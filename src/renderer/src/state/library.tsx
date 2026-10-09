// PlayPix renderer — library data context (songs, albums, artists, playlists)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import type { Album, Artist, LibraryChangedEvent, Playlist, Song } from '../../../shared/types'

interface LibraryContextValue {
  songs: Song[]
  albums: Album[]
  artists: Artist[]
  playlists: Playlist[]
  byId: Map<number, Song>
  loaded: boolean
  refresh: (reason?: string) => void
  refreshNow: () => Promise<void>
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary outside provider')
  return ctx
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loaded, setLoaded] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshNow = useCallback(async () => {
    try {
      const data = await api.getLibrary()
      setSongs(data.songs)
      setAlbums(data.albums)
      setArtists(data.artists)
      setPlaylists(data.playlists)
      setLoaded(true)
    } catch {
      setLoaded(true)
    }
  }, [])

  const refresh = useCallback(
    (_reason?: string) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        void refreshNow()
      }, 220)
    },
    [refreshNow]
  )

  useEffect(() => {
    void refreshNow()
    const off = api.onLibraryChanged((e: LibraryChangedEvent) => {
      if (e.reason === 'history') return // too frequent; home page refetches on focus
      refresh(e.reason)
    })
    return off
  }, [refreshNow, refresh])

  const byId = useMemo(() => {
    const m = new Map<number, Song>()
    for (const s of songs) m.set(s.id, s)
    return m
  }, [songs])

  const value = useMemo<LibraryContextValue>(
    () => ({ songs, albums, artists, playlists, byId, loaded, refresh, refreshNow }),
    [songs, albums, artists, playlists, byId, loaded, refresh, refreshNow]
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}
