// PlayPix main — small utilities
import * as crypto from 'crypto'
import * as path from 'path'

/** Normalize a string for identity comparisons (dedupe, artwork matching). */
export function norm(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Duplicate identity key. Two files with the same normalized title + artist + album
 * represent the same library song. Conservative: never merges songs without artist info.
 */
export function dupKey(m: {
  title: string
  artist: string
  albumArtist: string
  album: string
  duration: number
}): string {
  const title = norm(m.title)
  const artist = norm(m.albumArtist || m.artist)
  if (!title || !artist) return ''
  const album = norm(m.album)
  if (album) return `t:${title}|a:${artist}|b:${album}`
  // No album info — fall back to duration bucket (~±3s tolerance)
  const bucket = Math.round((m.duration || 0) / 6)
  return `t:${title}|a:${artist}|d:${bucket}`
}

export function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 20)
}

/** Quality score used to pick the "best" file among duplicates. */
const FORMAT_RANK: Record<string, number> = {
  flac: 60,
  alac: 55,
  wav: 50,
  aiff: 48,
  aif: 48,
  aac: 40,
  m4a: 40,
  ogg: 36,
  oga: 36,
  opus: 36,
  mp3: 30,
  wma: 20
}

export function qualityScore(m: {
  format: string
  bitrate: number | null
  size: number
  hasArt: boolean
  year: number | null
}): number {
  const rank = FORMAT_RANK[(m.format || '').toLowerCase()] ?? 10
  const bitrate = Math.min(20, (m.bitrate || 0) / 16000)
  return rank + bitrate + (m.hasArt ? 3 : 0) + (m.year ? 1 : 0) + Math.min(5, m.size / 5e8)
}

export function baseName(p: string): string {
  return path.basename(p, path.extname(p))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Yield to the event loop so heavy loops never starve IPC. */
export function yieldLoop(): Promise<void> {
  return new Promise((r) => setImmediate(r))
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** Fisher-Yates shuffle returning a new array. */
export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}
