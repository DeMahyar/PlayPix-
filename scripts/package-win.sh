#!/usr/bin/env bash
# PlayPix — package the Windows build from Linux, with the CORRECT native
# better-sqlite3 binary (win32-x64, Electron ABI v130).
#
# Background: electron-builder cannot cross-rebuild better-sqlite3 for Windows
# on this Linux box (no MSVC/mingw toolchain), which silently packed the Linux
# ELF binary into the Windows package and made the app crash on startup.
# This script swaps in the official win32 prebuild before packaging and
# restores the Linux dev binary afterwards so Linux E2E keeps working.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_BIN="node_modules/better-sqlite3/build/Release/better_sqlite3.node"
LINUX_BAK="/tmp/better_sqlite3.linux.backup.node"
ELECTRON_VERSION="$(npx electron --version | sed 's/^v//')"

if [ ! -f "$LINUX_BAK" ]; then
  echo "[package-win] Linux backup binary missing at $LINUX_BAK — refusing to run." >&2
  exit 1
fi

cleanup() {
  cp "$LINUX_BAK" "$NODE_BIN"
  echo "[package-win] dev (linux) binary restored"
}
trap cleanup EXIT

echo "[package-win] swapping in win32-x64 electron-${ELECTRON_VERSION} prebuild..."
( cd node_modules/better-sqlite3 && \
  npx prebuild-install --runtime=electron --target="${ELECTRON_VERSION}" --platform=win32 --arch=x64 --verbose )
file "$NODE_BIN"
case "$(file -b "$NODE_BIN")" in
  *PE32*Windows*|*MS\ Windows*) echo "[package-win] OK: win32 DLL in place" ;;
  *) echo "[package-win] ERROR: downloaded binary is not a Windows PE!" >&2; exit 1 ;;
esac

echo "[package-win] building renderer/main bundles..."
npm run build

echo "[package-win] electron-builder --win ..."
npx electron-builder --win --config electron-builder.yml

echo "[package-win] building NSIS installer..."
bash scripts/build-installer.sh

echo "[package-win] done."
