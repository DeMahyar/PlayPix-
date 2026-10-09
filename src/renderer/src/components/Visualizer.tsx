// PlayPix renderer — real-time audio visualizer (§24)
//
// Synchronized directly with live audio playback via Web Audio API AnalyserNode.
// Supports Spectrum, Waveform, Circular, and Fluid/Particles modes with
// smooth pause/freeze damping, idle breathing, and dynamic Album-Art palette colors.
import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../state/player'
import { getEnvelope, peekEnvelope } from '../lib/vizEnvelope'
import type { VisualizerMode, AlbumPalette } from '../../../shared/types'

const BARS = 42
const WAVE_SAMPLES = 72
const PARTICLE_COUNT = 36

interface VizProps {
  songId: number | null
  audioUrl: string | null
  duration: number
  getPosition: () => number
  isPlaying: boolean
  palette?: AlbumPalette | null
  theme?: 'light' | 'dark'
  currentMode?: VisualizerMode
  onModeChange?: (mode: VisualizerMode) => void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  hueOffset: number
}

export function Visualizer({
  songId,
  audioUrl,
  duration,
  getPosition,
  isPlaying,
  palette,
  theme,
  currentMode,
  onModeChange
}: VizProps) {
  const player = usePlayer()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)

  // Mode state with persistence
  const [mode, setMode] = useState<VisualizerMode>(() => {
    if (currentMode && currentMode !== 'waveform') return currentMode
    const saved = localStorage.getItem('playpix_viz_mode') as VisualizerMode | null
    if (saved && ['spectrum', 'circular', 'particles'].includes(saved)) {
      return saved
    }
    return 'circular'
  })

  useEffect(() => {
    if (currentMode && currentMode !== mode && currentMode !== 'waveform') {
      setMode(currentMode)
    }
  }, [currentMode])

  const cycleMode = (): void => {
    const modes: VisualizerMode[] = ['circular', 'spectrum', 'particles']
    const nextIdx = (modes.indexOf(mode) + 1) % modes.length
    const next = modes[nextIdx]
    setMode(next)
    localStorage.setItem('playpix_viz_mode', next)
    onModeChange?.(next)
  }

  // Pre-allocated typed arrays to prevent garbage collection inside 60fps render loop
  const freqRawRef = useRef(new Uint8Array(128))
  const timeRawRef = useRef(new Uint8Array(128))
  const levelsRef = useRef<number[]>(new Array(BARS).fill(0))
  const peaksRef = useRef<number[]>(new Array(BARS).fill(0))
  const peakHoldRef = useRef<number[]>(new Array(BARS).fill(0))

  // Particles state pre-allocated
  const particlesRef = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: 0.15 + 0.7 * Math.random(),
      y: 0.15 + 0.7 * Math.random(),
      vx: (Math.random() - 0.5) * 0.0035,
      vy: (Math.random() - 0.5) * 0.0035,
      radius: 1.8 + Math.random() * 2.6,
      alpha: 0.25 + 0.55 * Math.random(),
      hueOffset: (i / PARTICLE_COUNT) * 45
    }))
  )

  const envRef = useRef<Float32Array | null>(null)
  const paletteRef = useRef<AlbumPalette | null | undefined>(palette)
  paletteRef.current = palette

  const stateRef = useRef({ duration, getPosition, isPlaying, mode, theme })
  stateRef.current = { duration, getPosition, isPlaying, mode, theme }

  // Fallback envelope loading for offline/decoded track synchronization
  useEffect(() => {
    let cancelled = false
    envRef.current = songId !== null ? peekEnvelope(songId) : null
    if (songId === null || !audioUrl) return
    void getEnvelope(songId, audioUrl).then((env) => {
      if (cancelled) return
      if (env) envRef.current = env
    })
    return () => {
      cancelled = true
    }
  }, [songId, audioUrl])

  useEffect(() => {
    let lastTime = performance.now()

    const draw = (now: number): void => {
      rafRef.current = requestAnimationFrame(draw)
      const dt = Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return

      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const st = stateRef.current
      const engine = player.getEngine()
      const t = now / 1000

      // Acquire live audio data if engine is playing
      let hasLiveAudio = false
      if (engine && st.isPlaying) {
        const freqRes = engine.getFrequencyData(freqRawRef.current)
        const timeRes = engine.getTimeDomainData(timeRawRef.current)
        hasLiveAudio = freqRes.hasSignal || timeRes.hasSignal
      }

      // Dynamic Album-Art Palette colors
      const pal = paletteRef.current
      const primaryColor = pal?.primary || 'rgba(63, 125, 255, 0.9)'
      const secondaryColor = pal?.secondary || 'rgba(41, 207, 192, 0.75)'
      const accentColor = pal?.accent || 'rgba(63, 125, 255, 1)'
      const glowColor = pal?.glow || 'rgba(63, 125, 255, 0.35)'

      // ----------------------------------------------------
      // Compute normalized values across bands
      // ----------------------------------------------------
      const env = envRef.current
      const curPos = st.getPosition()

      for (let i = 0; i < BARS; i++) {
        let target = 0

        if (hasLiveAudio) {
          // Logarithmic frequency mapping from 128 bins
          const freqData = freqRawRef.current
          const binStart = Math.floor(Math.pow(i / BARS, 1.8) * (freqData.length - 2))
          const binEnd = Math.max(binStart + 1, Math.floor(Math.pow((i + 1) / BARS, 1.8) * (freqData.length - 1)))
          let sum = 0
          let count = 0
          for (let b = binStart; b <= binEnd && b < freqData.length; b++) {
            sum += freqData[b]
            count++
          }
          const raw = count ? sum / count / 255 : 0
          target = Math.max(0.04, Math.min(1, raw * 1.3))
        } else if (env && st.duration > 0 && st.isPlaying) {
          // Fallback envelope based on track timing
          const idx = Math.min(
            env.length - 1,
            Math.floor((Math.min(st.duration, curPos) / st.duration) * env.length)
          )
          const bell = Math.exp(-Math.pow((i - BARS / 2) / (BARS / 2.6), 2))
          const jitter = 0.82 + 0.18 * Math.abs(Math.sin(t * 2.1 + i * 1.7))
          target = Math.max(0.04, Math.min(1, env[idx] * (0.45 + 0.55 * bell) * jitter))
        } else if (!st.isPlaying) {
          // Paused / idle state: gently damp down smoothly
          target = 0.03
        } else {
          // Ambient breathing while loading
          target = 0.06 + 0.04 * Math.abs(Math.sin(t * 1.5 + i * 0.4))
        }

        // Smooth damping
        const smoothFactor = st.isPlaying ? 0.36 : 0.06
        levelsRef.current[i] += (target - levelsRef.current[i]) * smoothFactor

        // Peak tracking
        if (levelsRef.current[i] > peaksRef.current[i]) {
          peaksRef.current[i] = levelsRef.current[i]
          peakHoldRef.current[i] = 10
        } else {
          if (peakHoldRef.current[i] > 0) {
            peakHoldRef.current[i]--
          } else {
            peaksRef.current[i] = Math.max(0, peaksRef.current[i] - dt * 0.65)
          }
        }
      }

      // ----------------------------------------------------
      // DRAW BY ACTIVE MODE
      // ----------------------------------------------------
      if (st.mode === 'circular') {
        drawCircular(ctx, w, h, levelsRef.current, t, primaryColor, secondaryColor, accentColor, glowColor)
      } else if (st.mode === 'spectrum') {
        drawSpectrum(ctx, w, h, levelsRef.current, peaksRef.current, primaryColor, secondaryColor, accentColor, glowColor)
      } else if (st.mode === 'particles') {
        drawParticles(ctx, w, h, levelsRef.current, particlesRef.current, dt, t, primaryColor, secondaryColor, accentColor, glowColor)
      } else {
        drawCircular(ctx, w, h, levelsRef.current, t, primaryColor, secondaryColor, accentColor, glowColor)
      }
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [player])

  return (
    <div className="np-viz-canvas-wrap" aria-label="Audio Visualizer">
      <canvas
        ref={canvasRef}
        className="np-viz-canvas"
        onClick={cycleMode}
        title="Click to cycle visualizer mode"
        aria-hidden="true"
      />
    </div>
  )
}

// --------------------------------------------------------
// VISUALIZER RENDERERS
// --------------------------------------------------------

/** Symmetrical compact EQ spectrum flanking the circular album cover without overlap */
function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: number[],
  peaks: number[],
  primary: string,
  secondary: string,
  accent: string,
  _glow: string
): void {
  const cx = w / 2
  const cy = h / 2
  // Envelopes the round cover (~120px radius) with generous clearance so bars never run underneath
  const coverR = Math.min(w, h) * 0.28 + 24
  const barsPerSide = 14
  const barW = 4.5
  const gap = 4
  const maxBarH = 50

  const grad = ctx.createLinearGradient(0, cy - maxBarH / 2, 0, cy + maxBarH / 2)
  grad.addColorStop(0, accent)
  grad.addColorStop(0.5, primary)
  grad.addColorStop(1, secondary)

  ctx.fillStyle = grad

  for (let i = 0; i < barsPerSide; i++) {
    // Left wing bars: stepping leftward away from cover
    const valL = Math.max(0.06, Math.min(1, levels[i] ?? 0.06))
    const barHL = Math.max(6, valL * maxBarH)
    const xL = cx - coverR - (i + 1) * (barW + gap)
    const yL = cy - barHL / 2

    ctx.globalAlpha = 0.5 + 0.5 * valL
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(xL, yL, barW, barHL, barW / 2)
    } else {
      ctx.rect(xL, yL, barW, barHL)
    }
    ctx.fill()

    // Left peak indicator
    const peakValL = Math.max(valL, Math.min(1, peaks[i] ?? valL))
    const peakHL = Math.max(6, peakValL * maxBarH)
    const peakYL = cy - peakHL / 2 - 2
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.82
    ctx.fillRect(xL, peakYL, barW, 1.8)
    ctx.fillStyle = grad

    // Right wing bars: stepping rightward away from cover
    const valR = Math.max(0.06, Math.min(1, levels[barsPerSide + i] ?? levels[i] ?? 0.06))
    const barHR = Math.max(6, valR * maxBarH)
    const xR = cx + coverR + i * (barW + gap)
    const yR = cy - barHR / 2

    ctx.globalAlpha = 0.5 + 0.5 * valR
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(xR, yR, barW, barHR, barW / 2)
    } else {
      ctx.rect(xR, yR, barW, barHR)
    }
    ctx.fill()

    // Right peak indicator
    const peakValR = Math.max(valR, Math.min(1, peaks[barsPerSide + i] ?? peaks[i] ?? valR))
    const peakHR = Math.max(6, peakValR * maxBarH)
    const peakYR = cy - peakHR / 2 - 2
    ctx.fillStyle = '#ffffff'
    ctx.globalAlpha = 0.82
    ctx.fillRect(xR, peakYR, barW, 1.8)
    ctx.fillStyle = grad
  }
  ctx.globalAlpha = 1
}

/** Radial 360° Circular halo radiating outward around the centered album art */
function drawCircular(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: number[],
  t: number,
  primary: string,
  secondary: string,
  accent: string,
  glow: string
): void {
  const cx = w / 2
  const cy = h / 2
  // Inner base radius envelopes the round circular cover art (~120px radius)
  const baseR = Math.min(w, h) * 0.28
  const count = levels.length

  // Dynamically clamp maximum ray length so tip NEVER clips against top canvas boundary
  const maxRayLen = Math.max(16, cy - baseR - 22)

  // Subtle pulsing center aura
  const avg = levels.reduce((a, b) => a + b, 0) / count
  const auraR = baseR * (1.05 + 0.22 * avg)

  // 1) Soft ambient radial glow under the rays
  const auraGrad = ctx.createRadialGradient(cx, cy, baseR * 0.75, cx, cy, auraR * 1.45)
  auraGrad.addColorStop(0, glow)
  auraGrad.addColorStop(0.5, 'rgba(63, 125, 255, 0.15)')
  auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')

  ctx.fillStyle = auraGrad
  ctx.beginPath()
  ctx.arc(cx, cy, auraR * 1.45, 0, Math.PI * 2)
  ctx.fill()

  // 2) Outer radial frequency rays/spokes with dynamic linear gradients
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + t * 0.2
    const val = Math.max(0.04, Math.min(1, levels[i]))
    const len = val * maxRayLen

    const x1 = cx + Math.cos(angle) * (baseR + 3)
    const y1 = cy + Math.sin(angle) * (baseR + 3)
    const x2 = cx + Math.cos(angle) * (baseR + 3 + len)
    const y2 = cy + Math.sin(angle) * (baseR + 3 + len)

    // Ray gradient from primary at base to accent to secondary at tip
    const rayGrad = ctx.createLinearGradient(x1, y1, x2, y2)
    rayGrad.addColorStop(0, primary)
    rayGrad.addColorStop(0.55, accent)
    rayGrad.addColorStop(1, secondary)

    ctx.strokeStyle = rayGrad
    ctx.lineWidth = Math.max(2.4, (Math.PI * 2 * baseR) / (count * 1.8))
    ctx.globalAlpha = 0.5 + 0.5 * val
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // 3) Inner glowing accent ring directly hugging the circular album art
  ctx.beginPath()
  ctx.arc(cx, cy, baseR + 2, 0, Math.PI * 2)
  const ringGrad = ctx.createRadialGradient(cx, cy, baseR - 4, cx, cy, baseR + 6)
  ringGrad.addColorStop(0, accent)
  ringGrad.addColorStop(1, 'transparent')
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.6 + 0.4 * avg
  ctx.lineWidth = 2.5
  ctx.stroke()

  // 4) Second harmonic wave ring orbiting around
  ctx.beginPath()
  const waveR = baseR + 8 + Math.sin(t * 2) * 3 + avg * 12
  ctx.arc(cx, cy, waveR, 0, Math.PI * 2)
  ctx.strokeStyle = secondary
  ctx.globalAlpha = 0.35 + 0.35 * avg
  ctx.lineWidth = 1.4
  ctx.stroke()

  ctx.globalAlpha = 1
}

/** Fluid energetic kinetic particle swarm reacting to sound */
function drawParticles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  levels: number[],
  particles: Particle[],
  dt: number,
  t: number,
  primary: string,
  secondary: string,
  accent: string,
  glow: string
): void {
  // Energy metric (bass + mid)
  const bass = (levels[0] + levels[1] + levels[2] + levels[3]) / 4
  const mid = (levels[8] + levels[9] + levels[10]) / 3
  const energy = bass * 1.5 + mid * 0.8

  // Draw connecting constellation lines
  ctx.lineWidth = 0.9
  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i]
    for (let j = i + 1; j < particles.length; j++) {
      const p2 = particles[j]
      const dx = (p1.x - p2.x) * w
      const dy = (p1.y - p2.y) * h
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 55) {
        ctx.strokeStyle = secondary
        ctx.globalAlpha = (1 - dist / 55) * 0.3 * (0.5 + energy)
        ctx.beginPath()
        ctx.moveTo(p1.x * w, p1.y * h)
        ctx.lineTo(p2.x * w, p2.y * h)
        ctx.stroke()
      }
    }
  }

  // Draw each particle with dynamic aura
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]

    p.x += p.vx * (1 + energy * 2.2)
    p.y += p.vy * (1 + energy * 2.2)

    if (p.x < 0.02) p.x = 0.98
    if (p.x > 0.98) p.x = 0.02
    if (p.y < 0.02) p.y = 0.98
    if (p.y > 0.98) p.y = 0.02

    const px = p.x * w
    const py = p.y * h
    const r = p.radius * (1 + energy * 0.85)

    ctx.fillStyle = i % 2 === 0 ? accent : primary
    ctx.globalAlpha = Math.min(1, p.alpha * (0.6 + energy * 0.8))
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
