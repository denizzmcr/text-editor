# Text Editor

A lightweight, offline-first rich text editor for macOS. Write, format, and save
documents as whatever file type you like — no accounts, no cloud, no network.

Built with Tauri (Rust core) and Tiptap, with no UI framework.

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
- **Opens from Finder** — right-click a text or source file → Open With → Text
  Editor

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

Requires Rust and Node.

```sh
npm install
npm run tauri dev        # run in development
npm run tauri build      # build the release app
npm run install-app      # install to /Applications and register with Finder
```

The packaged app is 4.2 MB. See [NOTES.md](NOTES.md) for the size breakdown and
other design notes.
