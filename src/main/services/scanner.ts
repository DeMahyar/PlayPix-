// PlayPix main — library scanner.
// Full-PC discovery + metadata import + duplicate handling + missing-file validation.
// All heavy parsing runs in worker threads; DB writes happen in short transactions.
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import type { ScanProgress } from '../../shared/types'
import { getDb, tx, setSetting } from './db'
import { MetaService, ParseResult } from './metadata'
import * as artwork from './artwork'
import { AUDIO_EXTENSIONS, MIN_FILE_SIZE, shouldIgnoreDir, getScanRoots } from '../lib/paths'
import { baseName, dupKey, qualityScore, yieldLoop } from '../lib/util'
import { isPathIgnored } from './watcher'

const WALK_CONCURRENCY = 6
const PARSE_BATCH = 12

const IDLE_STATE: ScanProgress = {
  phase: 'idle',
  found: 0,
  processed: 0,
  imported: 0,
  duplicates: 0,
  errors: 0,
  total: 0,
  current: '',
  startedAt: null,
  endedAt: null
}

export class Scanner extends EventEmitter {
  private meta = new MetaService()
  private state: ScanProgress = { ...IDLE_STATE }
  private running = false
  private abortCtl: AbortController | null = null
  private lastEmit = 0

  async init(): Promise<void> {
    await this.meta.init()
  }

  destroy(): void {
    this.meta.destroy()
  }

  getProgress(): ScanProgress {
    return { ...this.state }
  }

  isRunning(): boolean {
    return this.running
  }

  private setState(patch: Partial<ScanProgress>): void {
    this.state = { ...this.state, ...patch }
    this.emitProgress(true)
  }

  private emitProgress(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmit < 250) return
    this.lastEmit = now
    this.emit('progress', this.getProgress())
  }

  // ---------- full scan ----------

  async start(roots?: string[]): Promise<ScanProgress> {
    if (this.running) return this.getProgress()
    this.running = true
    this.abortCtl = new AbortController()
    const signal = this.abortCtl.signal
    this.setState({
      ...IDLE_STATE,
      phase: 'discovering',
      startedAt: Date.now()
    })
    try {
      const rootsList = roots && roots.length ? roots : getScanRoots()
      const files = await this.walk(rootsList, signal, (found, current) => {
        this.setState({ found, current })
      })
      if (signal.aborted) throw new Error('cancelled')
      this.setState({ phase: 'importing', found: files.length, total: files.length })
      await this.importFiles(files, signal)
      if (!signal.aborted) {
        this.setState({ phase: 'finalizing' })
        await this.validateExisting()
        setSetting('lastScanAt', Date.now())
      }
      this.setState({
        phase: signal.aborted ? 'cancelled' : 'done',
        current: '',
        endedAt: Date.now()
      })
      this.emit('done', this.getProgress())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      this.setState({
        phase: msg === 'cancelled' ? 'cancelled' : 'error',
        current: msg === 'cancelled' ? '' : 'Something went wrong during the scan',
        endedAt: Date.now()
      })
      this.emit('done', this.getProgress())
    } finally {
      this.running = false
      this.abortCtl = null
    }
    return this.getProgress()
  }

  cancel(): void {
    this.abortCtl?.abort()
    this.setState({ phase: 'cancelled', endedAt: Date.now(), current: '' })
    this.emit('done', this.getProgress())
    this.running = false
    this.abortCtl = null
  }

  // ---------- manual import (files or folders, e.g. drag & drop) ----------

  async importPaths(paths: string[]): Promise<ScanProgress> {
    if (this.running) return this.getProgress()
    this.running = true
    this.abortCtl = new AbortController()
    const signal = this.abortCtl.signal
    this.setState({ ...IDLE_STATE, phase: 'importing', startedAt: Date.now() })
    try {
      const files: string[] = []
      const dirs: string[] = []
      for (const p of paths) {
        try {
          const st = await fsp.stat(p)
          if (st.isDirectory()) dirs.push(p)
          else if (AUDIO_EXTENSIONS.has(path.extname(p).toLowerCase())) files.push(p)
        } catch {
          /* vanished */
        }
      }
      for (const d of dirs) {
        if (signal.aborted) break
        await this.walk([d], signal, (found) => {
          this.setState({ found: found + files.length, current: d })
        }, files)
      }
      this.setState({ found: files.length, total: files.length, phase: 'importing' })
      await this.importFiles(files, signal)
      this.setState({ phase: 'done', current: '', endedAt: Date.now() })
      this.emit('done', this.getProgress())
      this.emit('imported-folders', dirs)
    } catch (e: unknown) {
      this.setState({
        phase: 'error',
        current: e instanceof Error ? e.message : 'Import failed',
        endedAt: Date.now()
      })
      this.emit('done', this.getProgress())
    } finally {
      this.running = false
      this.abortCtl = null
    }
    return this.getProgress()
  }

  // ---------- walking ----------

  private async walk(
    roots: string[],
    signal: AbortSignal,
    onFound: (found: number, current: string) => void,
    into?: string[]
  ): Promise<string[]> {
    const files = into ?? []
    const queue: string[] = [...roots]
    let foundTick = 0

    const worker = async (): Promise<void> => {
      while (queue.length && !signal.aborted) {
        const dir = queue.shift()
        if (!dir) break
        let entries: fs.Dirent[]
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const e of entries) {
          if (signal.aborted) return
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            if (!e.isSymbolicLink() && !shouldIgnoreDir(e.name)) queue.push(full)
          } else if (e.isFile() && !e.isSymbolicLink()) {
            if (AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
              files.push(full)
              foundTick++
              if (foundTick % 25 === 0) onFound(files.length, dir)
            }
          }
        }
        onFound(files.length, dir)
        await yieldLoop()
      }
    }

    await Promise.all(Array.from({ length: WALK_CONCURRENCY }, worker))
    return files
  }

  // ---------- importing ----------

  private async importFiles(files: string[], signal: AbortSignal): Promise<void> {
    const db = getDb()
    for (let i = 0; i < files.length; i += PARSE_BATCH) {
      if (signal.aborted) return
      const batch = files.slice(i, i + PARSE_BATCH)
      const stats = await Promise.all(
        batch.map((p) =>
          fsp
            .stat(p)
            .then((st) => ({ p, st }))
            .catch(() => null)
        )
      )
      const statMap = new Map<string, { size: number; mtime: number }>()
      const toParse: string[] = []
      for (const s of stats) {
        if (!s || !s.st.isFile()) continue
        if (s.st.size < MIN_FILE_SIZE) continue
        statMap.set(s.p, { size: s.st.size, mtime: Math.floor(s.st.mtimeMs) })
        toParse.push(s.p)
      }
      if (!toParse.length) {
        this.setState({ processed: Math.min(i + PARSE_BATCH, files.length) })
        continue
      }
      let results: ParseResult[] = []
      try {
        results = await this.meta.parseBatch(toParse)
      } catch {
        results = toParse.map((p) => ({ path: p, ok: false, error: 'metadata worker failed' }))
      }
      const now = Date.now()
      tx(() => {
        for (const r of results) this.applyResult(r, statMap, now)
      })
      this.setState({
        processed: Math.min(i + PARSE_BATCH, files.length),
        current: batch[0]
      })
      await yieldLoop()
    }
    void db
  }

  private applyResult(
    r: ParseResult,
    statMap: Map<string, { size: number; mtime: number }>,
    now: number
  ): void {
    const db = getDb()
    if (!r.ok || !r.data) {
      this.state.errors++
      return
    }
    if (isPathIgnored(r.path)) {
      return
    }
    const st = statMap.get(r.path)
    if (!st) return
    const d = r.data
    const ext = path.extname(r.path).slice(1).toLowerCase()
    const meta = {
      title: (d.title || '').trim() || baseName(r.path),
      artist: (d.artist || '').trim(),
      album: (d.album || '').trim(),
      albumArtist: (d.albumArtist || '').trim(),
      genre: (d.genre || '').trim(),
      trackNo: d.trackNo,
      discNo: d.discNo,
      year: d.year,
      duration: d.duration || 0
    }
    const key = dupKey({
      title: meta.title,
      artist: meta.artist,
      albumArtist: meta.albumArtist,
      album: meta.album,
      duration: meta.duration
    })
    const score = qualityScore({
      format: ext,
      bitrate: d.bitrate,
      size: st.size,
      hasArt: !!d.picture,
      year: meta.year
    })

    // --- artwork resolution (embedded > sidecar) ---
    let artKey: string | null = null
    let artSource: string | null = null
    const albumBase =
      meta.album && (meta.albumArtist || meta.artist)
        ? artwork.albumArtKeyBase(meta.album, meta.albumArtist || meta.artist)
        : null
    if (d.picture) {
      const base = albumBase ?? artwork.songArtKeyBase(r.path)
      artKey = artwork.storeArt(base, d.picture.ext, d.picture.data)
      artSource = 'embedded'
    } else {
      const side = artwork.findSidecar(path.dirname(r.path))
      if (side) {
        const base = albumBase ?? artwork.songArtKeyBase(r.path)
        artKey = artwork.copyArtFromFile(base, side)
        artSource = artKey ? 'local' : null
      }
    }

    // --- 1) already known by path? ---
    const existing = db
      .prepare('SELECT id, mtime, missing, art_key, art_source, user_edited FROM songs WHERE path = ?')
      .get(r.path) as
      | { id: number; mtime: number; missing: number; art_key: string | null; art_source: string | null; user_edited?: number }
      | undefined
    if (existing) {
      if (existing.mtime !== st.mtime) {
        const keepManualArt = existing.art_source === 'manual' && existing.art_key
        const finalArtKey = keepManualArt ? existing.art_key : (artKey ?? existing.art_key)
        const finalArtSource = keepManualArt ? 'manual' : (artKey ? artSource : existing.art_source)

        if (existing.user_edited) {
          // Song was manually edited by the user in PlayPix — preserve title, artist, album, genre, year!
          db.prepare(
            `UPDATE songs SET duration=?, bitrate=?, sample_rate=?, size=?, mtime=?, missing=0,
             art_key=?, art_source=?
             WHERE id=?`
          ).run(
            meta.duration,
            d.bitrate,
            d.sampleRate,
            st.size,
            st.mtime,
            finalArtKey,
            finalArtSource,
            existing.id
          )
        } else {
          db.prepare(
            `UPDATE songs SET title=?, artist=?, album=?, album_artist=?, genre=?,
             track_no=?, disc_no=?, year=?, duration=?, bitrate=?, sample_rate=?,
             size=?, mtime=?, missing=0, dup_key=?,
             art_key=?, art_source=?
             WHERE id=?`
          ).run(
            meta.title,
            meta.artist,
            meta.album,
            meta.albumArtist,
            meta.genre,
            meta.trackNo,
            meta.discNo,
            meta.year,
            meta.duration,
            d.bitrate,
            d.sampleRate,
            st.size,
            st.mtime,
            key,
            finalArtKey,
            finalArtSource,
            existing.id
          )
        }
      } else if (existing.missing) {
        db.prepare('UPDATE songs SET missing=0 WHERE id=?').run(existing.id)
      }
      db.prepare(
        'INSERT OR IGNORE INTO song_files (song_id, path, size, mtime, format, duration, score) VALUES (?,?,?,?,?,?,?)'
      ).run(existing.id, r.path, st.size, st.mtime, ext, meta.duration, score)
      return
    }

    // --- 2) duplicate of an existing library song? ---
    if (key) {
      const dup = db
        .prepare('SELECT id, path FROM songs WHERE dup_key = ? LIMIT 1')
        .get(key) as { id: number; path: string } | undefined
      if (dup) {
        db.prepare(
          'INSERT OR IGNORE INTO song_files (song_id, path, size, mtime, format, duration, score) VALUES (?,?,?,?,?,?,?)'
        ).run(dup.id, r.path, st.size, st.mtime, ext, meta.duration, score)
        // Keep the best available file as the primary source
        const cur = db
          .prepare(
            `SELECT COALESCE((SELECT score FROM song_files WHERE path = songs.path), 0) AS score
             FROM songs WHERE id = ?`
          )
          .get(dup.id) as { score: number }
        if (score > (cur?.score ?? 0)) {
          db.prepare(
            `UPDATE songs SET path=?, title=?, artist=?, album=?, album_artist=?, genre=?,
             track_no=?, disc_no=?, year=?, duration=?, bitrate=?, sample_rate=?, size=?, mtime=?,
             format=? WHERE id=?`
          ).run(
            r.path,
            meta.title,
            meta.artist,
            meta.album,
            meta.albumArtist,
            meta.genre,
            meta.trackNo,
            meta.discNo,
            meta.year,
            meta.duration,
            d.bitrate,
            d.sampleRate,
            st.size,
            st.mtime,
            ext,
            dup.id
          )
          // Prefer existing art; fill in if the song had none
          db.prepare(
            'UPDATE songs SET art_key=COALESCE(art_key, ?), art_source=COALESCE(art_source, ?) WHERE id=?'
          ).run(artKey, artSource, dup.id)
        }
        this.state.duplicates++
        return
      }
    }

    // --- 3) brand new song ---
    const info = db
      .prepare(
        `INSERT INTO songs (path, dup_key, title, artist, album, album_artist, genre, track_no,
         disc_no, year, duration, format, bitrate, sample_rate, size, mtime, art_key, art_source,
         date_added) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        r.path,
        key,
        meta.title,
        meta.artist,
        meta.album,
        meta.albumArtist,
        meta.genre,
        meta.trackNo,
        meta.discNo,
        meta.year,
        meta.duration,
        ext,
        d.bitrate,
        d.sampleRate,
        st.size,
        st.mtime,
        artKey,
        artSource,
        now
      )
    const songId = Number(info.lastInsertRowid)
    db.prepare(
      'INSERT OR IGNORE INTO song_files (song_id, path, size, mtime, format, duration, score) VALUES (?,?,?,?,?,?,?)'
    ).run(songId, r.path, st.size, st.mtime, ext, meta.duration, score)
    this.state.imported++
  }

  // ---------- standalone import (used by the file watcher) ----------

  private syncing = false

  /** Import/refresh specific files without touching scan-state counters. */
  async importFilesStandalone(files: string[]): Promise<void> {
    if (this.syncing || this.running || !files.length) return
    this.syncing = true
    try {
      const stats = await Promise.all(
        files.map((p) =>
          fsp
            .stat(p)
            .then((st) => ({ p, st }))
            .catch(() => null)
        )
      )
      const statMap = new Map<string, { size: number; mtime: number }>()
      const toParse: string[] = []
      for (const s of stats) {
        if (!s || !s.st.isFile()) continue
        if (s.st.size < MIN_FILE_SIZE) continue
        statMap.set(s.p, { size: s.st.size, mtime: Math.floor(s.st.mtimeMs) })
        toParse.push(s.p)
      }
      if (!toParse.length) return
      let results: ParseResult[] = []
      try {
        results = await this.meta.parseBatch(toParse)
      } catch {
        return
      }
      const now = Date.now()
      tx(() => {
        for (const r of results) this.applyResult(r, statMap, now)
      })
    } finally {
      this.syncing = false
    }
  }

  // ---------- missing-file validation ----------

  async validateExisting(): Promise<void> {
    const db = getDb()
    const rows = db.prepare('SELECT id, path FROM songs').all() as {
      id: number
      path: string
    }[]
    const CHUNK = 150
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      await Promise.all(
        chunk.map(async (row) => {
          let exists = false
          try {
            exists = (await fsp.stat(row.path)).isFile()
          } catch {
            exists = false
          }
          if (exists) {
            if (db.prepare('SELECT missing FROM songs WHERE id=?').get(row.id)) {
              tx(() => db.prepare('UPDATE songs SET missing=0 WHERE id=?').run(row.id))
            }
            return
          }
          // Primary gone — try alternate files
          const alts = db
            .prepare('SELECT path FROM song_files WHERE song_id=? AND path<>?')
            .all(row.id, row.path) as { path: string }[]
          for (const alt of alts) {
            try {
              const st = await fsp.stat(alt.path)
              if (st.isFile()) {
                tx(() =>
                  db.prepare('UPDATE songs SET path=?, missing=0 WHERE id=?').run(alt.path, row.id)
                )
                return
              }
            } catch {
              /* next */
            }
          }
          tx(() => db.prepare('UPDATE songs SET missing=1 WHERE id=?').run(row.id))
        })
      )
      await yieldLoop()
    }
  }
}

export const scanner = new Scanner()
