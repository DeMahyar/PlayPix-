// PlayPix — shared types between main, preload and renderer

export interface Song {
  id: number
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  genre: string
  trackNo: number | null
  discNo: number | null
  year: number | null
  duration: number
  format: string
  bitrate: number | null
  sampleRate: number | null
  size: number
  artKey: string | null
  artSource: 'embedded' | 'local' | 'net' | 'manual' | null
  favorite: boolean
  playCount: number
  lastPlayed: number | null
  dateAdded: number
  missing: boolean
  altFiles: string[]
}

export interface Album {
  key: string
  name: string
  artist: string
  year: number | null
  artKey: string | null
  songCount: number
  duration: number
}

export interface Artist {
  key: string
  name: string
  songCount: number
  albumCount: number
  artKey: string | null
}

export interface FolderInfo {
  path: string
  name: string
  songCount: number
}

export interface Playlist {
  id: number
  name: string
  songCount: number
  dateCreated: number
  dateModified: number
  artKeys: (string | null)[]
}

export interface ScanProgress {
  phase: 'idle' | 'discovering' | 'importing' | 'finalizing' | 'done' | 'error' | 'cancelled'
  found: number
  processed: number
  imported: number
  duplicates: number
  errors: number
  total: number
  current: string
  startedAt: number | null
  endedAt: number | null
}

export interface PlaybackState {
  queue: number[]
  index: number
  position: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
}

export interface SearchResults {
  songs: Song[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
  genres: { name: string; count: number }[]
  total: number
}

export interface HomeData {
  recentlyPlayed: Song[]
  recentlyAdded: Song[]
  favorites: Song[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

export interface LibraryData {
  songs: Song[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
}

export interface MetadataEdit {
  title?: string
  artist?: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: number | null
}

export type ThemeMode = 'light' | 'dark' | 'system'

export interface LibraryChangedEvent {
  reason:
    | 'scan'
    | 'watch'
    | 'edit'
    | 'favorite'
    | 'playlist'
    | 'remove'
    | 'artwork'
    | 'history'
    | 'settings'
}

export interface RemoveOptions {
  trash: boolean
}

export interface RemoveResult {
  ok: boolean
  errors: string[]
}

// ---------- statistics (§27) ----------

export interface DayBucket {
  /** Day start timestamp (local midnight). */
  day: number
  /** Number of track plays started that day. */
  plays: number
  /** Approximate seconds actually listened that day. */
  seconds: number
}

export interface HistoryEntry {
  song: Song
  playedAt: number
  seconds: number
}

export interface ArtistPlayCount {
  name: string
  plays: number
}

export interface StatsData {
  totals: {
    songs: number
    albums: number
    artists: number
    favorites: number
    playlists: number
    /** Total track plays recorded (play_history rows). */
    tracksPlayed: number
    /** Approximate total listening seconds. */
    listeningSeconds: number
  }
  lastPlayed: Song | null
  mostPlayedSongs: Song[]
  mostPlayedArtists: ArtistPlayCount[]
  mostPlayedAlbums: Album[]
  history: HistoryEntry[]
  daily: DayBucket[]
}

// ---------- smart playlists (§26, renderer-resolved) ----------

export type SmartKind = 'most-played' | 'recently-played' | 'recently-added' | 'favorites'

export interface AlbumPalette {
  primary: string
  secondary: string
  accent: string
  background: string
  bgDark: string
  bgLight: string
  glow: string
}

export interface PlayerBroadcastState {
  current: Song | null
  isPlaying: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  repeat: 'off' | 'all' | 'one'
  shuffle: boolean
  favorite: boolean
  theme?: 'light' | 'dark'
  palette?: AlbumPalette | null
}

export interface PlayerCommand {
  action: 'togglePlay' | 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'toggleFavorite' | 'restoreMain'
  payload?: unknown
}

export type VisualizerMode = 'spectrum' | 'waveform' | 'circular' | 'particles'

