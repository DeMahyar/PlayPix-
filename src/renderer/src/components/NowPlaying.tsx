// PlayPix renderer — immersive Now Playing overlay + queue panel
import { useEffect, useState } from 'react'
import { usePlayer, usePlayerPosition } from '../state/player'
import { useUI } from '../state/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { Visualizer } from './Visualizer'
import { PlayPixBeam } from './PlayPixBeam'
import { streamUrl } from '../lib/api'
import { cx, fmtTime, songArtists, songAlbum, hueFromString } from '../lib/utils'
import type { VisualizerMode } from '../../../shared/types'

export function NowPlaying({ closing }: { closing?: boolean }) {
  const player = usePlayer()
  const { position, duration } = usePlayerPosition()
  const ui = useUI()
  const [seeking, setSeeking] = useState<number | null>(null)

  const [vizMode, setVizMode] = useState<VisualizerMode>(() => {
    const saved = localStorage.getItem('playpix_viz_mode') as VisualizerMode | null
    if (saved && ['spectrum', 'circular', 'particles'].includes(saved)) {
      return saved
    }
    return 'circular'
  })

  const changeVizMode = (m: VisualizerMode): void => {
    if (m === 'waveform') return
    setVizMode(m)
    localStorage.setItem('playpix_viz_mode', m)
  }

  if (!player.current) return null
  const song = player.current
  const pos = seeking ?? position
  const pct = duration > 0 ? Math.min(100, (pos / duration) * 100) : 0

  const queue = player.queue
  const upNextCount = Math.max(0, queue.length - player.index - 1)

  const palette = player.palette

  // If track has no cover or palette is pending, derive default palette from song title
  const defaultHue = hueFromString(song.title || 'playpix')
  const defaultPrimary = `hsl(${defaultHue}, 60%, 54%)`
  const defaultSecondary = `hsl(${(defaultHue + 46) % 360}, 55%, 48%)`
  const defaultAccent = `hsl(${(defaultHue + 80) % 360}, 68%, 52%)`
  const defaultGlow = `hsla(${defaultHue}, 75%, 55%, 0.35)`
  const defaultBgDark = `hsl(${defaultHue}, 35%, 8%)`
  const defaultBgLight = `hsl(${defaultHue}, 30%, 94%)`

  const effectivePrimary = palette?.primary ?? defaultPrimary
  const effectiveSecondary = palette?.secondary ?? defaultSecondary
  const effectiveAccent = palette?.accent ?? defaultAccent
  const effectiveGlow = palette?.glow ?? defaultGlow
  const effectiveBg =
    ui.effectiveTheme === 'dark'
      ? (palette?.bgDark ?? defaultBgDark)
      : (palette?.bgLight ?? defaultBgLight)

  const palStyle = {
    '--np-primary': effectivePrimary,
    '--np-secondary': effectiveSecondary,
    '--np-accent': effectiveAccent,
    '--np-glow': effectiveGlow,
    '--np-bg': effectiveBg,
    '--grad-liquid-x': `90deg, ${effectivePrimary}, ${effectiveAccent}`
  } as React.CSSProperties

  return (
    <div
      className={`np ${closing ? 'closing' : ''} ${ui.effectiveTheme}`}
      role="dialog"
      aria-label="Now playing"
      style={palStyle}
    >
      <div className="np-backdrop" aria-hidden="true">
        {song.artKey ? (
          <>
            <img src={`art:///${encodeURIComponent(song.artKey)}`} alt="" />
            <img className="np-ambient" src={`art:///${encodeURIComponent(song.artKey)}`} alt="" />
          </>
        ) : (
          <div className="np-fallback-backdrop" />
        )}
      </div>
      <div className="np-shade" />

      <button className="np-close icon-btn" aria-label="Close Now Playing" onClick={() => ui.setNowPlaying(false)}>
        <Icon name="chevron-down" size={22} />
      </button>

      <div className="np-body">
        {/* Hero Visualizer Stage: Artwork centered, Visualizer radiating around it */}
        <div className="np-stage">
          <Visualizer
            songId={song.id}
            audioUrl={song.path ? streamUrl(song.path) : null}
            duration={duration}
            getPosition={() => player.getEngine()?.position ?? 0}
            isPlaying={player.isPlaying}
            palette={palette}
            theme={ui.effectiveTheme}
            currentMode={vizMode}
            onModeChange={setVizMode}
          />
          <div className="np-art-center">
            <PlayPixBeam variant="player" active={ui.nowPlaying}>
              <div className="np-art">
                <Artwork artKey={song.artKey} name={song.title} radius="50%" />
              </div>
            </PlayPixBeam>
          </div>
        </div>

        {/* Visualizer Mode Selector — Expanding Icon Tabs */}
        <div className="viz-modes expanding-tabs-bar" role="tablist" aria-label="Visualizer modes">
          <button
            className={cx('np-tab-btn', vizMode === 'circular' && 'active')}
            onClick={() => changeVizMode('circular')}
            title="360° Radial Circular Halo"
            role="tab"
            aria-selected={vizMode === 'circular'}
          >
            <span className="np-tab-icon">
              <Icon name="disc" size={14} />
            </span>
            <span className="np-tab-label-wrap" aria-hidden="true">
              <span className="np-tab-label-inner">Circular</span>
            </span>
          </button>
          <button
            className={cx('np-tab-btn', vizMode === 'spectrum' && 'active')}
            onClick={() => changeVizMode('spectrum')}
            title="Symmetrical EQ Spectrum"
            role="tab"
            aria-selected={vizMode === 'spectrum'}
          >
            <span className="np-tab-icon">
              <Icon name="chart" size={14} />
            </span>
            <span className="np-tab-label-wrap" aria-hidden="true">
              <span className="np-tab-label-inner">Spectrum</span>
            </span>
          </button>
          <button
            className={cx('np-tab-btn', vizMode === 'particles' && 'active')}
            onClick={() => changeVizMode('particles')}
            title="Fluid Energy Particles"
            role="tab"
            aria-selected={vizMode === 'particles'}
          >
            <span className="np-tab-icon">
              <Icon name="stars" size={14} />
            </span>
            <span className="np-tab-label-wrap" aria-hidden="true">
              <span className="np-tab-label-inner">Fluid</span>
            </span>
          </button>
        </div>

        <div className="np-meta">
          <div className="t">{song.title}</div>
          <div className="a">{songArtists(song)}</div>
          <div className="b">{songAlbum(song)}</div>
        </div>

        <div className="np-controls">
          <div className="np-seek">
            <span className="time">{fmtTime(pos)}</span>
            <input
              type="range"
              className="liquid-range"
              min={0}
              max={Math.max(1, Math.floor(duration))}
              value={Math.floor(pos)}
              style={{
                ['--fill' as string]: `${pct}%`,
                ['--grad-liquid-x' as string]:
                  palette?.primary && palette?.accent
                    ? `90deg, ${palette.primary}, ${palette.accent}`
                    : '90deg, #3f7dff, #29cfc0'
              }}
              aria-label="Seek"
              onChange={(e) => setSeeking(Number(e.target.value))}
              onPointerUp={() => {
                if (seeking !== null) player.seek(seeking)
                setSeeking(null)
              }}
              onKeyUp={() => {
                if (seeking !== null) player.seek(seeking)
                setSeeking(null)
              }}
            />
            <span className="time right">{fmtTime(duration)}</span>
          </div>

          <div className="np-buttons">
            <div className="side">
              <button
                className={cx('np-tab-btn', song.favorite && 'active')}
                aria-label="Favorite"
                onClick={() => player.toggleFavorite(song.id)}
                style={song.favorite && palette?.accent ? { background: palette.accent } : undefined}
              >
                <span className="np-tab-icon">
                  <Icon name="heart" size={17} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">{song.favorite ? 'Liked' : 'Favorite'}</span>
                </span>
              </button>
            </div>

            <div className="np-center expanding-tabs-bar" role="toolbar" aria-label="Playback controls">
              <button
                className={cx('np-tab-btn', player.shuffle && 'active')}
                aria-label="Shuffle"
                onClick={player.toggleShuffle}
                style={player.shuffle && palette?.accent ? { background: palette.accent } : undefined}
              >
                <span className="np-tab-icon">
                  <Icon name="shuffle" size={16} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">Shuffle</span>
                </span>
              </button>

              <button
                className="np-tab-btn"
                aria-label="Previous"
                onClick={player.prev}
              >
                <span className="np-tab-icon">
                  <Icon name="prev" size={17} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">Prev</span>
                </span>
              </button>

              <button
                className="np-tab-btn np-play-center"
                aria-label={player.isPlaying ? 'Pause' : 'Play'}
                onClick={player.togglePlay}
                style={{
                  background: palette?.accent || undefined,
                  boxShadow: palette?.glow ? `0 8px 24px ${palette.glow}` : undefined
                }}
              >
                <span className="np-tab-icon">
                  <Icon name={player.isPlaying ? 'pause' : 'play'} size={20} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">{player.isPlaying ? 'Pause' : 'Play'}</span>
                </span>
              </button>

              <button
                className="np-tab-btn"
                aria-label="Next"
                onClick={player.next}
              >
                <span className="np-tab-icon">
                  <Icon name="next" size={17} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">Next</span>
                </span>
              </button>

              <button
                className={cx('np-tab-btn', player.repeat !== 'off' && 'active')}
                aria-label={`Repeat: ${player.repeat}`}
                onClick={player.cycleRepeat}
                style={player.repeat !== 'off' && palette?.accent ? { background: palette.accent } : undefined}
              >
                <span className="np-tab-icon">
                  <Icon name={player.repeat === 'one' ? 'repeat-one' : 'repeat'} size={16} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">
                    {player.repeat === 'one' ? 'Repeat 1' : player.repeat === 'all' ? 'Repeat All' : 'Repeat'}
                  </span>
                </span>
              </button>
            </div>

            <div className="side">
              <button
                className={cx('np-tab-btn', ui.queueOpen && 'active')}
                aria-label="Queue"
                onClick={() => ui.setQueueOpen(!ui.queueOpen)}
                style={ui.queueOpen && palette?.accent ? { background: palette.accent } : undefined}
              >
                <span className="np-tab-icon">
                  <Icon name="queue" size={17} />
                </span>
                <span className="np-tab-label-wrap" aria-hidden="true">
                  <span className="np-tab-label-inner">Queue</span>
                </span>
              </button>
              <VolumeControl palette={palette} />
            </div>
          </div>
        </div>
      </div>

      {ui.queueOpen && <QueuePanel />}
      {upNextCount === 0 && null}
    </div>
  )
}

function VolumeControl({ palette }: { palette?: AlbumPalette | null }) {
  const player = usePlayer()
  const [open, setOpen] = useState(false)
  const volPct = Math.round(player.volume * 100)

  return (
    <div
      className={cx('np-vol-tab np-tab-btn', (player.muted || open) && 'active')}
      title={`Volume: ${volPct}%`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      role="group"
      aria-label="Volume Control"
      style={open && palette?.accent ? { borderColor: palette.accent } : undefined}
    >
      <button
        className="np-tab-icon"
        onClick={player.toggleMute}
        aria-label={player.muted || player.volume === 0 ? 'Unmute' : 'Mute'}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Icon name={player.muted || player.volume === 0 ? 'mute' : 'volume'} size={17} />
      </button>
      <div className="np-vol-slider-wrap">
        <input
          type="range"
          className="liquid-range vol-slider"
          min={0}
          max={100}
          value={player.muted ? 0 : volPct}
          style={{
            ['--fill' as string]: `${player.muted ? 0 : volPct}%`,
            ['--grad-liquid-x' as string]: palette?.accent ? `90deg, ${palette.accent}, ${palette.primary}` : undefined
          }}
          aria-label="Volume"
          onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
        />
        <span className="vol-pct">{player.muted ? '0%' : `${volPct}%`}</span>
      </div>
    </div>
  )
}

function QueuePanel() {
  const player = usePlayer()
  const ui = useUI()
  const current = player.current

  const upcoming = player.queue.slice(player.index + 1)

  return (
    <aside className="queue-panel" aria-label="Play queue">
      <div className="qh">
        <h3>Queue ({player.queue.length})</h3>
        <button
          className="icon-btn subtle"
          onClick={(e) => {
            e.stopPropagation()
            ui.setQueueOpen(false)
          }}
          aria-label="Close Queue"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="qlist">
        {current && (
          <div className="q-now">
            <span className="q-tag">Now playing</span>
            <div className="q-item playing">
              <div className="art">
                <Artwork artKey={current.artKey} name={current.title} radius={9} />
              </div>
              <div className="meta">
                <div className="t">{current.title}</div>
                <div className="a">{songArtists(current)}</div>
              </div>
            </div>
          </div>
        )}
        <div className="q-up">
          <span className="q-tag">Up next ({upcoming.length})</span>
          {upcoming.length === 0 ? (
            <div className="qempty">No more songs queued</div>
          ) : (
            upcoming.map((s, i) => (
              <div
                key={`${s.id}-${i}`}
                className="q-item"
                onClick={() => player.jumpTo(player.index + 1 + i)}
                title="Click to play"
              >
                <div className="art">
                  <Artwork artKey={s.artKey} name={s.title} radius={9} />
                </div>
                <div className="meta">
                  <div className="t">{s.title}</div>
                  <div className="a">{songArtists(s)}</div>
                </div>
                <span className="dur">{fmtTime(s.duration)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
