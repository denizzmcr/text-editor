# Engineering notes

Background on decisions that aren't obvious from the code. Not needed to use
the app — see [README.md](README.md) for that.

## Bundle size: 4.2 MB

The original brief targeted a packaged app under 2 MB. **That is not
achievable with Tauri on macOS**, and it was measured before any features were
written rather than discovered at the end.

An *empty* Tauri window, no application code at all:

| Build configuration | `.app` |
|---|---|
| Stable + `opt-level="s"`, LTO, `codegen-units=1`, `panic="abort"`, `strip` | 3.9 MB |
| \+ nightly `build-std`, `panic=immediate-abort` | 3.5 MB |
| \+ `-Zlocation-detail=none`, `-Zfmt-debug=none` | 3.5 MB |

That floor is already 1.75× the entire budget. Nightly `build-std` returned
about 11%, not the 30–40% the Tauri docs suggest. The finished app is 4.2 MB:
~4.11 MB binary, 337 KB of JavaScript, 96 KB icon.

The size-optimized release profile is kept in `Cargo.toml` anyway — it costs
only build time. The dependency tree is kept deliberately lean for the same
reason: no UI framework (React alone would be ~140 KB), Tiptap extensions
registered individually rather than via StarterKit, and a hand-written
Markdown serializer instead of turndown.

Reaching <2 MB on macOS would mean dropping the webview for native AppKit,
where an `NSTextView`-based editor lands well under 1 MB.

## File formats

Treating every file as HTML corrupts anything that isn't: it writes
`<p>fn main() {}</p>` into a `.rs` file, and loses `<String>` from
`Vec<String>` when reading one back, because the HTML parser eats it as an
unknown tag.

So the extension picks the format, and plain text is the default — the
non-destructive choice. The worst case becomes "formatting wasn't stored"
rather than "your file was mangled". Saving a formatted document to a
plain-text file asks for confirmation first.

Markdown support is a small reader/writer pair covering what this editor
itself emits. It is not a CommonMark implementation.

`.docx`, `.pages` and `.pdf` are deliberately not claimed — a `.docx` is a ZIP
archive of XML, not text.

## Auto-save is atomic

`write_file` writes a temp file in the target directory, flushes it, then
renames it over the target. Auto-save fires while the user types, so an
interrupted plain write could truncate the document. A rename is atomic, so
the file on disk is always either the previous version or the complete new
one. Covered by tests in `src-tauri/src/commands.rs`.

## Finder integration and a macOS limitation

macOS only offers an app in *Open With* for file types it has a real UTI for.
Extensions nothing on the system declares — `.rs`, `.toml`, and on a stock Mac
even `.md` — fall back to a *dynamic* UTI that conforms to nothing, and macOS
then offers **no** app for them at all, not even TextEdit.

A `CFBundleTypeExtensions` wildcard (`"*"`) does not fix this; it was tried and
measured to have no effect. `Info.plist` instead imports those types via
`UTImportedTypeDeclarations`, giving them real UTIs conforming to
`public.plain-text`. Extensions that already have a system UTI (`.py`, `.json`,
`.yaml`, `.ts`, `.c`) are deliberately left alone.

For a genuinely unheard-of extension, *Open With → Other… → All Applications*
is the only route — no app can register for a type macOS doesn't know.

## Menu accelerators are forwarded from Rust

The document model lives in ProseMirror, not the webview, so the predefined
Undo/Redo menu items would drive WebKit's own undo stack and desync from the
editor's history. Every editing accelerator is forwarded to the frontend
instead. Cut/Copy/Paste stay predefined — those act on the selection and
behave correctly natively.

## Tests

```sh
npm test                     # format detection, text/markdown parsing
cd src-tauri && cargo test   # atomic writes, round-trips, MIME detection
```
