// PlayPix main — filesystem monitoring.
// Watches manually imported folders (recursive) plus the parent directory of every
// known song (shallow). Debounced incremental sync keeps the library aligned with
// the filesystem without expensive full-PC rescans.
import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import { getDb, getSetting, setSetting, tx } from './db'
import { scanner } from './scanner'
import { AUDIO_EXTENSIONS, shouldIgnoreDir } from '../lib/paths'

let watcher: chokidar.FSWatcher | null = null
let debounces = new Map<string, NodeJS.Timeout>()
let onChangeCb: (() => void) | null = null
const temporarilyIgnoredPaths = new Map<string, number>()

export function ignorePathTemporarily(filePath: string, ms = 15000): void {
  temporarilyIgnoredPaths.set(path.resolve(filePath).toLowerCase(), Date.now() + ms)
}

export function isPathIgnored(filePath: string): boolean {
  const p = path.resolve(filePath).toLowerCase()
  const until = temporarilyIgnoredPaths.get(p)
  if (until && until > Date.now()) return true
  if (until) temporarilyIgnoredPaths.delete(p)
  return false
}

export function initWatcher(onChange: () => void): void {
  onChangeCb = onChange
  rebuild()
}

export function destroyWatcher(): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
  for (const t of debounces.values()) clearTimeout(t)
  debounces.clear()
}

export function getWatchFolders(): string[] {
  const v = getSetting('watchFolders')
  return Array.isArray(v) ? (v as string[]) : []
}

export function addWatchFolders(dirs: string[]): void {
  if (!dirs.length) return
  const cur = new Set(getWatchFolders())
  let changed = false
  for (const d of dirs) {
    const clean = path.resolve(d)
    if (!cur.has(clean) && fs.existsSync(clean)) {
      cur.add(clean)
      changed = true
    }
  }
  if (changed) {
    setSetting('watchFolders', [...cur])
    rebuild()
  }
}

export function removeWatchFolder(dir: string): void {
  const cur = getWatchFolders().filter((d) => d !== path.resolve(dir))
  setSetting('watchFolders', cur)
  rebuild()
}

function songParentDirs(): string[] {
  try {
    const rows = getDb()
      .prepare('SELECT DISTINCT path FROM songs WHERE missing=0')
      .all() as { path: string }[]
    const dirs = new Set<string>()
    for (const r of rows) dirs.add(path.dirname(r.path))
    return [...dirs]
  } catch {
    return []
  }
}

export function rebuild(): void {
  destroyWatcher()
  const folders = getWatchFolders()
  const parents = songParentDirs()
  if (!folders.length && !parents.length) return
  watcher = chokidar.watch([...folders, ...parents], {
    ignoreInitial: true,
    depth: 8,
    ignorePermissionErrors: true,
    ignored: (p: string) => {
      const base = path.basename(p)
      return shouldIgnoreDir(base)
    }
  })
  const handler = (dir: string) => {
    scheduleSync(dir)
  }
  watcher
    .on('add', (p) => handler(path.dirname(p)))
    .on('change', (p) => handler(path.dirname(p)))
    .on('unlink', (p) => handler(path.dirname(p)))
    .on('addDir', (p) => handler(path.dirname(p)))
    .on('unlinkDir', (p) => handler(p))
    .on('error', () => {
      /* keep watching */
    })
}

function scheduleSync(dir: string): void {
  const key = path.resolve(dir)
  const existing = debounces.get(key)
  if (existing) clearTimeout(existing)
  const t = setTimeout(() => {
    debounces.delete(key)
    void syncDirectory(key).then(() => {
      onChangeCb?.()
    })
  }, 1500)
  debounces.set(key, t)
}

/** Incrementally reconcile one directory against the library. */
export async function syncDirectory(dir: string): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  // Import/refresh files found on disk
  const files: string[] = []
  const now = Date.now()
  for (const e of entries) {
    if (e.isFile() && !e.isSymbolicLink() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
      const full = path.join(dir, e.name)
      if (isPathIgnored(full)) {
        continue
      }
      files.push(full)
    }
  }
  if (files.length) {
    await scanner.importFilesStandalone(files)
  }  // Mark songs that vanished
  const db = getDb()
  const rows = db
    .prepare('SELECT id, path, mtime FROM songs WHERE missing=0 AND substr(path,1,length(?))=?')
    .all(dir + path.sep, dir + path.sep) as { id: number; path: string; mtime: number }[]
  for (const row of rows) {
    let exists = false
    try {
      exists = (await fsp.stat(row.path)).isFile()
    } catch {
      exists = false
    }
    if (!exists) {
      // Try alternates before marking missing
      const alts = db
        .prepare('SELECT path FROM song_files WHERE song_id=? AND path<>?')
        .all(row.id, row.path) as { path: string }[]
      let promoted = false
      for (const alt of alts) {
        try {
          const st = await fsp.stat(alt.path)
          if (st.isFile()) {
            tx(() => db.prepare('UPDATE songs SET path=?, missing=0 WHERE id=?').run(alt.path, row.id))
            promoted = true
            break
          }
        } catch {
          /* next */
        }
      }
      if (!promoted) {
        tx(() => db.prepare('UPDATE songs SET missing=1 WHERE id=?').run(row.id))
      }
    }
  }
}
