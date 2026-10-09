// PlayPix renderer — liquid segmented tabs (signature motion: the glass pill
// physically travels between tabs with a soft squash & stretch, like water).
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { cx } from '../lib/utils'

export interface LiquidTabDef {
  id: string
  label: string
  icon?: React.ReactNode
}

export function LiquidTabs({
  tabs,
  active,
  onChange,
  className,
  ariaLabel
}: {
  tabs: LiquidTabDef[]
  active: string
  onChange: (id: string) => void
  className?: string
  ariaLabel?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const lastRect = useRef<{ left: number; width: number } | null>(null)

  const rectFor = useCallback(
    (id: string): { left: number; width: number } | null => {
      const cont = innerRef.current
      const el = tabRefs.current.get(id)
      if (!cont || !el) return null
      const cr = cont.getBoundingClientRect()
      const tr = el.getBoundingClientRect()
      return { left: tr.left - cr.left, width: tr.width }
    },
    []
  )

  const place = useCallback(
    (id: string, animate: boolean) => {
      const pill = pillRef.current
      const target = rectFor(id)
      if (!pill || !target) return
      const prev = lastRect.current
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (!animate || !prev || reduced) {
        pill.style.left = `${target.left}px`
        pill.style.width = `${target.width}px`
        lastRect.current = target
        return
      }

      const dx = target.left - prev.left
      const travel = Math.abs(dx)
      const squash = Math.min(0.16, 0.05 + travel / 1600)
      pill.animate(
        [
          { left: `${prev.left}px`, width: `${prev.width}px`, transform: 'scale(1, 1)', offset: 0 },
          {
            left: `${prev.left + dx * 0.45}px`,
            width: `${prev.width + (target.width - prev.width) * 0.5}px`,
            transform: `scale(${1 + squash}, ${1 - squash * 0.85})`,
            offset: 0.48
          },
          {
            left: `${target.left}px`,
            width: `${target.width}px`,
            transform: 'scale(0.97, 1.06)',
            offset: 0.86
          },
          { left: `${target.left}px`, width: `${target.width}px`, transform: 'scale(1, 1)', offset: 1 }
        ],
        { duration: 520, easing: 'cubic-bezier(0.3, 0.9, 0.12, 1)', fill: 'forwards' }
      )
      lastRect.current = target
    },
    [rectFor]
  )

  useLayoutEffect(() => {
    place(active, lastRect.current !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabs])

  // Keep the pill aligned on resize
  useEffect(() => {
    const onResize = (): void => {
      place(active, false)
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
    }
  }, [active, place])

  const onKeyNav = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const idx = tabs.findIndex((t) => t.id === active)
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const n = tabs[(idx + dir + tabs.length) % tabs.length]
    if (n) onChange(n.id)
  }

  return (
    <div ref={containerRef} className={cx('seg glass', className)} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyNav}>
      <div className="seg-inner" ref={innerRef}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) tabRefs.current.set(t.id, el)
              else tabRefs.current.delete(t.id)
            }}
            role="tab"
            aria-selected={t.id === active}
            tabIndex={t.id === active ? 0 : -1}
            className={cx('seg-tab', t.id === active && 'active')}
            onClick={() => onChange(t.id)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <span className="liquid-pill" ref={pillRef} aria-hidden="true" />
      </div>
    </div>
  )
}
