import { type ReactNode } from 'react'
import { clsx } from 'clsx'

export interface BottomAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  loading?: boolean
  icon?: ReactNode
  type?: 'button' | 'submit'
}

interface Props {
  actions: BottomAction[]
  className?: string
}

/**
 * Barra inferior sticky con max 3 acciones. Primary CTA va al final (yellow).
 * Touch targets ≥48px y respeta `env(safe-area-inset-bottom)`.
 */
export function BottomActionBar({ actions, className }: Props) {
  const limited = actions.slice(0, 3)
  return (
    <div
      className={clsx(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-white dark:bg-slate-900',
        'flex items-stretch gap-2 px-3 pt-2',
        'shadow-[0_-4px_14px_rgba(15,23,42,0.08)]',
        className,
      )}
      style={{
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        borderColor: 'var(--border)',
      }}
      role="toolbar"
      aria-label="Acciones de pantalla"
    >
      {limited.map((a, idx) => {
        const isPrimary = a.variant === 'primary' || (a.variant === undefined && idx === limited.length - 1)
        const isDanger = a.variant === 'danger'
        return (
          <button
            key={`${a.label}-${idx}`}
            type={a.type ?? 'button'}
            onClick={a.onClick}
            disabled={a.disabled || a.loading}
            className={clsx(
              'flex-1 min-h-12 rounded-xl font-bold text-sm tracking-wide',
              'inline-flex items-center justify-center gap-2',
              'transition-all duration-150 active:scale-[0.98]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isPrimary && 'bg-amber-400 text-slate-900 shadow-lg shadow-amber-400/30 hover:bg-amber-300',
              isDanger && 'bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-500',
              !isPrimary && !isDanger && 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
            )}
          >
            {a.loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              a.icon
            )}
            <span className="truncate">{a.label}</span>
          </button>
        )
      })}
    </div>
  )
}
