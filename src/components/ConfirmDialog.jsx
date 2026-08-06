import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CircleHelp, RotateCcw, Trash2, X } from 'lucide-react'
import { useT } from '../hooks/useT'
import './ConfirmDialog.css'

const ConfirmDialogContext = createContext(null)

const ICONS = {
  default: CircleHelp,
  restart: RotateCcw,
  warning: AlertTriangle,
  danger: Trash2
}

function ConfirmDialog({ request, onResolve }) {
  const t = useT()
  const panelRef = useRef(null)
  const confirmRef = useRef(null)
  const titleId = useId()
  const messageId = useId()
  const options = request?.options || {}
  const {
    title = t('common.confirm'),
    message = '',
    confirmText = t('common.confirm'),
    cancelText = t('common.cancel'),
    tone = 'primary',
    icon = tone === 'danger' ? 'danger' : 'default'
  } = options
  const Icon = ICONS[icon] || ICONS.default

  useEffect(() => {
    if (!request) return undefined

    const previouslyFocused = document.activeElement
    const focusTimer = window.setTimeout(() => confirmRef.current?.focus(), 30)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onResolve(false)
        return
      }

      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [request, onResolve])

  if (!request) return null

  return createPortal(
    <div
      className="confirm-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onResolve(false)
      }}
    >
      <section
        ref={panelRef}
        className={`confirm-dialog confirm-dialog--${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <div className="confirm-dialog__scanline" aria-hidden="true" />
        <button
          type="button"
          className="confirm-dialog__close"
          onClick={() => onResolve(false)}
          aria-label={t('common.close')}
        >
          <X size={17} />
        </button>

        <div className="confirm-dialog__content">
          <span className="confirm-dialog__icon" aria-hidden="true">
            <Icon size={23} strokeWidth={1.9} />
          </span>
          <div className="confirm-dialog__copy">
            <h2 id={titleId}>{title}</h2>
            <p id={messageId}>{message}</p>
          </div>
        </div>

        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            onClick={() => onResolve(false)}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="confirm-dialog__button confirm-dialog__button--confirm"
            onClick={() => onResolve(true)}
          >
            <Icon size={16} aria-hidden="true" />
            {confirmText}
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}

export function ConfirmDialogProvider({ children }) {
  const [request, setRequest] = useState(null)
  const pendingResolveRef = useRef(null)

  const confirm = useCallback((options) => new Promise((resolve) => {
    if (pendingResolveRef.current) pendingResolveRef.current(false)
    pendingResolveRef.current = resolve
    setRequest({ options: typeof options === 'string' ? { message: options } : options })
  }), [])

  const handleResolve = useCallback((result) => {
    const resolve = pendingResolveRef.current
    pendingResolveRef.current = null
    setRequest(null)
    resolve?.(result)
  }, [])

  useEffect(() => () => pendingResolveRef.current?.(false), [])

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <ConfirmDialog request={request} onResolve={handleResolve} />
    </ConfirmDialogContext.Provider>
  )
}

export function useConfirmDialog() {
  const confirm = useContext(ConfirmDialogContext)
  if (!confirm) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider')
  return confirm
}

export default ConfirmDialog
