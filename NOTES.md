# Engineering notes

Background on decisions that aren't obvious from the code. Not needed to use
the app — see [README.md](README.md) for that.

## Bundle size: 1.38 MB

The brief targeted a packaged app under 2 MB. The first version of this editor
was built on Tauri and came out at **4.2 MB** — comfortably over.

Tuning could not close that gap. An *empty* Tauri window, no application code
at all, with every documented size lever applied:

| Build configuration | `.app` |
|---|---|
| Stable + `opt-level="s"`, LTO, `codegen-units=1`, `panic="abort"`, `strip` | 3.9 MB |
| \+ nightly `build-std`, `panic=immediate-abort` | 3.5 MB |
| \+ `-Zlocation-detail=none`, `-Zfmt-debug=none` | 3.5 MB |

3.5 MB before a single line of application code — 1.75× the whole budget.
Nightly `build-std` returned about 11%, not the 30–40% the Tauri docs suggest.

The insight that fixed it: **the cost was Tauri's runtime, not the webview.**
The system webview (WKWebView, WebView2, webkit2gtk) is free on every platform.
Measuring the layers Tauri is built on, without Tauri:

| Configuration | Binary |
|---|---|
| Empty **Tauri** window, all size levers | 3.50 MB |
| Bare **wry + tao** window + webview | **0.75 MB** |
| \+ muda (menus), rfd (dialogs), IPC | **0.87 MB** |

Tauri's framework layer was costing ~2.75 MB. So the shell was rebuilt directly
on `wry`/`tao`/`muda`/`rfd`, keeping the entire frontend unchanged. The result:

| Component | Size |
|---|---|
| Binary, including the embedded frontend | 1.28 MB |
| Icon | 0.09 MB |
| Info.plist | negligible |
| **Total `.app`** | **1.38 MB** |

A native AppKit rewrite would have been smaller still, but it is macOS-only —
ruled out by the cross-platform requirement.

The dependency tree is kept deliberately lean for the same reason: no UI
framework (React alone would be ~140 KB, a third of the JS budget), Tiptap
extensions registered individually rather than via StarterKit, and a
hand-written Markdown serializer instead of turndown.

CI enforces the budget on macOS, Windows and Linux, failing the build if any
artifact exceeds 2 MB — the number is verified per platform rather than
estimated from one machine.

## The bridge to Rust

wry's IPC is one-way (page → host), so request/response is built in
`src/bridge.ts`: each call gets an id, the promise is parked in a map, and Rust
resolves it by evaluating `window.__bridge.resolve(id, ok, payload)`. Events
arrive the same way.

The exported functions deliberately mirror the Tauri APIs they replaced, which
is why dropping Tauri touched only four import lines — every call site in
`main.ts` and `files.ts` stayed as it was.

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
one. Covered by tests in `desktop/src/commands.rs`.

## File associations

Each platform declares them differently:

- **macOS** — `CFBundleDocumentTypes` in `desktop/Info.plist`, registered with
  `lsregister`.
- **Windows** — `OpenWithProgids` entries under `HKCU\Software\Classes`, written
  by `scripts/register-windows.ps1`. HKCU only, so no administrator rights and
  no effect on other users.
- **Linux** — a `.desktop` file with a `MimeType=` line, picked up by
  `update-desktop-database`.

All three register the app as *an* option rather than the default handler, so
it never takes over a file type you already have an editor for.

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
Undo/Redo menu items would drive the webview's own undo stack and desync from
the editor's history. Every editing accelerator is forwarded to the frontend
instead. Cut/Copy/Paste stay predefined — those act on the selection and
behave correctly natively.

The menu attaches to the system menu bar on macOS and to the window itself on
Windows and Linux, which is the convention on each. The accelerators are
identical.

## Tests

```sh
npm test                                          # format detection, text/markdown parsing
cargo test --manifest-path desktop/Cargo.toml     # atomic writes, round-trips, MIME detection
```
