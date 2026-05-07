import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import {
  Wrench, Clock, AlertTriangle, ClipboardList, TrendingUp, Truck, Package,
} from 'lucide-react'
import api from '../api/client'
import { listParts, listMovements } from '../api'
import type { Part, InventoryMovement, Paginated } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { fmtDate, fmtNumber } from '../utils/format'

// ── Local types ──────────────────────────────────────────────────────────────
interface OpWorkOrder {
  id: string
  order_number: string
  status: 'received' | 'in_progress' | 'waiting_parts' | 'completed' | 'delivered'
  vehicle_plates?: string
  assigned_mechanic_id: string | null
  mechanic_email?: string
  created_at: string
  completed_at: string | null
}

interface MechanicStats {
  mechanic_id: string
  mechanic_email: string
  completed_count: number
  avg_duration_min: number
}

const fetchWorkOrders = () =>
  api.get<{ items: OpWorkOrder[] }>('/work-orders').then(r => r.data.items ?? []).catch(() => [])

// Best-effort: try to get per-mechanic stats, otherwise we compute client-side
const fetchMechanicStats = () =>
  api.get<MechanicStats[]>('/workshop/stats/mechanics-today')
    .then(r => r.data)
    .catch(() => [] as MechanicStats[])

const STATUS_LABELS: Record<OpWorkOrder['status'], string> = {
  received: 'Recibida',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando piezas',
  completed: 'Completada',
  delivered: 'Entregada',
}

const STATUS_COLORS: Record<OpWorkOrder['status'], string> = {
  received: '#6b7280',
  in_progress: '#4f8df7',
  waiting_parts: '#f97316',
  completed: '#10b981',
  delivered: '#a78bfa',
}

export function OperationalDashboardPage() {
  const wosQuery = useQuery({
    queryKey: ['op-dashboard', 'work-orders'],
    queryFn: fetchWorkOrders,
    refetchInterval: 60_000,
  })

  const mechStatsQuery = useQuery({
    queryKey: ['op-dashboard', 'mechanic-stats'],
    queryFn: fetchMechanicStats,
    refetchInterval: 60_000,
  })

  const lowStockQuery = useQuery({
    queryKey: ['op-dashboard', 'low-stock'],
    queryFn: () => listParts({ only_low_stock: true, page: 1, page_size: 20 }),
    refetchInterval: 60_000,
  })

  const movementsQuery = useQuery<Paginated<InventoryMovement>>({
    queryKey: ['op-dashboard', 'movements-today'],
    queryFn: () => listMovements({ page: 1, page_size: 20 }),
    refetchInterval: 60_000,
  })

  const orders = wosQuery.data ?? []

  const kpis = useMemo(() => {
    const active = orders.filter(o => o.status !== 'delivered')
    const completedToday = orders.filter(o => o.completed_at && isToday(o.completed_at))
    const avgMin = active.length
      ? active.reduce((acc, o) => acc + (Date.now() - new Date(o.created_at).getTime()), 0) / active.length / 60000
      : 0
    const inSla = active.filter(o => (Date.now() - new Date(o.created_at).getTime()) / 3600000 < 24).length
    const slaPct = active.length ? Math.round((inSla / active.length) * 100) : 100
    const productivity = completedToday.length
    return {
      autosEnTaller: active.length,
      slaActual: slaPct,
      tiempoPromedio: Math.round(avgMin),
      osAbiertas: active.length,
      productividad: productivity,
    }
  }, [orders])

  const distribution = useMemo(() => {
    const map: Record<string, number> = {}
    orders.forEach((o) => { map[o.status] = (map[o.status] ?? 0) + 1 })
    return Object.entries(map).map(([k, v]) => ({
      name: STATUS_LABELS[k as OpWorkOrder['status']] ?? k,
      value: v,
      color: STATUS_COLORS[k as OpWorkOrder['status']] ?? '#6b7280',
    }))
  }, [orders])

  const fallbackMechStats = useMemo<MechanicStats[]>(() => {
    if ((mechStatsQuery.data ?? []).length > 0) return mechStatsQuery.data!
    const map = new Map<string, MechanicStats>()
    orders.forEach((o) => {
      if (!o.assigned_mechanic_id || !o.completed_at || !isToday(o.completed_at)) return
      const key = o.assigned_mechanic_id
      const existing = map.get(key) ?? {
        mechanic_id: key, mechanic_email: o.mechanic_email ?? key.slice(0, 8),
        completed_count: 0, avg_duration_min: 0,
      }
      existing.completed_count += 1
      const duration = (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime()) / 60000
      existing.avg_duration_min =
        (existing.avg_duration_min * (existing.completed_count - 1) + duration) / existing.completed_count
      map.set(key, existing)
    })
    return Array.from(map.values()).sort((a, b) => b.completed_count - a.completed_count).slice(0, 8)
  }, [orders, mechStatsQuery.data])

  const lowStockParts: Part[] = lowStockQuery.data?.items ?? []
  const movements: InventoryMovement[] = (movementsQuery.data?.items ?? [])
    .filter((m) => isToday(m.created_at))

  return (
    <PageShell>
      <PageHeader
        eyebrow="Operación"
        title="Tablero operativo"
        description="KPIs en vivo de la sucursal · auto-refresco cada 60s"
      />

      <div className="executive-kpi-rail executive-kpi-rail--5">
        <KpiTile icon={Wrench} label="Autos en taller" value={kpis.autosEnTaller} loading={wosQuery.isLoading} />
        <KpiTile icon={TrendingUp} label="SLA actual" value={`${kpis.slaActual}%`} tone={kpis.slaActual >= 80 ? 'good' : 'warn'} loading={wosQuery.isLoading} />
        <KpiTile icon={Clock} label="Tiempo prom." value={`${kpis.tiempoPromedio} min`} loading={wosQuery.isLoading} />
        <KpiTile icon={ClipboardList} label="OS abiertas" value={kpis.osAbiertas} loading={wosQuery.isLoading} />
        <KpiTile icon={TrendingUp} label="Productividad hoy" value={kpis.productividad} loading={wosQuery.isLoading} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="executive-panel">
          <header className="executive-panel__header">
            <p className="executive-panel__eyebrow">Distribución</p>
            <h3 className="executive-panel__title">OS por status</h3>
          </header>
          {wosQuery.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : distribution.length === 0 ? (
            <EmptyState icon={<Wrench size={28} />} title="Sin órdenes" description="Aún no hay datos." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={95}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="executive-panel">
          <header className="executive-panel__header">
            <p className="executive-panel__eyebrow">Top mecánicos del día</p>
            <h3 className="executive-panel__title">Productividad</h3>
          </header>
          {fallbackMechStats.length === 0 ? (
            <EmptyState icon={<Wrench size={28} />} title="Sin datos" description="Aún no hay servicios completados hoy." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Mecánico</th>
                  <th className="text-right">Servicios</th>
                  <th className="text-right">Tiempo prom.</th>
                </tr>
              </thead>
              <tbody>
                {fallbackMechStats.map((m) => (
                  <tr key={m.mechanic_id}>
                    <td style={{ color: 'var(--text)' }}>{m.mechanic_email}</td>
                    <td className="text-right tabular-nums font-bold">{m.completed_count}</td>
                    <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {Math.round(m.avg_duration_min)} min
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="executive-panel">
          <header className="executive-panel__header flex items-center justify-between">
            <div>
              <p className="executive-panel__eyebrow">Alertas</p>
              <h3 className="executive-panel__title">Stock bajo</h3>
            </div>
            <AlertTriangle size={18} style={{ color: 'var(--color-low)' }} />
          </header>
          {lowStockQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : lowStockParts.length === 0 ? (
            <EmptyState icon={<Package size={28} />} title="Sin alertas" description="Todo el inventario por encima del mínimo." />
          ) : (
            <ul className="space-y-2">
              {lowStockParts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{p.sku}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {fmtNumber(p.total_available ?? 0)} / {p.min_stock}
                    </span>
                    <Badge variant="critical">Bajo</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="executive-panel">
          <header className="executive-panel__header flex items-center justify-between">
            <div>
              <p className="executive-panel__eyebrow">Hoy</p>
              <h3 className="executive-panel__title">Movimientos del día</h3>
            </div>
            <Truck size={18} style={{ color: 'var(--text-muted)' }} />
          </header>
          {movementsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : movements.length === 0 ? (
            <EmptyState icon={<Truck size={28} />} title="Sin movimientos hoy" description="Aún no se han registrado movimientos." />
          ) : (
            <ol className="space-y-2">
              {movements.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl px-3 py-2"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase" style={{ color: 'var(--text)' }}>
                      {m.movement_type}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                      {fmtDate(m.created_at, { time: true })}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {fmtNumber(m.quantity)} unidades · {m.reason ?? 'sin motivo'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </PageShell>
  )
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

function KpiTile({
  icon: Icon, label, value, tone = 'neutral', loading,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  tone?: 'good' | 'warn' | 'neutral'
  loading?: boolean
}) {
  return (
    <article
      className={`executive-kpi ${tone === 'good' ? 'executive-kpi--good' : tone === 'warn' ? 'executive-kpi--warn' : ''}`}
    >
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color: 'var(--text-faint)' }} />
        <span className="executive-kpi__label">{label}</span>
      </div>
      <strong className="executive-kpi__value">{loading ? '…' : value}</strong>
    </article>
  )
}
