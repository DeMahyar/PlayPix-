// PlayPix — electron-builder afterPack hook (Windows).
// Injects the PlayPix icon + version info directly into the PE resources with
// resedit (pure JS) so no Wine is required on the build machine.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const product = context.packager.appInfo.productFilename
  const exePath = path.join(context.appOutDir, `${product}.exe`)
  if (!require('fs').existsSync(exePath)) {
    console.warn(`[afterPack] exe not found: ${exePath}`)
    return
  }
  console.log(`[afterPack] stamping icon + version info into ${product}.exe`)
  execFileSync(process.execPath, [path.join(__dirname, 'stamp-exe.mjs'), exePath], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  })
}
