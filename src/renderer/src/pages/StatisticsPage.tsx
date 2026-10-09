// PlayPix renderer — Statistics page (§27): local listening data, beautifully put.
import { useEffect, useState } from 'react'
import type { StatsData } from '../../../shared/types'
import { api } from '../lib/api'
import { usePlayer } from '../state/player'
import { useLibrary } from '../state/library'
import { Artwork } from '../components/Artwork'
import { EmptyState } from '../components/DialogHost'
import { Icon } from '../components/Icon'
import { cx } from '../lib/utils'

function fmtListening(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function fmtWhen(ts: number): string {
  const d = Date.now() - ts
  const mins = Math.floor(d / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(ts).toLocaleDateString()
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cx('stat-card glass', accent && 'stat-accent')}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function StatisticsPage() {
  const player = usePlayer()
  const lib = useLibrary()
  const [stats, setStats] = useState<StatsData | null>(null)

  useEffect(() => {
    void api.getStats().then(setStats)
    const off = api.onLibraryChanged(() => {
      void api.getStats().then(setStats)
    })
    return off
  }, [])

  if (!stats) {
    return (
      <div className="page page-anim stats-page">
        <div className="stats-head">
          <h1>Statistics</h1>
          <div className="sub">Your listening, measured locally.</div>
        </div>
        <div className="stats-grid">
          <div className="stat-card glass"><div className="stat-value">—</div><div className="stat-label">Loading</div></div>
        </div>
      </div>
    )
  }

  const t = stats.totals
  const noData = t.tracksPlayed === 0

  const maxPlays = Math.max(1, ...stats.daily.map((d) => d.plays))

  return (
    <div className="page page-anim stats-page">
      <div className="stats-head">
        <h1>Statistics</h1>
        <div className="sub">Your listening, measured locally.</div>
      </div>

      {noData && lib.songs.length === 0 ? (
        <EmptyState
          icon="stats"
          title="Nothing to measure yet"
          body="Once you play some music, PlayPix will build listening statistics here — everything stays on your PC."
        />
      ) : noData ? (
        <EmptyState
          icon="stats"
          title="No listening data yet"
          body="Play a few songs and this page will fill up with your most played tracks, artists, albums and daily activity."
        />
      ) : (
        <>
          <div className="stats-grid">
            {stats.lastPlayed && (
              <div className="stat-card glass stat-last" data-e2e="stat-last">
                {stats.lastPlayed.artKey ? (
                  <div className="stat-last-art">
                    <Artwork artKey={stats.lastPlayed.artKey} name={stats.lastPlayed.title} radius={12} />
                  </div>
                ) : (
                  <div className="stat-last-art placeholder"><Icon name="note" size={22} /></div>
                )}
                <div className="stat-last-info">
                  <div className="stat-label">Last played</div>
                  <div className="stat-last-title">{stats.lastPlayed.title}</div>
                  <div className="stat-last-sub">
                    {stats.lastPlayed.artist || 'Unknown artist'} · {fmtWhen(stats.lastPlayed.lastPlayed ?? Date.now())}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label="Play last song"
                  onClick={() => player.playContext([stats.lastPlayed!], 0)}
                >
                  <Icon name="play" size={16} />
                </button>
              </div>
            )}
            <StatCard label="Listening time" value={fmtListening(t.listeningSeconds)} accent />
            <StatCard label="Tracks played" value={String(t.tracksPlayed)} />
            <StatCard label="Favorites" value={String(t.favorites)} />
          </div>

          {stats.daily.length > 0 && (
            <div className="stats-section glass">
              <div className="stats-section-title">Last 14 days</div>
              <div className="daily-chart" data-e2e="daily-chart">
                {stats.daily.map((d) => (
                  <div key={d.day} className="daily-col" title={`${d.plays} plays · ${fmtListening(d.seconds)}`}>
                    <div
                      className="daily-bar"
                      style={{ height: `${Math.max(3, (d.plays / maxPlays) * 72)}px`, opacity: d.plays ? 1 : 0.25 }}
                    />
                    <div className="daily-day">{new Date(d.day).getDate()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stats-two-col">
            <div className="stats-section glass">
              <div className="stats-section-title">Most played songs</div>
              {stats.mostPlayedSongs.length === 0 && <div className="stats-empty">Play something to fill this in.</div>}
              {stats.mostPlayedSongs.slice(0, 6).map((s, i) => (
                <div key={s.id} className="stats-row" onClick={() => player.playContext(stats.mostPlayedSongs, i)}>
                  <div className="stats-rank">{i + 1}</div>
                  <div className="stats-thumb">
                    <Artwork artKey={s.artKey} name={s.title} radius={8} />
                  </div>
                  <div className="stats-row-main">
                    <div className="stats-row-title">{s.title}</div>
                    <div className="stats-row-sub">{s.artist || 'Unknown artist'}</div>
                  </div>
                  <div className="stats-badge">{s.playCount} plays</div>
                </div>
              ))}
            </div>

            <div className="stats-section glass">
              <div className="stats-section-title">Most played artists</div>
              {stats.mostPlayedArtists.length === 0 && <div className="stats-empty">No artist data yet.</div>}
              {stats.mostPlayedArtists.map((a) => {
                const max = stats.mostPlayedArtists[0]?.plays || 1
                return (
                  <div key={a.name} className="stats-row">
                    <div className="stats-rank">·</div>
                    <div className="stats-row-main grow">
                      <div className="stats-row-title">{a.name}</div>
                      <div className="stats-bar"><div style={{ width: `${(a.plays / max) * 100}%` }} /></div>
                    </div>
                    <div className="stats-badge">{a.plays} plays</div>
                  </div>
                )
              })}
            </div>
          </div>

          {stats.mostPlayedAlbums.length > 0 && (
            <div className="stats-section glass">
              <div className="stats-section-title">Most played albums</div>
              <div className="stats-albums">
                {stats.mostPlayedAlbums.map((a) => (
                  <div key={a.key} className="stats-album" onClick={() => {
                    player.playContext(
                      stats.mostPlayedSongs.filter((s) => s.album === a.name),
                      0
                    )
                  }}>
                    <div className="stats-thumb lg"><Artwork artKey={a.artKey} name={a.name} radius={10} /></div>
                    <div className="stats-row-title">{a.name}</div>
                    <div className="stats-row-sub">{a.artist || 'Unknown artist'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="stats-section glass">
            <div className="stats-section-title">Recent history</div>
            {stats.history.length === 0 && <div className="stats-empty">Nothing played yet.</div>}
            {stats.history.slice(0, 20).map((h, i) => (
              <div key={`${h.song.id}-${h.playedAt}-${i}`} className="stats-row">
                <div className="stats-thumb">
                  <Artwork artKey={h.song.artKey} name={h.song.title} radius={8} />
                </div>
                <div className="stats-row-main">
                  <div className="stats-row-title">{h.song.title}</div>
                  <div className="stats-row-sub">{h.song.artist || 'Unknown artist'}</div>
                </div>
                <div className="stats-badge ghost">{fmtWhen(h.playedAt)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 8 }} />
    </div>
  )
}
