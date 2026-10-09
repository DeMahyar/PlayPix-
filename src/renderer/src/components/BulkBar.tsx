// PlayPix renderer — bulk song selection hook + floating action bar
// Lets the user multi-select songs in the Library (ctrl/shift/checkbox)
// and run batch actions: play, queue, playlist, favorites, remove, delete.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../../../shared/types'
import { api } from '../lib/api'
import type { CtxMenuItem } from '../state/ui'
import type { useUI } from '../state/ui'
import type { usePlayer } from '../state/player'
import type { useLibrary } from '../state/library'
import { Icon } from './Icon'
import { playlistSubMenu, removeSongsFlow, deleteSongsFlow } from './actions'

export interface SelectionMods {
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

export interface BulkSelection {
  /** Selected song ids. */
  ids: Set<number>
  /** Selected songs in list order. */
  songs: Song[]
  count: number
  active: boolean
  /** Toggle/select a song. Checkbox click = select only this row; ctrl = add/remove; shift = range. */
  toggle: (song: Song, mods?: SelectionMods) => void
  isSelected: (id: number) => boolean
  clear: () => void
  selectAll: () => void
}

export function useBulkSelection(songs: Song[]): BulkSelection {
  const [ids, setIds] = useState<Set<number>>(new Set())
  const anchor = useRef<number | null>(null)
  const songsRef = useRef(songs)
  songsRef.current = songs

  // Prune ids that no longer exist (songs removed / library changed)
  useEffect(() => {
    setIds((cur) => {
      if (!cur.size) return cur
      const valid = new Set(songs.map((s) => s.id))
      const next = new Set([...cur].filter((id) => valid.has(id)))
      return next.size === cur.size ? cur : next
    })
  }, [songs])

  const toggle = useCallback((song: Song, mods?: SelectionMods) => {
    const list = songsRef.current
    const idx = list.findIndex((s) => s.id === song.id)
    if (idx < 0) return
    const shift = !!mods?.shiftKey
    const ctrl = !!mods?.ctrlKey || !!mods?.metaKey

    setIds((cur) => {
      if (shift && anchor.current !== null) {
        const [a, b] = [Math.min(anchor.current, idx), Math.max(anchor.current, idx)]
        const next = new Set(cur)
        for (let i = a; i <= b; i++) if (list[i]) next.add(list[i].id)
        return next
      }
      if (ctrl) {
        const next = new Set(cur)
        if (next.has(song.id)) next.delete(song.id)
        else next.add(song.id)
        anchor.current = idx
        return next
      }
      // Plain checkbox click: select just this row (or clear it if it was the only one)
      if (cur.size === 1 && cur.has(song.id)) {
        anchor.current = null
        return new Set()
      }
      anchor.current = idx
      return new Set([song.id])
    })
  }, [])

  const clear = useCallback(() => {
    anchor.current = null
    setIds(new Set())
  }, [])

  const selectAll = useCallback(() => {
    anchor.current = null
    setIds(new Set(songsRef.current.map((s) => s.id)))
  }, [])

  const selectedSongs = useMemo(() => songs.filter((s) => ids.has(s.id)), [songs, ids])

  return {
    ids,
    songs: selectedSongs,
    count: ids.size,
    active: ids.size > 0,
    toggle,
    isSelected: (id: number) => ids.has(id),
    clear,
    selectAll
  }
}

type UI = ReturnType<typeof useUI>
type Player = ReturnType<typeof usePlayer>
type Lib = ReturnType<typeof useLibrary>

/** Floating glass action bar for the current song selection (Library page). */
export function BulkActionBar({
  selection,
  ui,
  player,
  lib,
  onDone
}: {
  selection: BulkSelection
  ui: UI
  player: Player
  lib: Lib
  onDone?: () => void
}) {
  const n = selection.count
  if (!selection.active) return null

  const openPlaylistMenu = (e: React.MouseEvent): void => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const items: CtxMenuItem[] = playlistSubMenu(ui, lib, selection.songs)
    ui.openCtxMenu(r.left, r.bottom + 8, items)
  }

  const allFav = selection.songs.length > 0 && selection.songs.every((s) => s.favorite)

  return (
    <div className="bulk-bar glass-strong" role="toolbar" aria-label={`${n} songs selected`} data-e2e="bulk-bar">
      <span className="count">{n} selected</span>
      <span className="sep" />
      <button
        className="bb-btn"
        title="Play selected"
        onClick={() => {
          player.playContext(selection.songs, 0)
          selection.clear()
        }}
      >
        <Icon name="play" size={15} />
        <span className="lbl">Play</span>
      </button>
      <button
        className="bb-btn"
        title="Add to queue"
        onClick={() => {
          selection.songs.forEach((s) => player.addToQueue(s))
          ui.toast(`Added ${n} song${n > 1 ? 's' : ''} to the queue`)
          selection.clear()
        }}
      >
        <Icon name="queue" size={16} />
        <span className="lbl">Queue</span>
      </button>
      <button className="bb-btn" title="Add to playlist" onClick={openPlaylistMenu}>
        <Icon name="plus" size={16} />
        <span className="lbl">Playlist</span>
      </button>
      <button
        className="bb-btn"
        title={allFav ? 'Remove from favorites' : 'Add to favorites'}
        onClick={() => {
          for (const s of selection.songs) {
            if (allFav === !!s.favorite) void api.toggleFavorite(s.id)
          }
          lib.refresh('favorite')
          ui.toast(
            allFav
              ? `Removed ${n} song${n > 1 ? 's' : ''} from favorites`
              : `Added ${n} song${n > 1 ? 's' : ''} to favorites`
          )
          selection.clear()
        }}
      >
        <Icon name="heart" size={16} />
        <span className="lbl">{allFav ? 'Unfave' : 'Favorite'}</span>
      </button>
      <span className="sep" />
      <button
        className="bb-btn danger"
        title="Remove from library (files stay on disk)"
        onClick={() => removeSongsFlow(ui, selection.songs, onDone)}
      >
        <Icon name="trash" size={16} />
        <span className="lbl">Remove</span>
      </button>
      <button
        className="bb-btn danger"
        title="Delete files to the Recycle Bin"
        onClick={() => deleteSongsFlow(ui, selection.songs, onDone)}
      >
        <Icon name="trash" size={16} />
        <span className="lbl">Delete from PC</span>
      </button>
      <span className="sep" />
      <button className="bb-btn" title="Clear selection (Esc)" onClick={selection.clear}>
        <Icon name="close" size={15} />
      </button>
    </div>
  )
}
