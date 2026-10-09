// PlayPix main — library queries, favorites, metadata edits, removal, search, home.
import { getDb, tx, setSetting } from './db'
import * as artwork from './artwork'
import { writeTagsSafely } from './tagwrite'
import { ignorePathTemporarily } from './watcher'
import * as fsp from 'fs/promises'
import type {
  Album,
  Artist,
  DayBucket,
  FolderInfo,
  HomeData,
  LibraryData,
  MetadataEdit,
  Playlist,
  RemoveOptions,
  RemoveResult,
  SearchResults,
  Song,
  StatsData
} from '../../shared/types'
import { escapeLike, norm } from '../lib/util'
import * as path from 'path'
import { shell } from 'electron'

interface SongRow {
  id: number
  path: string
  title: string
  artist: string
  album: string
  album_artist: string
  genre: string
  track_no: number | null
  disc_no: number | null
  year: number | null
  duration: number
  format: string
  bitrate: number | null
  sample_rate: number | null
  size: number
  art_key: string | null
  art_source: string | null
  favorite: number
  play_count: number
  last_played: number | null
  date_added: number
  missing: number
}

function rowToSong(db: ReturnType<typeof getDb>, row: SongRow): Song {
  let altFiles: string[] = []
  try {
    altFiles = (
      db
        .prepare('SELECT path FROM song_files WHERE song_id=? AND path<>?')
        .all(row.id, row.path) as { path: string }[]
    ).map((r) => r.path)
  } catch {
    altFiles = []
  }
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    artist: row.artist,
    album: row.album,
    albumArtist: row.album_artist,
    genre: row.genre,
    trackNo: row.track_no,
    discNo: row.disc_no,
    year: row.year,
    duration: row.duration || 0,
    format: row.format,
    bitrate: row.bitrate,
    sampleRate: row.sample_rate,
    size: row.size,
    artKey: row.art_key,
    artSource: (row.art_source as Song['artSource']) ?? null,
    favorite: !!row.favorite,
    playCount: row.play_count,
    lastPlayed: row.last_played,
    dateAdded: row.date_added,
    missing: !!row.missing,
    altFiles
  }
}

function q(db: ReturnType<typeof getDb>, sql: string, ...params: unknown[]): Song[] {
  const rows = db.prepare(sql).all(...params) as SongRow[]
  return rows.map((r) => rowToSong(db, r))
}

// ---------- library data ----------

export function getSongs(): Song[] {
  const db = getDb()
  return q(db, 'SELECT * FROM songs WHERE missing=0 ORDER BY title COLLATE NOCASE, artist')
}

export function getSongsByIds(ids: number[]): Song[] {
  const db = getDb()
  if (!ids.length) return []
  const map = new Map<number, Song>()
  const chunkSize = 500
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const placeholders = chunk.map(() => '?').join(',')
    const rows = db.prepare(`SELECT * FROM songs WHERE id IN (${placeholders})`).all(...chunk) as SongRow[]
    for (const r of rows) map.set(r.id, rowToSong(db, r))
  }
  return ids.map((id) => map.get(id)).filter((s): s is Song => !!s)
}

export function getAlbums(orderBy?: 'name' | 'recent'): Album[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT album AS name,
        COALESCE(NULLIF(album_artist,''), artist) AS artist,
        MIN(year) AS year,
        MAX(date_added) AS recent,
        COUNT(*) AS songCount,
        SUM(duration) AS duration,
        (SELECT s2.art_key FROM songs s2 WHERE s2.missing=0 AND s2.album<>'' AND s2.art_key IS NOT NULL
           AND lower(s2.album)=lower(s.album)
           AND lower(COALESCE(NULLIF(s2.album_artist,''),s2.artist))=lower(COALESCE(NULLIF(s.album_artist,''),s.artist))
         ORDER BY (s2.art_key LIKE 'al-%') DESC LIMIT 1) AS artKey
       FROM songs s
       WHERE missing=0 AND album<>''
       GROUP BY lower(album), lower(COALESCE(NULLIF(album_artist,''), artist))
       ${orderBy === 'recent' ? 'ORDER BY recent DESC' : 'ORDER BY name COLLATE NOCASE'}`
    )
    .all() as {
    name: string
    artist: string
    year: number | null
    songCount: number
    duration: number
    artKey: string | null
  }[]
  return rows.map((r) => ({
    key: `${r.name}|||${r.artist}`,
    name: r.name,
    artist: r.artist,
    year: r.year,
    artKey: r.artKey,
    songCount: r.songCount,
    duration: r.duration || 0
  }))
}

export function getArtists(orderBy?: 'name' | 'recent'): Artist[] {
  const db = getDb()
  const rows = db
    .prepare(
      `WITH anames AS (
        SELECT artist AS name, album, date_added, art_key FROM songs
          WHERE missing=0 AND artist<>''
        UNION ALL
        SELECT album_artist AS name, album, date_added, art_key FROM songs
          WHERE missing=0 AND album_artist<>'' AND artist<>album_artist
      )
      SELECT name,
        COUNT(*) AS songCount,
        COUNT(DISTINCT lower(album)) AS albumCount,
        MAX(date_added) AS recent,
        (SELECT a2.art_key FROM anames a2 WHERE lower(a2.name)=lower(anames.name) AND a2.art_key IS NOT NULL LIMIT 1) AS artKey
      FROM anames GROUP BY lower(name)
      ${orderBy === 'recent' ? 'ORDER BY recent DESC' : 'ORDER BY name COLLATE NOCASE'}`
    )
    .all() as {
    name: string
    songCount: number
    albumCount: number
    artKey: string | null
  }[]
  return rows.map((r) => ({
    key: r.name,
    name: r.name,
    songCount: r.songCount,
    albumCount: r.albumCount,
    artKey: r.artKey
  }))
}

export function getFolders(): FolderInfo[] {
  const db = getDb()
  const rows = db
    .prepare("SELECT path FROM songs WHERE missing=0")
    .all() as { path: string }[]
  const map = new Map<string, number>()
  for (const r of rows) {
    const dir = path.dirname(r.path)
    map.set(dir, (map.get(dir) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([p, count]) => ({ path: p, name: path.basename(p) || p, songCount: count }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function getSongsByAlbum(key: string): Song[] {
  const db = getDb()
  const [name, artist] = key.split('|||')
  return q(
    db,
    `SELECT * FROM songs WHERE missing=0
     AND lower(album)=lower(?)
     AND lower(COALESCE(NULLIF(album_artist,''),artist))=lower(?)
     ORDER BY disc_no IS NULL, disc_no, track_no IS NULL, track_no, title`,
    name ?? '',
    artist ?? ''
  )
}

export function getSongsByArtist(key: string): Song[] {
  const db = getDb()
  return q(
    db,
    `SELECT * FROM songs WHERE missing=0
     AND (lower(artist)=lower(?) OR lower(album_artist)=lower(?))
     ORDER BY album COLLATE NOCASE, disc_no IS NULL, disc_no, track_no IS NULL, track_no, title`,
    key,
    key
  )
}

export function getSongsByFolder(folder: string): Song[] {
  const db = getDb()
  return q(
    db,
    `SELECT * FROM songs WHERE missing=0 AND substr(path,1,length(?))=?
     ORDER BY path`,
    folder + (folder.endsWith(path.sep) ? '' : path.sep),
    folder + (folder.endsWith(path.sep) ? '' : path.sep)
  )
}

export function getFavorites(): Song[] {
  const db = getDb()
  return q(
    db,
    `SELECT * FROM songs WHERE missing=0 AND favorite=1
     ORDER BY (last_played IS NULL), last_played DESC, date_added DESC`
  )
}

// ---------- playlists ----------

export function getPlaylists(): Playlist[] {
  const db = getDb()
  const lists = db
    .prepare(
      'SELECT id, name, date_created, date_modified, (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) AS songCount FROM playlists p ORDER BY date_modified DESC'
    )
    .all() as { id: number; name: string; date_created: number; date_modified: number; songCount: number }[]
  const artStmt = db.prepare(
    `SELECT s.art_key FROM playlist_tracks pt JOIN songs s ON s.id=pt.song_id
     WHERE pt.playlist_id=? AND s.art_key IS NOT NULL LIMIT 4`
  )
  return lists.map((p) => ({
    id: p.id,
    name: p.name,
    songCount: p.songCount,
    dateCreated: p.date_created,
    dateModified: p.date_modified,
    artKeys: (artStmt.all(p.id) as { art_key: string }[]).map((r) => r.art_key)
  }))
}

// ---------- favorites / play tracking ----------

export function toggleFavorite(id: number): boolean {
  const db = getDb()
  const row = db.prepare('SELECT favorite FROM songs WHERE id=?').get(id) as
    | { favorite: number }
    | undefined
  if (!row) return false
  const next = row.favorite ? 0 : 1
  db.prepare('UPDATE songs SET favorite=? WHERE id=?').run(next, id)
  return !!next
}

export function registerPlay(id: number): void {
  const db = getDb()
  const now = Date.now()
  tx(() => {
    db.prepare('UPDATE songs SET last_played=? WHERE id=?').run(now, id)
    db.prepare('INSERT INTO play_history (song_id, played_at) VALUES (?,?)').run(id, now)
  })
}

export function completePlay(id: number, seconds?: number): void {
  const db = getDb()
  tx(() => {
    db.prepare('UPDATE songs SET play_count=play_count+1 WHERE id=?').run(id)
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      db.prepare(
        'UPDATE play_history SET seconds=? WHERE id=(SELECT id FROM play_history WHERE song_id=? ORDER BY id DESC LIMIT 1)'
      ).run(Math.round(seconds), id)
    }
  })
}

// ---------- statistics (§27) ----------

export function getStats(): StatsData {
  const db = getDb()
  const totalsRow = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM songs WHERE missing=0) AS songs,
        (SELECT COUNT(*) FROM songs WHERE missing=0 AND favorite=1) AS favorites,
        (SELECT COUNT(*) FROM playlists) AS playlists,
        (SELECT COUNT(*) FROM play_history) AS tracksPlayed,
        (SELECT COALESCE(SUM(seconds),0) FROM play_history) AS listeningSeconds`
    )
    .get() as {
    songs: number
    favorites: number
    playlists: number
    tracksPlayed: number
    listeningSeconds: number
  }

  const lastPlayed = q(db, 'SELECT * FROM songs WHERE missing=0 AND last_played IS NOT NULL ORDER BY last_played DESC LIMIT 1')[0] ?? null

  const mostPlayedSongs = q(
    db,
    'SELECT * FROM songs WHERE missing=0 AND play_count>0 ORDER BY play_count DESC, last_played DESC LIMIT 12'
  )

  const artistRows = db
    .prepare(
      `SELECT s.artist AS name, COUNT(h.id) AS plays
       FROM play_history h JOIN songs s ON s.id=h.song_id
       WHERE s.artist<>'' GROUP BY lower(s.artist) ORDER BY plays DESC LIMIT 8`
    )
    .all() as { name: string; plays: number }[]

  const albumRows = db
    .prepare(
      `SELECT s.album AS albumName,
        COALESCE(NULLIF(s.album_artist,''), s.artist) AS albumArtist,
        COUNT(h.id) AS plays
       FROM play_history h JOIN songs s ON s.id=h.song_id
       WHERE s.album<>'' GROUP BY lower(s.album), lower(COALESCE(NULLIF(s.album_artist,''),s.artist))
       ORDER BY plays DESC LIMIT 8`
    )
    .all() as { albumName: string; albumArtist: string; plays: number }[]
  const mostPlayedAlbums = albumRows
    .map((r) => {
      const songs = q(
        db,
        `SELECT * FROM songs WHERE missing=0 AND lower(album)=lower(?)
         AND lower(COALESCE(NULLIF(album_artist,''),artist))=lower(?) LIMIT 1`,
        r.albumName,
        r.albumArtist
      )
      const first = songs[0]
      if (!first) return null
      return {
        key: `${r.albumName}|||${r.albumArtist}`,
        name: r.albumName,
        artist: r.albumArtist,
        year: first.year,
        artKey: first.artKey,
        songCount: 0,
        duration: 0,
        plays: r.plays
      } as Album & { plays: number }
    })
    .filter((a): a is Album & { plays: number } => !!a)

  // Recent history with song + seconds
  const histRows = db
    .prepare(
      `SELECT h.played_at AS playedAt, COALESCE(h.seconds,0) AS seconds, s.*
       FROM play_history h JOIN songs s ON s.id=h.song_id
       WHERE s.missing=0 ORDER BY h.played_at DESC LIMIT 60`
    )
    .all() as (SongRow & { playedAt: number; seconds: number })[]
  const history = histRows.map((r) => ({
    song: rowToSong(db, r),
    playedAt: r.playedAt,
    seconds: r.seconds || 0
  }))

  // Last 14 days buckets (local midnight)
  const dayRows = db
    .prepare(
      `SELECT played_at, COALESCE(seconds,0) AS seconds FROM play_history
       WHERE played_at >= ? ORDER BY played_at ASC`
    )
    .all(Date.now() - 14 * 86400000) as { played_at: number; seconds: number }[]
  const buckets = new Map<number, DayBucket>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    buckets.set(d.getTime(), { day: d.getTime(), plays: 0, seconds: 0 })
  }
  for (const r of dayRows) {
    const d = new Date(r.played_at)
    d.setHours(0, 0, 0, 0)
    const b = buckets.get(d.getTime())
    if (b) {
      b.plays++
      b.seconds += r.seconds || 0
    }
  }

  return {
    totals: {
      songs: totalsRow.songs,
      albums: getAlbums().length,
      artists: getArtists().length,
      favorites: totalsRow.favorites,
      playlists: totalsRow.playlists,
      tracksPlayed: totalsRow.tracksPlayed,
      listeningSeconds: Math.round(totalsRow.listeningSeconds)
    },
    lastPlayed,
    mostPlayedSongs,
    mostPlayedArtists: artistRows,
    mostPlayedAlbums,
    history,
    daily: [...buckets.values()]
  }
}

// ---------- metadata editing ----------

export async function editMetadata(
  id: number,
  fields: MetadataEdit,
  artPathFile?: string
): Promise<{ ok: boolean; warning?: string }> {
  const db = getDb()
  const song = db.prepare('SELECT * FROM songs WHERE id=?').get(id) as SongRow | undefined
  if (!song) return { ok: false, warning: 'Song not found' }

  const next = {
    title: fields.title !== undefined ? String(fields.title).trim().slice(0, 300) : song.title,
    artist: fields.artist !== undefined ? String(fields.artist).trim().slice(0, 300) : song.artist,
    album: fields.album !== undefined ? String(fields.album).trim().slice(0, 300) : song.album,
    albumArtist:
      fields.albumArtist !== undefined
        ? String(fields.albumArtist).trim().slice(0, 300)
        : song.album_artist,
    genre: fields.genre !== undefined ? String(fields.genre).trim().slice(0, 120) : song.genre,
    year:
      fields.year !== undefined
        ? fields.year === null || (Number.isFinite(Number(fields.year)) && Number(fields.year) > 0)
          ? fields.year === null
            ? null
            : Math.floor(Number(fields.year))
          : song.year
        : song.year
  }

  // Temporarily ignore file watcher events for this path so our own write-back does not trigger a rescan
  ignorePathTemporarily(song.path, 10000)

  // 1) Best-effort tag write-back to the audio file (never destructive: backup + verify)
  const tagResult = await writeTagsSafely(song.path, fields, artPathFile)

  // Query actual mtime and size from disk after tag write so database stays perfectly in sync
  let newMtime = song.mtime
  let newSize = song.size
  try {
    const st = await fsp.stat(song.path)
    newMtime = Math.floor(st.mtimeMs)
    newSize = st.size
  } catch {
    /* ignore */
  }

  // 2) Database is the app's source of truth
  let newKey = song.art_key
  let newSource = song.art_source
  if (artPathFile) {
    const base =
      next.album && (next.albumArtist || next.artist)
        ? artwork.albumArtKeyBase(next.album, next.albumArtist || next.artist)
        : artwork.songArtKeyBase(`song:${id}`)
    const key = artwork.copyArtFromFile(base, artPathFile, true)
    if (key) {
      newKey = key
      newSource = 'manual'
    }
  }
  db.prepare(
    `UPDATE songs SET title=?, artist=?, album=?, album_artist=?, genre=?, year=?,
     art_key=?, art_source=?, mtime=?, size=?, user_edited=1 WHERE id=?`
  ).run(
    next.title,
    next.artist,
    next.album,
    next.albumArtist,
    next.genre,
    next.year,
    newKey,
    newSource,
    newMtime,
    newSize,
    id
  )

  try {
    db.prepare('UPDATE song_files SET size=?, mtime=? WHERE song_id=? AND path=?').run(
      newSize,
      newMtime,
      id,
      song.path
    )
  } catch {
    /* ignore */
  }

  return { ok: true, warning: tagResult.ok ? undefined : tagResult.warning }
}

// ---------- removal ----------

export function removeSongs(ids: number[], opts: RemoveOptions): RemoveResult {
  const db = getDb()
  const errors: string[] = []
  for (const id of ids) {
    const row = db.prepare('SELECT path FROM songs WHERE id=?').get(id) as
      | { path: string }
      | undefined
    if (!row) continue
    const allFiles = [
      row.path,
      ...(db.prepare('SELECT path FROM song_files WHERE song_id=?').all(id) as { path: string }[]).map(
        (r) => r.path
      )
    ].filter((p, i, a) => a.indexOf(p) === i)

    if (opts.trash) {
      for (const f of allFiles) {
        try {
          // Move to the OS Recycle Bin — recoverable, never a hard delete
          // eslint-disable-next-line no-await-in-loop
          const r = shell.trashItem(f)
          if (r && typeof (r as unknown as Promise<void>).catch === 'function') {
            ;(r as unknown as Promise<void>).catch(() => errors.push(f))
          }
        } catch {
          errors.push(f)
        }
      }
    }
    tx(() => {
      db.prepare('DELETE FROM song_files WHERE song_id=?').run(id)
      db.prepare('DELETE FROM playlist_tracks WHERE song_id=?').run(id)
      db.prepare('DELETE FROM songs WHERE id=?').run(id)
    })
  }
  // Renumber playlists
  const lists = db.prepare('SELECT id FROM playlists').all() as { id: number }[]
  for (const l of lists) normalizePlaylist(l.id)
  return { ok: errors.length === 0, errors }
}

export function revealInFolder(p: string): void {
  try {
    shell.showItemInFolder(p)
  } catch {
    /* ignore */
  }
}

// ---------- playlists core (used by ipc + removal) ----------

export function normalizePlaylist(playlistId: number): void {
  const db = getDb()
  const rows = db
    .prepare('SELECT position, song_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position')
    .all(playlistId) as { position: number; song_id: number }[]
  const upd = db.prepare('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND song_id=?')
  tx(() => {
    rows.forEach((r, i) => {
      if (r.position !== i + 1) upd.run(i + 1, playlistId, r.song_id)
    })
  })
}

// ---------- home ----------

export function getHomeData(): HomeData {
  const db = getDb()
  return {
    recentlyPlayed: q(
      db,
      'SELECT * FROM songs WHERE missing=0 AND last_played IS NOT NULL ORDER BY last_played DESC LIMIT 14'
    ),
    recentlyAdded: q(
      db,
      'SELECT * FROM songs WHERE missing=0 ORDER BY date_added DESC, id DESC LIMIT 14'
    ),
    favorites: q(
      db,
      'SELECT * FROM songs WHERE missing=0 AND favorite=1 ORDER BY (last_played IS NULL), last_played DESC LIMIT 14'
    ),
    albums: getAlbums('recent').slice(0, 14),
    artists: getArtists('recent').slice(0, 14),
    playlists: getPlaylists().slice(0, 14)
  }
}

export function getLibraryData(): LibraryData {
  return {
    songs: getSongs(),
    albums: getAlbums('name'),
    artists: getArtists('name'),
    playlists: getPlaylists()
  }
}

// ---------- search ----------

export function search(term: string): SearchResults {
  const db = getDb()
  const t = term.trim()
  if (!t) {
    return { songs: [], albums: [], artists: [], playlists: [], genres: [], total: 0 }
  }
  const like = `%${escapeLike(t)}%`
  const prefix = `${escapeLike(t)}%`
  const exact = t.toLowerCase()

  const songs = q(
    db,
    `SELECT * FROM songs WHERE missing=0 AND (
       title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\'
       OR album_artist LIKE ? ESCAPE '\\' OR genre LIKE ? ESCAPE '\\')
     ORDER BY CASE
       WHEN lower(title) = ? THEN 0
       WHEN title LIKE ? ESCAPE '\\' THEN 1
       WHEN artist LIKE ? ESCAPE '\\' THEN 2
       ELSE 3 END,
     play_count DESC, title COLLATE NOCASE
     LIMIT 80`,
    like,
    like,
    like,
    like,
    like,
    exact,
    prefix,
    prefix
  )
  const albums = (
    db
      .prepare(
        `SELECT album AS name, COALESCE(NULLIF(album_artist,''),artist) AS artist, MIN(year) AS year,
          COUNT(*) AS songCount, SUM(duration) AS duration,
          (SELECT s2.art_key FROM songs s2 WHERE s2.missing=0 AND s2.album<>'' AND s2.art_key IS NOT NULL
             AND lower(s2.album)=lower(s.album)
             AND lower(COALESCE(NULLIF(s2.album_artist,''),s2.artist))=lower(COALESCE(NULLIF(s.album_artist,''),s.artist))
           LIMIT 1) AS artKey
         FROM songs s WHERE missing=0 AND album<>''
           AND (album LIKE ? ESCAPE '\\' OR COALESCE(NULLIF(album_artist,''),artist) LIKE ? ESCAPE '\\')
         GROUP BY lower(album), lower(COALESCE(NULLIF(album_artist,''),artist))
         ORDER BY name COLLATE NOCASE LIMIT 24`
      )
      .all(like, like) as {
      name: string
      artist: string
      year: number | null
      songCount: number
      duration: number
      artKey: string | null
    }[]
  ).map((r) => ({
    key: `${r.name}|||${r.artist}`,
    name: r.name,
    artist: r.artist,
    year: r.year,
    artKey: r.artKey,
    songCount: r.songCount,
    duration: r.duration || 0
  }))
  const artists = (
    db
      .prepare(
        `WITH anames AS (
           SELECT artist AS name, album, art_key FROM songs WHERE missing=0 AND artist<>''
           UNION ALL
           SELECT album_artist AS name, album, art_key FROM songs WHERE missing=0 AND album_artist<>'' AND artist<>album_artist
         )
         SELECT name, COUNT(*) AS songCount, COUNT(DISTINCT lower(album)) AS albumCount,
           (SELECT a2.art_key FROM anames a2 WHERE lower(a2.name)=lower(anames.name) AND a2.art_key IS NOT NULL LIMIT 1) AS artKey
         FROM anames WHERE name LIKE ? ESCAPE '\\' GROUP BY lower(name) ORDER BY songCount DESC LIMIT 24`
      )
      .all(like) as { name: string; songCount: number; albumCount: number; artKey: string | null }[]
  ).map((r) => ({ key: r.name, name: r.name, songCount: r.songCount, albumCount: r.albumCount, artKey: r.artKey }))
  const playlists = (
    db
      .prepare(
        `SELECT id, name, date_created, date_modified,
          (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id=p.id) AS songCount
         FROM playlists p WHERE name LIKE ? ESCAPE '\\' ORDER BY date_modified DESC LIMIT 12`
      )
      .all(like) as { id: number; name: string; date_created: number; date_modified: number; songCount: number }[]
  ).map((p) => ({
    id: p.id,
    name: p.name,
    songCount: p.songCount,
    dateCreated: p.date_created,
    dateModified: p.date_modified,
    artKeys: []
  }))
  const genres = (
    db
      .prepare(
        `SELECT genre AS name, COUNT(*) AS count FROM songs
         WHERE missing=0 AND genre<>'' AND genre LIKE ? ESCAPE '\\'
         GROUP BY lower(genre) ORDER BY count DESC LIMIT 10`
      )
      .all(like) as { name: string; count: number }[]
  ).map((g) => ({ name: g.name, count: g.count }))

  return {
    songs,
    albums,
    artists,
    playlists,
    genres,
    total: songs.length + albums.length + artists.length + playlists.length
  }
}

// ---------- search history ----------

export function addSearchTerm(term: string): void {
  const db = getDb()
  const t = term.trim().slice(0, 120)
  if (!t) return
  tx(() => {
    db.prepare(
      'INSERT INTO search_history (term, searched_at) VALUES (?,?) ON CONFLICT(term) DO UPDATE SET searched_at=excluded.searched_at'
    ).run(t, Date.now())
    const old = db.prepare('SELECT id FROM search_history ORDER BY searched_at DESC LIMIT -1 OFFSET 12').all() as {
      id: number
    }[]
    for (const o of old) db.prepare('DELETE FROM search_history WHERE id=?').run(o.id)
  })
}

export function getSearchHistory(): string[] {
  const rows = getDb()
    .prepare('SELECT term FROM search_history ORDER BY searched_at DESC LIMIT 12')
    .all() as { term: string }[]
  return rows.map((r) => r.term)
}

export function clearSearchHistory(): void {
  getDb().prepare('DELETE FROM search_history').run()
}

export function resetLibrary(): void {
  const db = getDb()
  tx(() => {
    db.prepare('DELETE FROM song_files').run()
    db.prepare('DELETE FROM playlist_tracks').run()
    db.prepare('DELETE FROM playlists').run()
    db.prepare('DELETE FROM play_history').run()
    db.prepare('DELETE FROM songs').run()
    db.prepare("DELETE FROM settings WHERE key IN ('onboardingDone','lastScanAt')").run()
  })
  setSetting('onboardingDone', false)
}

export { norm }
