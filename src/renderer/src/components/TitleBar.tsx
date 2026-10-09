// PlayPix renderer — titlebar: brand + morphing search + profile + window controls
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { cx } from '../lib/utils'
import { useUI } from '../state/ui'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { PlayPixBeam } from './PlayPixBeam'

export function TitleBar() {
  const ui = useUI()
  const [maximized, setMaximized] = useState(false)
  const [focused, setFocused] = useState(false)
  const [avatarPath, setAvatarPath] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const handleSearchMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = searchWrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    el.style.setProperty('--glow-x', `${x}px`)
    el.style.setProperty('--glow-y', `${y}px`)
    el.style.setProperty('--glow-opacity', '1')
  }

  const handleSearchMouseLeave = (): void => {
    const el = searchWrapRef.current
    if (!el) return
    el.style.setProperty('--glow-opacity', '0')
  }

  useEffect(() => {
    void api.winIsMaximized().then(setMaximized)
    const off = api.onWindowMaximized(setMaximized)
    const onFocus = (): void => setFocused(true)
    const onBlur = (): void => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      off()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // Local profile reflection: name comes from the live settings state, the
  // avatar is re-read on mount and whenever the Profile sheet closes (it may
  // have been changed there).
  useEffect(() => {
    if (ui.profileOpen) return
    let on = true
    void api.avatarPath().then((p) => {
      if (on) setAvatarPath(p || '')
    })
    return () => {
      on = false
    }
  }, [ui.profileOpen])

  const onSearchPage = ui.view.name === 'search'
  const displayName = typeof ui.settings['displayName'] === 'string' ? (ui.settings['displayName'] as string) : ''

  // Ctrl+F opens search
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        ui.openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui])

  useEffect(() => {
    if (ui.searchOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [ui.searchOpen])

  return (
    <header className="titlebar">
      {/* Brand logo: @microkit/outline-wipe-button style, purely visual badge */}
      <div
        className="brand outline-wipe-brand"
        aria-label="PlayPix"
        role="presentation"
      >
        <div className="outline-wipe-glow" aria-hidden="true" />
        <div className="outline-wipe-border" aria-hidden="true" />
        <div className="outline-wipe-content">
          <Logo size={24} />
          <span className="wordmark">PlayPix</span>
        </div>
      </div>

      <div className="topbar-spacer" />

      {/* Search button: @microkit/cursor-edge-glow-button style */}
      <div
        ref={searchWrapRef}
        className={cx('cursor-edge-glow search-edge-glow', ui.searchOpen && 'expanded')}
        onMouseMove={handleSearchMouseMove}
        onMouseLeave={handleSearchMouseLeave}
      >
        <div className={cx('searchbox', ui.searchOpen && 'expanded', ui.searchQuery && 'has-text')}>
          <button
            className="search-icon icon-btn"
            aria-label="Search"
            onClick={() => (ui.searchOpen ? inputRef.current?.focus() : ui.openSearch())}
          >
            <Icon name="search" size={18} />
          </button>
          <input
            ref={inputRef}
            value={ui.searchQuery}
            placeholder="Search songs, artists, albums…"
            onChange={(e) => ui.setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ui.commitSearch(ui.searchQuery)
            }}
            aria-label="Search music"
          />
          <button
            className="icon-btn clear-btn"
            aria-label="Clear search"
            onClick={() => {
              ui.setSearchQuery('')
              inputRef.current?.focus()
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </div>

      <div className={cx('profile-btn-wrap', onSearchPage && 'hidden')}>
        <button
          className="profile-chip"
          aria-label="Profile and settings"
          title="Profile and settings"
          onClick={() => ui.setProfileOpen(true)}
        >
          {avatarPath ? (
            <span className="pc-ava">
              <img src={`stream://img?p=${encodeURIComponent(avatarPath)}`} alt="" />
            </span>
          ) : displayName ? (
            <span className="pc-ava">{displayName.trim()[0]?.toUpperCase() ?? 'P'}</span>
          ) : (
            <span className="pc-ava">
              <Icon name="user" size={15} />
            </span>
          )}
          {displayName ? <span className="pc-name">{displayName}</span> : null}
        </button>
      </div>

      <div className="win-controls">
        <button
          className="win-btn"
          aria-label="Mini Player (Ctrl+M)"
          title="Mini Player (Ctrl+M)"
          onClick={() => api.openMiniPlayer()}
        >
          <Icon name="pip" size={13} />
        </button>
        <button className="win-btn" aria-label="Minimize" onClick={() => api.winMinimize()}>
          <Icon name="minimize-win" size={15} />
        </button>
        <button
          className="win-btn"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => api.winMaximizeToggle()}
        >
          <Icon name={maximized ? 'restore-win' : 'maximize-win'} size={13} />
        </button>
        <button className="win-btn close" aria-label="Close" onClick={() => api.winClose()}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {focused && null}
    </header>
  )
}
