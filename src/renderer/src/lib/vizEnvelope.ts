// PlayPix renderer — visualizer energy envelope (§24)
//
// STABILITY ARCHITECTURE: the visualizer does NOT tap the playing media
// element. A MediaElementSource/AnalyserNode graph attached to a playing
// element destabilized Chromium in this app (native renderer deadlock on the
// next page transition after closing Now Playing — no JS exception, no crash
// log). Instead, the track's energy envelope is computed ONCE per song from
// a decoded COPY of the audio (decodeAudioData on an OfflineAudioContext —
// pure decode, no device, no live graph), and the visualizer animates that
// real audio data in sync with the playback clock. The bars therefore respond
// to the actual music while playback stays 100% on the plain element path.
const cache = new Map<number, Float32Array>()
const BUCKETS = 96

/** LRU-ish trim so long sessions don't accumulate decoded envelopes. */
function trim(): void {
  if (cache.size <= 12) return
  const first = cache.keys().next().value
  if (first !== undefined) cache.delete(first)
}

/**
 * Energy envelope of a song: BUCKETS normalized RMS values (0..1), one per
 * time slice. Returns null when the format cannot be decoded (WMA) or the
 * fetch fails — the visualizer simply stays idle.
 */
export async function getEnvelope(songId: number, url: string): Promise<Float32Array | null> {
  const hit = cache.get(songId)
  if (hit) return hit
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    // OfflineAudioContext only decodes — it never opens an audio device.
    const OfflineCtor: typeof OfflineAudioContext | undefined =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!OfflineCtor) return null
    const ctx = new OfflineCtor(1, 128, 44100)
    const audio: AudioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      // callback form for widest Chromium compatibility
      void ctx.decodeAudioData(buf, resolve, reject)
      setTimeout(() => reject(new Error('decode timeout')), 8000)
    })
    const ch = audio.getChannelData(0)
    const rate = audio.sampleRate
    const slice = Math.max(1, Math.floor((ch.length / audio.numberOfChannels / BUCKETS) | 0) * audio.numberOfChannels)
    const out = new Float32Array(BUCKETS)
    for (let b = 0; b < BUCKETS; b++) {
      const start = b * slice
      const end = Math.min(ch.length, start + slice)
      let sum = 0
      let n = 0
      for (let i = start; i < end; i += 16) {
        sum += ch[i] * ch[i]
        n++
      }
      out[b] = n ? Math.sqrt(sum / n) : 0
    }
    // normalize to a musical range (peak-based with a floor)
    let peak = 0
    for (let b = 0; b < BUCKETS; b++) if (out[b] > peak) peak = out[b]
    if (peak > 0.0001) {
      for (let b = 0; b < BUCKETS; b++) out[b] = Math.min(1, out[b] / peak)
    }
    cache.set(songId, out)
    trim()
    return out
  } catch {
    return null
  }
}

/** Cached envelope lookup without any decoding (for render-path reads). */
export function peekEnvelope(songId: number): Float32Array | null {
  return cache.get(songId) ?? null
}
