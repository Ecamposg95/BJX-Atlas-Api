import { clsx } from 'clsx'

type Variant = 'ok' | 'low' | 'critical' | 'draft' | 'confirmed' | 'invoiced' | 'cancelled' | 'admin' | 'operador' | 'viewer'

const variantClasses: Record<Variant, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  low: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-800',
  invoiced: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-700',
  admin: 'bg-purple-100 text-purple-800',
  operador: 'bg-blue-100 text-blue-800',
  viewer: 'bg-gray-100 text-gray-700',
}

export function Badge({ variant, children }: { variant: Variant; children: React.ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variantClasses[variant])}>
      {children}
    </span>
  )
}

export function MarginBadge({ status }: { status: 'ok' | 'low' | 'critical' }) {
  const labels = { ok: '✅ OK', low: '⚠️ Bajo', critical: '🔴 Crítico' }
  return <Badge variant={status}>{labels[status]}</Badge>
}
