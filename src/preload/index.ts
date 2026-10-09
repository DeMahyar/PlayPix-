// PlayPix preload — typed, allow-listed bridge between renderer and main.
import { contextBridge, ipcRenderer, webUtils } from 'electron'

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return ipcRenderer.invoke(channel, ...args)
}

function subscribe(channel: string): (cb: (data: unknown) => void) => () => void {
  return (cb: (data: unknown) => void) => {
    const handler = (_e: unknown, data: unknown): void => {
      cb(data)
    }
    ipcRenderer.on(channel, handler as never)
    return () => ipcRenderer.removeListener(channel, handler as never)
  }
}

const api = {
  // app
  version: () => invoke('app:version'),
  getSettings: () => invoke('app:getSettings'),
  setSetting: (key: string, value: unknown) => invoke('app:setSetting', key, value),
  setAvatarFile: (p: string) => invoke('app:setAvatarFile', p),
  avatarPath: () => invoke('app:avatarPath'),

  // window controls
  winMinimize: () => ipcRenderer.send('win:minimize'),
  winMaximizeToggle: () => ipcRenderer.send('win:maximize'),
  winClose: () => ipcRenderer.send('win:close'),
  winIsMaximized: () => invoke('win:isMaximized'),
  onWindowMaximized: subscribe('win:maximized'),

  // mini player window
  openMiniPlayer: () => ipcRenderer.send('win:openMiniPlayer'),
  closeMiniPlayer: () => ipcRenderer.send('win:closeMiniPlayer'),
  minimizeMiniPlayer: () => ipcRenderer.send('win:minimizeMiniPlayer'),
  isMiniPlayerOpen: () => invoke('win:isMiniPlayerOpen'),
  toggleMiniAlwaysOnTop: () => invoke('win:toggleMiniAlwaysOnTop'),

  // scan
  startScan: (roots?: string[]) => invoke('scan:start', roots),
  cancelScan: () => invoke('scan:cancel'),
  getScanState: () => invoke('scan:getState'),
  onScanEvent: subscribe('scan:event'),

  // library
  getLibrary: () => invoke('lib:getAll'),
  getHome: () => invoke('lib:home'),
  artPalette: (key: string | null) => invoke('art:palette', key),
  getFolders: () => invoke('lib:folders'),
  songsByAlbum: (key: string) => invoke('lib:songsByAlbum', key),
  songsByArtist: (key: string) => invoke('lib:songsByArtist', key),
  songsByFolder: (p: string) => invoke('lib:songsByFolder', p),
  playlistTracks: (id: number) => invoke('lib:playlistTracks', id),
  songsByIds: (ids: number[]) => invoke('lib:songsByIds', ids),
  search: (term: string) => invoke('lib:search', term),
  toggleFavorite: (id: number) => invoke('lib:toggleFavorite', id),
  registerPlay: (id: number) => invoke('lib:registerPlay', id),
  completePlay: (id: number, seconds?: number) => invoke('lib:completePlay', id, seconds),
  getStats: () => invoke('lib:stats'),
  editMetadata: (id: number, fields: Record<string, unknown>, artPath?: string) =>
    invoke('lib:editMetadata', id, fields, artPath),
  removeSongs: (ids: number[], trash: boolean) => invoke('lib:removeSongs', ids, { trash }),
  reveal: (p: string) => invoke('lib:reveal', p),
  resetLibrary: () => invoke('lib:resetLibrary'),

  // playlists
  createPlaylist: (name: string) => invoke('pl:create', name),
  renamePlaylist: (id: number, name: string) => invoke('pl:rename', id, name),
  deletePlaylist: (id: number) => invoke('pl:delete', id),
  addPlaylistTracks: (id: number, songIds: number[], atIndex?: number) =>
    invoke('pl:addTracks', id, songIds, atIndex),
  removePlaylistTrack: (id: number, position: number) => invoke('pl:removeTrack', id, position),
  reorderPlaylist: (id: number, from: number, to: number) => invoke('pl:reorder', id, from, to),

  // import & pickers
  pickFiles: () => invoke('imp:pickFiles'),
  pickFolder: () => invoke('imp:pickFolder'),
  pickImage: () => invoke('imp:pickImage'),
  importPaths: (paths: string[]) => invoke('imp:import', paths),

  // watch folders
  listWatchFolders: () => invoke('watch:list'),
  addWatchFolder: (p: string) => invoke('watch:add', p),
  removeWatchFolder: (p: string) => invoke('watch:remove', p),

  // search history
  addSearchTerm: (term: string) => invoke('sh:add', term),
  getSearchHistory: () => invoke('sh:list'),
  clearSearchHistory: () => invoke('sh:clear'),

  // playback state persistence
  savePlaybackState: (state: unknown) => invoke('state:savePlayback', state),
  loadPlaybackState: () => invoke('state:loadPlayback'),

  // events
  onLibraryChanged: subscribe('library:changed'),

  // Windows media keys (media_play_pause / next / prev)
  onMediaKey: subscribe('mediaKey'),

  // playback sync & mini player relay
  broadcastPlayerState: (state: unknown) => ipcRenderer.send('player:broadcastState', state),
  onPlayerStateUpdated: subscribe('player:stateUpdated'),
  sendPlayerCommand: (action: string, payload?: unknown) =>
    ipcRenderer.send('player:command', { action, payload }),
  onPlayerCommand: subscribe('player:executeCommand'),
  requestPlayerState: () => ipcRenderer.send('player:requestState'),
  onRequestPlayerState: subscribe('player:requestState'),
  artFilePath: (key: string) => invoke('art:filePath', key),

  // drag & drop support (File.path was removed in modern Electron)
  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  e2ePing: () => invoke('e2e:ping'),

  e2eEnabled: process.env.PLAYPIX_E2E === '1'
}

contextBridge.exposeInMainWorld('playpix', api)

export type PlayPixApi = typeof api
