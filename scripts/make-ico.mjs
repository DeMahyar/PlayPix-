// PlayPix — build the multi-size Windows icon from build/icon.png
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const src = path.join(root, 'build', 'icon.png')

if (!existsSync(src)) {
  console.error('build/icon.png missing — add a 1024x1024 PNG first')
  process.exit(1)
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const tmp = path.join(root, 'build', 'ico-tmp')
mkdirSync(tmp, { recursive: true })

const pngs = sizes.map((s) => {
  const dest = path.join(tmp, `icon-${s}.png`)
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `scale=${s}:${s}`, dest], {
    stdio: 'pipe'
  })
  return dest
})

const { default: pngToIco } = await import('png-to-ico')
const buf = await pngToIco(pngs.map((p) => readFileSync(p)))
writeFileSync(path.join(root, 'build', 'icon.ico'), buf)
rmSync(tmp, { recursive: true, force: true })
console.log('✓ build/icon.ico written')
