import { clsx } from 'clsx'

type Variant =
  | 'ok' | 'low' | 'critical'
  | 'draft' | 'confirmed' | 'invoiced' | 'cancelled'
  | 'admin' | 'operador' | 'viewer'

const variantClasses: Record<Variant, string> = {
  ok:        'bg-emerald-400/15 text-emerald-300 border border-emerald-400/25',
  low:       'bg-amber-400/15   text-amber-300   border border-amber-400/25',
  critical:  'bg-rose-400/15    text-rose-300    border border-rose-400/25',
  draft:     'bg-slate-400/15   text-slate-300   border border-slate-400/25',
  confirmed: 'bg-blue-400/15    text-blue-300    border border-blue-400/25',
  invoiced:  'bg-emerald-400/15 text-emerald-300 border border-emerald-400/25',
  cancelled: 'bg-rose-400/15    text-rose-300    border border-rose-400/25',
  admin:     'bg-violet-500/20  text-violet-300  border border-violet-500/30',
  operador:  'bg-blue-500/20    text-blue-300    border border-blue-500/30',
  viewer:    'bg-slate-500/20   text-slate-300   border border-slate-500/30',
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
