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
if [ -d "$ARTIFACT" ]; then
  BYTES=$(find "$ARTIFACT" -type f -exec stat -f%z {} + 2>/dev/null | awk '{s+=$1} END {print s}' \
       || find "$ARTIFACT" -type f -exec stat -c%s {} + | awk '{s+=$1} END {print s}')
else
  BYTES=$(stat -f%z "$ARTIFACT" 2>/dev/null || stat -c%s "$ARTIFACT")
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
