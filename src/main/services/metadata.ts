// PlayPix main — metadata parsing facade.
// Preferred path: worker threads (keeps the main process free for IPC).
// Fallback: in-main parsing via dynamic import (if workers are unavailable).
import { Worker } from 'worker_threads'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

export interface ParsedMeta {
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  genre: string
  trackNo: number | null
  discNo: number | null
  year: number | null
  duration: number
  bitrate: number | null
  sampleRate: number | null
  picture: { ext: string; data: Buffer } | null
}

export interface ParseResult {
  path: string
  ok: boolean
  error?: string
  data?: ParsedMeta
}

interface Job {
  paths: string[]
  resolve: (r: ParseResult[]) => void
  reject: (e: Error) => void
}

export interface MMModule {
  parseFile: (
    p: string,
    opts?: { duration?: boolean }
  ) => Promise<{
    common: {
      title?: string | null
      artist?: string | null
      album?: string | null
      albumartist?: string | null
      genre?: string[]
      track?: { no?: number | null }
      disk?: { no?: number | null }
      year?: number | null
      picture?: { format?: string; data: Uint8Array }[]
    }
    format: {
      duration?: number | null
      bitrate?: number | null
      sampleRate?: number | null
    }
  }>
}

function extFromMime(mime: string | undefined): string {
  if (!mime) return 'jpg'
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

class MetaWorkerPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Job[] = []
  private nextId = 1
  private dead = false
  readonly size: number

  constructor(private workerPath: string, size = 2) {
    this.size = Math.max(1, Math.min(3, size))
    // Pre-spawn one worker lazily on first use
  }

  private spawn(): Worker {
    const w = new Worker(this.workerPath)

    w.on('message', (msg: { id: number; results: ParseResult[] }) => {
      const handlers = getHandlers(w)
      const h = handlers.get(msg.id)
      if (h) {
        handlers.delete(msg.id)
        h(msg.results)
      }
      this.idle.push(w)
      this.pump()
    })

    const fail = (err: Error) => {
      // A dead worker fails all pending jobs; mark pool dead and reject queued work.
      this.dead = true
      const handlers = getHandlers(w)
      for (const h of handlers.values()) h([])
      handlers.clear()
      for (const job of this.queue.splice(0)) job.reject(err)
    }
    w.on('error', fail)
    w.on('exit', (code) => {
      if (code !== 0) fail(new Error(`metadata worker exited with code ${code}`))
    })

    this.workers.push(w)
    return w
  }

  parse(paths: string[]): Promise<ParseResult[]> {
    if (this.dead) return Promise.reject(new Error('metadata workers unavailable'))
    return new Promise((resolve, reject) => {
      this.queue.push({ paths, resolve, reject })
      this.pump()
    })
  }

  private pump(): void {
    if (!this.queue.length) return
    let w = this.idle.pop()
    if (!w && this.workers.length < this.size) w = this.spawn()
    if (!w) return
    const job = this.queue.shift()!
    const id = this.nextId++
    const handler = (results: ParseResult[]) => job.resolve(results)
    const handlers = getHandlers(w)
    handlers.set(id, handler)
    w.postMessage({ id, paths: job.paths })
  }

  destroy(): void {
    for (const w of this.workers) w.terminate().catch(() => {})
    this.workers = []
    this.idle = []
    this.queue = []
  }
}

// Per-worker handler maps (kept on the worker object)
const handlerMap = new WeakMap<Worker, Map<number, (r: ParseResult[]) => void>>()
function getHandlers(w: Worker): Map<number, (r: ParseResult[]) => void> {
  let m = handlerMap.get(w)
  if (!m) {
    m = new Map()
    handlerMap.set(w, m)
  }
  return m
}

export class MetaService {
  private pool: MetaWorkerPool | null = null
  private workerBroken = false
  private mmModule: MMModule | null = null

  async init(): Promise<void> {
    const workerPath = resolveWorkerPath()
    if (process.env.PLAYPIX_E2E === '1') {
      // eslint-disable-next-line no-console
      console.log('[meta] init, workerPath=', workerPath, 'exists=', workerPath ? fs.existsSync(workerPath) : false)
    }
    if (!workerPath || !fs.existsSync(workerPath)) {
      this.workerBroken = true
      return
    }
    this.pool = new MetaWorkerPool(workerPath)
    // Probe the worker with an empty batch — if it can't start, fall back to main parsing.
    try {
      await this.pool.parse([])
      if (process.env.PLAYPIX_E2E === '1') {
        // eslint-disable-next-line no-console
        console.log('[meta] probe ok')
      }
    } catch {
      this.workerBroken = true
      this.pool.destroy()
      this.pool = null
    }
  }

  async parseBatch(paths: string[]): Promise<ParseResult[]> {
    if (!paths.length) return []
    if (this.pool && !this.workerBroken) {
      try {
        return await this.pool.parse(paths)
      } catch {
        this.workerBroken = true
        this.pool?.destroy()
        this.pool = null
      }
    }
    return this.parseInMain(paths)
  }

  private async parseInMain(paths: string[]): Promise<ParseResult[]> {
    const results: ParseResult[] = []
    if (!this.mmModule) {
      this.mmModule = (await import('music-metadata')) as unknown as MMModule
    }
    for (const p of paths) {
      results.push(await parseOne(this.mmModule, p))
      await new Promise<void>((r) => setImmediate(r))
    }
    return results
  }

  destroy(): void {
    this.pool?.destroy()
  }
}

function resolveWorkerPath(): string | null {
  // out/main/worker.js sits next to index.js; unpacked from asar in production.
  let p = path.join(__dirname, 'worker.js')
  if (app.isPackaged && p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked')
  return p
}

export async function parseOne(mm: MMModule, p: string): Promise<ParseResult> {
  try {
    const meta = await mm.parseFile(p, { duration: true })
    const c = meta.common
    const f = meta.format
    const pic = c.picture && c.picture.length ? c.picture[0] : undefined
    return {
      path: p,
      ok: true,
      data: {
        path: p,
        title: c.title ?? '',
        artist: c.artist ?? '',
        album: c.album ?? '',
        albumArtist: c.albumartist ?? '',
        genre: (c.genre ?? []).join(', '),
        trackNo: c.track?.no ?? null,
        discNo: c.disk?.no ?? null,
        year: c.year ?? null,
        duration: f.duration ?? 0,
        bitrate: f.bitrate ?? null,
        sampleRate: f.sampleRate ?? null,
        picture: pic ? { ext: extFromMime(pic.format), data: Buffer.from(pic.data) } : null
      }
    }
  } catch (e: unknown) {
    return { path: p, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
