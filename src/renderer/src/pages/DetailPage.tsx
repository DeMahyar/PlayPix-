// PlayPix renderer — detail pages: album, artist, folder, playlist
import { useEffect, useState } from 'react'
import type { Song } from '../../../shared/types'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { SongList } from '../components/SongRow'
import { EmptyState } from '../components/DialogHost'
import { Icon } from '../components/Icon'
import { Artwork } from '../components/Artwork'
import { AddSongsModal } from '../components/AddSongsModal'
import { fmtLongDuration, songArtists } from '../lib/utils'
import { smartRule } from '../lib/smartPlaylists'

export function DetailPage() {
  const ui = useUI()
  const lib = useLibrary()
  const player = usePlayer()
  const [songs, setSongs] = useState<Song[]>([])
  const [loaded, setLoaded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const detail = ui.view.name === 'detail' ? ui.view.detail : null

  useEffect(() => {
    if (!detail) return
    setLoaded(false)
    const fetch = async (): Promise<void> => {
      try {
        let list: Song[] = []
        if (detail.type === 'album') list = await api.songsByAlbum(detail.key)
        else if (detail.type === 'artist') list = await api.songsByArtist(detail.key)
        else if (detail.type === 'folder') list = await api.songsByFolder(detail.path)
        else if (detail.type === 'playlist') list = await api.playlistTracks(detail.id)
        else if (detail.type === 'smart') list = smartRule(detail.kind).resolve(lib.songs)
        setSongs(list)
      } catch (err) {
        console.error('Failed to load tracks:', err)
        setSongs([])
      } finally {
        setLoaded(true)
      }
    }
    void fetch()
    const off = api.onLibraryChanged((e) => {
      if (e.reason === 'scan' || e.reason === 'watch' || e.reason === 'edit' || e.reason === 'remove' || e.reason === 'playlist' || e.reason === 'favorite' || e.reason === 'history') {
        void fetch()
      }
    })
    return off
  }, [detail, lib.songs])

  if (!detail) return null

  const title =
    detail.name ??
    (detail.type === 'album'
      ? (detail.key.split('|||')[0] ?? '')
      : detail.type === 'artist'
        ? detail.key
        : detail.type === 'folder'
          ? (detail.path.split(/[\\/]/).pop() ?? 'Folder')
          : detail.type === 'smart'
            ? smartRule(detail.kind).name
            : 'Playlist')

  const kindLabel =
    detail.type === 'album'
      ? 'Album'
      : detail.type === 'artist'
        ? 'Artist'
        : detail.type === 'folder'
          ? 'Folder'
          : detail.type === 'smart'
            ? 'Smart Playlist'
            : 'Playlist'

  const totalDur = songs.reduce((a, s) => a + (s.duration || 0), 0)
  const firstArt =
    detail.type === 'playlist'
      ? (lib.playlists.find((p) => p.id === detail.id)?.artKeys ?? [null])[0]
      : songs[0]?.artKey
  const artistName = detail.type === 'album' ? (detail.key.split('|||')[1] ?? '') : songs[0] ? songArtists(songs[0]) : ''

  const playAll = (shuffle?: boolean): void => {
    player.playContext(songs, 0, shuffle ? { shuffle: true } : undefined)
  }

  return (
    <div className="page page-anim">
      <button className="btn subtle back-btn" onClick={ui.back} aria-label="Go back">
        <Icon name="chevron-left" size={17} />
        Back
      </button>

      {detail.type === 'playlist' && songs.length === 0 && loaded ? (
        <>
          <EmptyState
            icon="queue"
            title="This playlist is empty"
            body="Add songs from your library, or choose audio files from your PC."
            actions={
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn primary"
                  onClick={() => setAddOpen(true)}
                >
                  <Icon name="plus" size={16} />
                  Add songs
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    ui.setLibraryTab('songs')
                    ui.navigate({ name: 'library' })
                  }}
                >
                  Browse library
                </button>
              </div>
            }
          />
        </>
      ) : (
        <>
          <div className="detail-hero">
            <div className="art">
              <Artwork artKey={firstArt} name={title} radius={22} />
            </div>
            <div className="info">
              <div className="kind">{kindLabel}</div>
              <h1>{title}</h1>
              <div className="meta-line">
                {artistName && <b>{artistName}</b>}
                <span>·</span>
                <span>
                  {songs.length} song{songs.length === 1 ? '' : 's'}
                </span>
                {totalDur > 0 && (
                  <>
                    <span>·</span>
                    <span>{fmtLongDuration(totalDur)}</span>
                  </>
                )}
                {detail.type === 'album' && songs[0]?.year && (
                  <>
                    <span>·</span>
                    <span>{songs[0].year}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="detail-actions">
            <button className="play-big" aria-label="Play" onClick={() => playAll(false)} disabled={!songs.length}>
              <Icon name="play" size={22} />
            </button>
            <button className="btn" onClick={() => playAll(true)} disabled={!songs.length}>
              <Icon name="shuffle" size={16} />
              Shuffle
            </button>
            {detail.type === 'playlist' && (
              <div className="playlist-head-actions">
                <button
                  className="btn primary"
                  onClick={() => setAddOpen(true)}
                >
                  <Icon name="plus" size={15} />
                  Add songs
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    void ui.prompt({ title: 'Rename playlist', value: title, okLabel: 'Rename' }).then((name) => {
                      if (!name?.trim() || detail.type !== 'playlist') return
                      void api.renamePlaylist(detail.id, name.trim()).then(() => lib.refresh('playlist'))
                    })
                  }}
                >
                  <Icon name="edit" size={15} />
                  Rename
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    void ui
                      .confirm({
                        title: `Delete "${title}"?`,
                        body: 'The playlist is removed from PlayPix. Your songs stay in the library.',
                        okLabel: 'Delete',
                        danger: true
                      })
                      .then((ok) => {
                        if (!ok || detail.type !== 'playlist') return
                        void api.deletePlaylist(detail.id).then(() => {
                          lib.refresh('playlist')
                          ui.back()
                        })
                      })
                  }}
                >
                  <Icon name="trash" size={15} />
                  Delete
                </button>
              </div>
            )}
          </div>

          <div style={{ height: 'calc(100% - 320px)', minHeight: 320 }}>
            <SongList songs={songs} showAlbum={detail.type !== 'album'} />
          </div>
        </>
      )}

      {addOpen && detail.type === 'playlist' && (
        <AddSongsModal
          playlistId={detail.id}
          playlistName={title}
          currentTracks={songs}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            void api.playlistTracks(detail.id).then(setSongs)
          }}
        />
      )}
    </div>
  )
}
