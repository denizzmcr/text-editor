#!/usr/bin/env bash
#
# Builds the release artifact for the current platform and reports its size.
#
# Deliberately produces the smallest sensible artifact per platform -- a macOS
# .app, a bare .exe on Windows, a bare binary plus .desktop on Linux. Installers
# and AppImages bundle their own runtime, which would consume most of the 2MB
# budget on its own.
set -euo pipefail

BUDGET_BYTES=$((2 * 1024 * 1024))
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Building frontend…"
npm run build >/dev/null

echo "Building binary…"
cargo build --release --manifest-path desktop/Cargo.toml

BIN="desktop/target/release/text-editor"
OUT="dist-app"
rm -rf "$OUT"; mkdir -p "$OUT"

case "$(uname -s)" in
  Darwin)
    APP="$OUT/Text Editor.app"
    mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
    cp "$BIN" "$APP/Contents/MacOS/text-editor"
    cp desktop/Info.plist "$APP/Contents/Info.plist"
    cp desktop/icons/icon.icns "$APP/Contents/Resources/icon.icns"

    # Ad-hoc sign the assembled bundle. Rust's linker already ad-hoc signs the
    # executable, so without this macOS sees a bundle whose binary claims to be
    # signed but which has no _CodeSignature/CodeResources -- an inconsistent
    # signature. Gatekeeper reports that as "the app is damaged" and refuses to
    # open it, with no "Open Anyway" escape. Only shows up once the app has been
    # downloaded, since macOS skips the check for files without a quarantine
    # flag. `--sign -` is ad-hoc: no certificate, no Apple account.
    codesign --force --sign - --timestamp=none "$APP"
    codesign --verify --strict "$APP"

    ARTIFACT="$APP"
    ;;

  Linux)
    cp "$BIN" "$OUT/text-editor"
    # Desktop entry doubles as the file-association declaration.
    cat > "$OUT/text-editor.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Text Editor
Comment=A lightweight offline-first rich text editor
Exec=text-editor %f
Icon=text-editor
Terminal=false
Categories=Office;TextEditor;
MimeType=text/plain;text/markdown;text/html;text/x-python;text/x-csrc;application/json;application/xml;
DESKTOP
    ARTIFACT="$OUT/text-editor"
    ;;

  *)
    # Git Bash / MSYS on Windows.
    cp "$BIN.exe" "$OUT/text-editor.exe"
    ARTIFACT="$OUT/text-editor.exe"
    ;;
esac

# du -k reports allocated blocks, which overstates small files; sum the actual
# bytes so the number matches what the budget is measured against.
#
# `wc -c` is used rather than `stat` because stat's flags differ between BSD
# (-f%z) and GNU (-c%s), and this script has to run on all three platforms.
if [ -d "$ARTIFACT" ]; then
  BYTES=$(find "$ARTIFACT" -type f -exec wc -c {} + | awk '$2 != "total" {s+=$1} END {print s+0}')
else
  BYTES=$(wc -c < "$ARTIFACT" | tr -d '[:space:]')
fi

printf '\n%s\n' "$ARTIFACT"
awk -v b="$BYTES" -v budget="$BUDGET_BYTES" 'BEGIN {
  printf "  size:   %.2f MB (%d bytes)\n", b/1048576, b
  printf "  budget: %.2f MB\n", budget/1048576
}'

if [ "$BYTES" -gt "$BUDGET_BYTES" ]; then
  echo "  OVER BUDGET"
  exit 1
fi
echo "  under budget"
