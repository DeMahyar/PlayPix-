// PlayPix main — IPC API surface (single, typed registry)
import { ipcMain, dialog } from 'electron'
import { getAllSettings, setSetting, getDb } from './services/db'
import {
  scanner
} from './services/scanner'
import * as lib from './services/library'
import * as playlists from './services/playlists'
import * as artwork from './services/artwork'
import * as watcher from './services/watcher'
import { getMainWindow, getMiniWindow } from './window'
import type { MetadataEdit, RemoveOptions } from '../shared/types'

const AUDIO_OPEN_FILTERS = [
  { name: 'Audio files', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'm4b', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif'] },
  { name: 'All files', extensions: ['*'] }
]

export function sendToRenderer(channel: string, payload: unknown): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send(channel, payload)
    } catch {
      /* window gone */
    }
  }
}

export function notifyLibraryChanged(reason: string): void {
  sendToRenderer('library:changed', { reason })
}

export function registerIpc(): void {
  // ---------- app ----------
  ipcMain.handle('app:version', () => process.env.npm_package_version || '1.0.0')
  ipcMain.handle('app:getSettings', () => getAllSettings())
  ipcMain.handle('app:setSetting', (_e, key: string, value: unknown) => {
    setSetting(String(key), value)
    notifyLibraryChanged('settings')
    return true
  })
  ipcMain.handle('app:setAvatarFile', (_e, p: string) => {
    const key = artwork.setAvatarImage(String(p))
    notifyLibraryChanged('settings')
    return key
  })
  ipcMain.handle('app:avatarPath', () => artwork.avatarPath())

  // ---------- scan ----------
  ipcMain.handle('scan:start', async (_e, roots?: string[]) => {
    const res = scanner.isRunning() ? scanner.getProgress() : await scanner.start(roots)
    return res
  })
  ipcMain.handle('scan:cancel', () => {
    scanner.cancel()
    return scanner.getProgress()
  })
  ipcMain.handle('scan:getState', () => scanner.getProgress())

  // ---------- library ----------
  ipcMain.handle('lib:getAll', () => lib.getLibraryData())
  ipcMain.handle('lib:home', () => lib.getHomeData())
  ipcMain.handle('art:palette', (_e, key: string | null) => artwork.artPalette(key))
  ipcMain.handle('lib:folders', () => lib.getFolders())
  ipcMain.handle('lib:songsByAlbum', (_e, key: string) => lib.getSongsByAlbum(String(key)))
  ipcMain.handle('lib:songsByArtist', (_e, key: string) => lib.getSongsByArtist(String(key)))
  ipcMain.handle('lib:songsByFolder', (_e, p: string) => lib.getSongsByFolder(String(p)))
  ipcMain.handle('lib:playlistTracks', (_e, id: number) => lib.getSongsByIds(playlistTrackIds(Number(id))))
  ipcMain.handle('lib:songsByIds', (_e, ids: number[]) => lib.getSongsByIds((ids || []).map(Number)))
  ipcMain.handle('lib:search', (_e, term: string) => lib.search(String(term ?? '')))
  ipcMain.handle('lib:toggleFavorite', (_e, id: number) => {
    const fav = lib.toggleFavorite(Number(id))
    notifyLibraryChanged('favorite')
    return fav
  })
  ipcMain.handle('lib:registerPlay', (_e, id: number) => {
    lib.registerPlay(Number(id))
    notifyLibraryChanged('history')
    return true
  })
  ipcMain.handle('lib:completePlay', (_e, id: number, seconds?: number) => {
    lib.completePlay(Number(id), typeof seconds === 'number' ? seconds : undefined)
    return true
  })
  ipcMain.handle('lib:stats', () => lib.getStats())
  ipcMain.handle('lib:editMetadata', async (_e, id: number, fields: MetadataEdit, artPath?: string) => {
    const res = await lib.editMetadata(Number(id), fields || {}, artPath || undefined)
    notifyLibraryChanged('edit')
    return res
  })
  ipcMain.handle('lib:removeSongs', (_e, ids: number[], opts: RemoveOptions) => {
    const res = lib.removeSongs((ids || []).map(Number), { trash: !!opts?.trash })
    notifyLibraryChanged('remove')
    return res
  })
  ipcMain.handle('lib:reveal', (_e, p: string) => {
    lib.revealInFolder(String(p))
    return true
  })
  ipcMain.handle('lib:resetLibrary', () => {
    lib.resetLibrary()
    notifyLibraryChanged('remove')
    return true
  })

  // ---------- playlists ----------
  ipcMain.handle('pl:create', (_e, name: string) => {
    const p = playlists.createPlaylist(String(name ?? ''))
    notifyLibraryChanged('playlist')
    return p
  })
  ipcMain.handle('pl:rename', (_e, id: number, name: string) => {
    const ok = playlists.renamePlaylist(Number(id), String(name ?? ''))
    notifyLibraryChanged('playlist')
    return ok
  })
  ipcMain.handle('pl:delete', (_e, id: number) => {
    const ok = playlists.deletePlaylist(Number(id))
    notifyLibraryChanged('playlist')
    return ok
  })
  ipcMain.handle('pl:addTracks', (_e, id: number, songIds: number[], atIndex?: number) => {
    const ok = playlists.addTracks(Number(id), (songIds || []).map(Number), atIndex)
    notifyLibraryChanged('playlist')
    return ok
  })
  ipcMain.handle('pl:removeTrack', (_e, id: number, position: number) => {
    const ok = playlists.removeTrack(Number(id), Number(position))
    notifyLibraryChanged('playlist')
    return ok
  })
  ipcMain.handle('pl:reorder', (_e, id: number, from: number, to: number) => {
    const ok = playlists.reorderTrack(Number(id), Number(from), Number(to))
    notifyLibraryChanged('playlist')
    return ok
  })

  // ---------- import ----------
  ipcMain.handle('imp:pickFiles', async () => {
    const win = getMainWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import music files',
      filters: AUDIO_OPEN_FILTERS,
      properties: ['openFile', 'multiSelections']
    })
    return res.canceled ? null : res.filePaths
  })
  ipcMain.handle('imp:pickFolder', async () => {
    const win = getMainWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import a music folder',
      properties: ['openDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('imp:pickImage', async () => {
    const win = getMainWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose artwork',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'] }],
      properties: ['openFile']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('imp:import', async (_e, paths: string[]) => {
    const list = (paths || []).map(String)
    if (!list.length) return scanner.getProgress()
    return scanner.isRunning() ? scanner.getProgress() : await scanner.importPaths(list)
  })

  // ---------- watch folders ----------
  ipcMain.handle('watch:list', () => watcher.getWatchFolders())
  ipcMain.handle('watch:add', (_e, p: string) => {
    watcher.addWatchFolders([String(p)])
    notifyLibraryChanged('settings')
    return true
  })
  ipcMain.handle('watch:remove', (_e, p: string) => {
    watcher.removeWatchFolder(String(p))
    notifyLibraryChanged('settings')
    return true
  })

  // ---------- search history ----------
  ipcMain.handle('sh:add', (_e, term: string) => {
    lib.addSearchTerm(String(term ?? ''))
    return true
  })
  ipcMain.handle('sh:list', () => lib.getSearchHistory())
  ipcMain.handle('sh:clear', () => {
    lib.clearSearchHistory()
    return true
  })

  // ---------- playback state ----------
  ipcMain.handle('state:savePlayback', (_e, state: unknown) => {
    setSetting('playbackState', state)
    return true
  })
  ipcMain.handle('state:loadPlayback', () => {
    return getAllSettings()['playbackState'] ?? null
  })

  // ---------- mini player & playback relay ----------
  ipcMain.on('player:broadcastState', (_e, state: unknown) => {
    const mini = getMiniWindow()
    if (mini && !mini.isDestroyed()) {
      mini.webContents.send('player:stateUpdated', state)
    }
  })

  ipcMain.on('player:command', (_e, cmd: unknown) => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) {
      main.webContents.send('player:executeCommand', cmd)
    }
  })

  ipcMain.on('player:requestState', () => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) {
      main.webContents.send('player:requestState')
    }
  })

  ipcMain.handle('art:filePath', (_e, key: string) => {
    return artwork.hasArt(String(key)) ? artwork.artPath(String(key)) : null
  })

  // ---------- e2e test hook ----------
  ipcMain.handle('e2e:ping', () => {
    ipcMain.emit('e2e:renderer-ready')
    return true
  })
}

/** Playlist track ids in order (positions). */
function playlistTrackIds(playlistId: number): number[] {
  const rows = getDb()
    .prepare('SELECT song_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position')
    .all(Number(playlistId)) as { song_id: number }[]
  return rows.map((r) => r.song_id)
}
