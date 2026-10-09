// PlayPix renderer — context menu host (glass, with viewport-aware submenus)
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUI } from '../state/ui'
import type { CtxMenuItem, CtxMenuState } from '../state/ui'
import { Icon } from './Icon'

const ITEM_H = 38
const SUB_ITEM_H = 34
const EDGE = 8 // min distance kept from the window edges
const GAP = 6 // overlap gap between parent menu and submenu

/**
 * Collision-aware placement for a submenu anchored to its parent item:
 * prefers opening to the right, flips to the left when the viewport is too
 * narrow; vertically clamps so the submenu never leaves the screen, and
 * constrains its height (scrolling inside) when the list is long.
 */
function placeSubmenu(
  sub: HTMLElement,
  item: HTMLElement
): React.CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // The parent menu may still be running its entrance animation (scale +
  // translateY). Measuring item/sub rects mid-transform skews every value and
  // corrupts the collision math (the submenu then overflows the bottom edge).
  // Suspend animations on the whole menu subtree while measuring — this runs
  // pre-paint inside a layout effect, so no flicker is possible.
  const menuRoot = item.closest<HTMLElement>('.ctx-menu')
  const savedAnim = menuRoot?.style.animation
  if (menuRoot) menuRoot.style.animation = 'none'
  const ir = item.getBoundingClientRect()
  // Measure the natural size with animations disabled — the entrance
  // transform (scale/translate) would otherwise skew the measured rect and
  // corrupt the collision math.
  sub.style.animation = 'none'
  const sr = sub.getBoundingClientRect()
  if (menuRoot) menuRoot.style.animation = savedAnim ?? ''
  const maxH = Math.min(340, vh - EDGE * 2)
  const width = Math.min(sr.width, vw - EDGE * 2)
  const height = Math.min(sr.height, maxH)

  // --- horizontal: right side first, flip left when it would overflow ---
  const spaceRight = vw - EDGE - ir.right
  let left: number
  if (spaceRight >= width + GAP) {
    left = ir.width - GAP
  } else {
    const spaceLeft = ir.left - EDGE
    if (spaceLeft >= width + GAP) {
      left = -(width - GAP)
    } else {
      // Neither side fully fits: pick the side with more room and clamp
      // against the viewport edge.
      if (spaceRight >= spaceLeft) left = Math.max(GAP - ir.left, vw - EDGE - width - ir.left)
      else left = Math.max(EDGE - ir.left, -(width - GAP))
    }
  }

  // --- vertical: align with the item, shift up when it would overflow ---
  let top = 0
  const itemTopAbs = ir.top
  if (itemTopAbs + height > vh - EDGE) {
    // bottom-most position that keeps the submenu fully visible
    top = Math.max(-(ir.top - EDGE), vh - EDGE - height - itemTopAbs)
  }

  return {
    left: Math.round(left),
    top: Math.round(top),
    maxHeight: Math.round(maxH),
    overflowY: 'auto',
    width: width !== sr.width ? Math.round(width) : undefined
  }
}

/** Read a clean border-box rect with entrance animations suspended. */
function stableRect(el: HTMLElement): DOMRect {
  el.style.animation = 'none'
  const r = el.getBoundingClientRect()
  el.style.animation = ''
  return r
}

export function ContextMenuHost() {
  const ui = useUI()
  const menu = ui.ctxMenu
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<number, HTMLDivElement>())
  const subRef = useRef<HTMLDivElement | null>(null)
  const subItemRefs = useRef(new Map<number, HTMLButtonElement>())
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [subOpen, setSubOpen] = useState<number | null>(null)
  const [subStyle, setSubStyle] = useState<React.CSSProperties | null>(null)
  const [glideState, setGlideState] = useState<{
    top: number
    height: number
    opacity: number
    isDanger: boolean
  }>({
    top: 0,
    height: ITEM_H,
    opacity: 0,
    isDanger: false
  })
  const [subGlideState, setSubGlideState] = useState<{
    top: number
    height: number
    opacity: number
    isDanger: boolean
  }>({
    top: 0,
    height: SUB_ITEM_H,
    opacity: 0,
    isDanger: false
  })
  const prevMenu = useRef<CtxMenuState | null>(null)

  useLayoutEffect(() => {
    if (!menu) {
      setPos(null)
      setSubOpen(null)
      setSubStyle(null)
      setGlideState((s) => ({ ...s, opacity: 0 }))
      setSubGlideState((s) => ({ ...s, opacity: 0 }))
      prevMenu.current = null
      return
    }
    if (prevMenu.current === menu) return
    prevMenu.current = menu
    const el = ref.current
    let x = menu.x
    let y = menu.y
    if (el) {
      const r = stableRect(el)
      if (window.__ppCtxDebug) console.log(`[ctx] menu rect h=${Math.round(r.height)} raw=(${menu.x},${menu.y})`)
      if (x + r.width > window.innerWidth - EDGE) x = Math.max(EDGE, window.innerWidth - r.width - EDGE)
      if (y + r.height > window.innerHeight - EDGE) y = Math.max(EDGE, menu.y - r.height)
      if (window.__ppCtxDebug) console.log(`[ctx] pos=(${Math.round(x)},${Math.round(y)}) vh=${window.innerHeight}`)
    }
    setPos({ x, y })
    // Drop any submenu carried over from the previous menu; a requested
    // (E2E) submenu is re-opened after the menu lands at its final position
    // (see the effect below) so its collision math uses final geometry.
    setSubOpen(null)
    setSubStyle(null)
  }, [menu])

  // E2E hook: open the requested submenu once the menu is positioned.
  useEffect(() => {
    if (!menu?.openSub) return
    const idx = menu.items.findIndex((i) => i.label === menu.openSub && i.sub?.length)
    if (idx >= 0) setSubOpen(idx)
  }, [menu])

  // Position the open submenu collision-aware, before the browser paints.
  useLayoutEffect(() => {
    if (subOpen === null) {
      setSubStyle(null)
      return
    }
    const sub = subRef.current
    const item = itemRefs.current.get(subOpen)
    if (!sub || !item) return
    if (window.__ppCtxDebug) console.log(`[ctx] sub measure item.top=${Math.round(item.getBoundingClientRect().top)} subH=${Math.round(sub.getBoundingClientRect().height)}`)
    setSubStyle(placeSubmenu(sub, item))
    // restart the entrance animation at the final position
    sub.style.animation = ''
  }, [subOpen, menu])

  useEffect(() => {
    if (!menu) return
    const close = (): void => ui.closeCtxMenu()
    window.addEventListener('resize', close)
    return () => window.removeEventListener('resize', close)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu])

  if (!menu) return null

  const handleItemEnter = (i: number, isDanger: boolean): void => {
    const el = itemRefs.current.get(i)
    const menuEl = ref.current
    if (el && menuEl) {
      const mr = menuEl.getBoundingClientRect()
      const ir = el.getBoundingClientRect()
      setGlideState({
        top: ir.top - mr.top,
        height: ir.height,
        opacity: 1,
        isDanger
      })
    }
  }

  const handleSubItemEnter = (j: number, isDanger: boolean): void => {
    const el = subItemRefs.current.get(j)
    const subEl = subRef.current
    if (el && subEl) {
      const sr = subEl.getBoundingClientRect()
      const ir = el.getBoundingClientRect()
      setSubGlideState({
        top: ir.top - sr.top,
        height: ir.height,
        opacity: 1,
        isDanger
      })
    }
  }

  return (
    <>
      <div className="ctx-backdrop" onClick={ui.closeCtxMenu} onContextMenu={(e) => e.preventDefault()} />
      <div
        ref={ref}
        className="ctx-menu"
        style={{
          left: pos?.x ?? menu.x,
          top: pos?.y ?? menu.y,
          visibility: pos ? 'visible' : 'hidden'
        }}
        role="menu"
        onMouseLeave={() => setGlideState((s) => ({ ...s, opacity: 0 }))}
      >
        <div
          className={`ctx-glide-pill ${glideState.isDanger ? 'danger' : ''}`}
          style={{
            transform: `translateY(${glideState.top}px)`,
            height: `${glideState.height}px`,
            opacity: glideState.opacity
          }}
          aria-hidden="true"
        />
        {menu.items.map((item, i) =>
          item.sep ? (
            <div className="ctx-sep" key={`sep-${i}`} />
          ) : (
            <div
              key={`${item.label}-${i}`}
              ref={(el) => {
                if (el) itemRefs.current.set(i, el)
                else itemRefs.current.delete(i)
              }}
              style={{ position: 'relative' }}
              onMouseEnter={() => {
                handleItemEnter(i, !!item.danger)
                if (item.sub?.length) setSubOpen(i)
                // while an E2E-forced submenu is open, hovering a plain row
                // must not close it (synthetic mouseover under a static cursor)
                else if (!menu?.openSub) setSubOpen(null)
              }}
            >
              <button
                className={`ctx-item ${item.danger ? 'danger' : ''}`}
                role="menuitem"
                onClick={() => {
                  if (item.sub?.length) return
                  ui.closeCtxMenu()
                  item.onClick?.()
                }}
              >
                {item.icon && (
                  <span className="ico">
                    <Icon name={item.icon} size={16} />
                  </span>
                )}
                {item.label}
                {item.sub?.length ? (
                  <span className="chev">
                    <Icon name="chevron-right" size={14} />
                  </span>
                ) : null}
              </button>
              {item.sub?.length && subOpen === i && (
                <div
                  ref={subRef}
                  className="ctx-sub"
                  style={
                    subStyle ?? {
                      // staged off-screen until the layout effect measures it
                      left: -9999,
                      top: 0,
                      maxHeight: 340,
                      overflowY: 'auto'
                    }
                  }
                  onMouseLeave={() => setSubGlideState((s) => ({ ...s, opacity: 0 }))}
                >
                  <div
                    className={`ctx-glide-pill ${subGlideState.isDanger ? 'danger' : ''}`}
                    style={{
                      transform: `translateY(${subGlideState.top}px)`,
                      height: `${subGlideState.height}px`,
                      opacity: subGlideState.opacity
                    }}
                    aria-hidden="true"
                  />
                  {item.sub.map((s, j) =>
                    s.sep ? (
                      <div className="ctx-sep" key={`ssep-${j}`} />
                    ) : (
                      <button
                        key={`${s.label}-${j}`}
                        ref={(el) => {
                          if (el) subItemRefs.current.set(j, el)
                          else subItemRefs.current.delete(j)
                        }}
                        className={`ctx-item ${s.danger ? 'danger' : ''}`}
                        role="menuitem"
                        style={{ height: SUB_ITEM_H }}
                        onMouseEnter={() => handleSubItemEnter(j, !!s.danger)}
                        onClick={() => {
                          ui.closeCtxMenu()
                          s.onClick?.()
                        }}
                      >
                        {s.icon && (
                          <span className="ico">
                            <Icon name={s.icon} size={15} />
                          </span>
                        )}
                        {s.label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </>
  )
}
