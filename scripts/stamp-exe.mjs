// PlayPix — inject icon + version information into a Windows PE (.exe) using resedit.
// Usage: node scripts/stamp-exe.mjs <path-to-exe>
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { Data, NtExecutable, NtExecutableResource, Resource, VersionInfo } = require('resedit')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const exePath = process.argv[2]
if (!exePath || !fs.existsSync(exePath)) {
  console.error('usage: node scripts/stamp-exe.mjs <exe>')
  process.exit(1)
}

const icoPath = path.join(root, 'build', 'icon.ico')
if (!fs.existsSync(icoPath)) {
  console.error('build/icon.ico missing — run npm run icon first')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version || '1.0.0'
const [vMajor, vMinor, vPatch] = version.split('.').map((n) => parseInt(n, 10) || 0)

const exe = NtExecutable.from(fs.readFileSync(exePath))
const res = NtExecutableResource.from(exe)

// --- icons (application + all icon groups present, e.g. the electron default) ---
const iconFile = Data.IconFile.from(fs.readFileSync(icoPath))
const iconItems = iconFile.icons.map((it) => it.data)
const groupIDs = Resource.IconGroupEntry.fromEntries(res.entries).map((it) => it.id)
const ids = groupIDs.length ? groupIDs : [1]
for (const gid of ids) {
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, 0, iconItems)
}

// --- version info ---
const vi = Resource.VersionInfo.createEmpty()
vi.setFileVersion(vMajor, vMinor, vPatch, 0)
vi.setProductVersion(vMajor, vMinor, vPatch, 0)
vi.setStringValues(
  { lang: 0x0409, codepage: 1200 },
  {
    CompanyName: 'PlayPix',
    FileDescription: 'PlayPix — a beautiful local-first music player',
    FileVersion: version,
    InternalName: 'PlayPix',
    LegalCopyright: 'Copyright © 2026 PlayPix',
    OriginalFilename: `${path.basename(exePath)}`,
    ProductName: 'PlayPix',
    ProductVersion: version
  }
)
vi.outputToResourceEntries(res.entries)

res.outputResource(exe)
const out = exe.generate({ regenerateCheckSum: true })
fs.writeFileSync(exePath, Buffer.from(out))
console.log(`[stamp] OK ${exePath} (icons: ${ids.join(',')}, v${version})`)
