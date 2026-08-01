#!/usr/bin/env bash
#
# Installs the built app into /Applications and registers it with
# LaunchServices, so it appears in Finder's "Open With" menu.
#
# Run after `npm run tauri build` -- the copy in /Applications is independent
# of the build directory and does not update on its own.
set -euo pipefail

BUILD_APP="src-tauri/target/release/bundle/macos/Text Editor.app"
DEST="/Applications/Text Editor.app"
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

if [ ! -d "$BUILD_APP" ]; then
  echo "No build found at $BUILD_APP" >&2
  echo "Run 'npm run tauri build' first." >&2
  exit 1
fi

if pgrep -f "Text Editor.app" >/dev/null 2>&1; then
  echo "Quitting the running app…"
  pkill -f "Text Editor.app" || true
  sleep 2
fi

# Without this, the build-directory copy stays registered and Finder lists
# "Text Editor" twice in Open With.
"$LSREG" -u "$PWD/$BUILD_APP" 2>/dev/null || true

echo "Installing to ${DEST}"

# Guard the rm: an empty or unexpected DEST must never reach `rm -rf`.
case "$DEST" in
  /Applications/*.app) ;;
  *) echo "Refusing to remove unexpected path: $DEST" >&2; exit 1 ;;
esac

rm -rf "$DEST"
cp -R "$BUILD_APP" "$DEST"

"$LSREG" -f -R "$DEST"

echo "Installed. Right-click a text file in Finder → Open With → Text Editor."
