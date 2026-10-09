// PlayPix renderer — dedicated Windows Mini Player Window
//
// Compact Rounded Floating Card (Music Widget style).
// Highly legible, solid/semi-solid surface in Dark & Light modes with
// dynamic album-art accents and zero desktop bleed-through.
import { useEffect, useRef, useState } from 'react'
import { api, artUrl } from '../lib/api'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { fmtTime, songArtists } from '../lib/utils'
import type { PlayerBroadcastState } from '../../../shared/types'

export function MiniPlayerWindow() {
  const [state, setState] = useState<PlayerBroadcastState>({
    current: null,
    isPlaying: false,
    position: 0,
    duration: 0,
    volume: 0.85,
    muted: false,
    repeat: 'off',
    shuffle: false,
    favorite: false,
    theme: 'dark',
    palette: null
  })

  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [seeking, setSeeking] = useState<number | null>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)

  // Initial theme bootstrap from settings
  useEffect(() => {
    void api.getSettings().then((s) => {
      const t = s['theme']
      if (t === 'light' || t === 'dark') {
        setTheme(t)
      } else {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setTheme(isDark ? 'dark' : 'light')
      }
    })
  }, [])

  // Sync theme changes from main player state broadcast
  useEffect(() => {
    if (state.theme && state.theme !== theme) {
      setTheme(state.theme)
    }
  }, [state.theme, theme])

  // Apply theme to documentElement for full token cascade
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Subscribe to live state updates from Main Player
  useEffect(() => {
    const unsub = api.onPlayerStateUpdated((freshState) => {
      setState(freshState as PlayerBroadcastState)
    })
    // Request current state immediately on mount
    api.requestPlayerState()
    return unsub
  }, [])

  const current = state.current
  const pos = seeking ?? state.position
  const dur = state.duration
  const pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : 0

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!progressBarRef.current || dur <= 0) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const targetTime = ratio * dur
    api.sendPlayerCommand('seek', targetTime)
  }

  const toggleAlwaysOnTop = async (): Promise<void> => {
    const isPinned = await api.toggleMiniAlwaysOnTop()
    setAlwaysOnTop(isPinned)
  }

  const palette = state.palette
  const palStyle = {
    '--mini-primary': palette?.primary ?? 'var(--accent)',
    '--mini-accent': palette?.accent ?? 'var(--accent)',
    '--mini-glow': palette?.glow ?? (theme === 'dark' ? 'rgba(63, 125, 255, 0.16)' : 'rgba(63, 125, 255, 0.08)')
  } as React.CSSProperties

  return (
    <div className="mini-window-wrapper" style={palStyle}>
      <div className={`mini-card-surface ${theme}`} aria-label="PlayPix Mini Player">
        {/* Draggable header bar */}
        <div className="mini-card-header">
          <div className="mini-card-brand" onClick={() => api.closeMiniPlayer()} title="Expand to PlayPix">
            <Logo size={14} />
            <span className="mini-brand-title">PlayPix</span>
          </div>

          <div className="mini-card-actions no-drag">
            <button
              className={`mini-head-btn ${alwaysOnTop ? 'active' : ''}`}
              onClick={toggleAlwaysOnTop}
              title={alwaysOnTop ? 'Pinned on Top' : 'Always on Top'}
              aria-label="Pin on top"
            >
              <Icon name="pin" size={13} />
            </button>
            <button
              className="mini-head-btn"
              onClick={() => api.closeMiniPlayer()}
              title="Expand to Full Player"
              aria-label="Expand player"
            >
              <Icon name="expand" size={13} />
            </button>
            <button
              className="mini-head-btn close"
              onClick={() => api.closeMiniPlayer()}
              title="Close"
              aria-label="Close"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        </div>

        {/* Main player content */}
        <div className="mini-card-body">
          <div className="mini-art-section">
            <div
              className="mini-card-art no-drag"
              onClick={() => api.closeMiniPlayer()}
              title="Click to open Full Player"
            >
              {current?.artKey ? (
                <img src={artUrl(current.artKey)} alt={current.title} />
              ) : (
                <div className="mini-art-placeholder">
                  <Icon name="note" size={28} />
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="mini-meta-section no-drag">
            <div className="mini-meta-text">
              <div className="mini-title" title={current?.title ?? 'No music playing'}>
                {current?.title ?? 'Nothing playing'}
              </div>
              <div className="mini-artist" title={current ? songArtists(current) : ''}>
                {current ? songArtists(current) : 'PlayPix Music'}
              </div>
            </div>

            {current && (
              <button
                className={`mini-fav-btn ${state.favorite ? 'favorited' : ''}`}
                onClick={() => api.sendPlayerCommand('toggleFavorite', current.id)}
                title={state.favorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-label="Favorite"
              >
                <Icon name="heart" size={15} />
              </button>
            )}
          </div>

          {/* Controls row */}
          <div className="mini-controls-row no-drag">
            <button
              className="mini-ctrl-btn"
              onClick={() => api.sendPlayerCommand('prev')}
              title="Previous Track"
              aria-label="Previous track"
              disabled={!current}
            >
              <Icon name="prev" size={16} />
            </button>

            <button
              className="mini-play-btn"
              onClick={() => api.sendPlayerCommand('togglePlay')}
              title={state.isPlaying ? 'Pause' : 'Play'}
              aria-label={state.isPlaying ? 'Pause' : 'Play'}
              disabled={!current}
            >
              <Icon name={state.isPlaying ? 'pause' : 'play'} size={18} />
            </button>

            <button
              className="mini-ctrl-btn"
              onClick={() => api.sendPlayerCommand('next')}
              title="Next Track"
              aria-label="Next track"
              disabled={!current}
            >
              <Icon name="next" size={16} />
            </button>
          </div>

          {/* Bottom scrub progress bar + time */}
          <div className="mini-progress-section no-drag">
            <div
              className="mini-progress-track"
              ref={progressBarRef}
              onClick={handleSeekClick}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(dur)}
              aria-valuenow={Math.round(pos)}
              tabIndex={0}
            >
              <div className="mini-progress-fill" style={{ width: `${pct}%` }} />
              <div className="mini-progress-thumb" style={{ left: `${pct}%` }} />
            </div>

            <div className="mini-time-display">
              <span>{fmtTime(pos)}</span>
              <span className="sep">/</span>
              <span>{fmtTime(dur)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
