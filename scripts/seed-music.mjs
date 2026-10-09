// PlayPix — generates a deterministic seeded test library with ffmpeg:
// multiple artists/albums/genres, embedded artwork, a sidecar cover, a FLAC/MP3
// duplicate pair, a corrupt file, an unsupported-by-Chromium WMA, and junk files.
import { execFileSync } from 'child_process'
import { copyFileSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, existsSync, rmSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const out = process.env.PLAYPIX_SEED_OUT || path.join(root, 'test-music')

function encoders() {
  try {
    const outp = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })
    const set = new Set()
    for (const l of outp.split('\n')) {
      const m = /^\s*[AV][A-Z.]{5}\s+([\w\d_]+)/.exec(l)
      if (m) set.add(m[1])
    }
    return set
  } catch {
    return new Set()
  }
}

const enc = encoders()
const has = (e) => enc.has(e)

if (existsSync(out)) rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// base cover images (gradients)
function makeCover(dest, c0, c1) {
  try {
    execFileSync(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `gradients=s=600x600:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=600:y1=600`,
        '-frames:v', '1', dest],
      { stdio: 'pipe' }
    )
    return existsSync(dest)
  } catch {
    try {
      execFileSync(
        'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${c0}:s=600x600`, '-frames:v', '1', dest],
        { stdio: 'pipe' }
      )
      return existsSync(dest)
    } catch {
      return false
    }
  }
}

const covers = []
for (let i = 0; i < 8; i++) {
  const c0 = `0x${(0x30313d + i * 0x1c2a51).toString(16).slice(0, 6).padStart(6, '0')}`
  const c1 = `0x${(0x7f5fd0 + i * 0x2b3d19).toString(16).slice(0, 6).padStart(6, '0')}`
  const p = path.join(out, `cover${i}.png`)
  if (makeCover(p, c0, c1)) covers.push(p)
}

const A = 'Arctic Monkeys'
const FWN = 'Favourite Worst Nightmare'
const DP = 'Daft Punk'
const DISC = 'Discovery'
const NJ = 'Nu Jazz Sessions'

const tracks = [
  { rel: `${A}/${FWN}/01 Brianstorm.mp3`, freq: 220, dur: 22, coverIdx: 0, meta: { title: 'Brianstorm', artist: A, album: FWN, track: '1', date: '2007', genre: 'Indie Rock' } },
  { rel: `${A}/${FWN}/02 Teddy Picker.mp3`, freq: 262, dur: 21, coverIdx: 0, meta: { title: 'Teddy Picker', artist: A, album: FWN, track: '2', date: '2007', genre: 'Indie Rock' } },
  { rel: `${A}/${FWN}/03 Fluorescent Adolescent.mp3`, freq: 294, dur: 24, coverIdx: 0, meta: { title: 'Fluorescent Adolescent', artist: A, album: FWN, track: '3', date: '2007', genre: 'Indie Rock' } },
  { rel: `${A}/${FWN}/04 505.flac`, freq: 330, dur: 25, coverIdx: 0, meta: { title: '505', artist: A, album: FWN, track: '4', date: '2007', genre: 'Indie Rock' } },
  { rel: `${DP}/${DISC}/01 One More Time.m4a`, freq: 349, dur: 20, coverIdx: 1, meta: { title: 'One More Time', artist: DP, album: DISC, track: '1', date: '2001', genre: 'Electronic' } },
  { rel: `${DP}/${DISC}/02 Digital Love.m4a`, freq: 392, dur: 22, coverIdx: 1, meta: { title: 'Digital Love', artist: DP, album: DISC, track: '2', date: '2001', genre: 'Electronic' } },
  { rel: `${DP}/${DISC}/03 Harder Better Faster.ogg`, freq: 440, dur: 20, coverIdx: 1, meta: { title: 'Harder Better Faster', artist: DP, album: DISC, track: '3', date: '2001', genre: 'Electronic' } },
  { rel: `${NJ}/01 Midnight Walk.mp3`, freq: 196, dur: 21, meta: { title: 'Midnight Walk', artist: 'Ella Monroe', album: NJ, track: '1', date: '2019', genre: 'Nu Jazz' } },
  { rel: `${NJ}/02 Rain on Brass.mp3`, freq: 208, dur: 23, meta: { title: 'Rain on Brass', artist: 'Ella Monroe', album: NJ, track: '2', date: '2019', genre: 'Nu Jazz' } },
  { rel: `${NJ}/03 Velvet Hours.flac`, freq: 233, dur: 22, meta: { title: 'Velvet Hours', artist: 'Ella Monroe', album: NJ, track: '3', date: '2019', genre: 'Nu Jazz' } },
  { rel: 'Singles/First Light.mp3', freq: 262, dur: 18, meta: { title: 'First Light', artist: 'Cassette Club', date: '2021', genre: 'Synthwave' } },
  { rel: 'Singles/Neon Rivers.mp3', freq: 277, dur: 19, meta: { title: 'Neon Rivers', artist: 'Cassette Club', date: '2022', genre: 'Synthwave' } },
  { rel: 'Singles/Slow Burn.m4a', freq: 311, dur: 18, meta: { title: 'Slow Burn', artist: 'Marlow Fields', date: '2020', genre: 'Chillout' } },
  { rel: 'Memos/Voice Memo 12.wav', freq: 180, dur: 12, meta: { title: 'Voice Memo 12' } },
  // Duplicate pair: 505 also exists as mp3 under Downloads (no art) — merged, flac stays primary
  { rel: 'Downloads/505.mp3', freq: 330, dur: 25, meta: { title: '505', artist: A, album: FWN, track: '4', date: '2007', genre: 'Indie Rock' } },
  { rel: 'Cloud Archive/2024/Summer/Tapes/Night Drive.mp3', freq: 165, dur: 20, coverIdx: 2, meta: { title: 'Night Drive', artist: 'Marlow Fields', album: 'Night Drive EP', track: '1', date: '2024', genre: 'Chillout' } }
]

if (has('wmav2')) {
  tracks.push({
    rel: 'Singles/Legacy.wma',
    freq: 140,
    dur: 15,
    meta: { title: 'Legacy', artist: 'Old Format', date: '2004', genre: 'Rock' }
  })
}

function ff(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' })
}

let ok = 0
let failed = 0
for (const t of tracks) {
  const dest = path.join(out, ...t.rel.split('/'))
  mkdirSync(path.dirname(dest), { recursive: true })
  const ext = path.extname(dest).toLowerCase()
  const args = ['-f', 'lavfi', '-i', `sine=frequency=${t.freq}:duration=${t.dur}`]
  const cover = t.coverIdx !== undefined ? covers[t.coverIdx] : null
  if (cover) args.push('-i', cover)
  args.push('-map', '0:a')
  if (cover) args.push('-map', '1:v')
  try {
    if (ext === '.mp3') {
      if (!has('libmp3lame')) throw new Error('no libmp3lame')
      args.push('-c:a', 'libmp3lame', '-b:a', '128k')
      if (cover) args.push('-c:v', 'mjpeg', '-disposition:v', 'attached_pic', '-metadata:s:v', 'title=Album cover')
    } else if (ext === '.flac') {
      args.push('-c:a', 'flac')
      if (cover) args.push('-c:v', 'png', '-disposition:v', 'attached_pic')
    } else if (ext === '.m4a') {
      if (!has('aac')) throw new Error('no aac')
      args.push('-c:a', 'aac', '-b:a', '128k')
    } else if (ext === '.ogg') {
      if (!has('libvorbis')) throw new Error('no libvorbis')
      args.push('-c:a', 'libvorbis')
    } else if (ext === '.wma') {
      args.push('-c:a', 'wmav2', '-f', 'asf')
    } else if (ext === '.wav') {
      args.push('-c:a', 'pcm_s16le')
    } else {
      throw new Error('unsupported test ext ' + ext)
    }
    for (const [k, v] of Object.entries(t.meta)) args.push('-metadata', `${k}=${v}`)
    args.push(dest)
    ff(args)
    ok++
  } catch (e) {
    failed++
    console.warn(`  skip ${t.rel}: ${String(e).split('\n')[0]}`)
  }
}

// sidecar folder.jpg for Nu Jazz Sessions (no embedded art)
if (covers[3]) copyFileSync(covers[3], path.join(out, NJ, 'folder.jpg'))

// corrupt file: random bytes with .mp3 extension (scanner must skip gracefully)
const corrupt = path.join(out, 'Corrupt Album', 'broken song.mp3')
mkdirSync(path.dirname(corrupt), { recursive: true })
const buf = Buffer.alloc(120 * 1024)
for (let i = 0; i < buf.length; i += 7) buf.writeUInt8((i * 31) % 251, i)
writeFileSync(corrupt, buf)

// junk + ignored paths
writeFileSync(path.join(out, 'readme.txt'), 'not music')
mkdirSync(path.join(out, '.hidden'), { recursive: true })
writeFileSync(path.join(out, '.hidden', 'secret.mp3'), Buffer.alloc(50 * 1024, 7))
mkdirSync(path.join(out, 'Empty Folder'), { recursive: true })

// cleanup helper covers
for (const c of covers) {
  try {
    unlinkSync(c)
  } catch {
    /* ignore */
  }
}

const countAudio = (dir) => {
  let n = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(mp3|flac|m4a|ogg|wav|wma)$/i.test(e.name)) n++
    }
  }
  walk(dir)
  return n
}

console.log(`Seeded ${ok} audio files (+${failed} skipped encoders) at ${out}`)
console.log(`audio files on disk: ${countAudio(out)}`)
