import { type ReactNode } from 'react'
import { clsx } from 'clsx'

export interface PageShellProps {
  children: ReactNode
  className?: string
  /** Por defecto el shell aplica max-width 1280px. Páginas full-bleed (kanban) pasan `wide`. */
  wide?: boolean
  /** Para vistas compactas mobile-first (mecánico). Default 1280px en wide=false. */
  narrow?: boolean
}

/**
 * Container premium estándar — match con `executive-home__container`.
 * Centra el contenido, ancho responsivo, espaciado vertical consistente.
 */
export function PageShell({ children, className, wide, narrow }: PageShellProps) {
  return (
    <div
      className={clsx('mx-auto flex flex-col gap-6 px-4 py-6 sm:px-6', className)}
      style={{
        width: '100%',
        maxWidth: narrow ? '720px' : wide ? '100%' : '1280px',
      }}
    >
      {children}
    </div>
  )
}
