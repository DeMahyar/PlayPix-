// PlayPix main — SQLite database (better-sqlite3)
// WAL journaling + transactions make the library resilient against crashes.
// NOTE: better-sqlite3 is loaded LAZILY (inside initDb, not at module
// top-level) so that a missing or incompatible native binary can never crash
// the whole process during bundle evaluation — that failure mode produced a
// silent "app does not open" bug. Here the error is thrown at a call site
// where it is caught, logged and shown to the user instead.
import type { Database as DatabaseType } from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

let db: DatabaseType | null = null
type DatabaseConstructor = typeof import('better-sqlite3')
let DatabaseCtor: DatabaseConstructor | null = null

export function getDb(): DatabaseType {
  if (!db) throw new Error('Database not initialized')
  return db
}

export async function initDb(userDataDir: string): Promise<DatabaseType> {
  if (db) return db
  fs.mkdirSync(userDataDir, { recursive: true })
  // Runtime shape tolerance: depending on the bundler interop the imported
  // module may be the constructor itself or wrapped under `.default`.
  const mod = (await import('better-sqlite3')) as unknown as {
    default?: DatabaseConstructor
  } & DatabaseConstructor
  const Ctor: DatabaseConstructor = (mod && mod.default ? mod.default : mod) as DatabaseConstructor
  DatabaseCtor = Ctor
  const instance: DatabaseType = new Ctor(path.join(userDataDir, 'playpix.db'))
  instance.pragma('journal_mode = WAL')
  instance.pragma('synchronous = NORMAL')
  instance.pragma('foreign_keys = ON')
  createSchema(instance)
  migrateSchema(instance)
  db = instance
  return instance
}

/** Additive migrations — never rewrite existing tables. */
function migrateSchema(db: DatabaseType): void {
  // Statistics (v1.1.0): store how many seconds were actually listened per play.
  const cols = (db.prepare('PRAGMA table_info(play_history)').all() as { name: string }[]).map(
    (c) => c.name
  )
  if (!cols.includes('seconds')) {
    try {
      db.exec('ALTER TABLE play_history ADD COLUMN seconds REAL NOT NULL DEFAULT 0')
    } catch {
      /* concurrent migration — ignore */
    }
  }

  // User-edited metadata preservation
  const songCols = (db.prepare('PRAGMA table_info(songs)').all() as { name: string }[]).map(
    (c) => c.name
  )
  if (!songCols.includes('user_edited')) {
    try {
      db.exec('ALTER TABLE songs ADD COLUMN user_edited INTEGER NOT NULL DEFAULT 0')
    } catch {
      /* concurrent migration — ignore */
    }
  }
}

export function closeDb(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)')
      db.close()
    } catch {
      /* ignore */
    }
    db = null
  }
}

function createSchema(db: DatabaseType): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      dup_key TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      album TEXT NOT NULL DEFAULT '',
      album_artist TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL DEFAULT '',
      track_no INTEGER,
      disc_no INTEGER,
      year INTEGER,
      duration REAL NOT NULL DEFAULT 0,
      format TEXT NOT NULL DEFAULT '',
      bitrate INTEGER,
      sample_rate INTEGER,
      size INTEGER NOT NULL DEFAULT 0,
      mtime INTEGER NOT NULL DEFAULT 0,
      art_key TEXT,
      art_source TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      play_count INTEGER NOT NULL DEFAULT 0,
      last_played INTEGER,
      date_added INTEGER NOT NULL DEFAULT 0,
      missing INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_songs_dup    ON songs(dup_key);
    CREATE INDEX IF NOT EXISTS idx_songs_title  ON songs(title);
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_songs_album  ON songs(album);
    CREATE INDEX IF NOT EXISTS idx_songs_fav    ON songs(favorite);
    CREATE INDEX IF NOT EXISTS idx_songs_added  ON songs(date_added);

    CREATE TABLE IF NOT EXISTS song_files (
      song_id INTEGER NOT NULL,
      path TEXT UNIQUE NOT NULL,
      size INTEGER,
      mtime INTEGER,
      format TEXT,
      duration REAL,
      score REAL,
      PRIMARY KEY (song_id, path)
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date_created INTEGER NOT NULL,
      date_modified INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      song_id INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, position)
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      played_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_played ON play_history(played_at);

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT UNIQUE NOT NULL,
      searched_at INTEGER NOT NULL
    );
  `)
}

/** Simple transaction helper. */
export function tx<T>(fn: () => T): T {
  const d = getDb()
  return d.transaction(fn)()
}

// ---------- settings ----------

export function getSetting(key: string): unknown {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, JSON.stringify(value ?? null))
}

export function getAllSettings(): Record<string, unknown> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value)
    } catch {
      out[r.key] = r.value
    }
  }
  return out
}
