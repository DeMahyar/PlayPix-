#!/usr/bin/env bash
# PlayPix — build the Windows installer with the native Linux makensis
# (bundled by electron-builder). No Wine required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NSIS_DIR="${HOME}/.cache/electron-builder/nsis/nsis-3.0.4.1"
RES_DIR="${HOME}/.cache/electron-builder/nsis/nsis-resources-3.4.1"

if [ ! -x "${NSIS_DIR}/linux/makensis" ]; then
  echo "makensis not found at ${NSIS_DIR}/linux/makensis"
  echo "Run 'npx electron-builder --win' once so it downloads the NSIS bundle."
  exit 1
fi

cd "${ROOT}/build"

"${NSIS_DIR}/linux/makensis" -V2 -NOCD installer.nsi

echo "OK release/PlayPix-Setup-1.0.0.exe"
