// PlayPix renderer — Library page (Songs / Albums / Artists / Folders / Playlists / Favorites)
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import type { LibraryTab } from '../state/ui'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { LiquidTabs } from '../components/LiquidTabs'
import { SongList } from '../components/SongRow'
import { AlbumCard, ArtistCard, PlaylistCard } from '../components/Cards'
import { EmptyState } from '../components/DialogHost'
import { Icon } from '../components/Icon'
import { BulkActionBar, useBulkSelection } from '../components/BulkBar'
import { addMusicMenu, playAlbumOrList, reportImport } from '../components/actions'
import { SMART_RULES, smartCount, smartRule } from '../lib/smartPlaylists'
import type { FolderInfo, SmartKind, Song } from '../../../shared/types'

const TABS: { id: LibraryTab; label: string }[] = [
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'folders', label: 'Folders' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'favorites', label: 'Favorites' }
]

/** Smart playlist card (§26) — rule-based, auto-updating, local. */
function SmartCard({ kind, name, desc, icon, count }: { kind: SmartKind; name: string; desc: string; icon: string; count: number }) {
  const ui = useUI()
  const player = usePlayer()
  const lib = useLibrary()
  return (
    <div
      className="card smart-card"
      role="listitem"
      tabIndex={0}
      onClick={() => ui.navigate({ name: 'detail', detail: { type: 'smart', kind, name } })}
      onKeyDown={(e) => e.key === 'Enter' && ui.navigate({ name: 'detail', detail: { type: 'smart', kind, name } })}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const rule = smartRule(kind)
        const tracks = rule.resolve(lib.songs)
        ui.openCtxMenu(e.clientX, e.clientY, [
          { label: 'Play', icon: 'play', onClick: () => player.playContext(tracks, 0) },
          { label: 'Shuffle', icon: 'shuffle', onClick: () => player.playContext(tracks, 0, { shuffle: true }) }
        ])
      }}
    >
      <div className="art smart-art">
        <Icon name={icon} size={40} />
        <button
          className="play-fab"
          aria-label={`Play ${name}`}
          onClick={(e) => {
            e.stopPropagation()
            player.playContext(smartRule(kind).resolve(lib.songs), 0)
          }}
        >
          <Icon name="play" size={18} />
        </button>
      </div>
      <div className="name">{name}</div>
      <div className="sub">{desc} · {count}</div>
    </div>
  )
}

export function LibraryPage() {
  const ui = useUI()
  const lib = useLibrary()
  const player = usePlayer()
  const [heightKey, setHeightKey] = useState('')

  const tab = ui.libraryTab
  const setTab = (t: string): void => {
    ui.setLibraryTab(t as LibraryTab)
  }

  const hasMusic = lib.songs.length > 0

  // ---- bulk selection (Songs / Favorites tabs) ----
  const listSongs: Song[] = tab === 'favorites' ? lib.songs.filter((s) => s.favorite) : lib.songs
  const sel = useBulkSelection(listSongs)

  // Switching tabs (or the page) drops the selection
  useEffect(() => {
    sel.clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Esc clears the selection when no overlay is open on top of it
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || !sel.active) return
      if (ui.ctxMenu || ui.confirmState || ui.promptState || ui.editSong) return
      sel.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, ui])

  // e2e bridge for the bulk-selection tests
  useEffect(() => {
    const w = window as unknown as {
      __ppSelApi?: { toggle: (s: Song, mods?: object) => void; clear: () => void; selectAll: () => void }
      __ppSelCount?: number
    }
    w.__ppSelApi = { toggle: sel.toggle, clear: sel.clear, selectAll: sel.selectAll }
    w.__ppSelCount = sel.count
  }, [sel])

  const openAddMusic = (e: React.MouseEvent): void => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    ui.openCtxMenu(r.left, r.bottom + 8, addMusicMenu(ui))
  }

  return (
    <div className="page page-anim" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="lib-head">
        <div className="left">
          <h1>Library</h1>
          <LiquidTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="Library sections" />
        </div>
        <div className="actions">
          <button className="btn primary" onClick={openAddMusic} data-e2e="add-music" title="Add music to your library">
            <Icon name="plus" size={16} />
            Add music
          </button>
          {tab === 'playlists' && (
            <button
              className="btn primary"
              onClick={() => {
                void ui.prompt({ title: 'Create playlist', value: 'My Playlist', okLabel: 'Create' }).then((name) => {
                  if (!name?.trim()) return
                  void api.createPlaylist(name.trim()).then(() => lib.refresh('playlist'))
                })
              }}
            >
              <Icon name="plus" size={16} />
              New playlist
            </button>
          )}
          {(tab === 'songs' || tab === 'albums' || tab === 'artists') && (
            <button className="btn" onClick={() => playAlbumOrList(player, lib.songs, 0)}>
              <Icon name="play" size={15} />
              Play all
            </button>
          )}
          {tab === 'favorites' && lib.songs.some((s) => s.favorite) && (
            <button
              className="btn"
              onClick={() => playAlbumOrList(player, lib.songs.filter((s) => s.favorite), 0)}
            >
              <Icon name="play" size={15} />
              Play favorites
            </button>
          )}
        </div>
      </div>

      <div
        key={tab + heightKey}
        style={{ flex: 1, minHeight: 0, marginTop: 18 }}
        className="fade-up"
      >
        {tab === 'songs' && (
          hasMusic ? (
            <SongList songs={lib.songs} selection={sel} />
          ) : (
            <LibraryEmpty ui={ui} />
          )
        )}

        {tab === 'albums' && (
          hasMusic && lib.albums.length > 0 ? (
            <div className="grid" role="list">
              {lib.albums.map((a) => (
                <AlbumCard
                  key={a.key}
                  album={a}
                  songsFor={(al) => api.songsByAlbum(al.key)}
                />
              ))}
            </div>
          ) : (
            <LibraryEmpty ui={ui} />
          )
        )}

        {tab === 'artists' && (
          hasMusic && lib.artists.length > 0 ? (
            <div className="grid" role="list">
              {lib.artists.map((a) => (
                <ArtistCard key={a.key} artist={a} songsFor={(ar) => api.songsByArtist(ar.key)} />
              ))}
            </div>
          ) : (
            <LibraryEmpty ui={ui} />
          )
        )}

        {tab === 'folders' && (
          hasMusic ? (
            <FolderView />
          ) : (
            <LibraryEmpty ui={ui} />
          )
        )}

        {tab === 'playlists' && (
          lib.playlists.length > 0 || lib.songs.length > 0 ? (
            <>
              {lib.songs.length > 0 && (
                <div className="grid" role="list" data-e2e="smart-playlists">
                  {SMART_RULES.map((r) => (
                    <SmartCard key={r.kind} kind={r.kind} name={r.name} desc={r.desc} icon={r.icon} count={smartCount(r.kind, lib.songs)} />
                  ))}
                </div>
              )}
              {lib.playlists.length > 0 ? (
                <div className="grid" role="list" style={{ marginTop: lib.songs.length ? 18 : 0 }}>
                  {lib.playlists.map((p) => (
                    <PlaylistCard
                      key={p.id}
                      playlist={p}
                      onPlay={async () => {
                        const tracks = await api.playlistTracks(p.id)
                        player.playContext(tracks, 0)
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="queue"
              title="Create your first playlist"
              body="Gather songs the way you like them. Right-click any song and choose Add to playlist."
              actions={
                <button
                  className="btn primary"
                  onClick={() => {
                    void ui.prompt({ title: 'Create playlist', value: 'My Playlist', okLabel: 'Create' }).then((name) => {
                      if (!name?.trim()) return
                      void api.createPlaylist(name.trim()).then(() => lib.refresh('playlist'))
                    })
                  }}
                >
                  <Icon name="plus" size={16} />
                  Create playlist
                </button>
              }
            />
          )
        )}

        {tab === 'favorites' && (
          lib.songs.some((s) => s.favorite) ? (
            <SongList songs={listSongs} selection={sel} />
          ) : (
            <EmptyState
              icon="heart"
              title="No favorite songs yet"
              body="Tap the heart on any song and it will be waiting for you here."
            />
          )
        )}
      </div>

      {(tab === 'songs' || tab === 'favorites') && (
        <BulkActionBar selection={sel} ui={ui} player={player} lib={lib} onDone={sel.clear} />
      )}
    </div>
  )
}

/** Empty library — offers full scan, folder import and manual file picking. */
function LibraryEmpty({ ui }: { ui: ReturnType<typeof useUI> }) {
  return (
    <EmptyState
      icon="library"
      title="Your library is empty"
      body="PlayPix hasn't found any music yet. Scan your PC, import a folder, or add individual files to get started."
      actions={
        <>
          <button className="btn primary" onClick={() => void api.startScan()}>
            <Icon name="scan" size={16} />
            Scan my PC
          </button>
          <button
            className="btn"
            onClick={async () => {
              const p = await api.pickFolder()
              if (p) void api.importPaths([p])
            }}
          >
            <Icon name="folder" size={16} />
            Import Folder
          </button>
          <button
            className="btn"
            onClick={async () => {
              const paths = await api.pickFiles()
              if (!paths?.length) return
              ui.toast(`Importing ${paths.length} file${paths.length > 1 ? 's' : ''}…`)
              const prog = await api.importPaths(paths)
              reportImport(ui, prog, paths.length)
            }}
          >
            <Icon name="note" size={16} />
            Add Files
          </button>
        </>
      }
    />
  )
}

function FolderView() {
  const ui = useUI()
  const lib = useLibrary()
  const [folder, setFolder] = useState<string | null>(null)

  if (folder) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <button className="btn subtle back-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setFolder(null)}>
          <Icon name="chevron-left" size={16} />
          All folders
        </button>
        <div style={{ flex: 1, minHeight: 0 }}>
          <FolderSongs folder={folder} />
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up" style={{ overflowY: 'auto', height: '100%', paddingRight: 4 }}>
      <Folders onOpen={setFolder} />
    </div>
  )
}

function Folders({ onOpen }: { onOpen: (p: string) => void }) {
  const [folders, setFolders] = useState<FolderInfo[]>([])
  useEffect(() => {
    void api.getFolders().then(setFolders)
  }, [])
  return (
    <div className="song-list">
      {folders.map((f) => (
        <div
          key={f.path}
          className="folder-row"
          onClick={() => onOpen(f.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(f.path)}
        >
          <div className="ico">
            <Icon name="folder" size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="name">{f.name}</div>
            <div className="sub">{f.songCount} songs · {f.path}</div>
          </div>
          <button
            className="icon-btn open-ico"
            aria-label={`Reveal ${f.name} in Explorer`}
            onClick={(e) => {
              e.stopPropagation()
              void api.reveal(f.path)
            }}
          >
            <Icon name="external-open" size={16} />
          </button>
        </div>
      ))}
      {folders.length === 0 && <div style={{ color: 'var(--text-3)', padding: 30, textAlign: 'center' }}>No folders yet</div>}
    </div>
  )
}

function FolderSongs({ folder }: { folder: string }) {
  const [songs, setSongs] = useState<Song[]>([])
  useEffect(() => {
    void api.songsByFolder(folder).then(setSongs)
  }, [folder])
  return <SongList songs={songs} />
}
