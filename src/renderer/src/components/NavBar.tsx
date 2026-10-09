// PlayPix renderer — floating glass navigation dock with liquid active indicator
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUI } from '../state/ui'
import { usePlayer } from '../state/player'
import { Icon } from './Icon'
import { cx } from '../lib/utils'

const TABS = [
  { id: 'home', label: 'Home', icon: <Icon name="home" size={18} /> },
  { id: 'library', label: 'Library', icon: <Icon name="library" size={18} /> },
  { id: 'stats', label: 'Statistics', icon: <Icon name="stats" size={18} /> }
]

export function NavBar() {
  const ui = useUI()
  const player = usePlayer()
  const active = ui.view.name === 'library' ? 'library' : ui.view.name === 'stats' ? 'stats' : 'home'
  const pillRef = useRef<HTMLSpanElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const [dockBottom, setDockBottom] = useState<number>(() => (player.current ? 110 : 20))

  // Dynamically compute exact floating dock bottom position from Music Bar
  useEffect(() => {
    const updateDockPosition = (): void => {
      const miniEl = document.querySelector('.mini') as HTMLElement | null
      if (miniEl) {
        const rect = miniEl.getBoundingClientRect()
        // Gap above Music Bar: 16px (strictly within 14–20px spec)
        const calculatedBottom = window.innerHeight - rect.top + 16
        setDockBottom(Math.round(calculatedBottom))
      } else if (player.current) {
        // Fallback when mini player is active: 16px bottom + 78px height + 16px gap = 110px
        setDockBottom(110)
      } else {
        setDockBottom(20)
      }
    }

    updateDockPosition()
    window.addEventListener('resize', updateDockPosition)
    const timer = setTimeout(updateDockPosition, 60)
    return () => {
      window.removeEventListener('resize', updateDockPosition)
      clearTimeout(timer)
    }
  }, [player.current])

  // Precision-align the active pill centered inside the dock capsule with equal spacing
  useLayoutEffect(() => {
    const pill = pillRef.current
    const tab = tabRefs.current.get(active)
    if (!pill || !tab) return

    pill.style.left = `${tab.offsetLeft}px`
    pill.style.width = `${tab.offsetWidth}px`
  }, [active])

  useEffect(() => {
    const place = (): void => {
      const pill = pillRef.current
      const tab = tabRefs.current.get(active)
      if (!pill || !tab) return
      pill.style.left = `${tab.offsetLeft}px`
      pill.style.width = `${tab.offsetWidth}px`
    }
    window.addEventListener('resize', place)
    const ro = new ResizeObserver(place)
    const tabs = tabRefs.current.get(active)?.parentElement
    if (tabs) ro.observe(tabs)
    return () => {
      window.removeEventListener('resize', place)
      ro.disconnect()
    }
  }, [active])

  const goto = (id: string): void => {
    ui.closeSearch()
    if (id === 'home') ui.navigate({ name: 'home' })
    else if (id === 'library') ui.navigate({ name: 'library' })
    else ui.navigate({ name: 'stats' })
  }

  return (
    <nav
      className={cx('navbar', player.current && 'has-player')}
      style={{ bottom: `${dockBottom}px` }}
      aria-label="Main navigation"
    >
      <div className="nav-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el)
              else tabRefs.current.delete(t.id)
            }}
            className={cx('nav-tab', active === t.id && 'active')}
            aria-current={active === t.id ? 'page' : undefined}
            onClick={() => goto(t.id)}
          >
            <span className="nav-ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
        <span className="liquid-pill" ref={pillRef} aria-hidden="true" />
      </div>
    </nav>
  )
}
