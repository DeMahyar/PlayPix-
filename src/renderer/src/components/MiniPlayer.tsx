// PlayPix renderer — compact persistent mini player
import { useRef } from 'react'
import { usePlayer, usePlayerPosition } from '../state/player'
import { useUI } from '../state/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { api } from '../lib/api'
import { fmtTime, songArtists } from '../lib/utils'

export function MiniPlayer() {
  const player = usePlayer()
  const { position, duration } = usePlayerPosition()
  const ui = useUI()
  const lineRef = useRef<HTMLDivElement>(null)

  if (!player.current) return null
  const song = player.current
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0

  const seekFromEvent = (e: React.MouseEvent): void => {
    const el = lineRef.current
    if (!el || duration <= 0) return
    const r = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    player.seek(ratio * duration)
  }

  return (
    <div className="mini glass-strong" role="region" aria-label="Mini player">
      <div
        className="art"
        onClick={() => ui.setNowPlaying(true)}
        title="Open Now Playing"
      >
        <Artwork artKey={song.artKey} name={song.title} radius={12} />
      </div>
      <div className="meta" onClick={() => ui.setNowPlaying(true)}>
        <div className="t">{song.title}</div>
        <div className="a">{songArtists(song)}</div>
      </div>
      <button
        className={`icon-btn ${song.favorite ? 'accent' : ''}`}
        aria-label={song.favorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={() => player.toggleFavorite(song.id)}
        style={song.favorite && player.palette?.accent ? { color: player.palette.accent } : undefined}
      >
        <Icon name="heart" size={18} />
      </button>
      <div className="controls">
        <button className="icon-btn" aria-label="Previous" onClick={player.prev}>
          <Icon name="prev" size={19} />
        </button>
        <button
          className="icon-btn"
          aria-label={player.isPlaying ? 'Pause' : 'Play'}
          onClick={player.togglePlay}
          style={{
            background: player.isPlaying && player.palette?.accent ? player.palette.accent : 'var(--row-active)',
            color: player.isPlaying && player.palette?.accent ? '#ffffff' : undefined,
            boxShadow: player.isPlaying && player.palette?.glow ? `0 4px 14px ${player.palette.glow}` : undefined,
            width: 40,
            height: 40,
            transition: 'all var(--dur-fast)'
          }}
        >
          <Icon name={player.isPlaying ? 'pause' : 'play'} size={19} />
        </button>
        <button className="icon-btn" aria-label="Next" onClick={player.next}>
          <Icon name="next" size={19} />
        </button>
      </div>
      <button
        className="icon-btn"
        aria-label="Switch to Mini Player Window (Ctrl+M)"
        title="Switch to Mini Player Window (Ctrl+M)"
        onClick={() => api.openMiniPlayer()}
      >
        <Icon name="pip" size={17} />
      </button>
      <button
        className="icon-btn"
        aria-label="Open Now Playing"
        onClick={() => ui.setNowPlaying(true)}
      >
        <Icon name="chevron-up" size={17} />
      </button>
      <div
        className="progress-line"
        ref={lineRef}
        onClick={seekFromEvent}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') player.seek(Math.min(duration, position + 5))
          if (e.key === 'ArrowLeft') player.seek(Math.max(0, position - 5))
        }}
      >
        <div
          className="fill"
          style={{
            width: `${pct}%`,
            background:
              player.palette?.primary && player.palette?.accent
                ? `linear-gradient(90deg, ${player.palette.primary}, ${player.palette.accent})`
                : undefined
          }}
        />
      </div>
      <span className="badge-count" style={{ position: 'absolute', left: 0, top: -18, display: 'none' }}>
        {fmtTime(position)}
      </span>
    </div>
  )
}
