import { type CSSProperties } from 'react'
import { CheckCircle2, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react'
import { clsx } from 'clsx'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  variant: ToastVariant
  message: string
  description?: string
  duration: number
}

const VARIANT_ICON: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
}

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: 'var(--success)',
  error: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--primary)',
}

interface ToastProps {
  toast: ToastItem
  onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const Icon = VARIANT_ICON[toast.variant]
  const accent = VARIANT_ACCENT[toast.variant]

  const containerStyle: CSSProperties = {
    minWidth: '280px',
    maxWidth: '380px',
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${accent}`,
    borderRadius: 'var(--radius-xl)',
    background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
    boxShadow: 'var(--shadow-lg)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    padding: '0.85rem 1rem',
    color: 'var(--text)',
    animation: 'toastSlideIn var(--duration-base) var(--ease-premium)',
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => onDismiss(toast.id)}
      className={clsx('flex cursor-pointer items-start gap-3')}
      style={containerStyle}
    >
      <span
        className="mt-0.5 inline-flex items-center justify-center"
        style={{ color: accent, flexShrink: 0 }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-bold leading-snug"
          style={{ color: 'var(--text)', letterSpacing: '0.01em' }}
        >
          {toast.message}
        </p>
        {toast.description && (
          <p
            className="mt-0.5 text-xs leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label="Cerrar notificación"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(toast.id)
        }}
        className="flex-shrink-0 rounded-md p-0.5 transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
