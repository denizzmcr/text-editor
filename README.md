# Text Editor

A lightweight, offline-first rich text editor for macOS, Windows and Linux.
Write, format, and save documents as whatever file type you like — no accounts,
no cloud, no network.

Rust core on the system webview, Tiptap for editing, no UI framework.
**The packaged app is under 2 MB.**

## What it does

- **Rich text** — bold, italic, and Title / Heading / Subheading / Body styles
- **Saves as any file type** — the save panel never constrains the extension, and
  the extension decides how the file is written: rich HTML for `.html`, Markdown
  for `.md`, plain text for `.txt`, `.rs`, `.py` and everything else
- **Undo and redo** — full history, with consecutive typing grouped into one step
- **Auto-save** — writes about 800ms after you stop typing, never mid-keystroke,
  and always atomically so a file can't be left half-written
- **Draft recovery** — unsaved documents survive a quit or crash
- **Tab to indent** — indents whole lines, including across a multi-line
  selection, and one undo reverts the lot
- **Images** — insert from disk, paste, or drag and drop; embedded in the
  document so a saved file stays self-contained
- **Export** — Markdown or plain text
- **Opens from the file manager** — right-click a text or source file → Open
  With → Text Editor, on all three platforms
- **Under 2 MB packaged**, verified in CI on macOS, Windows and Linux

## Shortcuts

| Action | Shortcut |
|---|---|
| New / Open | `⌘N` / `⌘O` |
| Save / Save As | `⌘S` / `⌘⇧S` |
| Bold / Italic | `⌘B` / `⌘I` |
| Title / Heading / Subheading / Body | `⌘⌥1` / `⌘⌥2` / `⌘⌥3` / `⌘⌥0` |
| Undo / Redo | `⌘Z` / `⌘⇧Z` |
| Indent / Outdent | `Tab` / `⇧Tab` |
| Insert image | `⌘⇧I` |

## Build

Requires Rust and Node. On Linux also `libwebkit2gtk-4.1-dev` and `libgtk-3-dev`;
macOS and Windows use the webview that ships with the OS.

```sh
npm install
npm run desktop:dev      # run it
npm run package          # build the release artifact and check it fits the budget
npm run install-app      # install and register for "Open With"
```

On Windows, register with
`powershell -ExecutionPolicy Bypass -File scripts/register-windows.ps1`.

Every push builds all three platforms in CI and **fails if any artifact exceeds
2 MB**. See [NOTES.md](NOTES.md) for the size breakdown and other design notes.
