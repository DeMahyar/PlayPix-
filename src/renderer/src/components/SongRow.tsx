// PlayPix renderer — song row + virtualized song list
import { memo, useEffect, useRef, useState } from 'react'
import type { Song } from '../../../shared/types'
import { usePlayer } from '../state/player'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { cx, fmtTime, songAlbum, songArtists } from '../lib/utils'
import { songMenu } from './actions'

/** Selection wiring passed down from the Library page (bulk actions). */
export interface RowSelection {
  active: boolean
  isSelected: (id: number) => boolean
  toggle: (song: Song, mods?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void
}

export const SongRow = memo(function SongRow({
  song,
  num,
  compact,
  showAlbum = true,
  queuePos,
  onRemove,
  onContextMenu,
  selection,
  contextSongs,
  contextIndex
}: {
  song: Song
  num?: number
  compact?: boolean
  showAlbum?: boolean
  queuePos?: number
  onRemove?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  selection?: RowSelection
  contextSongs?: Song[]
  contextIndex?: number
}) {
  const player = usePlayer()
  const ui = useUI()
  const lib = useLibrary()
  const isCurrent = player.current?.id === song.id
  const playing = isCurrent && player.isPlaying
  const selected = !!selection?.isSelected(song.id)

  const openMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    ui.openCtxMenu(e.clientX, e.clientY, songMenu(ui, player, lib, song))
  }

  const onRowClick = (e: React.MouseEvent): void => {
    if (queuePos !== undefined) {
      player.jumpTo(queuePos)
      return
    }
    // Ctrl/Shift clicks build a multi-selection instead of playing
    if (selection && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault()
      selection.toggle(song, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey })
      return
    }
    if (isCurrent) {
      player.togglePlay()
      return
    }
    if (contextSongs && contextSongs.length) {
      player.playContext(contextSongs, contextIndex ?? 0)
    } else {
      player.playContext([song], 0)
    }
  }

  return (
    <div
      className={cx('song-row', compact && 'compact', isCurrent && 'playing', selected && 'selected')}
      onClick={onRowClick}
      onContextMenu={onContextMenu ?? openMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') player.playContext([song], 0)
      }}
      aria-label={`Play ${song.title} by ${songArtists(song)}`}
    >
      {!compact ? (
        <div className="art">
          <Artwork artKey={song.artKey} name={song.title} radius={10} />
          {selection && (
            <button
              className={cx('sel-check', selected && 'on', selection.active && 'visible')}
              aria-label={selected ? 'Deselect song' : 'Select song'}
              aria-pressed={selected}
              onClick={(e) => {
                e.stopPropagation()
                selection.toggle(song, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey })
              }}
            >
              <Icon name="check" size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="num">{num ?? ''}</div>
      )}
      <div className="title-block">
        <div className="title">
          {song.title}
          {playing && (
            <span className="eq" style={{ marginLeft: 8, verticalAlign: '-2px' }} aria-label="Playing">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
        <div className="artist">{songArtists(song)}</div>
      </div>
      {!compact && showAlbum && <div className="album-name">{songAlbum(song)}</div>}
      {!compact && <div className="dur">{fmtTime(song.duration)}</div>}
      <button
        className={cx('icon-btn fav-btn', song.favorite && 'faved')}
        aria-label={song.favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => {
          e.stopPropagation()
          player.toggleFavorite(song.id)
        }}
      >
        <Icon name={song.favorite ? 'heart' : 'heart'} size={17} />
      </button>
      {onRemove ? (
        <button
          className="icon-btn row-menu"
          aria-label="Remove from queue"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <Icon name="close" size={16} />
        </button>
      ) : (
        <button
          className="icon-btn row-menu"
          aria-label="More actions"
          onClick={(e) => {
            e.stopPropagation()
            openMenu(e)
          }}
        >
          <Icon name="dots" size={17} />
        </button>
      )}
    </div>
  )
})

/** Windowed list for large libraries. Scrolls internally, fills its parent. */
export function SongList({
  songs,
  height,
  compact,
  showAlbum = true,
  queueMode,
  selection
}: {
  songs: Song[]
  height?: number | string
  compact?: boolean
  showAlbum?: boolean
  queueMode?: boolean
  selection?: RowSelection
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const player = usePlayer()
  const rowH = compact ? 54 : 58

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight || 600))
    ro.observe(el)
    setViewportH(el.clientHeight || 600)
    return () => ro.disconnect()
  }, [])

  const overscan = 8
  const start = Math.max(0, Math.floor(scrollTop / rowH) - overscan)
  const visibleCount = Math.ceil(viewportH / rowH) + overscan * 2
  const end = Math.min(songs.length, start + visibleCount)
  const slice = songs.slice(start, end)

  const totalH = songs.length * rowH

  return (
    <div
      ref={containerRef}
      className="song-list"
      style={{ height: height ?? '100%', overflowY: 'auto', paddingRight: 4 }}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      role="list"
    >
      <div style={{ position: 'relative', height: totalH }}>
        {slice.map((song, i) => {
          const abs = start + i
          return (
            <div
              key={`${song.id}-${abs}`}
              style={{ position: 'absolute', top: abs * rowH, left: 0, right: 0 }}
            >
              <SongRow
                song={song}
                num={abs + 1}
                compact={compact}
                showAlbum={showAlbum}
                queuePos={queueMode ? abs : undefined}
                onRemove={queueMode ? () => player.removeFromQueue(abs) : undefined}
                selection={selection}
                contextSongs={queueMode ? undefined : songs}
                contextIndex={queueMode ? undefined : abs}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Simple non-virtualized list for smaller collections. */
export function StaticSongList({
  songs,
  compact,
  showAlbum = true,
  queueMode,
  selection
}: {
  songs: Song[]
  compact?: boolean
  showAlbum?: boolean
  queueMode?: boolean
  selection?: RowSelection
}) {
  const player = usePlayer()
  return (
    <div className="song-list" role="list">
      {songs.map((song, i) => (
        <SongRow
          key={song.id}
          song={song}
          num={i + 1}
          compact={compact}
          showAlbum={showAlbum}
          queuePos={queueMode ? i : undefined}
          onRemove={queueMode ? () => player.removeFromQueue(i) : undefined}
          selection={selection}
          contextSongs={queueMode ? undefined : songs}
          contextIndex={queueMode ? undefined : i}
        />
      ))}
    </div>
  )
}
