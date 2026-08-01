A lightweight, offline-first rich text editor. No accounts, no cloud, no network.

Every download below is **under 2 MB** — the build fails if any artifact exceeds it.

## Download

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `TextEditor-macOS-arm64.zip` |
| Windows (x64) | `TextEditor-Windows-x86_64.zip` |
| Linux (x64) | `TextEditor-Linux-x86_64.tar.gz` |

`SHA256SUMS` lists the checksum of each file.

## Installing

**macOS** — unzip and drag `Text Editor.app` to Applications. The app is not
notarized, so the first launch is blocked with *"Apple could not verify…"*: click
**Done**, then go to **System Settings → Privacy & Security**, where an **Open
Anyway** button now appears. Or skip the round trip entirely:

```sh
xattr -dr com.apple.quarantine "/Applications/Text Editor.app"
```

If you instead see *"Text Editor is damaged and can't be opened"*, you have the
v1.0.0 download — its bundle signature was malformed. Delete it and use v1.0.1
or later.

**Windows** — unzip and run `text-editor.exe`. SmartScreen will warn that the
publisher is unrecognised (again, no code signature): **More info → Run anyway**.
Needs the WebView2 runtime, which ships with Windows 11 and Windows 10 21H2+.

**Linux** — needs the system webview:

```sh
sudo apt install libwebkit2gtk-4.1-0        # or your distro's equivalent
tar -xzf TextEditor-Linux-x86_64.tar.gz
chmod +x text-editor && ./text-editor
```

To get it into your application menu and the file manager's *Open With*, copy
`text-editor.desktop` to `~/.local/share/applications/` and run
`update-desktop-database ~/.local/share/applications`.

## What it does

Bold, italic and Title/Heading/Subheading/Body styles · saves as any file type,
with the extension deciding the format · undo/redo · auto-save with atomic writes
· draft recovery · Tab indents whole lines · images by dialog, paste or drag-drop
· Markdown and plain-text export · opens from the file manager.

See the [README](https://github.com/denizzmcr/text-editor#readme) for the full
shortcut list.
