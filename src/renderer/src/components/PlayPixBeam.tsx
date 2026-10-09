// PlayPix renderer — centralized BorderBeam wrapper (visual enhancement spec)
// One place configures the beam so every surface shares the same identity:
// dark-blue ocean treatment, theme-aware, subtle by default.
import { BorderBeam } from 'border-beam'
import type { ReactNode } from 'react'
import { useUI } from '../state/ui'
import { api } from '../lib/api'

type BeamVariant = 'navigation' | 'search' | 'player' | 'panel'

interface PlayPixBeamProps {
  children: ReactNode
  /** Beam runs only while active — inactive surfaces skip all animation. */
  active?: boolean
  variant?: BeamVariant
}

const PRESETS: Record<
  BeamVariant,
  { size: 'sm' | 'md'; strength: number; duration: number }
> = {
  navigation: { size: 'sm', strength: 0.5, duration: 4.2 },
  search: { size: 'sm', strength: 0.65, duration: 3.4 },
  player: { size: 'md', strength: 0.55, duration: 5.0 },
  panel: { size: 'md', strength: 0.6, duration: 4.4 }
}

export function PlayPixBeam({ children, active = true, variant = 'panel' }: PlayPixBeamProps) {
  const ui = useUI()
  const p = PRESETS[variant]
  // In automated e2e runs (software rendering, Xvfb) the always-on glow layers
  // cost real frame time and memory — mount an inert host instead so layout
  // and [data-beam] selectors stay identical while skipping the effect.
  const running = active && !api.e2eEnabled
  if (!running) {
    return (
      <div data-beam data-beam-inert style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}>
        {children}
      </div>
    )
  }
  return (
    <BorderBeam
      size={p.size}
      colorVariant="ocean"
      strength={p.strength}
      duration={p.duration}
      theme={ui.effectiveTheme}
      active={running}
      hueRange={18}
      glowSize={0.9}
    >
      {children}
    </BorderBeam>
  )
}
