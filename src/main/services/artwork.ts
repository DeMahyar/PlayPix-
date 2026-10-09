// PlayPix main — artwork system.
// Priority: embedded art > local sidecar images > optional internet lookup (iTunes
// Search, confidence-checked) > PlayPix-generated placeholder (rendered client-side).
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { getDb, getSetting, tx } from './db'
import { norm, sha1 } from '../lib/util'
import { imageMimeByExt } from '../lib/paths'
import type { AlbumPalette } from '../../shared/types'

let cacheDir = ''

function extFromMime(mime: string | undefined): string {
  if (!mime) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

export function initArtwork(userDataDir: string): void {
  cacheDir = path.join(userDataDir, 'artwork')
  fs.mkdirSync(cacheDir, { recursive: true })
}

export function artPath(key: string): string {
  return path.join(cacheDir, path.basename(key))
}

export function hasArt(key: string | null | undefined): boolean {
  if (!key || !cacheDir) return false
  try {
    return fs.existsSync(artPath(key))
  } catch {
    return false
  }
}

/** Store an artwork buffer under a cache key. Returns the key (with extension). */
export function storeArt(keyBase: string, ext: string, data: Buffer, overwrite = false): string {
  const key = `${keyBase}.${ext}`
  const dest = artPath(key)
  if (overwrite || !fs.existsSync(dest)) {
    fs.writeFileSync(dest, data)
  }
  return key
}

export function copyArtFromFile(keyBase: string, srcPath: string, overwrite = false): string | null {
  try {
    const ext = path.extname(srcPath).replace('.', '').toLowerCase() || 'jpg'
    const data = fs.readFileSync(srcPath)
    if (data.length < 100) return null
    return storeArt(keyBase, ext, data, overwrite)
  } catch {
    return null
  }
}

// ---------- key helpers ----------

export function albumArtKeyBase(album: string, artist: string): string {
  return `al-${sha1(`${norm(album)}::${norm(artist)}`)}`
}

export function songArtKeyBase(songPath: string): string {
  return `sg-${sha1(songPath)}`
}

// ---------- sidecar images ----------

const SIDECAR_NAMES = [
  'folder.jpg',
  'folder.png',
  'cover.jpg',
  'cover.png',
  'front.jpg',
  'front.png',
  'album.jpg',
  'albumart.jpg',
  'art.jpg'
]

const sidecarMemo = new Map<string, string | null>()

export function findSidecar(dir: string): string | null {
  if (sidecarMemo.has(dir)) return sidecarMemo.get(dir) ?? null
  let found: string | null = null
  try {
    for (const name of SIDECAR_NAMES) {
      const p = path.join(dir, name)
      if (fs.existsSync(p)) {
        found = p
        break
      }
    }
  } catch {
    /* ignore */
  }
  sidecarMemo.set(dir, found)
  return found
}

export function resetSidecarMemo(dir?: string): void {
  if (dir) sidecarMemo.delete(dir)
  else sidecarMemo.clear()
}

// ---------- internet lookup (optional, offline-safe) ----------

let fetching = false
let fetchAbort = false

export function cancelNetFetch(): void {
  fetchAbort = true
}

/** Fetch covers for albums that have none. Fully offline-safe: silently skips. */
export async function kickNetFetch(onArtwork: () => void): Promise<void> {
  if (fetching) return
  if (getSetting('fetchArtworkOnline') === false) return
  fetching = true
  fetchAbort = false
  try {
    const db = getDb()
    const albums = db
      .prepare(
        `SELECT album AS name, COALESCE(NULLIF(album_artist,''), artist) AS artist
         FROM songs WHERE missing=0 AND album<>'' AND artist<>''
         GROUP BY lower(album), lower(COALESCE(NULLIF(album_artist,''),artist))
         HAVING SUM(CASE WHEN art_key IS NOT NULL THEN 1 ELSE 0 END) = 0
         LIMIT 60`
      )
      .all() as { name: string; artist: string }[]

    for (const a of albums) {
      if (fetchAbort) break
      const got = await fetchAlbumCover(a.name, a.artist)
      if (got) {
        const base = albumArtKeyBase(a.name, a.artist)
        const key = storeArt(base, got.ext, got.data)
        tx(() => {
          db.prepare(
            `UPDATE songs SET art_key=?, art_source='net'
             WHERE missing=0 AND art_key IS NULL
               AND lower(album)=lower(?)
               AND lower(COALESCE(NULLIF(album_artist,''),artist))=lower(?)`
          ).run(key, a.name, a.artist)
        })
        onArtwork()
        await sleep(400)
      } else {
        // Mark as attempted so we don't hammer the API forever: store a null marker row
        tx(() => {
          db.prepare(
            `UPDATE songs SET art_source='none'
             WHERE art_key IS NULL AND art_source IS NULL
               AND lower(album)=lower(?)
               AND lower(COALESCE(NULLIF(album_artist,''),artist))=lower(?)`
          ).run(a.name, a.artist)
        })
        await sleep(150)
      }
    }
  } catch {
    /* offline or network error — fail silently */
  } finally {
    fetching = false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAlbumCover(
  album: string,
  artist: string
): Promise<{ ext: string; data: Buffer } | null> {
  try {
    const term = encodeURIComponent(`${artist} ${album}`)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=5`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'PlayPix/1.0' } }
    )
    clearTimeout(t)
    if (!res.ok) return null
    const json = (await res.json()) as {
      results?: { artistName?: string; collectionName?: string; artworkUrl100?: string }[]
    }
    const nArtist = norm(artist)
    const nAlbum = norm(album)
    if (!nAlbum || !nArtist) return null
    for (const r of json.results ?? []) {
      const rArtist = norm(r.artistName)
      const rAlbum = norm(r.collectionName)
      const artistOk =
        rArtist === nArtist ||
        rArtist.includes(nArtist) ||
        nArtist.includes(rArtist)
      const albumOk = rAlbum === nAlbum || rAlbum.includes(nAlbum) || nAlbum.includes(rAlbum)
      if (artistOk && albumOk && r.artworkUrl100) {
        const url = r.artworkUrl100.replace('100x100', '600x600')
        const ctrl2 = new AbortController()
        const t2 = setTimeout(() => ctrl2.abort(), 8000)
        const img = await fetch(url, { signal: ctrl2.signal })
        clearTimeout(t2)
        if (!img.ok) continue
        const buf = Buffer.from(await img.arrayBuffer())
        if (buf.length < 2000) continue
        const ct = img.headers.get('content-type') || 'image/jpeg'
        return { ext: extFromMime(ct), data: buf }
      }
    }
    return null
  } catch {
    return null
  }
}

/** Manual artwork set by the user (metadata editor / song menu). */
export function setManualArt(opts: {
  songId: number
  album: string
  artist: string
  albumArtist: string
  imagePath: string
}): string | null {
  const base =
    opts.album && opts.artist
      ? albumArtKeyBase(opts.album, opts.albumArtist || opts.artist)
      : songArtKeyBase(`song:${opts.songId}`)
  const key = copyArtFromFile(base, opts.imagePath, true)
  if (!key) return null
  tx(() => {
    getDb()
      .prepare('UPDATE songs SET art_key=?, art_source=? WHERE id=?')
      .run(key, 'manual', opts.songId)
  })
  return key
}

/** Copy a profile avatar image into the artwork cache. */
export function setAvatarImage(imagePath: string): string | null {
  const key = copyArtFromFile('avatar', imagePath, true)
  return key
}

export function avatarPath(): string {
  const p = artPath('avatar.jpg')
  if (fs.existsSync(p)) return p
  const p2 = artPath('avatar.png')
  return fs.existsSync(p2) ? p2 : ''
}

export async function cacheStats(): Promise<{ files: number; bytes: number }> {
  try {
    const files = await fsp.readdir(cacheDir)
    let bytes = 0
    for (const f of files) {
      try {
        bytes += (await fsp.stat(path.join(cacheDir, f))).size
      } catch {
        /* ignore */
      }
    }
    return { files: files.length, bytes }
  } catch {
    return { files: 0, bytes: 0 }
  }
}

export function imageContentType(key: string): string {
  return imageMimeByExt(path.extname(key))
}

/* ==================== §25 Dynamic album-art theme palette ====================
 * Dominant-color extraction runs in the MAIN process on a tiny downsample of
 * the cached artwork. Pure-JS decoders (jpeg-js / pngjs) only — no canvas, no
 * GPU, no native code — so the renderer can never die computing a glow color.
 */
interface Rgb {
  r: number
  g: number
  b: number
}

const PALETTE_CACHE = new Map<string, AlbumPalette | null>()

const DEFAULT_COBALT_PALETTE: AlbumPalette = {
  primary: '#3f7dff',
  secondary: '#29cfc0',
  accent: '#3f7dff',
  background: 'rgba(7, 11, 20, 0.96)',
  bgDark: 'rgba(7, 11, 20, 0.96)',
  bgLight: 'rgba(238, 242, 250, 0.98)',
  glow: 'rgba(63, 125, 255, 0.35)'
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: Math.round(h * 360), s, l }
}

interface ColorBucket {
  count: number
  rSum: number
  gSum: number
  bSum: number
  satSum: number
  hSum: number
}

function extractPalette(pixels: Uint8Array | Buffer): AlbumPalette | null {
  const buckets: ColorBucket[] = Array.from({ length: 12 }, () => ({
    count: 0,
    rSum: 0,
    gSum: 0,
    bSum: 0,
    satSum: 0,
    hSum: 0
  }))

  let totalValid = 0
  let saturatedCount = 0

  for (let i = 0; i + 2 < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const a = pixels[i + 3]
    if (a !== undefined && a < 128) continue

    const { h, s, l } = rgbToHsl(r, g, b)
    if (l < 0.08 || l > 0.94) continue

    totalValid++
    if (s > 0.22) saturatedCount++

    const bIdx = Math.min(11, Math.floor((h % 360) / 30))
    const bkt = buckets[bIdx]
    bkt.count++
    bkt.rSum += r
    bkt.gSum += g
    bkt.bSum += b
    bkt.satSum += s
    bkt.hSum += h
  }

  if (totalValid < 16) return DEFAULT_COBALT_PALETTE

  // Monochrome / Black & White cover fallback
  if (saturatedCount / totalValid < 0.06) {
    return DEFAULT_COBALT_PALETTE
  }

  // Score buckets by population & saturation
  const scored = buckets
    .map((b, idx) => {
      const avgSat = b.count > 0 ? b.satSum / b.count : 0
      const score = b.count * (0.6 + avgSat * 1.4)
      return {
        idx,
        count: b.count,
        score,
        avgSat,
        avgH: b.count > 0 ? Math.round(b.hSum / b.count) : idx * 30 + 15,
        r: b.count > 0 ? Math.round(b.rSum / b.count) : 0,
        g: b.count > 0 ? Math.round(b.gSum / b.count) : 0,
        b: b.count > 0 ? Math.round(b.bSum / b.count) : 0
      }
    })
    .filter((b) => b.count >= 8)

  if (!scored.length) return DEFAULT_COBALT_PALETTE

  scored.sort((a, b) => b.score - a.score)
  const dom = scored[0]

  // Find most vibrant accent bucket
  const vibrantCandidates = [...scored].sort((a, b) => b.avgSat - a.avgSat)
  const vibrant = vibrantCandidates[0] || dom

  // Find secondary color with at least 35° hue distance
  const secCandidate = scored.find((b) => {
    const diff = Math.abs(b.avgH - dom.avgH)
    return diff > 35 && diff < 325
  })
  const sec = secCandidate || {
    avgH: (dom.avgH + 40) % 360,
    avgSat: Math.max(0.4, dom.avgSat),
    r: Math.round(dom.r * 0.8),
    g: Math.round(dom.g * 0.9),
    b: Math.round(dom.b * 1.1)
  }

  const primH = dom.avgH
  const primS = Math.round(Math.max(40, Math.min(85, dom.avgSat * 100)))
  const primL = 52
  const primary = `hsl(${primH} ${primS}% ${primL}%)`

  const secH = sec.avgH
  const secS = Math.round(Math.max(35, Math.min(80, (sec.avgSat || 0.5) * 100)))
  const secondary = `hsl(${secH} ${secS}% 50%)`

  const accH = vibrant.avgH
  const accS = Math.round(Math.max(55, Math.min(95, vibrant.avgSat * 120)))
  const accent = `hsl(${accH} ${accS}% 54%)`

  const glow = `hsla(${accH}, ${accS}%, 55%, 0.38)`
  const bgDark = `hsla(${primH}, ${Math.min(28, primS)}%, 8%, 0.96)`
  const bgLight = `hsla(${primH}, ${Math.min(22, primS)}%, 96%, 0.98)`

  return {
    primary,
    secondary,
    accent,
    background: bgDark,
    bgDark,
    bgLight,
    glow
  }
}

function downsample(data: Uint8Array | Buffer, w: number, h: number, ch: number): Buffer {
  const size = 28
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const sy = Math.min(h - 1, Math.floor((y / size) * h))
    for (let x = 0; x < size; x++) {
      const sx = Math.min(w - 1, Math.floor((x / size) * w))
      const si = (sy * w + sx) * ch
      const di = (y * size + x) * 4
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
      out[di + 3] = ch === 4 ? data[si + 3] : 255
    }
  }
  return out
}

/** Dominant color palette of cached artwork (null if unavailable). */
export function artPalette(key: string | null | undefined): AlbumPalette | null {
  if (!key || !cacheDir) return null
  if (PALETTE_CACHE.has(key)) return PALETTE_CACHE.get(key) ?? null
  let result: AlbumPalette | null = null
  try {
    const p = artPath(key)
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p)
      const ext = path.extname(p).toLowerCase()
      if (ext === '.png') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PNG = require('pngjs').PNG
        const png = PNG.sync.read(buf)
        result = extractPalette(downsample(png.data, png.width, png.height, 4))
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const jpeg = require('jpeg-js')
        const img = jpeg.decode(buf, { maxMemoryUsageInMB: 128, useTArray: true })
        result = extractPalette(downsample(img.data, img.width, img.height, 4))
      }
    }
  } catch {
    result = null
  }
  PALETTE_CACHE.set(key, result)
  if (PALETTE_CACHE.size > 200) {
    const first = PALETTE_CACHE.keys().next().value
    if (first) PALETTE_CACHE.delete(first)
  }
  return result
}
