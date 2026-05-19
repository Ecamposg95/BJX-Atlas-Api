import { type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { BottomActionBar, type BottomAction } from './BottomActionBar'

interface Props {
  title: string
  subtitle?: string
  onBack?: () => void
  headerAction?: ReactNode
  bottomActions?: BottomAction[]
  children: ReactNode
  className?: string
}

/**
 * Shell mobile-first: header sticky h-14, contenido scrollable con pb para no
 * tapar la BottomActionBar, opcional bottom bar sticky.
 *
 * En desktop (lg) se expande pero mantiene la estructura — la app ya tiene
 * Layout con sidebar, así que esto vive DENTRO del Layout y solo añade el
 * chrome mobile-friendly.
 */
export function MobileShell({
  title,
  subtitle,
  onBack,
  headerAction,
  bottomActions,
  children,
  className,
}: Props) {
  const hasBottom = bottomActions && bottomActions.length > 0
  return (
    <div className={clsx('mobile-shell relative min-h-[calc(100vh-4rem)]', className)}>
      {/* Sticky header */}
      <header
        className="mobile-shell__header sticky top-0 z-20 h-14 flex items-center gap-2 px-3 border-b backdrop-blur-md"
        style={{
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          borderColor: 'var(--border)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-12 min-w-12 -ml-2 inline-flex items-center justify-center rounded-full text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Volver"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="w-2" />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold leading-tight truncate" style={{ color: 'var(--text)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-[0.7rem] uppercase font-bold tracking-wider truncate" style={{ color: 'var(--text-faint)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
      </header>

      {/* Scrollable content */}
      <main className={clsx('mobile-shell__main px-4 pt-4', hasBottom ? 'pb-24' : 'pb-6')}>
        {children}
      </main>

      {hasBottom && <BottomActionBar actions={bottomActions} />}
    </div>
  )
}
