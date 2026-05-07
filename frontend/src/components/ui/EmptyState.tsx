import { type ReactNode } from 'react'
import { clsx } from 'clsx'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        'px-6 py-12',
        className
      )}
    >
      {icon && (
        <div
          className="mb-4 inline-flex items-center justify-center"
          style={{
            width: '4rem',
            height: '4rem',
            borderRadius: '999px',
            background: 'color-mix(in srgb, var(--primary) 10%, transparent)',
            color: 'var(--text-muted)',
            opacity: 0.85,
          }}
        >
          {icon}
        </div>
      )}
      <h3
        className="text-base font-bold"
        style={{ color: 'var(--text)', letterSpacing: '0.01em' }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="mt-1.5 max-w-md text-sm leading-relaxed"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
