// PlayPix renderer — Home-wide playback context (§6)
// Clicking any song on Home continues through ONE home-wide queue instead of
// dead-ending at the end of the small section the user happened to click.
import type { HomeData, Song } from '../../../shared/types'
import { hueFromString } from './utils'

/**
 * Build the persistent Home queue: Home listening content first (recent,
 * fresh, favorites), then the rest of the library as backfill so the music
 * never stops just because a section was short. Order is stable — the queue
 * reads like a personal radio lineup, deduped by song id.
 */
export function buildHomeQueue(home: HomeData | null, songs: Song[]): Song[] {
  if (!home) return songs.filter((s) => !s.missing && !!s.path)
  const seen = new Set<number>()
  const out: Song[] = []
  const push = (list: Song[]): void => {
    for (const s of list) {
      if (s && !seen.has(s.id) && !s.missing && !!s.path) {
        seen.add(s.id)
        out.push(s)
      }
    }
  }
  push(home.recentlyPlayed)
  push(home.recentlyAdded)
  push(home.favorites)
  push(songs)
  return out
}

/**
 * Heavy Rotation (§7): most-played songs, most recent wins on ties.
 */
export function heavyRotation(songs: Song[], limit = 10): Song[] {
  return songs
    .filter((s) => !s.missing && s.playCount > 0)
    .sort((a, b) => b.playCount - a.playCount || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, limit)
}

/**
 * Quick Picks (§7): a light, deterministic local blend — favorites, fresh
 * additions and most played interleaved. No AI, just the user's own data.
 */
export function quickPicks(songs: Song[], limit = 10): Song[] {
  const seen = new Set<number>()
  const out: Song[] = []
  const favs = songs.filter((s) => s.favorite && !s.missing).slice(0, 4)
  const fresh = songs
    .filter((s) => !s.missing)
    .sort((a, b) => b.dateAdded - a.dateAdded)
    .slice(0, 4)
  const played = heavyRotation(songs, 4)
  const lists = [favs, fresh, played]
  for (let round = 0; round < 4 && out.length < limit; round++) {
    for (const list of lists) {
      const s = list[round]
      if (s && !seen.has(s.id) && !s.missing) {
        seen.add(s.id)
        out.push(s)
        if (out.length >= limit) break
      }
    }
  }
  return out
}

/**
 * "Artists you've been listening to" (§7): artists behind recent plays.
 */
export function recentArtistNames(home: HomeData | null, limit = 8): string[] {
  if (!home) return []
  const seen: string[] = []
  for (const s of home.recentlyPlayed) {
    const a = (s.artist || '').trim()
    if (a && !seen.some((x) => x.toLowerCase() === a.toLowerCase())) seen.push(a)
    if (seen.length >= limit) break
  }
  return seen
}

/**
 * "Albums you might want to hear" (§7): albums scored by plays of their
 * songs plus a recency boost when the artist was played recently.
 */
export function albumSuggestions(albums: import('../../../shared/types').Album[], songs: Song[], limit = 10) {
  const now = Date.now()
  const score = new Map<string, number>()
  for (const s of songs) {
    if (s.missing) continue
    const key = `${(s.album || '').toLowerCase()}|||${((s.albumArtist || s.artist) || '').toLowerCase()}`
    if (!key.replace('|', '')) continue
    const cur = score.get(key) ?? 0
    let v = cur + (s.playCount || 0) * 2
    if (s.lastPlayed && now - s.lastPlayed < 21 * 86400000) v += 3
    if (s.favorite) v += 2
    score.set(key, v)
  }
  return albums
    .map((a) => ({ a, v: score.get(a.key.toLowerCase()) ?? 0 }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v)
    .slice(0, limit)
    .map((x) => x.a)
}

/* ==================== Home redesign: moods, genres, top artists ==================== */

export interface MoodSpec {
  key: string
  name: string
  icon: string
  /** CSS gradient for the mood card. */
  grad: string
  /** Substring keywords matched against the song genre (lowercase). */
  re: RegExp
}

/** The five signature moods of the redesigned Home (order = display order). */
export const MOODS: MoodSpec[] = [
  {
    key: 'chill',
    name: 'Chill',
    icon: 'wave',
    grad: 'linear-gradient(155deg, #2fd68f 0%, #0e9f9f 100%)',
    re: /chill|ambient|lo-?fi|acoustic|jazz|classical|downtempo|smooth|dream|chillout|nu jazz/i
  },
  {
    key: 'focus',
    name: 'Focus',
    icon: 'target',
    grad: 'linear-gradient(155deg, #8b5cf6 0%, #5b21b6 100%)',
    re: /focus|study|instrumental|piano|minimal|electronic|deep|techno/i
  },
  {
    key: 'workout',
    name: 'Workout',
    icon: 'dumbbell',
    grad: 'linear-gradient(155deg, #ff9147 0%, #ef4056 100%)',
    re: /workout|gym|sport|energy|dance|edm|hip.?hop|rap|metal|rock|power|punk/i
  },
  {
    key: 'road trip',
    name: 'Road Trip',
    icon: 'car',
    grad: 'linear-gradient(155deg, #38bdf8 0%, #2456e6 100%)',
    re: /road|drive|travel|country|blues|rock|indie|alternative|synthwave/i
  },
  {
    key: 'indie',
    name: 'Indie',
    icon: 'leaf',
    grad: 'linear-gradient(155deg, #f472b6 0%, #d9368f 100%)',
    re: /indie|alternative|folk|singer.?songwriter|indie rock|indie pop/i
  }
]

/** Deterministic per-seed shuffle so a mood mix is stable across re-renders. */
function seededShuffle(list: Song[], seed: string): Song[] {
  const out = [...list]
  let h = hueFromString(seed)
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Mood mix (§7 redesign): songs whose genre matches the mood first (most
 * played first), topped up with a deterministic shuffle of the library when
 * the genre match is thin. Purely data-driven — no AI, no network.
 */
export function moodMix(songs: Song[], mood: MoodSpec, limit = 30): Song[] {
  const pool = songs.filter((s) => !s.missing && !!s.path)
  const matched = pool
    .filter((s) => mood.re.test(s.genre || ''))
    .sort((a, b) => b.playCount - a.playCount || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
  if (matched.length >= 3) return matched.slice(0, limit)
  const seen = new Set(matched.map((s) => s.id))
  const fill = seededShuffle(pool, mood.key).filter((s) => !seen.has(s.id))
  return [...matched, ...fill].slice(0, limit)
}

/** Genre chips (§7 redesign): real genres from the library, most songs first. */
export function topGenres(songs: Song[], limit = 7): { name: string; count: number }[] {
  const tally = new Map<string, number>()
  for (const s of songs) {
    if (s.missing) continue
    const g = (s.genre || '').trim()
    if (!g) continue
    for (const part of g.split(/[,;|/]/)) {
      const name = part.trim()
      if (!name) continue
      tally.set(name, (tally.get(name) ?? 0) + 1)
    }
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** All songs of one genre (chip click → instant genre mix). */
export function songsForGenre(songs: Song[], genre: string, limit = 30): Song[] {
  const re = new RegExp(`^${genre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  return songs
    .filter((s) => !s.missing && (s.genre || '').split(/[,;|/]/).some((g) => re.test(g.trim())))
    .sort((a, b) => b.playCount - a.playCount || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, limit)
}

/** Popular Artists (§7 redesign): ranked by their songs' plays, then size. */
export function topArtistsByPlays(
  artists: { key: string; name: string; songCount: number; albumCount: number; artKey: string | null }[],
  songs: Song[],
  limit = 10
): typeof artists {
  const plays = new Map<string, number>()
  for (const s of songs) {
    if (s.missing) continue
    for (const a of [s.artist, s.albumArtist]) {
      const k = (a || '').trim().toLowerCase()
      if (k) plays.set(k, (plays.get(k) ?? 0) + (s.playCount || 0))
    }
  }
  return [...artists]
    .sort(
      (x, y) =>
        (plays.get(y.key.toLowerCase()) ?? 0) - (plays.get(x.key.toLowerCase()) ?? 0) ||
        y.songCount - x.songCount
    )
    .slice(0, limit)
}
