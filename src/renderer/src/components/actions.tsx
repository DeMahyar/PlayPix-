// PlayPix renderer — shared song/album/artist/playlist actions (context menus, flows)
import { api } from '../lib/api'
import type { CtxMenuItem } from '../state/ui'
import { useUI } from '../state/ui'
import { usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import type { Album, Artist, Playlist, Song } from '../../../shared/types'

type UI = ReturnType<typeof useUI>
type Player = ReturnType<typeof usePlayer>
type Lib = ReturnType<typeof useLibrary>

export function playlistSubMenu(ui: UI, lib: Lib, songs: Song[]): CtxMenuItem[] {
  const items: CtxMenuItem[] = lib.playlists.map((p) => ({
    label: p.name,
    icon: 'queue',
    onClick: () => {
      void api
        .addPlaylistTracks(p.id, songs.map((s) => s.id))
        .then(() => ui.toast(`Added ${songs.length} song${songs.length > 1 ? 's' : ''} to "${p.name}"`))
    }
  }))
  items.push({
    sep: true,
    label: ''
  })
  items.push({
    label: 'New playlist…',
    icon: 'plus',
    onClick: () => {
      void ui.prompt({ title: 'Create playlist', value: 'My Playlist', okLabel: 'Create' }).then(
        (name) => {
          if (!name?.trim()) return
          void api.createPlaylist(name.trim()).then((pl) => {
            void api.addPlaylistTracks(pl.id, songs.map((s) => s.id))
            ui.toast(`Added to "${pl.name}"`)
            lib.refresh('playlist')
          })
        }
      )
    }
  })
  return items
}

export function removeSongsFlow(ui: UI, songs: Song[], onDone?: () => void): void {
  const n = songs.length
  void ui
    .confirm({
      title: n === 1 ? 'Remove this song from your library?' : `Remove ${n} songs from your library?`,
      body: 'The song will disappear from PlayPix. Your audio files on disk are never touched.',
      okLabel: 'Remove',
      danger: true
    })
    .then((ok) => {
      if (!ok) return
      void api.removeSongs(songs.map((s) => s.id), false).then((res) => {
        ui.toast(n === 1 ? 'Removed from library' : `Removed ${n} songs`)
        if (res?.errors?.length) ui.toast(`${res.errors.length} item(s) could not be fully processed`, 'error')
        onDone?.()
      })
    })
}

/** Delete songs AND move their files to the OS Recycle Bin (recoverable). */
export function deleteSongsFlow(ui: UI, songs: Song[], onDone?: () => void): void {
  const n = songs.length
  void ui
    .confirm({
      title:
        n === 1
          ? `Delete "${songs[0]?.title ?? 'song'}" from your PC?`
          : `Delete ${n} songs from your PC?`,
      body:
        'The files are moved to the Recycle Bin and removed from PlayPix. You can restore them from the Recycle Bin if you change your mind.',
      okLabel: 'Delete',
      danger: true
    })
    .then((ok) => {
      if (!ok) return
      void api.removeSongs(songs.map((s) => s.id), true).then((res) => {
        const bad = res?.errors?.length ?? 0
        if (bad) ui.toast(`Deleted from library — ${bad} file(s) could not be moved to the Recycle Bin`, 'error')
        else ui.toast(n === 1 ? 'Moved to Recycle Bin' : `${n} songs moved to Recycle Bin`)
        onDone?.()
      })
    })
}

/** Shared "Add music" menu — manual import entry points (files, folder, full scan). */
export function addMusicMenu(ui: UI, _lib?: Lib): CtxMenuItem[] {
  return [
    {
      label: 'Add files…',
      icon: 'note',
      onClick: () => {
        void api.pickFiles().then((paths) => {
          if (!paths?.length) return
          ui.toast(`Importing ${paths.length} file${paths.length > 1 ? 's' : ''}…`)
          void api.importPaths(paths).then((prog) => reportImport(ui, prog, paths.length))
        })
      }
    },
    {
      label: 'Add folder…',
      icon: 'folder',
      onClick: () => {
        void api.pickFolder().then((p) => {
          if (!p) return
          ui.toast('Importing folder…')
          void api.importPaths([p]).then((prog) => reportImport(ui, prog, 1))
        })
      }
    },
    { sep: true, label: '' },
    {
      label: 'Scan my PC',
      icon: 'scan',
      onClick: () => void api.startScan()
    }
  ]
}

/** Human summary of an import run (scanner progress snapshot at completion). */
export function reportImport(
  ui: UI,
  prog: { phase: string; imported: number; duplicates: number; errors: number },
  requested: number
): void {
  const bits: string[] = []
  if (prog.imported > 0) bits.push(`added ${prog.imported} song${prog.imported > 1 ? 's' : ''}`)
  if (prog.duplicates > 0) bits.push(`${prog.duplicates} duplicate${prog.duplicates > 1 ? 's' : ''} merged`)
  if (prog.errors > 0) bits.push(`${prog.errors} file${prog.errors > 1 ? 's' : ''} failed`)
  if (!bits.length) {
    ui.toast(requested > 1 ? 'Nothing new to add — those songs are already in your library' : 'Nothing new to add')
    return
  }
  ui.toast(`Import finished: ${bits.join(' · ')}`, prog.errors > 0 ? 'error' : 'info')
}

export function songMenu(ui: UI, player: Player, lib: Lib, song: Song, extra?: CtxMenuItem[]): CtxMenuItem[] {
  return [
    { label: 'Play', icon: 'play', onClick: () => player.playContext([song], 0) },
    { label: 'Play next', icon: 'note', onClick: () => player.playNext(song) },
    { label: 'Add to queue', icon: 'queue', onClick: () => player.addToQueue(song) },
    { sep: true, label: '' },
    {
      label: song.favorite ? 'Remove from favorites' : 'Add to favorites',
      icon: 'heart',
      onClick: () => player.toggleFavorite(song.id)
    },
    { label: 'Add to playlist', icon: 'plus', sub: playlistSubMenu(ui, lib, [song]) },
    { sep: true, label: '' },
    { label: 'Edit metadata', icon: 'edit', onClick: () => ui.setEditSong(song) },
    { label: 'Show in folder', icon: 'external-open', onClick: () => void api.reveal(song.path) },
    ...(extra ?? []),
    { sep: true, label: '' },
    {
      label: 'Remove from library',
      icon: 'trash',
      danger: true,
      onClick: () => removeSongsFlow(ui, [song])
    },
    {
      label: 'Delete from PC (Recycle Bin)',
      icon: 'trash',
      danger: true,
      onClick: () => deleteSongsFlow(ui, [song])
    }
  ]
}

export function albumMenu(ui: UI, player: Player, lib: Lib, album: Album, songs: Song[]): CtxMenuItem[] {
  return [
    { label: 'Play album', icon: 'play', onClick: () => player.playContext(songs, 0) },
    { label: 'Shuffle album', icon: 'shuffle', onClick: () => player.playContext(songs, 0, { shuffle: true }) },
    { sep: true, label: '' },
    { label: 'Add to queue', icon: 'queue', onClick: () => songs.forEach((s) => player.addToQueue(s)) },
    { label: 'Add to playlist', icon: 'plus', sub: playlistSubMenu(ui, lib, songs) },
    { sep: true, label: '' },
    { label: 'Show in folder', icon: 'external-open', onClick: () => songs[0] && void api.reveal(songs[0].path) }
  ]
}

export function artistMenu(player: Player, songs: Song[]): CtxMenuItem[] {
  return [
    { label: 'Play', icon: 'play', onClick: () => player.playContext(songs, 0) },
    { label: 'Shuffle', icon: 'shuffle', onClick: () => player.playContext(songs, 0, { shuffle: true }) },
    { sep: true, label: '' },
    { label: 'Add to queue', icon: 'queue', onClick: () => songs.forEach((s) => player.addToQueue(s)) }
  ]
}

export function playlistMenu(
  ui: UI,
  player: Player,
  lib: Lib,
  pl: Playlist,
  tracks: Song[],
  refresh: () => void
): CtxMenuItem[] {
  return [
    { label: 'Play', icon: 'play', onClick: () => player.playContext(tracks, 0) },
    { label: 'Shuffle', icon: 'shuffle', onClick: () => player.playContext(tracks, 0, { shuffle: true }) },
    { sep: true, label: '' },
    {
      label: 'Rename',
      icon: 'edit',
      onClick: () => {
        void ui.prompt({ title: 'Rename playlist', value: pl.name, okLabel: 'Rename' }).then((name) => {
          if (!name?.trim()) return
          void api.renamePlaylist(pl.id, name.trim()).then(() => refresh())
        })
      }
    },
    {
      label: 'Delete playlist',
      icon: 'trash',
      danger: true,
      onClick: () => {
        void ui
          .confirm({
            title: `Delete "${pl.name}"?`,
            body: 'The playlist is removed from PlayPix. Your songs stay in the library.',
            okLabel: 'Delete',
            danger: true
          })
          .then((ok) => {
            if (!ok) return
            void api.deletePlaylist(pl.id).then(() => {
              ui.toast('Playlist deleted')
              refresh()
            })
          })
      }
    }
  ]
}

export function playAlbumOrList(player: Player, songs: Song[], start = 0): void {
  player.playContext(songs, start)
}
