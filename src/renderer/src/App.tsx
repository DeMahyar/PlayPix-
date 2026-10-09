// PlayPix renderer — app shell: pages, overlays, keyboard shortcuts, scanning UX
import { useEffect, useState } from 'react'
import { api } from './lib/api'
import { UIProvider, useUI } from './state/ui'
import { LibraryProvider } from './state/library'
import { PlayerProvider, usePlayer, usePlayerPosition } from './state/player'
import { TitleBar } from './components/TitleBar'
import { NavBar } from './components/NavBar'
import { MiniPlayer } from './components/MiniPlayer'
import { NowPlaying } from './components/NowPlaying'
import { ProfileSheet } from './components/ProfileSheet'
import { ContextMenuHost } from './components/ContextMenuHost'
import { DialogHost, Toasts } from './components/DialogHost'
import { MetadataEditor } from './components/MetadataEditor'
import { DropOverlay, ScanChip, useGlobalDrop } from './components/DropOverlay'
import { Onboarding } from './pages/Onboarding'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { StatisticsPage } from './pages/StatisticsPage'
import { DetailPage } from './pages/DetailPage'
import { SearchPage } from './pages/SearchPage'
import { E2EBridge } from './e2e'
import type { ScanProgress } from '../../shared/types'

function Pages() {
  const ui = useUI()
  switch (ui.view.name) {
    case 'home':
      return <HomePage />
    case 'library':
      return <LibraryPage />
    case 'stats':
      return <StatisticsPage />
    case 'search':
      return <SearchPage />
    case 'detail':
      return <DetailPage />
    default:
      return <HomePage />
  }
}

function Shortcuts() {
  const ui = useUI()
  const player = usePlayer()
  const pos = usePlayerPosition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      // Global shortcuts
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault()
        ui.navigate({ name: 'home' })
        return
      }
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault()
        ui.navigate({ name: 'library' })
        return
      }
      if (e.ctrlKey && e.key === '3') {
        e.preventDefault()
        ui.navigate({ name: 'stats' })
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        api.openMiniPlayer()
        return
      }
      if (typing) return

      // Next / Prev / Volume (§29) — never while typing
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault()
        player.next()
        return
      }
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        player.prev()
        return
      }
      if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault()
        const step = e.key === 'ArrowUp' ? 0.05 : -0.05
        player.setVolume(Math.max(0, Math.min(1, player.volume + step)))
        return
      }

      if (e.code === 'Space') {
        if (player.queue.length) {
          e.preventDefault()
          player.togglePlay()
        }
        return
      }
      // Seek with arrows when Now Playing is open
      if (ui.nowPlaying) {
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          player.seek(Math.min(pos.duration || 1e9, pos.position + 10))
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault()
          player.seek(Math.max(0, pos.position - 10))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui, player, pos])

  return null
}

function ScanWatcher({ onProgress }: { onProgress: (p: ScanProgress) => void }) {
  useEffect(() => {
    void api.getScanState().then(onProgress)
    return api.onScanEvent(onProgress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function Shell() {
  const ui = useUI()
  useGlobalDrop()
  const [scan, setScan] = useState<ScanProgress | null>(null)

  const scanRunning =
    scan && (scan.phase === 'discovering' || scan.phase === 'importing' || scan.phase === 'finalizing')
  const showOnboarding = ui.onboardingDone === false || ui.onboardingDone === undefined

  return (
    <>
      <ScanWatcher onProgress={setScan} />
      <TitleBar />

      <main className="viewport">
        <div className="page-holder" key={ui.view.name + (ui.view.name === 'detail' ? JSON.stringify(ui.view.detail) : '')}>
          <Pages />
        </div>

        {ui.nowPlaying && <NowPlaying />}
        {ui.profileOpen && <ProfileSheet />}

        {showOnboarding && !ui.nowPlaying && !ui.profileOpen && <Onboarding />}

        {scanRunning && scan && (
          <ScanChip
            progress={scan}
            onCancel={() => {
              void api.cancelScan().then(setScan)
            }}
          />
        )}
      </main>

      <MiniPlayer />
      <NavBar />

      <ContextMenuHost />
      <DialogHost />
      <MetadataEditor />
      <Toasts />
      <DropOverlay />
      <Shortcuts />
      {api.e2eEnabled && <E2EBridge />}
    </>
  )
}

export default function App() {
  return (
    <UIProvider>
      <LibraryProvider>
        <PlayerProvider>
          <div id="app">
            <Shell />
          </div>
        </PlayerProvider>
      </LibraryProvider>
    </UIProvider>
  )
}
