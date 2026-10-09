// PlayPix renderer — horizontal home sections
import type { ReactNode } from 'react'
import { useRef, useState, useEffect } from 'react'
import { Icon } from './Icon'

export function Section({
  title,
  seeAll,
  onSeeAll,
  children
}: {
  title: string
  seeAll?: boolean
  onSeeAll?: () => void
  children: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = (): void => {
    const el = scroller.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }

  useEffect(() => {
    update()
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  const nudge = (dir: number): void => {
    scroller.current?.scrollBy({ left: dir * 480, behavior: 'smooth' })
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {seeAll && (
            <button className="see-all" onClick={onSeeAll}>
              See all
            </button>
          )}
          {canLeft && (
            <button className="icon-btn" aria-label="Scroll left" onClick={() => nudge(-1)}>
              <Icon name="chevron-left" size={17} />
            </button>
          )}
          {canRight && (
            <button className="icon-btn" aria-label="Scroll right" onClick={() => nudge(1)}>
              <Icon name="chevron-right" size={17} />
            </button>
          )}
        </div>
      </div>
      <div className="h-scroll" ref={scroller} onScroll={update}>
        {children}
      </div>
    </section>
  )
}
