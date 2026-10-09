// PlayPix renderer — audio engine (HTML5 Audio over the stream:// protocol)
import { streamUrl } from '../lib/api'
import type { Song } from '../../../shared/types'

/**
 * A pending play() promise rejects with AbortError when pause()/load() wins
 * the race (rapid play/pause toggling). That is normal UI interaction, never
 * a broken file — swallowing it prevents the infamous "UI says paused but the
 * engine skips tracks" desync.
 */
function isAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : (err as { name?: string })?.name === 'AbortError'
}

export interface EngineCallbacks {
  onEnded: () => void
  onError: (song: Song) => void
  onTime: (position: number, duration: number) => void
  onPlaying: (playing: boolean) => void
  onLoaded: (duration: number) => void
}

export class AudioEngine {
  private audio: HTMLAudioElement
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private freqBuffer: Uint8Array | null = null
  private timeBuffer: Uint8Array | null = null
  private current: Song | null = null
  private altIndex = -1
  private cb: EngineCallbacks
  private wantPlaying = false
  /** Bumped on every src assignment; identifies "the resource now playing". */
  private gen = 0
  /** The 'error' listener armed for the current generation (if any). */
  private errHandler: ((ev: Event) => void) | null = null

  constructor(cb: EngineCallbacks) {
    this.cb = cb
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.crossOrigin = 'anonymous'
    this.audio.addEventListener('ended', () => {
      this.cb.onEnded()
    })
    this.audio.addEventListener('timeupdate', () => {
      this.cb.onTime(this.audio.currentTime, this.audio.duration || 0)
    })
    this.audio.addEventListener('durationchange', () => {
      if (Number.isFinite(this.audio.duration)) this.cb.onLoaded(this.audio.duration)
    })
    this.audio.addEventListener('play', () => this.cb.onPlaying(true))
    this.audio.addEventListener('pause', () => this.cb.onPlaying(false))
  }

  private initAudioGraph(): void {
    if (this.analyser) return
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      this.audioCtx = new AudioCtx()
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.82
      this.freqBuffer = new Uint8Array(this.analyser.frequencyBinCount)
      this.timeBuffer = new Uint8Array(this.analyser.frequencyBinCount)
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio)
      this.sourceNode.connect(this.analyser)
      this.analyser.connect(this.audioCtx.destination)
    } catch {
      /* Web Audio graph init fallback */
    }
  }

  /**
   * Arm the 'error' handling for the src assigned under generation `seq`.
   * A single persistent listener cannot tell WHICH src failed: a slow error
   * for track A can dispatch after the user already skipped to track B, and
   * reacting to it would skip B with a wrong toast. Each generation arms its
   * own handler; the first handler to see a given event claims it, so a stale
   * error can never be judged by the new generation.
   */
  private armError(seq: number): void {
    this.detachError()
    const h = (ev: Event): void => {
      const e = ev as Event & { __ppHandled?: number }
      if (e.__ppHandled !== undefined) return // a stale handler already judged this event
      e.__ppHandled = seq
      if (seq !== this.gen) return // error belongs to a replaced src — ignore
      if (!this.current) return
      // A decode/error event while the user never asked for playback
      // (e.g. a restored session preloading a missing file) must not skip
      // tracks on its own — surface it only when playback is requested.
      if (!this.wantPlaying) return
      this.tryAlternate()
    }
    this.errHandler = h
    this.audio.addEventListener('error', h)
  }

  private detachError(): void {
    if (this.errHandler) {
      this.audio.removeEventListener('error', this.errHandler)
      this.errHandler = null
    }
  }

  /** The audio element is the single source of truth for "is sound playing". */
  get playing(): boolean {
    return !this.audio.paused && !this.audio.ended
  }

  /** Read-only access — callers must never mutate. */
  getMediaElement(): HTMLAudioElement {
    return this.audio
  }

  private srcFor(song: Song, fileOverride?: string): string {
    return streamUrl(fileOverride ?? song.path)
  }

  /** Try the next alternate file for the current song (handles moved/renamed files). */
  private tryAlternate(): void {
    const song = this.current
    if (!song) return
    const alts = song.altFiles ?? []
    const next = alts[this.altIndex + 1]
    if (next) {
      this.altIndex++
      const seq = ++this.gen
      this.audio.src = this.srcFor(song, next)
      this.armError(seq)
      if (this.wantPlaying) this.audio.play().catch(() => this.cb.onError(song))
      return
    }
    this.cb.onError(song)
  }

  async load(song: Song, opts: { autoplay: boolean; position?: number }): Promise<void> {
    this.current = song
    this.altIndex = -1
    this.wantPlaying = opts.autoplay
    const seq = ++this.gen
    this.audio.src = this.srcFor(song)
    this.armError(seq)
    if (opts.position && opts.position > 0) {
      const seek = (): void => {
        try {
          this.audio.currentTime = opts.position!
        } catch {
          /* not seekable yet */
        }
      }
      this.audio.addEventListener('loadedmetadata', seek, { once: true })
    }
    if (opts.autoplay) {
      this.initAudioGraph()
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {})
      }
      try {
        await this.audio.play()
      } catch (err) {
        if (isAbort(err)) return // interrupted by a user pause — not a file problem
        this.tryAlternate()
      }
    }
  }

  async play(): Promise<void> {
    this.initAudioGraph()
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume()
      } catch {
        /* ignore */
      }
    }
    this.wantPlaying = true
    try {
      await this.audio.play()
    } catch (err) {
      if (isAbort(err)) return // pause() won the race — do NOT treat as a bad file
      this.tryAlternate()
    }
  }

  pause(): void {
    this.wantPlaying = false
    this.audio.pause()
  }

  stop(): void {
    this.wantPlaying = false
    this.gen++ // any in-flight error for the old src is now stale
    this.detachError()
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.current = null
  }

  seek(t: number): void {
    try {
      this.audio.currentTime = Math.max(0, t)
    } catch {
      /* ignore */
    }
  }

  get position(): number {
    return this.audio.currentTime || 0
  }

  get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0
  }

  setVolume(v: number): void {
    this.audio.volume = Math.max(0, Math.min(1, v))
  }

  setMuted(m: boolean): void {
    this.audio.muted = m
  }

  /**
   * Real-time frequency data from live playback (Web Audio AnalyserNode).
   * Populates `target` array with byte values (0-255).
   * Returns true if active audio signal was measured.
   */
  getFrequencyData(target?: Uint8Array): { data: Uint8Array; hasSignal: boolean } {
    this.initAudioGraph()
    const len = this.analyser?.frequencyBinCount || 128
    const out = target && target.length === len ? target : (this.freqBuffer ?? new Uint8Array(len))
    if (!this.analyser) {
      return { data: out, hasSignal: false }
    }
    ;(this.analyser.getByteFrequencyData as (arr: Uint8Array) => void)(out)
    let hasSignal = false
    for (let i = 0; i < out.length; i++) {
      if (out[i] > 2) {
        hasSignal = true
        break
      }
    }
    return { data: out, hasSignal }
  }

  /**
   * Real-time waveform / time-domain data (oscilloscope) from live playback.
   * Populates `target` array with byte values (0-255, center 128).
   * Returns true if active audio signal was measured.
   */
  getTimeDomainData(target?: Uint8Array): { data: Uint8Array; hasSignal: boolean } {
    this.initAudioGraph()
    const len = this.analyser?.frequencyBinCount || 128
    const out = target && target.length === len ? target : (this.timeBuffer ?? new Uint8Array(len))
    if (!this.analyser) {
      return { data: out, hasSignal: false }
    }
    ;(this.analyser.getByteTimeDomainData as (arr: Uint8Array) => void)(out)
    let hasSignal = false
    for (let i = 0; i < out.length; i++) {
      if (Math.abs(out[i] - 128) > 3) {
        hasSignal = true
        break
      }
    }
    return { data: out, hasSignal }
  }
}
