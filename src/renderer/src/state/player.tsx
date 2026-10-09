// PlayPix renderer — player state: queue, shuffle, repeat, history, persistence
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { ReactNode } from 'react'
import { api, artUrl } from '../lib/api'
import logoFullUrl from '../assets/logo-full.png'
import { AudioEngine } from '../player/engine'
import { shuffleCopy } from '../lib/utils'
import type { Song, AlbumPalette } from '../../../shared/types'
import { useLibrary } from './library'
import { useUI } from './ui'

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerCore {
  queue: Song[]
  index: number
  current: Song | null
  isPlaying: boolean
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  palette: AlbumPalette | null
  playContext: (list: Song[], startIndex: number, opts?: { shuffle?: boolean; position?: number }) => void
  togglePlay: () => void
  playPause: (play: boolean) => void
  next: () => void
  prev: () => void
  seek: (t: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  playNext: (song: Song) => void
  addToQueue: (song: Song) => void
  removeFromQueue: (pos: number) => void
  jumpTo: (pos: number) => void
  clearUpcoming: () => void
  moveInQueue: (from: number, to: number) => void
  toggleFavorite: (id: number) => void
  /** Access the underlying audio engine (visualizer taps it, never mutates). */
  getEngine: () => AudioEngine | null
}

interface PlayerPosition {
  position: number
  duration: number
}

const PlayerCoreContext = createContext<PlayerCore | null>(null)
const PlayerPositionContext = createContext<PlayerPosition>({ position: 0, duration: 0 })

export function usePlayer(): PlayerCore {
  const ctx = useContext(PlayerCoreContext)
  if (!ctx) throw new Error('usePlayer outside provider')
  return ctx
}

export function usePlayerPosition(): PlayerPosition {
  return useContext(PlayerPositionContext)
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const library = useLibrary()
  const ui = useUI()

  const [queue, setQueue] = useState<Song[]>([])
  const [index, setIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolumeState] = useState(0.85)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [palette, setPalette] = useState<AlbumPalette | null>(null)

  // refs mirroring state for stable engine callbacks
  const queueRef = useRef<Song[]>([])
  const indexRef = useRef(-1)
  const repeatRef = useRef<RepeatMode>('off')
  const shuffleRef = useRef(false)
  const pastRef = useRef<number[]>([])
  const restoredRef = useRef(false)

  queueRef.current = queue
  indexRef.current = index
  repeatRef.current = repeat
  shuffleRef.current = shuffle

  const engineRef = useRef<AudioEngine | null>(null)
  // §31: approximate seconds ACTUALLY listened for the current track.
  const listenedRef = useRef(0)
  const lastPosRef = useRef(0)
  const playingRef = useRef(false)

  const current = index >= 0 && index < queue.length ? queue[index] : null

  // ---------- engine bootstrap ----------
  useEffect(() => {
    let consecutiveErrors = 0
    const engine = new AudioEngine({
      onEnded: () => {
        const cur = queueRef.current[indexRef.current]
        if (cur) void api.completePlay(cur.id, listenedRef.current)
        if (repeatRef.current === 'one') {
          engine.seek(0)
          void engine.play()
        } else {
          advance(true)
        }
      },
      onError: (song) => {
        consecutiveErrors++
        ui.toast(`Can't play "${song.title}" — the file is missing or can't be decoded`, 'error')
        setIsPlaying(false)
        // Skip forward, but never churn through the whole queue on bad files
        if (consecutiveErrors >= 3) {
          ui.toast('Playback stopped — several tracks could not be played', 'error')
          return
        }
        setTimeout(() => {
          if (queueRef.current.length > 1) advance(true)
        }, 900)
      },
      onTime: (pos, dur) => {
        // Accumulate real listening seconds (§31/§27) — ignore seek jumps.
        if (playingRef.current) {
          const delta = pos - lastPosRef.current
          if (delta > 0 && delta < 2) listenedRef.current += delta
        }
        lastPosRef.current = pos
        setPosition(pos)
        setDuration(dur || 0)
      },
      onPlaying: (playing) => {
        if (playing) {
          consecutiveErrors = 0
          lastPosRef.current = engineRef.current?.position ?? lastPosRef.current
        }
        playingRef.current = playing
        setIsPlaying(playing)
      },
      onLoaded: (dur) => setDuration(dur || 0)
    })
    engineRef.current = engine

    // restore last session
    void (async () => {
      try {
        const saved = await api.loadPlaybackState()
        if (saved && Array.isArray(saved.queue) && saved.queue.length) {
          const songs = await api.songsByIds(saved.queue)
          const map = new Map(songs.map((s) => [s.id, s]))
          const restoredQ = saved.queue.map((id) => map.get(id)).filter((s): s is Song => !!s)
          if (restoredQ.length) {
            const idx = Math.max(0, Math.min(saved.index, restoredQ.length - 1))
            setQueue(restoredQ)
            setIndex(idx)
            setVolumeState(saved.volume ?? 0.85)
            setMuted(!!saved.muted)
            setShuffle(!!saved.shuffle)
            setRepeat(saved.repeat === 'one' ? 'one' : saved.repeat === 'all' ? 'all' : 'off')
            engine.setVolume(saved.volume ?? 0.85)
            engine.setMuted(!!saved.muted)
            const track = restoredQ[idx]
            if (track) {
              await engine.load(track, { autoplay: false, position: saved.position || 0 })
              setPosition(saved.position || 0)
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        restoredRef.current = true
      }
    })()

    return () => {
      engine.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- persistence ----------
  useEffect(() => {
    if (!restoredRef.current) return
    const t = setTimeout(() => {
      void api.savePlaybackState({
        queue: queue.map((s) => s.id),
        index,
        position: engineRef.current?.position ?? 0,
        volume,
        muted,
        shuffle,
        repeat
      })
    }, 700)
    return () => clearTimeout(t)
  }, [queue, index, volume, muted, shuffle, repeat])

  // volume / mute sync
  useEffect(() => {
    engineRef.current?.setVolume(volume)
  }, [volume])
  useEffect(() => {
    engineRef.current?.setMuted(muted)
  }, [muted])

  // ---------- actions ----------
  const loadTrack = useCallback(
    (song: Song, opts: { autoplay: boolean; position?: number }) => {
      listenedRef.current = 0
      lastPosRef.current = opts.position ?? 0
      setDuration(song.duration || 0)
      setPosition(opts.position ?? 0)
      void engineRef.current?.load(song, opts)
      if (opts.autoplay) void api.registerPlay(song.id)
    },
    []
  )

  const advance = useCallback(
    (auto: boolean) => {
      const q = queueRef.current
      if (!q.length) return
      const cur = indexRef.current
      if (shuffleRef.current && q.length > 1) {
        const candidates: number[] = []
        for (let i = 0; i < q.length; i++) {
          if (i !== cur && !pastRef.current.includes(i)) candidates.push(i)
        }
        const pool = candidates.length ? candidates : [cur]
        if (!candidates.length) pastRef.current = []
        const pick = pool[Math.floor(Math.random() * pool.length)]
        if (cur >= 0) pastRef.current.push(cur)
        setIndex(pick)
        loadTrack(q[pick], { autoplay: true })
        return
      }
      let nextIdx = cur + 1
      if (nextIdx >= q.length) {
        if (repeatRef.current === 'all') nextIdx = 0
        else {
          setIsPlaying(false)
          return
        }
      }
      if (cur >= 0) pastRef.current.push(cur)
      setIndex(nextIdx)
      loadTrack(q[nextIdx], { autoplay: true })
      void auto
    },
    [loadTrack]
  )

  const playContext = useCallback(
    (list: Song[], startIndex: number, opts?: { shuffle?: boolean; position?: number }) => {
      const playable = list.filter((s) => !!s.path)
      if (!playable.length) {
        ui.toast('Nothing to play yet — import some music first', 'error')
        return
      }
      let list2 = playable
      let startIdx = Math.max(0, Math.min(startIndex, playable.length - 1))
      if (opts?.shuffle) {
        list2 = shuffleCopy(playable)
        startIdx = 0
      }
      pastRef.current = []
      setQueue(list2)
      setIndex(startIdx)
      loadTrack(list2[startIdx], { autoplay: true, position: opts?.position })
    },
    [loadTrack, ui]
  )

  const togglePlay = useCallback(() => {
    const eng = engineRef.current
    if (!eng) return
    const q = queueRef.current
    if (!q.length) return
    if (indexRef.current < 0) {
      setIndex(0)
      loadTrack(q[0], { autoplay: true })
      return
    }
    // The ENGINE is the source of truth — never React state, which can be a
    // frame stale during rapid clicks and cause pause/play inversions.
    if (eng.playing) {
      eng.pause()
      return
    }
    // Paused (or ended): if the track finished, restart from the top.
    const dur = eng.duration
    if (dur > 0 && eng.position >= dur - 0.05) eng.seek(0)
    void eng.play()
  }, [loadTrack])

  const playPause = useCallback(
    (play: boolean) => {
      const eng = engineRef.current
      if (!eng) return
      if (!play) {
        eng.pause()
        return
      }
      const q = queueRef.current
      if (!q.length) return
      if (indexRef.current < 0) {
        setIndex(0)
        loadTrack(q[0], { autoplay: true })
        return
      }
      const dur = eng.duration
      if (dur > 0 && eng.position >= dur - 0.05) eng.seek(0)
      void eng.play()
    },
    [loadTrack]
  )

  const next = useCallback(() => {
    advance(false)
  }, [advance])

  const prev = useCallback(() => {
    const eng = engineRef.current
    const cur = indexRef.current
    if (eng && eng.position > 3) {
      eng.seek(0)
      return
    }
    if (pastRef.current.length) {
      const p = pastRef.current.pop()!
      setIndex(p)
      const q = queueRef.current
      if (q[p]) loadTrack(q[p], { autoplay: true })
    } else if (queueRef.current.length) {
      const last = repeatRef.current === 'all' ? queueRef.current.length - 1 : Math.max(0, cur)
      setIndex(last)
      loadTrack(queueRef.current[last], { autoplay: true })
    }
  }, [loadTrack])

  // stable refs for mediaSession handlers
  const nextRef = useRef(next)
  const prevRef = useRef(prev)
  nextRef.current = next
  prevRef.current = prev

  const seek = useCallback((t: number) => {
    engineRef.current?.seek(t)
    setPosition(t)
  }, [])

  // ---------- Windows Media Session (SMTC integration) ----------
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    if (current) {
      const art = current.artKey ? artUrl(current.artKey) : undefined
      ms.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist || 'Unknown artist',
        album: current.album || 'PlayPix',
        artwork: art
          ? [
              { src: art, sizes: '96x96', type: 'image/jpeg' },
              { src: art, sizes: '128x128', type: 'image/jpeg' },
              { src: art, sizes: '256x256', type: 'image/jpeg' },
              { src: art, sizes: '512x512', type: 'image/jpeg' }
            ]
          : [
              { src: logoFullUrl, sizes: '512x512', type: 'image/png' }
            ]
      })
    } else {
      ms.metadata = null
    }

    try {
      ms.setActionHandler('play', () => playPause(true))
      ms.setActionHandler('pause', () => playPause(false))
      ms.setActionHandler('previoustrack', () => prevRef.current())
      ms.setActionHandler('nexttrack', () => nextRef.current())
      ms.setActionHandler('seekto', (d) => {
        if (d.seekTime !== undefined && d.seekTime !== null) seek(d.seekTime)
      })
      ms.setActionHandler('seekbackward', (d) => {
        const offset = d.seekOffset || 10
        seek(Math.max(0, (engineRef.current?.position ?? 0) - offset))
      })
      ms.setActionHandler('seekforward', (d) => {
        const offset = d.seekOffset || 10
        const dur = engineRef.current?.duration ?? 0
        seek(Math.min(dur || 1e9, (engineRef.current?.position ?? 0) + offset))
      })
      ms.setActionHandler('stop', () => playPause(false))
    } catch {
      /* some handlers unsupported */
    }
  }, [current?.id, current?.title, current?.artist, current?.album, current?.artKey, playPause, seek])

  // Synchronize Windows SMTC playbackState and position state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    ms.playbackState = isPlaying ? 'playing' : 'paused'
    if ('setPositionState' in ms && duration > 0 && Number.isFinite(duration) && Number.isFinite(position)) {
      try {
        ms.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: 1,
          position: Math.max(0, Math.min(position, duration))
        })
      } catch {
        /* position bounds error */
      }
    }
  }, [isPlaying, duration, position])

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.max(0, Math.min(1, v)))
    if (v > 0) setMuted(false)
  }, [])

  const toggleMute = useCallback(() => setMuted((m) => !m), [])

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      if (!s) pastRef.current = []
      return !s
    })
  }, [])

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
  }, [])

  const playNext = useCallback(
    (song: Song) => {
      const q = queueRef.current
      if (!q.length) {
        pastRef.current = []
        setQueue([song])
        setIndex(0)
        loadTrack(song, { autoplay: true })
      } else {
        const cur = indexRef.current
        const kept: Song[] = []
        let newCur = cur
        // Drop other occurrences of the song, tracking how the current
        // index shifts when earlier entries are removed.
        q.forEach((s, i) => {
          if (s.id === song.id && i !== cur) {
            if (i < cur) newCur--
            return
          }
          kept.push(s)
        })
        kept.splice(newCur + 1, 0, song)
        setQueue(kept)
        setIndex(newCur)
      }
      ui.toast(`Playing next: ${song.title}`)
    },
    [loadTrack, ui]
  )

  const addToQueue = useCallback(
    (song: Song) => {
      const q = queueRef.current
      if (!q.length) {
        pastRef.current = []
        setQueue([song])
        setIndex(0)
        loadTrack(song, { autoplay: false })
      } else {
        setQueue([...q, song])
      }
      ui.toast(`Added to queue: ${song.title}`)
    },
    [loadTrack, ui]
  )

  const removeFromQueue = useCallback((pos: number) => {
    const q = queueRef.current
    if (pos < 0 || pos >= q.length) return
    const cur = indexRef.current
    const nq = q.filter((_, i) => i !== pos)
    let ni = cur
    if (pos < cur) ni = cur - 1
    else if (pos === cur) ni = Math.min(cur, nq.length - 1)
    setQueue(nq)
    setIndex(ni)
  }, [])

  const jumpTo = useCallback(
    (pos: number) => {
      const q = queueRef.current
      if (pos < 0 || pos >= q.length) return
      if (indexRef.current >= 0) pastRef.current.push(indexRef.current)
      setIndex(pos)
      loadTrack(q[pos], { autoplay: true })
    },
    [loadTrack]
  )

  const clearUpcoming = useCallback(() => {
    setQueue((q) => q.slice(0, indexRef.current + 1))
  }, [])

  const moveInQueue = useCallback((from: number, to: number) => {
    const q = queueRef.current
    if (from === to || from < 0 || to < 0 || from >= q.length || to >= q.length) return
    const nq = [...q]
    const [moved] = nq.splice(from, 1)
    nq.splice(to, 0, moved)
    const cur = indexRef.current
    let ni = cur
    if (cur === from) ni = to
    else if (from < cur && to >= cur) ni = cur - 1
    else if (from > cur && to <= cur) ni = cur + 1
    setQueue(nq)
    setIndex(ni)
  }, [])

  const toggleFavorite = useCallback(
    (id: number) => {
      void api.toggleFavorite(id).then(() => library.refresh('favorite'))
    },
    [library]
  )

  const getEngine = useCallback((): AudioEngine | null => engineRef.current, [])

  // ---------- Windows media keys (§28) ----------
  useEffect(() => {
    return api.onMediaKey((key) => {
      if (key === 'playpause') togglePlay()
      else if (key === 'next') nextRef.current()
      else if (key === 'prev') prevRef.current()
      else if (key === 'stop') playPause(false)
    })
  }, [togglePlay, playPause])

  // ---------- Mini Player commands listener ----------
  useEffect(() => {
    return api.onPlayerCommand((cmd) => {
      if (cmd.action === 'togglePlay') togglePlay()
      else if (cmd.action === 'play') playPause(true)
      else if (cmd.action === 'pause') playPause(false)
      else if (cmd.action === 'next') nextRef.current()
      else if (cmd.action === 'prev') prevRef.current()
      else if (cmd.action === 'seek' && typeof cmd.payload === 'number') seek(cmd.payload)
      else if (cmd.action === 'toggleFavorite') {
        const id = (typeof cmd.payload === 'number' && cmd.payload) || current?.id
        if (id) toggleFavorite(id)
      }
    })
  }, [togglePlay, playPause, seek, toggleFavorite, current?.id])

  // ---------- Dynamic Album-Art Palette extraction ----------
  useEffect(() => {
    const song = current
    if (!song?.artKey) {
      setPalette(null)
      return
    }
    let cancelled = false
    void api
      .artPalette(song.artKey)
      .then((pal) => {
        if (!cancelled) setPalette(pal)
      })
      .catch(() => {
        if (!cancelled) setPalette(null)
      })
    return () => {
      cancelled = true
    }
  }, [current?.id, current?.artKey])

  // ---------- Mini Player state broadcast ----------
  const broadcastCurrent = useCallback(() => {
    if (!api.broadcastPlayerState) return
    api.broadcastPlayerState({
      current,
      isPlaying,
      position: engineRef.current?.position ?? position,
      duration: engineRef.current?.duration ?? duration,
      volume,
      muted,
      repeat,
      shuffle,
      favorite: !!current?.favorite,
      theme: ui.effectiveTheme,
      palette
    })
  }, [current, isPlaying, position, duration, volume, muted, repeat, shuffle, ui.effectiveTheme, palette])

  useEffect(() => {
    broadcastCurrent()
  }, [broadcastCurrent])

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      broadcastCurrent()
    }, 250)
    return () => clearInterval(interval)
  }, [isPlaying, broadcastCurrent])

  useEffect(() => {
    return api.onRequestPlayerState(() => {
      broadcastCurrent()
    })
  }, [broadcastCurrent])

  // keep queue song objects fresh after library edits
  useEffect(() => {
    setQueue((q) =>
      q.map((s) => {
        const fresh = library.byId.get(s.id)
        return fresh && !fresh.missing ? fresh : s
      })
    )
  }, [library.byId])

  const core = useMemo<PlayerCore>(
    () => ({
      queue,
      index,
      current,
      isPlaying,
      volume,
      muted,
      shuffle,
      repeat,
      palette,
      playContext,
      togglePlay,
      playPause,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      playNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      clearUpcoming,
      moveInQueue,
      toggleFavorite,
      getEngine
    }),
    [
      queue,
      index,
      current,
      isPlaying,
      volume,
      muted,
      shuffle,
      repeat,
      palette,
      playContext,
      togglePlay,
      playPause,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      playNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      clearUpcoming,
      moveInQueue,
      toggleFavorite
    ]
  )

  const posValue = useMemo(() => ({ position, duration }), [position, duration])

  return (
    <PlayerCoreContext.Provider value={core}>
      <PlayerPositionContext.Provider value={posValue}>{children}</PlayerPositionContext.Provider>
    </PlayerCoreContext.Provider>
  )
}
