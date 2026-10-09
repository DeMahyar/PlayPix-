// PlayPix main — playlist management
import { getDb, tx } from './db'
import type { Playlist } from '../../shared/types'
import { getPlaylists } from './library'

export function createPlaylist(name: string): Playlist {
  const db = getDb()
  const now = Date.now()
  const clean = name.trim().slice(0, 120) || 'New Playlist'
  const info = db
    .prepare('INSERT INTO playlists (name, date_created, date_modified) VALUES (?,?,?)')
    .run(clean, now, now)
  const id = Number(info.lastInsertRowid)
  return {
    id,
    name: clean,
    songCount: 0,
    dateCreated: now,
    dateModified: now,
    artKeys: []
  }
}

export function renamePlaylist(id: number, name: string): boolean {
  const db = getDb()
  const clean = name.trim().slice(0, 120)
  if (!clean) return false
  const res = db
    .prepare('UPDATE playlists SET name=?, date_modified=? WHERE id=?')
    .run(clean, Date.now(), id)
  return res.changes > 0
}

export function deletePlaylist(id: number): boolean {
  const db = getDb()
  return tx(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id=?').run(id)
    const res = db.prepare('DELETE FROM playlists WHERE id=?').run(id)
    return res.changes > 0
  })
}

export function addTracks(playlistId: number, songIds: number[], atIndex?: number): boolean {
  const db = getDb()
  if (!songIds.length) return false
  return tx(() => {
    const exists = db.prepare('SELECT id FROM playlists WHERE id=?').get(playlistId)
    if (!exists) return false
    const count = (
      db
        .prepare('SELECT COALESCE(MAX(position),0) AS m FROM playlist_tracks WHERE playlist_id=?')
        .get(playlistId) as { m: number }
    ).m
    const insert = db.prepare(
      'INSERT INTO playlist_tracks (playlist_id, position, song_id) VALUES (?,?,?)'
    )
    if (atIndex === undefined || atIndex === null || atIndex >= count) {
      songIds.forEach((sid, i) => insert.run(playlistId, count + 1 + i, sid))
    } else {
      const idx = Math.max(0, atIndex)
      // shift existing tracks up
      db.prepare('UPDATE playlist_tracks SET position=position+? WHERE playlist_id=? AND position>?').run(
        songIds.length,
        playlistId,
        idx
      )
      songIds.forEach((sid, i) => insert.run(playlistId, idx + 1 + i, sid))
    }
    db.prepare('UPDATE playlists SET date_modified=? WHERE id=?').run(Date.now(), playlistId)
    return true
  })
}

export function removeTrack(playlistId: number, position: number): boolean {
  const db = getDb()
  return tx(() => {
    const res = db
      .prepare('DELETE FROM playlist_tracks WHERE playlist_id=? AND position=?')
      .run(playlistId, position)
    if (!res.changes) return false
    const rows = db
      .prepare('SELECT position, song_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position')
      .all(playlistId) as { position: number; song_id: number }[]
    const upd = db.prepare('UPDATE playlist_tracks SET position=? WHERE playlist_id=? AND song_id=?')
    rows.forEach((r, i) => upd.run(i + 1, playlistId, r.song_id))
    db.prepare('UPDATE playlists SET date_modified=? WHERE id=?').run(Date.now(), playlistId)
    return true
  })
}

export function reorderTrack(playlistId: number, from: number, to: number): boolean {
  const db = getDb()
  return tx(() => {
    const rows = db
      .prepare('SELECT song_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position')
      .all(playlistId) as { song_id: number }[]
    if (from < 1 || from > rows.length || to < 1 || to > rows.length) return false
    const ids = rows.map((r) => r.song_id)
    const [moved] = ids.splice(from - 1, 1)
    ids.splice(to - 1, 0, moved)
    const del = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id=?')
    del.run(playlistId)
    const ins = db.prepare('INSERT INTO playlist_tracks (playlist_id, position, song_id) VALUES (?,?,?)')
    ids.forEach((sid, i) => ins.run(playlistId, i + 1, sid))
    db.prepare('UPDATE playlists SET date_modified=? WHERE id=?').run(Date.now(), playlistId)
    return true
  })
}

export function listPlaylists(): Playlist[] {
  return getPlaylists()
}
