import { clsx } from 'clsx'

type Variant =
  | 'ok' | 'low' | 'critical'
  | 'draft' | 'confirmed' | 'invoiced' | 'cancelled'
  | 'admin' | 'operador' | 'viewer'

const variantClasses: Record<Variant, string> = {
  ok:        'badge-chip badge-chip--ok',
  low:       'badge-chip badge-chip--low',
  critical:  'badge-chip badge-chip--critical',
  draft:     'badge-chip badge-chip--draft',
  confirmed: 'badge-chip badge-chip--confirmed',
  invoiced:  'badge-chip badge-chip--ok',
  cancelled: 'badge-chip badge-chip--critical',
  admin:     'badge-chip badge-chip--admin',
  operador:  'badge-chip badge-chip--operador',
  viewer:    'badge-chip badge-chip--viewer',
}

export function Badge({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        variantClasses[variant]
      )}
    >
      {children}
    </span>
  )
}

export function MarginBadge({ status }: { status: 'ok' | 'low' | 'critical' }) {
  const labels = { ok: 'OK', low: 'Bajo', critical: 'Crítico' }
  return <Badge variant={status}>{labels[status]}</Badge>
}
