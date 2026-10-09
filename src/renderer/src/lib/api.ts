// PlayPix renderer — typed API bridge
import type {
  Album,
  Artist,
  FolderInfo,
  HomeData,
  LibraryChangedEvent,
  LibraryData,
  PlaybackState,
  PlayerBroadcastState,
  PlayerCommand,
  Playlist,
  RemoveResult,
  ScanProgress,
  SearchResults,
  Song,
  StatsData,
  AlbumPalette
} from '../../../shared/types'

export interface PlayPixApi {
  version: () => Promise<string>
  getSettings: () => Promise<Record<string, unknown>>
  setSetting: (key: string, value: unknown) => Promise<boolean>
  setAvatarFile: (p: string) => Promise<string | null>
  avatarPath: () => Promise<string>

  winMinimize: () => void
  winMaximizeToggle: () => void
  winClose: () => void
  winIsMaximized: () => Promise<boolean>
  onWindowMaximized: (cb: (max: boolean) => void) => () => void

  openMiniPlayer: () => void
  closeMiniPlayer: () => void
  minimizeMiniPlayer: () => void
  isMiniPlayerOpen: () => Promise<boolean>
  toggleMiniAlwaysOnTop: () => Promise<boolean>

  startScan: (roots?: string[]) => Promise<ScanProgress>
  cancelScan: () => Promise<ScanProgress>
  getScanState: () => Promise<ScanProgress>
  onScanEvent: (cb: (p: ScanProgress) => void) => () => void

  getLibrary: () => Promise<LibraryData>
  getHome: () => Promise<HomeData>
  artPalette: (key: string | null) => Promise<AlbumPalette | null>
  getFolders: () => Promise<FolderInfo[]>
  songsByAlbum: (key: string) => Promise<Song[]>
  songsByArtist: (key: string) => Promise<Song[]>
  songsByFolder: (p: string) => Promise<Song[]>
  playlistTracks: (id: number) => Promise<Song[]>
  songsByIds: (ids: number[]) => Promise<Song[]>
  search: (term: string) => Promise<SearchResults>
  toggleFavorite: (id: number) => Promise<boolean>
  registerPlay: (id: number) => Promise<boolean>
  completePlay: (id: number, seconds?: number) => Promise<boolean>
  getStats: () => Promise<StatsData>
  editMetadata: (
    id: number,
    fields: Record<string, unknown>,
    artPath?: string
  ) => Promise<{ ok: boolean; warning?: string }>
  removeSongs: (ids: number[], trash: boolean) => Promise<RemoveResult>
  reveal: (p: string) => Promise<boolean>
  resetLibrary: () => Promise<boolean>

  createPlaylist: (name: string) => Promise<Playlist>
  renamePlaylist: (id: number, name: string) => Promise<boolean>
  deletePlaylist: (id: number) => Promise<boolean>
  addPlaylistTracks: (id: number, songIds: number[], atIndex?: number) => Promise<boolean>
  removePlaylistTrack: (id: number, position: number) => Promise<boolean>
  reorderPlaylist: (id: number, from: number, to: number) => Promise<boolean>

  pickFiles: () => Promise<string[] | null>
  pickFolder: () => Promise<string | null>
  pickImage: () => Promise<string | null>
  importPaths: (paths: string[]) => Promise<ScanProgress>

  listWatchFolders: () => Promise<string[]>
  addWatchFolder: (p: string) => Promise<boolean>
  removeWatchFolder: (p: string) => Promise<boolean>

  addSearchTerm: (term: string) => Promise<boolean>
  getSearchHistory: () => Promise<string[]>
  clearSearchHistory: () => Promise<boolean>

  savePlaybackState: (state: PlaybackState) => Promise<boolean>
  loadPlaybackState: () => Promise<PlaybackState | null>

  onLibraryChanged: (cb: (e: LibraryChangedEvent) => void) => () => void

  onMediaKey: (cb: (key: string) => void) => () => void

  broadcastPlayerState: (state: PlayerBroadcastState) => void
  onPlayerStateUpdated: (cb: (state: PlayerBroadcastState) => void) => () => void
  sendPlayerCommand: (action: PlayerCommand['action'], payload?: unknown) => void
  onPlayerCommand: (cb: (cmd: PlayerCommand) => void) => () => void
  requestPlayerState: () => void
  onRequestPlayerState: (cb: () => void) => () => void
  artFilePath: (key: string) => Promise<string | null>

  pathForFile: (file: File) => string

  e2ePing: () => Promise<boolean>
  e2eEnabled: boolean
}

export const api: PlayPixApi = (window as unknown as { playpix: PlayPixApi }).playpix

function mediaBase(): string {
  return (window as unknown as { __PP_MEDIA_BASE?: string }).__PP_MEDIA_BASE ?? ''
}

export function artUrl(key: string | null | undefined): string {
  if (!key) return ''
  const base = mediaBase()
  if (base) return `${base}/art/${encodeURIComponent(key)}`
  return `art:///${encodeURIComponent(key)}`
}

export function streamUrl(p: string): string {
  const base = mediaBase()
  if (base) return `${base}/stream?p=${encodeURIComponent(p)}`
  return `stream://file?p=${encodeURIComponent(p)}`
}
