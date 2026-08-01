#!/usr/bin/env bash
#
# Installs the packaged app for the current user and registers it so the OS
# offers it for text files.
#
# Run after `npm run package`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

case "$(uname -s)" in
  Darwin)
    BUILT="dist-app/Text Editor.app"
    DEST="/Applications/Text Editor.app"
    LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

    if [ ! -d "$BUILT" ]; then
      echo "No build at $BUILT. Run 'npm run package' first." >&2
      exit 1
    fi

    if pgrep -f "Text Editor.app" >/dev/null 2>&1; then
      echo "Quitting the running app…"
      pkill -f "Text Editor.app" || true
      sleep 2
    fi

    # Without this the build-directory copy stays registered and Finder lists
    # "Text Editor" twice in Open With.
    "$LSREG" -u "$ROOT/$BUILT" 2>/dev/null || true

    echo "Installing to ${DEST}"
    # Guard the rm: an unexpected DEST must never reach `rm -rf`.
    case "$DEST" in
      /Applications/*.app) ;;
      *) echo "Refusing to remove unexpected path: $DEST" >&2; exit 1 ;;
    esac
    rm -rf "$DEST"
    cp -R "$BUILT" "$DEST"

    "$LSREG" -f -R "$DEST"
    echo "Installed. Right-click a text file in Finder → Open With → Text Editor."
    ;;

  Linux)
    BIN_DIR="$HOME/.local/bin"
    APP_DIR="$HOME/.local/share/applications"
    mkdir -p "$BIN_DIR" "$APP_DIR"

    install -m 755 dist-app/text-editor "$BIN_DIR/text-editor"
    install -m 644 dist-app/text-editor.desktop "$APP_DIR/text-editor.desktop"

    # Makes the MimeType= line in the .desktop file take effect.
    command -v update-desktop-database >/dev/null && \
      update-desktop-database "$APP_DIR" || true

    echo "Installed to $BIN_DIR. Ensure it is on your PATH."
    echo "Right-click a text file → Open With → Text Editor."
    ;;

  *)
    echo "On Windows, run: powershell -ExecutionPolicy Bypass -File scripts/register-windows.ps1" >&2
    exit 1
    ;;
esac
