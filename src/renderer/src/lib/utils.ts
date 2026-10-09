// PlayPix renderer — helpers
import type { Song } from '../../../shared/types'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function fmtTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60) % 60
  const h = Math.floor(sec / 3600)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtLongDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h > 0) return `${h} hr ${m} min`
  return `${m} min`
}

export function fmtSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}

export function songArtists(song: Pick<Song, 'artist' | 'albumArtist'>): string {
  return song.artist || song.albumArtist || 'Unknown artist'
}

export function songAlbum(song: Pick<Song, 'album'>): string {
  return song.album || 'Unknown album'
}

export function hueFromString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 360
}

export function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | null = null
  return ((...args: never[]) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as F
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '♪'
}

export function shuffleCopy<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
