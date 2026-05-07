import { type ReactNode } from 'react'
import { clsx } from 'clsx'

export interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}

/**
 * Header premium estándar para páginas no-home.
 * Sigue el lenguaje del executive-hero pero compacto, alineado
 * con executive-panel. Usar siempre dentro de PageShell.
 */
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={clsx('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p
            className="text-xs font-extrabold uppercase"
            style={{
              color: 'var(--text-faint)',
              letterSpacing: '0.18em',
            }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="font-extrabold leading-tight"
          style={{
            color: 'var(--text)',
            fontSize: 'clamp(1.5rem, 2.6vw, 2.1rem)',
            marginTop: eyebrow ? '0.4rem' : 0,
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="mt-1.5 text-sm"
            style={{ color: 'var(--text-muted)', maxWidth: '70ch', lineHeight: 1.6 }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
