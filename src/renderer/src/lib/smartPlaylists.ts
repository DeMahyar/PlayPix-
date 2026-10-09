// PlayPix renderer — Smart Playlists (§26): rule-based local playlists
// Architecturally extensible: add a rule to SMART_RULES and it appears in
// Library → Playlists automatically. Everything resolves from the single
// local library snapshot — no cloud, no AI.
import type { SmartKind, Song } from '../../../shared/types'

export interface SmartRule {
  kind: SmartKind
  name: string
  desc: string
  icon: string
  resolve: (songs: Song[]) => Song[]
}

const DAY = 86400000

export const SMART_RULES: SmartRule[] = [
  {
    kind: 'most-played',
    name: 'Most Played',
    desc: 'Your top tracks by play count',
    icon: 'stats',
    resolve: (songs) =>
      songs
        .filter((s) => !s.missing && s.playCount > 0)
        .sort((a, b) => b.playCount - a.playCount || (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
        .slice(0, 100)
  },
  {
    kind: 'recently-played',
    name: 'Recently Played',
    desc: 'What you played lately',
    icon: 'clock',
    resolve: (songs) =>
      songs
        .filter((s) => !s.missing && s.lastPlayed)
        .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
        .slice(0, 100)
  },
  {
    kind: 'recently-added',
    name: 'Recently Added',
    desc: 'Fresh imports into your library',
    icon: 'plus',
    resolve: (songs) =>
      songs
        .filter((s) => !s.missing)
        .sort((a, b) => b.dateAdded - a.dateAdded)
        .slice(0, 100)
  },
  {
    kind: 'favorites',
    name: 'Favorites',
    desc: 'Everything you have hearted',
    icon: 'heart',
    resolve: (songs) =>
      songs
        .filter((s) => s.favorite && !s.missing)
        .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
  }
]

export function smartRule(kind: SmartKind): SmartRule {
  return SMART_RULES.find((r) => r.kind === kind) ?? SMART_RULES[0]
}

/** Cheap count for the card badge, without materializing the full list. */
export function smartCount(kind: SmartKind, songs: Song[]): number {
  if (kind === 'favorites') return songs.filter((s) => s.favorite && !s.missing).length
  if (kind === 'most-played') return songs.filter((s) => !s.missing && s.playCount > 0).length
  if (kind === 'recently-played') return songs.filter((s) => !s.missing && s.lastPlayed).length
  if (kind === 'recently-added') {
    const cutoff = Date.now() - 30 * DAY
    return songs.filter((s) => !s.missing && s.dateAdded >= cutoff).length
  }
  return 0
}
