// PlayPix renderer — Home page: the redesigned "neon dashboard" (§7 v1.2.0)
// Personalized hero + mixed-size bands + mood/genre quick picks.
// The global Shell (titlebar, search, profile, nav, mini player) is untouched;
// every song tile reuses the shared SongContextMenu — no second menu system.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { HomeData, PlaybackState, Playlist, Song, StatsData } from '../../../shared/types'
import { api, artUrl } from '../lib/api'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { usePlayer } from '../state/player'
import { Section } from '../components/SectionRow'
import { ArtistCard, SongCard } from '../components/Cards'
import { Artwork } from '../components/Artwork'
import { EmptyState } from '../components/DialogHost'
import { Icon } from '../components/Icon'
import {
  MOODS,
  albumSuggestions,
  buildHomeQueue,
  heavyRotation,
  moodMix,
  songsForGenre,
  topArtistsByPlays,
  topGenres
} from '../lib/homeQueue'
import { albumMenu, playlistMenu, songMenu } from '../components/actions'

const greeting = (): string => {
  const h = new Date().getHours()
  if (h < 5) return 'Up late?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function fmtListening(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

export function HomePage() {
  const ui = useUI()
  const lib = useLibrary()
  const player = usePlayer()
  const [home, setHome] = useState<HomeData | null>(null)
  const [resume, setResume] = useState<PlaybackState | null>(null)
  const [stats, setStats] = useState<StatsData | null>(null)
  const [heroSlide, setHeroSlide] = useState(0)
  const [isHeroHovered, setIsHeroHovered] = useState(false)

  useEffect(() => {
    void api.getHome().then(setHome)
    void api.getStats().then(setStats)
    const off = api.onLibraryChanged((e) => {
      if (e.reason !== 'history') {
        void api.getHome().then(setHome)
        void api.getStats().then(setStats)
      }
    })
    return off
  }, [lib.songs.length])

  // Auto-advance hero slides every 6.5s unless user hovers
  useEffect(() => {
    if (isHeroHovered) return
    const timer = window.setInterval(() => {
      setHeroSlide((cur) => (cur + 1) % 3)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [isHeroHovered])

  // Continue Listening (§7): the last session worth resuming
  useEffect(() => {
    let cancelled = false
    void api.loadPlaybackState().then((saved) => {
      if (cancelled || !saved) return
      const ok =
        saved.position > 20 &&
        saved.index >= 0 &&
        saved.index < (saved.queue?.length ?? 0) &&
        player.current?.id !== saved.queue[saved.index]
      setResume(ok ? saved : null)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib.songs.length, player.current?.id])

  const homeQueue = useMemo(() => buildHomeQueue(home, lib.songs), [home, lib.songs])

  // e2e hook: expose the home-wide queue for §6 assertions
  useEffect(() => {
    if (api.e2eEnabled) {
      ;(window as unknown as { __ppHomeQueue?: Song[] }).__ppHomeQueue = homeQueue
    }
  }, [homeQueue])

  const rotation = useMemo(() => heavyRotation(lib.songs, 12), [lib.songs])
  const favCount = useMemo(() => lib.songs.filter((s) => s.favorite && !s.missing).length, [lib.songs])
  const moods = useMemo(
    () => MOODS.map((m) => ({ spec: m, songs: moodMix(lib.songs, m) })).filter((m) => m.songs.length >= 3),
    [lib.songs]
  )
  const genres = useMemo(() => topGenres(lib.songs, 7), [lib.songs])
  const topArtists = useMemo(() => topArtistsByPlays(lib.artists, lib.songs, 10), [lib.artists, lib.songs])

  // Featured playlist (wide band card) + song tiles
  const featured: Playlist | null = lib.playlists[0] ?? null
  const recentTiles = useMemo(() => {
    const tiles: Song[] = []
    const seen = new Set<number>()
    for (const s of [...(home?.recentlyPlayed ?? []), ...(home?.recentlyAdded ?? [])]) {
      if (s.missing || seen.has(s.id)) continue
      seen.add(s.id)
      tiles.push(s)
      if (tiles.length >= 6) break
    }
    if (tiles.length < 4) {
      for (const s of lib.songs) {
        if (s.missing || seen.has(s.id)) continue
        seen.add(s.id)
        tiles.push(s)
        if (tiles.length >= 6) break
      }
    }
    return tiles
  }, [home, lib.songs])

  // "Your Top Mix": heavy rotation when there is one, else the home queue mix
  const topMix = rotation.length >= 3 ? rotation : homeQueue.filter((s) => !s.missing).slice(0, 12)
  const topMixIsRotation = rotation.length >= 3

  // Hero Now-Playing card: current track, else the most likely next listen.
  // heroLive reflects the fresh library copy so the heart never goes stale.
  const heroTrack: Song | null =
    player.current ??
    (resume && resume.index < resume.queue.length ? lib.byId.get(resume.queue[resume.index]) ?? null : null) ??
    home?.recentlyPlayed[0] ??
    rotation[0] ??
    lib.songs.find((s) => !s.missing) ??
    null
  const heroLive = heroTrack ? lib.byId.get(heroTrack.id) ?? heroTrack : null

  // Dynamic Album Art Theme (§25): hero accent follows the cover's palette
  const [heroAccent, setHeroAccent] = useState<string | null>(null)
  const artReq = useRef<string | null>(null)
  useEffect(() => {
    const key = heroTrack?.artKey ?? null
    if (!key) {
      setHeroAccent(null)
      return
    }
    artReq.current = key
    void api.artPalette(key).then((pal) => {
      if (artReq.current === key) setHeroAccent(pal ? (typeof pal === 'string' ? pal : pal.accent) : null)
    })
  }, [heroTrack?.artKey])

  // Hero ambience dots: slowly cycle the neon hue of the artwork layers
  const [heroDot, setHeroDot] = useState(2)
  useEffect(() => {
    const t = window.setInterval(() => setHeroDot((d) => (d + 1) % 5), 7000)
    return () => window.clearInterval(t)
  }, [])

  const playInHomeQueue = (song: Song): void => {
    // §6: a clicked song joins the HOME-WIDE queue, never a dead-end 1-song queue
    if (homeQueue.length > 1) {
      const idx = homeQueue.findIndex((s) => s.id === song.id)
      player.playContext(homeQueue, Math.max(0, idx))
    } else {
      player.playContext([song], 0)
    }
  }

  const openSongMenu = (e: React.MouseEvent, song: Song): void => {
    e.preventDefault()
    e.stopPropagation()
    ui.openCtxMenu(e.clientX, e.clientY, songMenu(ui, player, lib, song))
  }

  const continueListening = (): void => {
    if (resume) {
      const songs = resume.queue.map((id) => lib.byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
      if (songs.length) {
        player.playContext(songs, resume.index, { position: resume.position })
        return
      }
    }
    if (homeQueue.length) player.playContext(homeQueue, 0)
  }

  const shuffleAll = (): void => {
    if (homeQueue.length) player.playContext(homeQueue, 0, { shuffle: true })
  }

  const songsForArtist = async (a: { key: string }): Promise<Song[]> => api.songsByArtist(a.key)

  const empty = !home || (home.recentlyAdded.length === 0 && lib.playlists.length === 0)

  // ---- Recently-played band tiles ----

  const openFeaturedMenu = async (e: React.MouseEvent, pl: Playlist): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    const tracks = await api.playlistTracks(pl.id)
    ui.openCtxMenu(e.clientX, e.clientY, playlistMenu(ui, player, lib, pl, tracks, () => lib.refresh('playlist')))
  }

  const bandTiles = (
    <>
      {featured && (
        <div
          className="tile tile-feature"
          data-e2e="featured-playlist"
          role="button"
          tabIndex={0}
          onClick={() =>
            ui.navigate({ name: 'detail', detail: { type: 'playlist', id: featured.id, name: featured.name } })
          }
          onKeyDown={(e) => e.key === 'Enter' && ui.navigate({ name: 'detail', detail: { type: 'playlist', id: featured.id, name: featured.name } })}
        >
          <div className="tile-bg">
            <Artwork artKey={featured.artKeys[0] ?? null} name={featured.name} radius={0} />
          </div>
          <div className="tile-shade" />
          <div className="tile-label row">
            <button
              className="tf-play"
              aria-label={`Play ${featured.name}`}
              onClick={(e) => {
                e.stopPropagation()
                void api.playlistTracks(featured.id).then((tracks) => player.playContext(tracks, 0))
              }}
            >
              <Icon name="play" size={16} />
            </button>
            <div className="tile-texts">
              <div className="t">{featured.name}</div>
              <div className="s">Playlist • {featured.songCount} songs</div>
            </div>
          </div>
          <button
            className="card-menu tf-dots"
            aria-label={`Actions for ${featured.name}`}
            onClick={(e) => void openFeaturedMenu(e, featured)}
          >
            <Icon name="dots" size={15} />
          </button>
        </div>
      )}

      {favCount > 0 && (
        <div
          className="tile tile-liked"
          data-e2e="liked-songs-tile"
          role="button"
          tabIndex={0}
          onClick={() => {
            ui.setLibraryTab('favorites')
            ui.navigate({ name: 'library' })
          }}
          onKeyDown={(e) => e.key === 'Enter' && ui.setLibraryTab('favorites')}
        >
          <Icon name="sparkle" size={44} className="tl-spark" />
          <div className="tile-texts">
            <div className="t">Liked Songs</div>
            <div className="s">Playlist • {favCount} songs</div>
          </div>
          <Icon name="heart" size={17} className="tl-heart" />
        </div>
      )}

      {recentTiles.map((s) => (
        <div
          key={`rt-${s.id}`}
          className="tile tile-song"
          role="button"
          tabIndex={0}
          onClick={() => playInHomeQueue(s)}
          onKeyDown={(e) => e.key === 'Enter' && playInHomeQueue(s)}
          onContextMenu={(e) => openSongMenu(e, s)}
        >
          <div className="tile-bg">
            <Artwork artKey={s.artKey} name={s.title} radius={0} />
          </div>
          <div className="tile-shade" />
          <div className="tile-texts">
            <div className="t">{s.title}</div>
            <div className="s">{s.artist || 'Unknown artist'}</div>
          </div>
          <button
            className="play-fab"
            aria-label={`Play ${s.title}`}
            onClick={(e) => {
              e.stopPropagation()
              playInHomeQueue(s)
            }}
          >
            <Icon name="play" size={16} />
          </button>
          <button
            className="card-menu"
            aria-label={`Actions for ${s.title}`}
            onClick={(e) => openSongMenu(e, s)}
          >
            <Icon name="dots" size={14} />
          </button>
        </div>
      ))}

      {topMix.length >= 3 && (
        <div className="tile tile-mix" data-e2e="top-mix" role="button" tabIndex={0}
          onClick={() => player.playContext(topMix, 0)}
          onKeyDown={(e) => e.key === 'Enter' && player.playContext(topMix, 0)}
        >
          <div className="tile-bg">
            {topMix[0] && <Artwork artKey={topMix[0].artKey} name={topMix[0].title} radius={0} />}
          </div>
          <div className="tile-shade" />
          <div className="tile-texts">
            <div className="t">{topMixIsRotation ? 'Your Top Mix' : 'Your Mix'}</div>
            <div className="s">Based on your listening</div>
          </div>
          <button
            className="mix-fab"
            aria-label="Play your mix"
            onClick={(e) => {
              e.stopPropagation()
              player.playContext(topMix, 0)
            }}
          >
            <Icon name="play" size={20} />
          </button>
        </div>
      )}
    </>
  )

  return (
    <div className="page page-anim home-page">
      {empty ? (
        <div className="home-hero" data-e2e="hero">
          <div className="hero-blob b1" />
          <div className="hero-blob b2" />
          <div className="hero-blob b3" />
          <div className="hero-empty">
            <h1>{greeting()}{ui.settings['displayName'] ? `, ${String(ui.settings['displayName'])}` : ''}</h1>
            <div className="tagline">Music makes everything <span className="accent">better.</span></div>
          </div>
          <EmptyState
            icon="note"
            title="Your library is empty"
            body="PlayPix hasn't found any music yet. Let it scan your PC, import a folder, or simply drag files in."
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
              </>
            }
          />
        </div>
      ) : (
        <>
          {/* ============ HERO ============ */}
          <div
            className={`home-hero hero-v${heroDot}`}
            data-e2e="hero"
            style={heroAccent ? ({ '--hero-accent': heroAccent } as React.CSSProperties) : undefined}
            onMouseEnter={() => setIsHeroHovered(true)}
            onMouseLeave={() => setIsHeroHovered(false)}
          >
            <div className="hero-art" aria-hidden="true">
              {heroTrack?.artKey && <img src={artUrl(heroTrack.artKey)} alt="" loading="lazy" draggable={false} />}
            </div>
            <div className="hero-blob b1" />
            <div className="hero-blob b2" />
            <div className="hero-blob b3" />
            <div className="hero-shade" />

            {/* Slide 0: Daily Vibe & Continue Listening */}
            <div className={`hero-slide ${heroSlide === 0 ? 'active' : ''}`}>
              <div className="hero-inner">
                <div className="hero-left">
                  <div className="eyebrow">
                    {greeting()}{ui.settings['displayName'] ? `, ${String(ui.settings['displayName'])}` : ''}
                  </div>
                  <h1 className="headline">
                    Music makes
                    <br />
                    everything <span className="accent">better.</span>
                  </h1>
                  <div className="tagline">Your vibe. Your tracks. Your PlayPix.</div>
                  <div className="hero-cta">
                    <button className="btn primary hero-continue" data-e2e="hero-continue" onClick={continueListening}>
                      <Icon name="play" size={16} />
                      Continue Listening
                    </button>
                    <button className="hero-shuffle" aria-label="Shuffle my music" onClick={shuffleAll}>
                      <Icon name="shuffle" size={17} />
                    </button>
                  </div>
                </div>
                {heroTrack && heroLive && (
                  <button className="hero-np" data-e2e="hero-np" onClick={() => ui.setNowPlaying(true)}>
                    <div className="art">
                      <Artwork artKey={heroLive.artKey} name={heroLive.title} radius={12} />
                    </div>
                    <div className="np-meta">
                      <div className="np-kicker">Now Playing</div>
                      <div className="np-t">{heroLive.title}</div>
                      <div className="np-a">{heroLive.artist || 'Unknown artist'}</div>
                    </div>
                    <div className="np-actions">
                      <span
                        className={`np-heart ${heroLive.favorite ? 'on' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          player.toggleFavorite(heroLive.id)
                        }}
                      >
                        <Icon name="heart" size={16} />
                      </span>
                      <span className="np-wave" aria-hidden="true">
                        <span /><span /><span /><span />
                      </span>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Slide 1: Listening Insights & Statistics */}
            <div className={`hero-slide ${heroSlide === 1 ? 'active' : ''}`}>
              <div className="hero-inner">
                <div className="hero-left">
                  <div className="eyebrow">LISTENING INSIGHTS</div>
                  <h1 className="headline">
                    Your Sound Journey
                    <br />
                    <span className="accent">in Focus.</span>
                  </h1>
                  <div className="tagline">Stats, playtime and patterns from your library.</div>
                  <div className="hero-cta">
                    <button
                      className="btn primary hero-continue"
                      onClick={() => ui.navigate({ name: 'statistics' })}
                    >
                      <Icon name="chart" size={16} />
                      View Full Statistics
                    </button>
                    <button
                      className="hero-shuffle"
                      aria-label="View library"
                      title="View library"
                      onClick={() => {
                        ui.setLibraryTab('songs')
                        ui.navigate({ name: 'library' })
                      }}
                    >
                      <Icon name="folder" size={17} />
                    </button>
                  </div>
                </div>

                <div
                  className="hero-stats-panel glass"
                  onClick={() => ui.navigate({ name: 'statistics' })}
                  role="button"
                  tabIndex={0}
                  title="Click to view detailed statistics"
                >
                  <div className="hero-stats-header">
                    <div className="hero-stats-badge">
                      <Icon name="sparkle" size={13} />
                      <span>Library Overview</span>
                    </div>
                    <span className="hero-stats-arrow">
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </div>

                  <div className="hero-stats-grid">
                    <div className="hero-stat-cell">
                      <div className="hstat-value">{fmtListening(stats?.totals?.totalSeconds ?? 0)}</div>
                      <div className="hstat-label">
                        <Icon name="clock" size={12} />
                        <span>Listening Time</span>
                      </div>
                    </div>

                    <div className="hero-stat-cell">
                      <div className="hstat-value">{lib.songs.filter((s) => !s.missing).length}</div>
                      <div className="hstat-label">
                        <Icon name="note" size={12} />
                        <span>Total Songs</span>
                      </div>
                    </div>

                    <div className="hero-stat-cell">
                      <div className="hstat-value">{favCount}</div>
                      <div className="hstat-label">
                        <Icon name="heart" size={12} />
                        <span>Favorites</span>
                      </div>
                    </div>

                    <div className="hero-stat-cell">
                      <div className="hstat-value" title={stats?.topArtists?.[0]?.artist || 'Top Artist'}>
                        {stats?.topArtists?.[0]?.artist || (lib.artists[0]?.name || '—')}
                      </div>
                      <div className="hstat-label">
                        <Icon name="profile" size={12} />
                        <span>Top Artist</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Slide 2: Heavy Rotation & Discovery */}
            <div className={`hero-slide ${heroSlide === 2 ? 'active' : ''}`}>
              <div className="hero-inner">
                <div className="hero-left">
                  <div className="eyebrow">CURATED DISCOVERY</div>
                  <h1 className="headline">
                    Heavy Rotation
                    <br />
                    <span className="accent">& Top Mix.</span>
                  </h1>
                  <div className="tagline">The tracks and rhythms you keep coming back to.</div>
                  <div className="hero-cta">
                    <button
                      className="btn primary hero-continue"
                      onClick={() => player.playContext(topMix, 0)}
                    >
                      <Icon name="play" size={16} />
                      Play Your Top Mix
                    </button>
                    <button
                      className="hero-shuffle"
                      aria-label="Shuffle Top Mix"
                      title="Shuffle Top Mix"
                      onClick={() => player.playContext(topMix, 0, { shuffle: true })}
                    >
                      <Icon name="shuffle" size={17} />
                    </button>
                  </div>
                </div>

                <div className="hero-rotation-panel glass">
                  <div className="hero-rotation-title">
                    <Icon name="repeat" size={13} />
                    <span>Frequent Rotations</span>
                  </div>
                  <div className="hero-rotation-list">
                    {(rotation.length ? rotation.slice(0, 3) : lib.songs.slice(0, 3)).map((s, idx) => (
                      <div
                        key={`hrot-${s.id}`}
                        className="hero-rot-item"
                        onClick={() => player.playContext(rotation.length ? rotation : lib.songs, idx)}
                      >
                        <div className="hrot-art">
                          <Artwork artKey={s.artKey} name={s.title} radius={6} />
                        </div>
                        <div className="hrot-info">
                          <div className="hrot-title">{s.title}</div>
                          <div className="hrot-artist">{s.artist || 'Unknown'}</div>
                        </div>
                        <button
                          className="hrot-play-btn"
                          aria-label={`Play ${s.title}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            player.playContext(rotation.length ? rotation : lib.songs, idx)
                          }}
                        >
                          <Icon name="play" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Interactive Carousel Indicator Dots */}
            <div className="hero-dots" role="tablist" aria-label="Hero carousel slides">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  className={`hero-dot-btn ${i === heroSlide ? 'on' : ''}`}
                  onClick={() => setHeroSlide(i)}
                  aria-label={`Slide ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* ============ RECENTLY PLAYED (mixed-size band) ============ */}
          <div className="band-wrap">
            <div className="band-head">
              <h2>
                <Icon name="clock" size={17} />
                Recently played
                <span className="badge-i" title="Playlists, favorites and tracks from your recent listening">i</span>
              </h2>
              <button
                className="see-all"
                onClick={() => {
                  ui.setLibraryTab('songs')
                  ui.navigate({ name: 'library' })
                }}
              >
                See all <Icon name="chevron-right" size={14} />
              </button>
            </div>
            <div className="band" data-e2e="recent-band">
              {bandTiles}
            </div>
          </div>

          {/* ============ QUICK PICKS (moods + mood card + genres) ============ */}
          {moods.length > 0 && (
            <div className="quick-grid">
              <div className="quick-left">
                <div className="band-head">
                  <h2>
                    <Icon name="sparkle" size={17} />
                    Quick Picks for You
                  </h2>
                </div>
                <div className="mood-row">
                  {moods.map(({ spec, songs }) => (
                    <button
                      key={spec.key}
                      className="mood-card"
                      style={{ background: spec.grad }}
                      data-e2e={`mood-${spec.key.replace(' ', '-')}`}
                      onClick={() => player.playContext(songs, 0, { shuffle: true })}
                    >
                      <span className="m-ico">
                        <Icon name={spec.icon} size={18} />
                      </span>
                      <span className="m-name">{spec.name}</span>
                      <span className="m-sub">Playlist</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="quick-right">
                <div className="mood-feature">
                  <div className="mf-art" aria-hidden="true">
                    {recentTiles[0] && <img src={recentTiles[0].artKey ? artUrl(recentTiles[0].artKey) : ''} alt="" loading="lazy" draggable={false} />}
                  </div>
                  <h3>Mood</h3>
                  <div className="mf-sub">Find the perfect sound for your mood.</div>
                  <button
                    className="mf-browse"
                    onClick={() => {
                      ui.setLibraryTab('songs')
                      ui.navigate({ name: 'library' })
                    }}
                  >
                    Browse
                  </button>
                </div>
                {genres.length > 0 && (
                  <div className="genres-card" data-e2e="genres-card">
                    <div className="genres-head">
                      <h3>
                        <Icon name="wave" size={15} />
                        Genres
                      </h3>
                      <button
                        className="see-all"
                        onClick={() => {
                          ui.setLibraryTab('songs')
                          ui.navigate({ name: 'library' })
                        }}
                      >
                        See all <Icon name="chevron-right" size={13} />
                      </button>
                    </div>
                    <div className="genre-chips">
                      {genres.map((g) => (
                        <button
                          key={g.name}
                          className="genre-chip"
                          onClick={() => {
                            const mix = songsForGenre(lib.songs, g.name)
                            if (mix.length) player.playContext(mix, 0, { shuffle: true })
                          }}
                        >
                          {g.name}
                        </button>
                      ))}
                      <button
                        className="genre-chip more"
                        onClick={() => {
                          ui.setLibraryTab('songs')
                          ui.navigate({ name: 'library' })
                        }}
                      >
                        More →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============ POPULAR ARTISTS ============ */}
          {topArtists.length > 0 && (
            <div className="band-wrap">
              <div className="band-head">
                <h2>
                  <Icon name="user" size={17} />
                  Popular Artists
                  <span className="badge-i" title="Ranked by how much you listen to them">i</span>
                </h2>
                <button
                  className="see-all"
                  onClick={() => {
                    ui.setLibraryTab('artists')
                    ui.navigate({ name: 'library' })
                  }}
                >
                  See all <Icon name="chevron-right" size={14} />
                </button>
              </div>
              <div className="band artists-band">
                {topArtists.map((a) => (
                  <ArtistCard key={`ta-${a.key}`} artist={a} songsFor={songsForArtist} />
                ))}
              </div>
            </div>
          )}

          {/* ============ RECENTLY ADDED / ALBUMS ============ */}
          {home && home.recentlyAdded.length > 0 && (
            <Section title="Recently added">
              {home.recentlyAdded.map((s) => (
                <SongCard key={`ra-${s.id}`} song={s} homeQueue={homeQueue} />
              ))}
            </Section>
          )}

          {home && home.albums.length > 0 && (
            <Section
              title="Albums for you"
              seeAll
              onSeeAll={() => {
                ui.setLibraryTab('albums')
                ui.navigate({ name: 'library' })
              }}
            >
              {(albumSuggestions(lib.albums, lib.songs, 10).length > 0
                ? albumSuggestions(lib.albums, lib.songs, 10)
                : home.albums
              ).map((a) => (
                <AlbumTile key={`af-${a.key}`} albumKey={a.key} />
              ))}
            </Section>
          )}
        </>
      )}

      <div style={{ height: 8 }} />
    </div>
  )
}

/** Minimal album tile that reuses the shared album menu + detail navigation. */
function AlbumTile({ albumKey }: { albumKey: string }) {
  const ui = useUI()
  const lib = useLibrary()
  const player = usePlayer()
  const album = lib.albums.find((a) => a.key === albumKey)
  if (!album) return null
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => ui.navigate({ name: 'detail', detail: { type: 'album', key: album.key, name: album.name } })}
      onKeyDown={(e) => e.key === 'Enter' && ui.navigate({ name: 'detail', detail: { type: 'album', key: album.key, name: album.name } })}
      onContextMenu={(e) => {
        e.preventDefault()
        void api.songsByAlbum(album.key).then((songs) =>
          ui.openCtxMenu(e.clientX, e.clientY, albumMenu(ui, player, lib, album, songs))
        )
      }}
    >
      <div className="art">
        <Artwork artKey={album.artKey} name={album.name} radius={14} />
        <button
          className="play-fab"
          aria-label={`Play ${album.name}`}
          onClick={(e) => {
            e.stopPropagation()
            void api.songsByAlbum(album.key).then((songs) => player.playContext(songs, 0))
          }}
        >
          <Icon name="play" size={18} />
        </button>
      </div>
      <div className="name">{album.name}</div>
      <div className="sub">{album.artist || 'Unknown artist'} · {album.songCount} songs</div>
      <button
        className="icon-btn card-menu"
        aria-label={`Actions for ${album.name}`}
        onClick={(e) => {
          e.stopPropagation()
          void api.songsByAlbum(album.key).then((songs) =>
            ui.openCtxMenu(e.clientX, e.clientY, albumMenu(ui, player, lib, album, songs))
          )
        }}
      >
        <Icon name="dots" size={15} />
      </button>
    </div>
  )
}
