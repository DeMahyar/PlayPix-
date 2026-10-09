// PlayPix renderer — first launch experience
import { useEffect, useRef, useState } from 'react'
import type { ScanProgress } from '../../../shared/types'
import { api } from '../lib/api'
import { useUI } from '../state/ui'
import { Logo } from '../components/Logo'
import { Icon } from '../components/Icon'

type Step = 'welcome' | 'scanning' | 'ready' | 'empty'

export function Onboarding() {
  const ui = useUI()
  const [step, setStep] = useState<Step>('welcome')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    void api.getScanState().then((s) => {
      if (s.phase === 'discovering' || s.phase === 'importing' || s.phase === 'finalizing') {
        startedRef.current = true
        setStep('scanning')
        setProgress(s)
      }
    })
    const off = api.onScanEvent((p) => {
      setProgress(p)
      if (p.phase === 'done' || p.phase === 'cancelled') {
        setStep(p.imported > 0 ? 'ready' : 'empty')
      } else if (p.phase === 'error') {
        setStep('empty')
      }
    })
    return off
  }, [])

  const start = (): void => {
    if (startedRef.current) return
    startedRef.current = true
    setStep('scanning')
    void api.startScan()
  }

  const finish = (): void => {
    ui.finishOnboarding()
    ui.navigate({ name: 'home' })
  }

  return (
    <div className="onboard">
      <div className="onboard-card glass-strong">
        {step === 'welcome' && (
          <>
            <div className="logo-big">
              <Logo size={84} />
            </div>
            <h1>Welcome to PlayPix</h1>
            <p className="sub">
              Your music, beautifully organized. PlayPix is about to look through this PC for songs and build
              your library automatically.
            </p>
            <button className="btn primary" style={{ height: 46, padding: '0 30px', fontSize: 14.5 }} onClick={start}>
              Get started
            </button>
          </>
        )}

        {step === 'scanning' && (
          <>
            <div className="logo-big">
              <Logo size={64} />
            </div>
            <h1>Finding your music</h1>
            <p className="sub">Searching the usual places — this can take a moment.</p>
            <div className="onboard-stats">
              <div className="stat">
                <div className="n">{progress?.found ?? 0}</div>
                <div className="l">Found</div>
              </div>
              <div className="stat">
                <div className="n">{progress?.imported ?? 0}</div>
                <div className="l">Added</div>
              </div>
              <div className="stat">
                <div className="n">{progress?.duplicates ?? 0}</div>
                <div className="l">Duplicates</div>
              </div>
            </div>
            <div className="liquid-progress">
              <div className="fill" style={{ width: progress && progress.total > 0 ? `${Math.max(3, (progress.processed / progress.total) * 100)}%` : '10%' }} />
            </div>
            <div className="current-file">{progress?.current ?? ''}</div>
            <button className="onboard-skip" onClick={finish}>
              Continue to PlayPix while scanning
            </button>
          </>
        )}

        {step === 'ready' && (
          <>
            <div className="logo-big">
              <Logo size={84} />
            </div>
            <h1>Your library is ready</h1>
            <p className="sub">
              {progress?.imported ?? 0} songs{progress && progress.duplicates > 0 ? ` · ${progress.duplicates} duplicates merged` : ''} — everything is organized and waiting for you.
            </p>
            <button className="btn primary" style={{ height: 46, padding: '0 30px', fontSize: 14.5 }} onClick={finish}>
              Go to Home
            </button>
          </>
        )}

        {step === 'empty' && (
          <>
            <div className="logo-big">
              <Logo size={84} />
            </div>
            <h1>Your library is empty</h1>
            <p className="sub">
              PlayPix didn't find any music yet. Point it at your music folders, or drag files in any time.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn primary" onClick={() => void api.startScan()}>
                <Icon name="scan" size={16} />
                Scan again
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const p = await api.pickFolder()
                  if (p) {
                    void api.importPaths([p])
                  }
                }}
              >
                <Icon name="folder" size={16} />
                Import folder
              </button>
            </div>
            <button className="onboard-skip" onClick={finish}>
              Skip for now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
