// PlayPix renderer — metadata editor modal
import { useEffect, useState } from 'react'
import type { Song } from '../../../shared/types'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import { useLibrary } from '../state/library'
import { Artwork } from './Artwork'
import { Icon } from './Icon'

export function MetadataEditor() {
  const ui = useUI()
  const lib = useLibrary()
  const song = ui.editSong

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [albumArtist, setAlbumArtist] = useState('')
  const [genre, setGenre] = useState('')
  const [year, setYear] = useState('')
  const [artPath, setArtPath] = useState<string | undefined>(undefined)
  const [artKey, setArtKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!song) return
    setTitle(song.title)
    setArtist(song.artist)
    setAlbum(song.album)
    setAlbumArtist(song.albumArtist)
    setGenre(song.genre)
    setYear(song.year ? String(song.year) : '')
    setArtPath(undefined)
    setArtKey(song.artKey)
  }, [song])

  if (!song) return null

  const pickArt = async (): Promise<void> => {
    const p = await api.pickImage()
    if (p) {
      setArtPath(p)
      setArtKey(`local-preview:${p}`)
    }
  }

  const save = (): void => {
    if (!song || saving) return
    setSaving(true)
    const fields: Record<string, unknown> = {}
    if (title !== song.title) fields.title = title
    if (artist !== song.artist) fields.artist = artist
    if (album !== song.album) fields.album = album
    if (albumArtist !== song.albumArtist) fields.albumArtist = albumArtist
    if (genre !== song.genre) fields.genre = genre
    const y = year.trim()
    if (y !== (song.year ? String(song.year) : '')) fields.year = y === '' ? null : Number(y)
    void api
      .editMetadata(song.id, fields, artPath)
      .then((res) => {
        if (res.warning) ui.toast(res.warning)
        else ui.toast('Metadata saved')
        ui.setEditSong(null)
        lib.refresh('edit')
      })
      .catch(() => ui.toast('Could not save metadata', 'error'))
      .finally(() => setSaving(false))
  }

  const changed =
    title !== song.title ||
    artist !== song.artist ||
    album !== song.album ||
    albumArtist !== song.albumArtist ||
    genre !== song.genre ||
    year !== (song.year ? String(song.year) : '') ||
    !!artPath

  return (
    <div className="modal-backdrop" onClick={() => ui.setEditSong(null)}>
      <div className="modal glass-strong meta-editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit metadata">
        <h3>Edit metadata</h3>
        <div className="cover-row">
          <div className="cover" onClick={() => void pickArt()} role="button" aria-label="Change artwork" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && void pickArt()}>
            {artPath ? (
              <img
                src={`stream://img?p=${encodeURIComponent(artPath)}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <Artwork artKey={song.artKey} name={song.title} radius={16} />
            )}
            <div className="edit-hint">
              <Icon name="image" size={22} />
            </div>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 650, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {song.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
              {song.format.toUpperCase()} · {Math.round((song.size || 0) / 1024)} KB
            </div>
            <button className="btn" style={{ height: 34, marginTop: 12, fontSize: 12.5 }} onClick={() => void pickArt()}>
              <Icon name="image" size={15} />
              Choose cover
            </button>
          </div>
        </div>
        <div className="form-grid">
          <div className="full">
            <label className="field-label" htmlFor="me-title">Title</label>
            <input id="me-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="me-artist">Artist</label>
            <input id="me-artist" className="field" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="me-album">Album</label>
            <input id="me-album" className="field" value={album} onChange={(e) => setAlbum(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="me-aa">Album artist</label>
            <input id="me-aa" className="field" value={albumArtist} onChange={(e) => setAlbumArtist(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="me-genre">Genre</label>
            <input id="me-genre" className="field" value={genre} onChange={(e) => setGenre(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="me-year">Year</label>
            <input id="me-year" className="field" value={year} inputMode="numeric" onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn subtle" onClick={() => ui.setEditSong(null)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!changed || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
