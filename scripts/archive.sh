#!/usr/bin/env bash
#
# Packages the current platform's artifact into a single downloadable archive.
#
# scripts/package.sh produces the raw artifact and enforces the size budget;
# this wraps that output in the archive format each platform expects, so a
# release asset is one file the user can download and double-click.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bash scripts/package.sh

OUT="release"
rm -rf "$OUT"; mkdir -p "$OUT"
ARCH="$(uname -m)"

case "$(uname -s)" in
  Darwin)
    # ditto rather than zip: it preserves the bundle's structure and resource
    # forks, which a plain zip of a .app directory does not reliably do.
    NAME="TextEditor-macOS-${ARCH}.zip"
    ditto -c -k --keepParent "dist-app/Text Editor.app" "$OUT/$NAME"
    ;;

  Linux)
    NAME="TextEditor-Linux-${ARCH}.tar.gz"
    tar -czf "$OUT/$NAME" -C dist-app text-editor text-editor.desktop
    ;;

  *)
    NAME="TextEditor-Windows-${ARCH}.zip"
    if command -v 7z >/dev/null 2>&1; then
      7z a -tzip "$OUT/$NAME" ./dist-app/text-editor.exe >/dev/null
    else
      powershell -NoProfile -Command \
        "Compress-Archive -Path dist-app/text-editor.exe -DestinationPath $OUT/$NAME -Force"
    fi
    ;;
esac

printf '\nArchive: %s\n' "$OUT/$NAME"
wc -c < "$OUT/$NAME" | awk '{printf "  %.2f MB compressed\n", $1/1048576}'
