import { clsx } from 'clsx'
import { type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const variantClasses: Record<Variant, string> = {
  primary:   'text-white',
  secondary: 'border text-sm font-semibold',
  danger:    'text-white',
  ghost:     'font-semibold',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const baseStyle: React.CSSProperties = {
    borderRadius: '10px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    transition: 'all 0.15s ease',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }

  const variantStyle: Record<Variant, React.CSSProperties> = {
    primary: {
      background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
      boxShadow: '0 4px 14px rgba(139,92,246,0.25)',
    },
    secondary: {
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      color: 'var(--text-muted)',
    },
    danger: {
      background: 'rgba(225,29,72,0.15)',
      border: '1px solid rgba(244,63,94,0.4)',
      color: '#fda4af',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-muted)',
    },
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{ ...baseStyle, ...variantStyle[variant], ...style }}
      className={clsx(
        'inline-flex items-center justify-center gap-2 focus:outline-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
