// PlayPix renderer — cards for albums, artists, playlists, songs
import type { Album, Artist, Playlist, Song } from '../../../shared/types'
import { usePlayer } from '../state/player'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { cx, songArtists } from '../lib/utils'
import { albumMenu, artistMenu, songMenu } from './actions'
import { api } from '../lib/api'

interface CardShellProps {
  name: string
  sub: string
  circle?: boolean
  onOpen: () => void
  onPlay: () => void
  onMenu?: (e: React.MouseEvent) => void
  art: React.ReactNode
  width?: number
}

function CardShell({ name, sub, circle, onOpen, onPlay, onMenu, art, width }: CardShellProps) {
  return (
    <div
      className="card"
      style={width ? { width } : undefined}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault()
              onMenu(e)
            }
          : undefined
      }
    >
      <div className="art" style={circle ? { borderRadius: '50%' } : undefined}>
        {art}
        <button
          className="play-fab"
          aria-label={`Play ${name}`}
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
        >
          <Icon name="play" size={18} />
        </button>
      </div>
      <div className="name">{name}</div>
      <div className="sub">{sub}</div>
      {onMenu && (
        <button
          className="icon-btn card-menu"
          aria-label={`Actions for ${name}`}
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e)
          }}
        >
          <Icon name="dots" size={15} />
        </button>
      )}
    </div>
  )
}

export function AlbumCard({ album, songsFor }: { album: Album; songsFor: (a: Album) => Promise<Song[]> }) {
  const player = usePlayer()
  const ui = useUI()
  const lib = useLibrary()
  const openAlbum = (): void => ui.navigate({ name: 'detail', detail: { type: 'album', key: album.key, name: album.name } })

  return (
    <CardShell
      name={album.name}
      sub={`${album.artist || 'Unknown artist'} · ${album.songCount} songs`}
      art={<Artwork artKey={album.artKey} name={album.name} radius={14} />}
      onOpen={openAlbum}
      onPlay={() => {
        void songsFor(album).then((songs) => player.playContext(songs, 0))
      }}
      onMenu={(e) => {
        void songsFor(album).then((songs) =>
          ui.openCtxMenu(e.clientX, e.clientY, albumMenu(ui, player, lib, album, songs))
        )
      }}
    />
  )
}

export function ArtistCard({ artist, songsFor }: { artist: Artist; songsFor: (a: Artist) => Promise<Song[]> }) {
  const player = usePlayer()
  const ui = useUI()
  return (
    <CardShell
      name={artist.name}
      sub={`${artist.songCount} songs · ${artist.albumCount} albums`}
      circle
      art={<Artwork artKey={artist.artKey} name={artist.name} radius="50%" />}
      onOpen={() => ui.navigate({ name: 'detail', detail: { type: 'artist', key: artist.key, name: artist.name } })}
      onPlay={() => {
        void songsFor(artist).then((songs) => player.playContext(songs, 0, { shuffle: true }))
      }}
      onMenu={(e) => {
        void songsFor(artist).then((songs) =>
          ui.openCtxMenu(e.clientX, e.clientY, artistMenu(player, songs))
        )
      }}
    />
  )
}

export function PlaylistCard({ playlist, onPlay }: { playlist: Playlist; onPlay?: () => void }) {
  const ui = useUI()
  const keys = playlist.artKeys
  const open = (): void =>
    ui.navigate({ name: 'detail', detail: { type: 'playlist', id: playlist.id, name: playlist.name } })
  return (
    <div
      className="card"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && open()}
    >
      <div className="art" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', background: 'var(--art-placeholder-1)' }}>
        {keys.length >= 4
          ? keys.slice(0, 4).map((k, i) => (
              <div key={i} style={{ overflow: 'hidden' }}>
                <Artwork artKey={k} name={playlist.name} radius={0} />
              </div>
            ))
          : keys.length > 0
            ? (
              <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }}>
                <Artwork artKey={keys[0]} name={playlist.name} radius={0} />
              </div>
            )
            : (
              <div
                style={{
                  gridColumn: '1 / -1',
                  gridRow: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)'
                }}
              >
                <Icon name="note" size={44} />
              </div>
            )}
        {onPlay && (
          <button
            className="play-fab"
            aria-label={`Play ${playlist.name}`}
            onClick={(e) => {
              e.stopPropagation()
              onPlay()
            }}
          >
            <Icon name="play" size={18} />
          </button>
        )}
      </div>
      <div className="name">{playlist.name}</div>
      <div className="sub">{playlist.songCount} songs</div>
    </div>
  )
}

export function SongCard({ song, homeQueue }: { song: Song; homeQueue?: Song[] }) {
  const player = usePlayer()
  const ui = useUI()
  const lib = useLibrary()
  // §6: on Home, a clicked song joins the HOME-WIDE queue instead of a
  // one-song queue that dead-ends after the section ends.
  const play = (): void => {
    if (homeQueue && homeQueue.length > 1) {
      const idx = homeQueue.findIndex((s) => s.id === song.id)
      player.playContext(homeQueue, Math.max(0, idx))
    } else {
      player.playContext([song], 0)
    }
  }
  const openMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    ui.openCtxMenu(e.clientX, e.clientY, songMenu(ui, player, lib, song))
  }
  return (
    <div
      className="card"
      onClick={play}
      onContextMenu={openMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && play()}
    >
      <div className="art">
        <Artwork artKey={song.artKey} name={song.title} radius={14} />
        {player.current?.id === song.id && (
          <div
            className="eq"
            style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(10,14,26,.55)', padding: '5px 7px', borderRadius: 8, backdropFilter: 'blur(6px)' }}
          >
            <span />
            <span />
            <span />
          </div>
        )}
        <button
          className="play-fab"
          aria-label={`Play ${song.title}`}
          onClick={(e) => {
            e.stopPropagation()
            play()
          }}
        >
          <Icon name="play" size={18} />
        </button>
      </div>
      <div className="name">{song.title}</div>
      <div className="sub">{songArtists(song)}</div>
      <button
        className="icon-btn card-menu"
        aria-label={`Actions for ${song.title}`}
        onClick={openMenu}
      >
        <Icon name="dots" size={15} />
      </button>
    </div>
  )
}
