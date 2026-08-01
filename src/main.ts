import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";
import { Editor } from "@tiptap/core";

import { extensions } from "./editor/extensions";
import {
  type DocumentFormat,
  formatForPath,
  isLossy,
  serialize,
  toEditorHtml,
} from "./editor/formats";
import { downscaleDataUri, fileToDataUri } from "./editor/images";
import {
  clearDraft,
  readDraft,
  readFile,
  readImageDataUri,
  takePendingFile,
  writeDraft,
  writeFile,
} from "./files";

/** Idle time after the last keystroke before auto-save runs. */
const AUTOSAVE_DELAY_MS = 800;

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];

const FORMAT_LABELS: Record<DocumentFormat, string> = {
  html: "Rich text",
  markdown: "Markdown",
  text: "Plain text",
};

const appWindow = getCurrentWindow();

let currentPath: string | null = null;
let currentFormat: DocumentFormat = "html";
let dirty = false;

let autosaveTimer: number | undefined;
let saveInFlight = false;
let resaveQueued = false;

const statusEl = document.querySelector<HTMLElement>("#status")!;
const docNameEl = document.querySelector<HTMLElement>("#docname")!;
const formatEl = document.querySelector<HTMLElement>("#format")!;
const styleSelect = document.querySelector<HTMLSelectElement>("#block-style")!;

const editor = new Editor({
  element: document.querySelector<HTMLElement>("#editor")!,
  extensions,
  content: "",
  autofocus: "end",
  editorProps: {
    handlePaste: (_view, event) => insertImagesFrom(event.clipboardData),
    handleDrop: (_view, event) => insertImagesFrom((event as DragEvent).dataTransfer),
  },
  onUpdate: () => {
    setDirty(true);
    scheduleAutosave();
  },
  onSelectionUpdate: syncToolbar,
  onTransaction: syncToolbar,
});

// --- Saving ---------------------------------------------------------------

function scheduleAutosave() {
  window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
}

/**
 * Writes the document to its file, or to the recovery draft if it has never
 * been saved. Concurrent calls are coalesced: a save arriving while another
 * is in flight sets a flag rather than queueing, so a fast typist cannot
 * build up a backlog of writes.
 */
async function persist(): Promise<boolean> {
  if (saveInFlight) {
    resaveQueued = true;
    return false;
  }

  saveInFlight = true;
  setStatus("Saving…");

  try {
    if (currentPath) {
      await writeFile(currentPath, serialize(editor, currentFormat));
    } else {
      // Drafts are always rich HTML regardless of the eventual file type, so
      // recovery never loses formatting the user has not yet committed to.
      await writeDraft(editor.getHTML());
    }
    setDirty(false);
    setStatus(currentPath ? "All changes saved" : "Draft saved");
    return true;
  } catch (error) {
    setStatus("Save failed");
    await reportError(error);
    return false;
  } finally {
    saveInFlight = false;
    if (resaveQueued) {
      resaveQueued = false;
      void persist();
    }
  }
}

async function saveAs(): Promise<void> {
  // No filter list: the file type is whatever the user names it, and the
  // extension chooses how the contents are written.
  const path = await save({
    title: "Save",
    defaultPath: currentPath ?? "Untitled.html",
  });
  if (!path) return;

  const format = formatForPath(path);

  // Saving rich text into a plain-text file drops formatting permanently.
  // Say so before writing rather than after.
  if (isLossy(format) && hasFormatting()) {
    const proceed = await confirm(
      `${path.split("/").pop()} will be saved as plain text, so bold, headings and images will not be stored in it. Continue?`,
      { title: "Save as plain text", kind: "warning" },
    );
    if (!proceed) return;
  }

  currentPath = path;
  currentFormat = format;
  await persist();
  await clearDraft().catch(() => {});
  updateChrome();
}

async function saveNow(): Promise<void> {
  window.clearTimeout(autosaveTimer);
  if (currentPath) await persist();
  else await saveAs();
}

/** True when the document holds anything plain text cannot represent. */
function hasFormatting(): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.type.name === "image" || node.type.name === "heading") found = true;
    if (node.marks.length > 0) found = true;
    if ((node.attrs?.indent ?? 0) > 0) found = true;
    return !found;
  });
  return found;
}

// --- Opening --------------------------------------------------------------

async function openDocument(): Promise<void> {
  const selected = await open({ title: "Open", multiple: false, directory: false });
  if (typeof selected !== "string") return;
  await openPath(selected);
}

async function openPath(path: string): Promise<void> {
  // Don't discard unsaved work when a second file arrives from Finder.
  if (dirty) await persist();

  try {
    const contents = await readFile(path);
    const format = formatForPath(path);
    loadContent(toEditorHtml(contents, format));
    currentPath = path;
    currentFormat = format;
    await clearDraft().catch(() => {});
    updateChrome();
    setStatus(`Opened as ${FORMAT_LABELS[format].toLowerCase()}`);
  } catch (error) {
    await reportError(error);
  }
}

function newDocument(): void {
  loadContent("");
  currentPath = null;
  currentFormat = "html";
  void clearDraft().catch(() => {});
  updateChrome();
  setStatus("New document");
}

/** Replaces the document without marking it dirty or triggering auto-save. */
function loadContent(html: string): void {
  editor.commands.setContent(html);
  window.clearTimeout(autosaveTimer);
  setDirty(false);
  editor.commands.focus("end");
}

// --- Exporting ------------------------------------------------------------

async function exportAs(kind: "md" | "txt"): Promise<void> {
  const base = currentPath ? stripExtension(baseName(currentPath)) : "Untitled";
  const path = await save({
    title: kind === "md" ? "Export as Markdown" : "Export as Plain Text",
    defaultPath: `${base}.${kind}`,
  });
  if (!path) return;

  try {
    await writeFile(path, serialize(editor, kind === "md" ? "markdown" : "text"));
    setStatus("Exported");
  } catch (error) {
    await reportError(error);
  }
}

const baseName = (path: string) => path.split("/").pop() ?? path;
const stripExtension = (name: string) => name.replace(/\.[^.]+$/, "");

// --- Images ---------------------------------------------------------------

async function insertImageFromDisk(): Promise<void> {
  const selected = await open({
    title: "Insert Image",
    multiple: false,
    directory: false,
    filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
  });
  if (typeof selected !== "string") return;

  try {
    const raw = await readImageDataUri(selected);
    const src = await downscaleDataUri(raw);
    editor.chain().focus().setImage({ src }).run();
  } catch (error) {
    await reportError(error);
  }
}

/**
 * Shared handler for paste and drop. Returns true when images were found, so
 * ProseMirror skips its own handling; anything else falls through to the
 * default behaviour (which is what makes pasting plain text still work).
 */
function insertImagesFrom(data: DataTransfer | null): boolean {
  const images = Array.from(data?.files ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
  if (images.length === 0) return false;

  void (async () => {
    for (const file of images) {
      try {
        const src = await downscaleDataUri(await fileToDataUri(file));
        editor.chain().focus().setImage({ src }).run();
      } catch (error) {
        await reportError(error);
      }
    }
  })();

  return true;
}

// --- Chrome ---------------------------------------------------------------

function setDirty(value: boolean): void {
  if (dirty === value) return;
  dirty = value;
  updateChrome();
}

function updateChrome(): void {
  const name = currentPath ? baseName(currentPath) : "Untitled";
  docNameEl.textContent = name;
  formatEl.textContent = FORMAT_LABELS[currentFormat];
  formatEl.classList.toggle("is-lossy", isLossy(currentFormat));
  void appWindow.setTitle(dirty ? `${name} •` : name);
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function reportError(error: unknown): Promise<void> {
  await message(String(error), { title: "Text Editor", kind: "error" });
}

// Tiptap's `.run()` returns a boolean; callers here ignore it.
const ACTIONS: Record<string, () => unknown> = {
  bold: () => editor.chain().focus().toggleBold().run(),
  italic: () => editor.chain().focus().toggleItalic().run(),
  h1: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  h2: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  h3: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  body: () => editor.chain().focus().setParagraph().run(),
  indent: () => editor.chain().focus().indent().run(),
  outdent: () => editor.chain().focus().outdent().run(),
  undo: () => editor.chain().focus().undo().run(),
  redo: () => editor.chain().focus().redo().run(),
  image: insertImageFromDisk,
};

function syncToolbar(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    const action = button.dataset.action!;
    if (action === "bold" || action === "italic") {
      button.classList.toggle("is-active", editor.isActive(action));
    }
  }

  const level = [1, 2, 3].find((n) => editor.isActive("heading", { level: n }));
  styleSelect.value = level ? `h${level}` : "body";

  document
    .querySelector<HTMLButtonElement>('[data-action="undo"]')
    ?.toggleAttribute("disabled", !editor.can().undo());
  document
    .querySelector<HTMLButtonElement>('[data-action="redo"]')
    ?.toggleAttribute("disabled", !editor.can().redo());
}

document.querySelector("#toolbar")!.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
  if (button) void ACTIONS[button.dataset.action!]?.();
});

styleSelect.addEventListener("change", () => {
  void ACTIONS[styleSelect.value]?.();
});

// --- Menu -----------------------------------------------------------------

const MENU_ACTIONS: Record<string, () => unknown> = {
  ...ACTIONS,
  new: newDocument,
  open: openDocument,
  save: saveNow,
  save_as: saveAs,
  export_md: () => exportAs("md"),
  export_txt: () => exportAs("txt"),
};

void listen<string>("menu", ({ payload }) => {
  void MENU_ACTIONS[payload]?.();
});

// --- Lifecycle ------------------------------------------------------------

void appWindow.onCloseRequested(async (event) => {
  if (!dirty) return;
  event.preventDefault();

  // Only close once the work is safely on disk. If the write failed (read-only
  // volume, deleted directory, full disk) closing anyway would discard exactly
  // the edits the user was trying to keep, so make them choose explicitly.
  if (await persist()) {
    await appWindow.destroy();
    return;
  }

  const discard = await confirm(
    "Could not save your changes. Close anyway and lose them?",
    { title: "Text Editor", kind: "warning" },
  );
  if (discard) await appWindow.destroy();
});

/** Loads a file the OS handed us. No-op when there isn't one. */
async function openPendingFile(): Promise<boolean> {
  try {
    const path = await takePendingFile();
    if (!path) return false;
    await openPath(path);
    return true;
  } catch {
    return false;
  }
}

// Fires when Finder hands a file to an already-running instance.
void listen("open-pending", () => {
  void openPendingFile();
});

async function start(): Promise<void> {
  // A file opened from Finder wins over the recovery draft: it is what the
  // user just asked for.
  if (await openPendingFile()) return;

  try {
    const draft = await readDraft();
    if (draft && draft.trim()) {
      loadContent(draft);
      setStatus("Recovered unsaved draft");
      return;
    }
  } catch {
    // A failed recovery must never stop the editor from opening.
  }
  setStatus("Ready");
}

updateChrome();
syncToolbar();
void start();
