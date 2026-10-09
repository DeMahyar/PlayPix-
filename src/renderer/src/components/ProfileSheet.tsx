// PlayPix renderer — local profile & settings floating bottom sheet
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import { Artwork } from './Artwork'
import { Icon } from './Icon'
import { Logo } from './Logo'
import type { ThemeMode } from '../../../shared/types'

export function ProfileSheet({ closing }: { closing?: boolean }) {
  const ui = useUI()
  const [avatarPath, setAvatarPath] = useState('')
  const [name, setName] = useState('')
  const [watchFolders, setWatchFolders] = useState<string[]>([])
  const [version, setVersion] = useState('')
  const nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void api.getSettings().then((s) => {
      setName(typeof s['displayName'] === 'string' ? (s['displayName'] as string) : '')
    })
    void api.avatarPath().then((p) => setAvatarPath(p))
    void api.listWatchFolders().then(setWatchFolders)
    void api.version().then(setVersion)
  }, [])

  const onNameChange = (v: string): void => {
    setName(v)
    if (nameTimer.current) clearTimeout(nameTimer.current)
    nameTimer.current = setTimeout(() => {
      ui.updateSetting('displayName', v.trim())
    }, 500)
  }

  const pickAvatar = async (): Promise<void> => {
    const p = await api.pickImage()
    if (!p) return
    const key = await api.setAvatarFile(p)
    if (key) setAvatarPath(await api.avatarPath())
  }

  const addFolder = async (): Promise<void> => {
    const p = await api.pickFolder()
    if (!p) return
    await api.addWatchFolder(p)
    await api.importPaths([p])
    setWatchFolders(await api.listWatchFolders())
    ui.toast('Folder added — scanning for new music…')
  }

  const removeFolder = async (p: string): Promise<void> => {
    await api.removeWatchFolder(p)
    setWatchFolders(await api.listWatchFolders())
  }

  const initial = (name || 'P').trim()[0]?.toUpperCase() ?? 'P'

  return (
    <>
      <div
        className="sheet-backdrop"
        onClick={() => ui.setProfileOpen(false)}
      />
      <div className={`sheet glass-strong ${closing ? 'closing' : ''}`} role="dialog" aria-label="Profile and settings">
        <div className="sheet-head">
          <div
            className="avatar"
            onClick={() => void pickAvatar()}
            role="button"
            aria-label="Change profile picture"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && void pickAvatar()}
          >
            {avatarPath ? (
              <img src={`stream://img?p=${encodeURIComponent(avatarPath)}`} alt="Profile" />
            ) : (
              initial
            )}
          </div>
          <div className="who">
            <input
              className="name-input"
              value={name}
              placeholder="Your name"
              aria-label="Display name"
              onChange={(e) => onNameChange(e.target.value)}
            />
            <div className="hint">Local profile — everything stays on this PC</div>
          </div>
          <button className="icon-btn" aria-label="Close settings" onClick={() => ui.setProfileOpen(false)}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="settings-group">
            <div className="gtitle">Appearance</div>
            <div className="setting-row">
              <span className="ico">
                <Icon name="sun" size={18} />
              </span>
              <div className="label">
                <div className="t">Theme</div>
                <div className="s">Light, dark, or follow Windows</div>
              </div>
              <div className="theme-seg" role="radiogroup" aria-label="Theme">
                {(
                  [
                    ['light', 'Light', 'sun'],
                    ['dark', 'Dark', 'moon'],
                    ['system', 'System', 'monitor']
                  ] as [ThemeMode, string, string][]
                ).map(([mode, label, icon]) => (
                  <button
                    key={mode}
                    className={ui.themeMode === mode ? 'active' : ''}
                    onClick={() => ui.setThemeMode(mode)}
                    role="radio"
                    aria-checked={ui.themeMode === mode}
                  >
                    <Icon name={icon} size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <span className="ico">
                <Icon name="note" size={18} />
              </span>
              <div className="label">
                <div className="t">Language</div>
                <div className="s">More languages arrive in a future version</div>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>English</div>
            </div>
          </div>

          <div className="settings-group">
            <div className="gtitle">Music library</div>
            <div className="setting-row">
              <span className="ico">
                <Icon name="image" size={18} />
              </span>
              <div className="label">
                <div className="t">Fetch missing album covers</div>
                <div className="s">Only when online. Never attaches low-confidence artwork.</div>
              </div>
              <button
                className={`switch ${ui.settings['fetchArtworkOnline'] === false ? '' : 'on'}`}
                role="switch"
                aria-checked={ui.settings['fetchArtworkOnline'] !== false}
                aria-label="Fetch missing album covers"
                onClick={() => ui.updateSetting('fetchArtworkOnline', ui.settings['fetchArtworkOnline'] === false)}
              >
                <span className="knob" />
              </button>
            </div>
            <div className="setting-row" style={{ cursor: 'pointer' }} onClick={() => void addFolder()}>
              <span className="ico">
                <Icon name="folder" size={18} />
              </span>
              <div className="label">
                <div className="t">Watched folders</div>
                <div className="s">New music in these folders is imported automatically</div>
              </div>
              <button className="icon-btn" aria-label="Add watched folder">
                <Icon name="plus" size={17} />
              </button>
            </div>
            {watchFolders.map((f) => (
              <div className="folder-pill" key={f}>
                <Icon name="folder" size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span className="path" title={f}>
                  {f}
                </span>
                <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label={`Stop watching ${f}`} onClick={() => void removeFolder(f)}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
            <div className="setting-row" style={{ cursor: 'pointer' }} onClick={() => void api.startScan()}>
              <span className="ico">
                <Icon name="scan" size={18} />
              </span>
              <div className="label">
                <div className="t">Scan my PC</div>
                <div className="s">Find music that was added anywhere else</div>
              </div>
              <Icon name="chevron-right" size={16} style={{ color: 'var(--text-3)' }} />
            </div>
          </div>

          <div className="settings-group">
            <div className="gtitle">About</div>
            <div className="about-row">
              <div className="logo">
                <Logo size={46} />
              </div>
              <div>
                <div className="t">PlayPix {version ? `v${version}` : ''}</div>
                <div className="s">
                  A local-first music player. Your library, your files, your machine — no accounts, no cloud, no
                  telemetry.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
