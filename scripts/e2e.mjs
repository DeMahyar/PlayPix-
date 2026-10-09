// PlayPix — E2E launcher: boots the app against a seeded music library,
// runs the automated UI walkthrough, and saves screenshots + a report.
import { spawn } from 'child_process'
import { createRequire } from 'module'
import { existsSync, mkdtempSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const seedDir = process.env.PLAYPIX_SEED_DIR || path.join(root, 'test-music')
if (!existsSync(seedDir)) {
  console.error(`Seed library missing at ${seedDir}. Run: npm run seed`)
  process.exit(1)
}

const outDir = process.env.PLAYPIX_E2E_OUT || path.join(root, 'e2e-output')
mkdirSync(outDir, { recursive: true })
const userData = mkdtempSync(path.join(os.tmpdir(), 'playpix-e2e-'))

const env = {
  ...process.env,
  PLAYPIX_E2E: '1',
  PLAYPIX_SCAN_ROOTS: seedDir,
  PLAYPIX_USER_DATA: userData,
  PLAYPIX_E2E_OUT: outDir,
  ELECTRON_DISABLE_SANDBOX: '1',
  ELECTRON_ENABLE_LOGGING: '1'
}

const electronPath = require('electron')
const args = [
  root,
  '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion'
]

let cmd = electronPath
let finalArgs = args
let xvfbProc = null

// Headless environments need a virtual display (xvfb-run needs xauth; use Xvfb directly)
if (process.platform === 'linux' && !process.env.DISPLAY) {
  const { spawnSync } = await import('child_process')
  if (!spawnSync('Xvfb', ['-help'], { stdio: 'ignore' }).error) {
    const fbDir = mkdtempSync(path.join(os.tmpdir(), 'playpix-fb-'))
    xvfbProc = spawn(
      'Xvfb',
      [':99', '-screen', '0', '1440x900x24', '-nolisten', 'tcp', '-fbdir', fbDir],
      { stdio: 'ignore' }
    )
    await new Promise((r) => setTimeout(r, 700))
    env.DISPLAY = ':99'
    env.PLAYPIX_XVFB_FB = path.join(fbDir, 'Xvfb_screen0')
  }
}

console.log(`▶ Running PlayPix e2e (output: ${outDir})`)
const child = spawn(cmd, finalArgs, { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: root })

let tail = ''
child.stdout.on('data', (d) => {
  const s = String(d)
  tail = (tail + s).slice(-8000)
  if (process.env.PLAYPIX_E2E_VERBOSE) process.stdout.write(s)
  if (s.includes('E2E-DONE')) console.log(s.trim())
})
child.stderr.on('data', (d) => {
  const s = String(d)
  tail = (tail + s).slice(-8000)
  if (process.env.PLAYPIX_E2E_VERBOSE) process.stderr.write(s)
})

const timeout = setTimeout(
  () => {
    console.error('✗ e2e timed out after 12 minutes')
    console.error(tail.split('\n').slice(-30).join('\n'))
    child.kill('SIGKILL')
    process.exit(1)
  },
  12 * 60 * 1000
)

child.on('exit', (code) => {
  clearTimeout(timeout)
  if (xvfbProc) xvfbProc.kill()
  console.log(`■ electron exited with code ${code}`)
  console.log(`  report: ${path.join(outDir, 'e2e-report.json')}`)
  console.log(`  shots:  ${outDir}`)
  process.exit(0)
})
