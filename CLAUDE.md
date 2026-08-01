This is a text-editor project like google docs
Project

A desktop text editor application — a lightweight, focused writing app for saving text, loosely modeled on Google Docs functionality (not a clone, just a directional reference for "what good looks like").

Core Requirements (must-have for full score)
 Can write and save text as any file type (not limited to .txt)
 Rich text formatting: italic, bold, and header/title/body text styles
 Undo/redo support
 Auto-save
 Keyboard shortcuts (save, bold, italic, undo/redo, etc.)
 Tab key indents the current line properly (not just an oddly-placed tab character)
Bonus Requirements
 +50: Ability to insert images into the document
 +50: Entire packaged app is under 2 MB
Architecture Notes
This is a desktop app — evaluate Tauri (Rust core + web frontend) over Electron. Electron alone typically adds 100MB+ to a bundle, which makes the <2MB bonus effectively unreachable. Tauri produces much smaller native binaries and is the more realistic path to that bonus.
For rich text editing (bold/italic/headers, undo/redo), prefer a proven editor foundation (e.g. ProseMirror/Tiptap for the webview layer) instead of building formatting and undo history from scratch.
Auto-save should not block the UI thread — debounce writes rather than saving on every keystroke.
Tab-to-indent needs to behave like a real editor (indent current line / selection), not just insert a raw tab character at the cursor.
Conventions
Keep the dependency tree lean — every added package works against the 2MB bonus goal. Justify any new dependency before adding it.
Favor native OS APIs / lightweight libraries where they help keep bundle size down.
Out of Scope (unless explicitly asked)
Cloud sync / multi-device support
Real-time collaboration
Any online/network features — this is a local, offline-first editor
