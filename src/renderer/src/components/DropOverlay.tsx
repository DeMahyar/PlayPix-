// PlayPix renderer — drag & drop overlay + window-level drag detection
import { useEffect } from 'react'
import { useUI } from '../state/ui'
import { api } from '../lib/api'

/** Global drag & drop importer: drag music files or folders anywhere in the window. */
export function useGlobalDrop(): void {
  const ui = useUI()

  useEffect(() => {
    let depth = 0

    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth++
      e.preventDefault()
      ui.setDropActive(true)
    }
    const onOver = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      depth--
      if (depth <= 0) {
        depth = 0
        ui.setDropActive(false)
      }
    }
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      ui.setDropActive(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files
        .map((f) => api.pathForFile(f))
        .filter((p): p is string => !!p)
      if (!paths.length) return
      void api.importPaths(paths).then(() => {
        ui.toast(`Importing ${paths.length} item${paths.length > 1 ? 's' : ''}…`)
      })
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [ui])
}

export function DropOverlay() {
  const ui = useUI()
  if (!ui.dropActive) return null
  return (
    <div className="drop-overlay">
      <div className="drop-panel">
        <div className="drop-ripple" />
        <svg width="54" height="54" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path
            d="M24 6C24 6 12 20 12 27.5c0 6.9 5.4 11.5 12 11.5s12-4.6 12-11.5C36 20 24 6 24 6z"
            fill="rgba(255,255,255,0.9)"
          />
        </svg>
        <div className="big">Drop to add music</div>
        <div className="small">Files or folders — PlayPix will take it from here</div>
      </div>
    </div>
  )
}

/** Small floating chip shown while a scan runs in the background. */
export function ScanChip({ progress, onCancel }: { progress: import('../../../shared/types').ScanProgress; onCancel: () => void }) {
  const running =
    progress.phase === 'discovering' || progress.phase === 'importing' || progress.phase === 'finalizing'
  if (!running) return null
  const pct =
    progress.phase === 'discovering'
      ? 0
      : progress.total > 0
        ? Math.round((progress.processed / progress.total) * 100)
        : progress.phase === 'finalizing'
          ? 100
          : 0
  return (
    <div className="scan-chip glass-strong" role="status">
      <div className="info">
        <div className="t">
          {progress.phase === 'discovering'
            ? `Looking for music… ${progress.found} found`
            : progress.phase === 'finalizing'
              ? 'Finishing up…'
              : `Scanning your music… ${progress.processed}/${progress.total}`}
        </div>
        <div className="liquid-progress">
          <div
            className="fill"
            style={{ width: `${Math.max(4, pct)}%` }}
          />
        </div>
      </div>
      <button className="icon-btn" aria-label="Cancel scan" onClick={onCancel}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <circle cx="13" cy="13" r="10" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <path d="M9.5 9.5l7 7M16.5 9.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
