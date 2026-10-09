import { useEffect, useMemo, useState } from 'react'
import type { Song } from '../../../shared/types'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { fmtTime, songArtists } from '../lib/utils'

export function AddSongsModal({
  playlistId,
  playlistName,
  currentTracks,
  onClose,
  onAdded
}: {
  playlistId: number
  playlistName: string
  currentTracks: Song[]
  onClose: () => void
  onAdded: () => void
}) {
  const ui = useUI()
  const lib = useLibrary()
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentIds = useMemo(() => new Set(currentTracks.map((s) => s.id)), [currentTracks])

  const availableSongs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return lib.songs.filter((s) => {
      if (s.missing) return false
      if (!q) return true
      const titleMatch = s.title.toLowerCase().includes(q)
      const artistMatch = (s.artist || '').toLowerCase().includes(q)
      const albumMatch = (s.album || '').toLowerCase().includes(q)
      return titleMatch || artistMatch || albumMatch
    })
  }, [lib.songs, query])

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(availableSongs.map((s) => s.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const addSingle = async (song: Song) => {
    await api.addPlaylistTracks(playlistId, [song.id])
    ui.toast(`Added "${song.title}" to ${playlistName}`)
    lib.refresh('playlist')
    onAdded()
  }

  const addSelected = async () => {
    if (selectedIds.size === 0 || adding) return
    setAdding(true)
    try {
      const ids = Array.from(selectedIds)
      await api.addPlaylistTracks(playlistId, ids)
      ui.toast(`Added ${ids.length} song${ids.length > 1 ? 's' : ''} to "${playlistName}"`)
      lib.refresh('playlist')
      onAdded()
      onClose()
    } finally {
      setAdding(false)
    }
  }

  const importFromPc = async () => {
    if (importing) return
    setImporting(true)
    try {
      const paths = await api.pickFiles()
      if (!paths?.length) return
      ui.toast(`Importing ${paths.length} file${paths.length > 1 ? 's' : ''}…`)
      const prog = await api.importPaths(paths)
      if (prog.imported > 0) {
        ui.toast(`Imported ${prog.imported} new song${prog.imported > 1 ? 's' : ''}`)
        lib.refresh('scan')
        lib.refresh('playlist')
        onAdded()
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal glass-strong"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add songs to playlist"
        style={{
          width: 'min(620px, calc(100vw - 40px))',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 24,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Add songs to playlist</h3>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{playlistName}</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32 }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Search & Actions bar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              className="field"
              placeholder="Search library songs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              style={{ width: '100%', paddingLeft: 34, height: 38 }}
            />
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-3)',
                pointerEvents: 'none',
                display: 'flex'
              }}
            >
              <Icon name="search" size={15} />
            </div>
            {query && (
              <button
                className="icon-btn"
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 26,
                  height: 26
                }}
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          <button
            className="btn"
            style={{ height: 38, fontSize: 13, flexShrink: 0 }}
            onClick={() => void importFromPc()}
            disabled={importing}
            title="Import audio files from your PC into library"
          >
            <Icon name="plus" size={14} />
            {importing ? 'Importing…' : 'Import from PC'}
          </button>
        </div>

        {/* Quick select helpers */}
        {availableSongs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
              {availableSongs.length} song{availableSongs.length === 1 ? '' : 's'} found
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
              <button
                className="btn subtle"
                style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                onClick={selectAll}
              >
                Select all
              </button>
              {selectedIds.size > 0 && (
                <button
                  className="btn subtle"
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                  onClick={clearSelection}
                >
                  Clear selection
                </button>
              )}
            </div>
          </div>
        )}

        {/* Songs List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 220,
            maxHeight: 360,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            paddingRight: 4
          }}
        >
          {availableSongs.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                padding: 40,
                color: 'var(--text-3)',
                textAlign: 'center'
              }}
            >
              <div style={{ marginBottom: 8, opacity: 0.6 }}>
                <Icon name="note" size={32} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 550, color: 'var(--text-2)' }}>No songs found</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                {query ? 'Try a different search term or import files from PC.' : 'Your library is empty. Click "Import from PC" above to add music.'}
              </div>
            </div>
          ) : (
            availableSongs.map((s) => {
              const inPlaylist = currentIds.has(s.id)
              const isSelected = selectedIds.has(s.id)
              return (
                <div
                  key={s.id}
                  onClick={() => toggleSelect(s.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: isSelected ? 'var(--glass-surface-active)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background var(--dur-fast) var(--ease-out)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--glass-surface-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(s.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ width: 36, height: 36, flexShrink: 0 }}>
                    <Artwork artKey={s.artKey} name={s.title} radius={8} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: 'var(--text-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 2
                      }}
                    >
                      {songArtists(s)}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>
                    {fmtTime(s.duration)}
                  </div>
                  {inPlaylist ? (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'rgba(255, 255, 255, 0.07)',
                        color: 'var(--text-3)',
                        flexShrink: 0
                      }}
                    >
                      In playlist
                    </span>
                  ) : null}
                  <button
                    className="btn subtle icon-btn"
                    style={{ width: 28, height: 28, flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      void addSingle(s)
                    }}
                    title="Add this song to playlist"
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Modal Actions Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid var(--glass-border)'
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {selectedIds.size > 0 ? (
              <span>
                <b>{selectedIds.size}</b> song{selectedIds.size === 1 ? '' : 's'} selected
              </span>
            ) : (
              <span>{currentTracks.length} song{currentTracks.length === 1 ? '' : 's'} currently in playlist</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn subtle" onClick={onClose}>
              Done
            </button>
            {selectedIds.size > 0 && (
              <button
                className="btn primary"
                onClick={() => void addSelected()}
                disabled={adding}
              >
                <Icon name="plus" size={14} />
                {adding ? 'Adding…' : `Add selected (${selectedIds.size})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
