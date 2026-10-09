// PlayPix renderer — e2e test bridge (only rendered when PLAYPIX_E2E=1)
import { useEffect } from 'react'
import { api } from './lib/api'
import { useUI, usePlayer, useLibrary, usePlayerPosition } from './state'

import type { Song } from '../../shared/types'

 declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window {
    __e2e?: Record<string, (...args: any[]) => any>
    /** Verbose positioning logs for the context-menu collision math. */
    __ppCtxDebug?: boolean
  }
}

export function E2EBridge() {
  const ui = useUI()
  const player = usePlayer()
  const lib = useLibrary()
  const pos = usePlayerPosition()

  useEffect(() => {
    void api.e2ePing()
    ;(window as unknown as { __ppCtxDebug?: boolean }).__ppCtxDebug = true
    window.__e2e = {
      nav: (page: string) => {
        if (page === 'home') {
          ui.closeSearch()
          ui.navigate({ name: 'home' })
        } else if (page === 'library') {
          ui.closeSearch()
          ui.navigate({ name: 'library' })
        } else if (page === 'stats') {
          ui.closeSearch()
          ui.navigate({ name: 'stats' })
        } else if (page === 'search') {
          ui.openSearch()
        }
      },
      libTab: (t: string) => {
        ui.navigate({ name: 'library' })
        ui.setLibraryTab(t as never)
      },
      search: (q: string) => {
        ui.openSearch(q)
      },
      clearSearch: () => ui.setSearchQuery(''),
      openNow: () => ui.setNowPlaying(true),
      closeNow: () => ui.setNowPlaying(false),
      engineEl: () => player.getEngine()?.getMediaElement() ?? null,
      toggleQueue: () => ui.setQueueOpen(true),
      openProfile: () => ui.setProfileOpen(true),
      closeProfile: () => ui.setProfileOpen(false),
      setTheme: (t: string) => ui.setThemeMode(t as 'light' | 'dark' | 'system'),
      playFrom: (i: number) => player.playContext(lib.songs, i),
      pause: () => player.playPause(false),
      next: () => player.next(),
      prev: () => player.prev(),
      toggle: () => player.togglePlay(),
      playSingle: () => {
        // pick a known-playable song (the seed library contains one corrupt file)
        const s = lib.songs.find((x) => x.duration > 0) ?? lib.songs[1]
        if (s) player.playContext([s], 0)
      },
      playAllFromLibrary: () => player.playContext(lib.songs.filter((s) => s.duration > 0), 0),
      playFromGood: (i: number) => player.playContext(lib.songs.filter((s) => s.duration > 0), i),
      // §6: play inside the HOME-WIDE queue (exposed by HomePage for e2e)
      playQueueAt: (i: number) => {
        const q = (window as unknown as { __ppHomeQueue?: Song[] }).__ppHomeQueue
        if (q && q.length) player.playContext(q, i)
      },
      homeQueueLen: () => (window as unknown as { __ppHomeQueue?: Song[] }).__ppHomeQueue?.length ?? 0,
      shuffleAll: () => player.playContext(lib.songs, 0, { shuffle: true }),
      jumpQueue: (i: number) => player.jumpTo(i),
      setName: (n: string) => ui.updateSetting('displayName', n),
      ctxAt: (x: number, y: number) =>
        ui.openCtxMenu(x, y, [
          { label: 'Play', icon: 'play', onClick: () => undefined },
          { label: 'Play next', icon: 'note', onClick: () => undefined },
          { sep: true, label: '' },
          {
            label: 'Add to playlist',
            icon: 'plus',
            sub: [
              { label: 'My Playlist', onClick: () => undefined },
              { label: 'Chill Mix', onClick: () => undefined },
              { label: 'Workout', onClick: () => undefined },
              { label: 'Late Night Drive', onClick: () => undefined },
              { label: 'Rainy Day', onClick: () => undefined },
              { label: 'Focus Flow', onClick: () => undefined },
              { label: 'Roadtrip 2026', onClick: () => undefined },
              { label: 'New playlist…', onClick: () => undefined }
            ]
          },
          { label: 'Edit metadata', icon: 'edit', onClick: () => undefined }
        ], 'Add to playlist'),
      hoverSub: () => {
        const rows = Array.from(document.querySelectorAll('.ctx-menu > div')) as HTMLElement[]
        const target = rows.find((r) => r.textContent?.includes('Add to playlist'))
        // React derives onMouseEnter from delegated mouseover events
        target?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      },
      favoriteSome: (n: number) => {
        for (const s of lib.songs.slice(0, n)) void api.toggleFavorite(s.id)
      },
      createPlaylist: (name: string) =>
        void api.createPlaylist(name).then(() => lib.refresh('playlist')),
      openFirstAlbum: () => {
        const a = lib.albums[0]
        if (a) ui.navigate({ name: 'detail', detail: { type: 'album', key: a.key, name: a.name } })
      },
      addSongsToPlaylist: (idx: number) => {
        const pl = lib.playlists[idx]
        if (!pl) return
        void api.addPlaylistTracks(pl.id, lib.songs.slice(0, 5).map((s) => s.id)).then(() =>
          lib.refresh('playlist')
        )
      },
      startOnboarding: () => {
        ui.finishOnboarding(true)
      },
      beginScan: () => {
        // Starts scanning while the onboarding card stays visible (scanning step)
        void api.startScan()
      },
      skipOnboarding: () => {
        ui.finishOnboarding()
      },
      showDrop: (v: boolean) => ui.setDropActive(v),
      ctx: () => {
        ui.openCtxMenu(420, 320, [
          { label: 'Play', icon: 'play', onClick: () => undefined },
          { label: 'Add to playlist', icon: 'plus', sub: [{ label: 'My Playlist', onClick: () => undefined }] }
        ])
      },
      editFirst: () => {
        if (lib.songs[0]) ui.setEditSong(lib.songs[0])
      },
      closeEditor: () => ui.setEditSong(null),
      closeMenu: () => ui.closeCtxMenu(),
      // --- v1.2.0 bulk selection + manual add/delete ---
      selToggleAt: (i: number, mods?: string) => {
        const s = lib.songs[i]
        if (!s) return
        const w = window as unknown as {
          __ppSelApi?: { toggle: (s: Song, mods?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void; clear: () => void; selectAll: () => void }
        }
        w.__ppSelApi?.toggle(s, {
          ctrlKey: !!mods?.includes('ctrl'),
          metaKey: !!mods?.includes('meta'),
          shiftKey: !!mods?.includes('shift')
        })
      },
      selCount: () =>
        (window as unknown as { __ppSelCount?: number }).__ppSelCount ?? -1,
      selClear: () =>
        (window as unknown as { __ppSelApi?: { clear: () => void } }).__ppSelApi?.clear(),
      bulkBarVisible: () => !!document.querySelector('[data-e2e="bulk-bar"]'),
      addMusicBtnVisible: () => !!document.querySelector('[data-e2e="add-music"]'),
      // Runs the same import pipeline the "Add files…" button uses (file dialog can't be automated)
      importTestFile: (p: string) => api.importPaths([p]).then((r) => ({ imported: r.imported, duplicates: r.duplicates, errors: r.errors })),
      state: () => ({
        view: ui.view.name,
        detail: ui.view.name === 'detail' ? ui.view.detail : null,
        libraryTab: ui.libraryTab,
        theme: ui.themeMode,
        effectiveTheme: ui.effectiveTheme,
        nowPlaying: ui.nowPlaying,
        profileOpen: ui.profileOpen,
        queueOpen: ui.queueOpen,
        dropActive: ui.dropActive,
        songCount: lib.songs.length,
        albumCount: lib.albums.length,
        artistCount: lib.artists.length,
        playlistCount: lib.playlists.length,
        favorites: lib.songs.filter((s) => s.favorite).length,
        playing: player.isPlaying,
        currentTitle: player.current?.title ?? null,
        queueLen: player.queue.length,
        position: Math.round(pos.position * 10) / 10,
        duration: Math.round(pos.duration * 10) / 10,
        shuffle: player.shuffle,
        repeat: player.repeat,
        volume: player.volume,
        firstAlbum: lib.albums[0]?.name ?? null,
        firstArtist: lib.artists[0]?.name ?? null,
        onboardingDone: ui.onboardingDone
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui, player, lib, pos])

  return null
}
