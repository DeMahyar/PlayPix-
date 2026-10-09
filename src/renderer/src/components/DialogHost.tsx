// PlayPix renderer — dialog host (confirm + prompt) and toasts + empty states
import { useEffect, useRef, useState } from 'react'
import { useUI } from '../state/ui'
import { Icon } from './Icon'

export function DialogHost() {
  const ui = useUI()

  const closeConfirm = (ok: boolean): void => {
    if (ui.confirmState) {
      ui.confirmState.resolve(ok)
    }
  }
  const closePrompt = (v: string | null): void => {
    if (ui.promptState) {
      ui.promptState.resolve(v)
    }
  }

  return (
    <>
      {ui.confirmState && (
        <div className="modal-backdrop" onClick={() => closeConfirm(false)}>
          <div className="modal glass-strong" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label={ui.confirmState.title}>
            <h3>{ui.confirmState.title}</h3>
            {ui.confirmState.body && <div className="modal-body">{ui.confirmState.body}</div>}
            <div className="modal-actions">
              <button className="btn subtle" onClick={() => closeConfirm(false)}>
                Cancel
              </button>
              <button
                className={`btn ${ui.confirmState.danger ? 'danger' : 'primary'}`}
                style={ui.confirmState.danger ? { border: '1px solid var(--glass-border)' } : undefined}
                onClick={() => closeConfirm(true)}
              >
                {ui.confirmState.okLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {ui.promptState && (
        <PromptModal
          title={ui.promptState.title}
          value={ui.promptState.value}
          okLabel={ui.promptState.okLabel}
          onSubmit={(v) => closePrompt(v)}
          onCancel={() => closePrompt(null)}
        />
      )}
    </>
  )
}

function PromptModal({
  title,
  value,
  okLabel,
  onSubmit,
  onCancel
}: {
  title: string
  value: string
  okLabel?: string
  onSubmit: (v: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus()
      ref.current?.select()
    }, 80)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal glass-strong" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <div style={{ marginTop: 16 }}>
          <input
            ref={ref}
            className="field"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && val.trim()) onSubmit(val.trim())
            }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn subtle" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" disabled={!val.trim()} onClick={() => val.trim() && onSubmit(val.trim())}>
            {okLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Toasts() {
  const ui = useUI()
  return (
    <div className="toasts" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          <span className="ico">
            <Icon name={t.kind === 'error' ? 'close' : 'check'} size={16} />
          </span>
          {t.msg}
          <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Dismiss" onClick={() => ui.dismissToast(t.id)}>
            <Icon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  actions
}: {
  icon: string
  title: string
  body: string
  actions?: React.ReactNode
}) {
  return (
    <div className="empty">
      <div className="orb">
        <Icon name={icon} size={38} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}
