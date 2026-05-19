import { Activity, DollarSign, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import type { BranchMetric } from '../../api/types'

interface ModeToggleProps {
  value: BranchMetric
  onChange: (m: BranchMetric) => void
}

const MODES: Array<{ id: BranchMetric; label: string; icon: typeof Activity }> = [
  { id: 'operation', label: 'Operación', icon: Activity },
  { id: 'revenue', label: 'Ingresos', icon: DollarSign },
  { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
]

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Modo de visualización"
      style={{
        display: 'inline-flex',
        padding: 4,
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'color-mix(in srgb, var(--surface-2) 70%, transparent)',
        gap: 2,
      }}
    >
      {MODES.map(({ id, label, icon: Icon }) => {
        const active = id === value
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={clsx('inline-flex items-center gap-1.5 transition-all focus:outline-none')}
            style={{
              padding: '0.45rem 0.9rem',
              minHeight: 36,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.02em',
              cursor: 'pointer',
              background: active
                ? 'linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%)'
                : 'transparent',
              color: active ? '#1E293B' : 'var(--text-muted)',
              boxShadow: active ? '0 2px 8px rgba(245, 158, 11, 0.35)' : 'none',
              border: 'none',
            }}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
