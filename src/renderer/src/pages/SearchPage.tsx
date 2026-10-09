// PlayPix renderer — Search page
import { useEffect, useRef, useState } from 'react'
import type { SearchResults } from '../../../shared/types'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import { usePlayer } from '../state/player'
import { Section } from '../components/SectionRow'
import { AlbumCard, ArtistCard, PlaylistCard } from '../components/Cards'
import { StaticSongList } from '../components/SongRow'
import { EmptyState } from '../components/DialogHost'
import { Icon } from '../components/Icon'
import { cx } from '../lib/utils'

export function SearchPage() {
  const ui = useUI()
  const player = usePlayer()
  const [results, setResults] = useState<SearchResults | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const query = ui.searchQuery.trim()

  useEffect(() => {
    void api.getSearchHistory().then(setHistory)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query) {
      setResults(null)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      void api
        .search(query)
        .then(setResults)
        .finally(() => setSearching(false))
    }, 140)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const refreshHistory = (): void => {
    void api.getSearchHistory().then(setHistory)
  }

  const playFirst = (): void => {
    if (results?.songs.length) {
      player.playContext(results.songs, 0)
      ui.commitSearch(query)
      refreshHistory()
    }
  }

  // Enter plays the first song result
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && query && results?.songs.length) {
        playFirst()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, results])

  const songsForAlbum = async (a: { key: string }): Promise<import('../../../shared/types').Song[]> =>
    api.songsByAlbum(a.key)
  const songsForArtist = async (a: { key: string }): Promise<import('../../../shared/types').Song[]> =>
    api.songsByArtist(a.key)

  return (
    <div className="page page-anim search-page">
      {!query ? (
        <>
          <div className="search-top">
            <h2>Search</h2>
            {history.length > 0 && (
              <button
                className="see-all"
                onClick={() => {
                  void api.clearSearchHistory().then(refreshHistory)
                }}
              >
                Clear history
              </button>
            )}
          </div>
          {history.length > 0 ? (
            <>
              <p style={{ color: 'var(--text-3)', fontSize: 12.5, marginTop: 4 }}>Recent searches</p>
              <div className="search-chips">
                {history.map((h) => (
                  <button
                    key={h}
                    className="chip"
                    onClick={() => {
                      ui.setSearchQuery(h)
                    }}
                  >
                    <Icon name="clock" size={14} style={{ color: 'var(--text-3)' }} />
                    {h}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon="search"
              title="Find your music"
              body="Search by song, artist, album, genre or playlist. Results appear as you type."
            />
          )}
        </>
      ) : (
        <>
          <div className="search-top">
            <h2>
              {searching ? 'Searching…' : results ? `${results.total} result${results.total === 1 ? '' : 's'}` : ''}{' '}
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>for “{query}”</span>
            </h2>
            <button
              className="btn"
              onClick={() => {
                ui.setSearchQuery('')
              }}
            >
              <Icon name="close" size={14} />
              Clear
            </button>
          </div>

          {results && results.total === 0 && !searching && (
            <EmptyState
              icon="search"
              title="Nothing found"
              body={`No songs, artists, albums or playlists match “${query}”.`}
            />
          )}

          {results && results.songs.length > 0 && (
            <div className="result-group">
              <div className="section-head">
                <h2>Songs</h2>
                <span className="badge-count">{results.songs.length}</span>
              </div>
              <StaticSongList songs={results.songs.slice(0, 25)} />
            </div>
          )}

          {results && results.albums.length > 0 && (
            <Section title="Albums">
              {results.albums.map((a) => (
                <AlbumCard key={a.key} album={a} songsFor={songsForAlbum} />
              ))}
            </Section>
          )}

          {results && results.artists.length > 0 && (
            <Section title="Artists">
              {results.artists.map((a) => (
                <ArtistCard key={a.key} artist={a} songsFor={songsForArtist} />
              ))}
            </Section>
          )}

          {results && results.playlists.length > 0 && (
            <Section title="Playlists">
              {results.playlists.map((p) => (
                <PlaylistCard
                  key={p.id}
                  playlist={p}
                  onPlay={async () => {
                    const tracks = await api.playlistTracks(p.id)
                    player.playContext(tracks, 0)
                  }}
                />
              ))}
            </Section>
          )}

          {results && results.genres.length > 0 && (
            <div className="result-group">
              <div className="section-head">
                <h2>Genres</h2>
              </div>
              <div className="search-chips">
                {results.genres.map((g) => (
                  <button key={g.name} className="chip" onClick={() => ui.setSearchQuery(g.name)}>
                    <Icon name="note" size={14} style={{ color: 'var(--text-3)' }} />
                    {g.name}
                    <span className={cx('badge-count')}>{g.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div style={{ height: 30 }} />
    </div>
  )
}
