import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Car,
  Truck,
  ClipboardCheck,
  Wallet,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Search,
  Building2,
} from 'lucide-react'
import api from '@/api/client'
import { PageShell } from '@/components/ui/PageShell'
import { Table, type TableColumn } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'

interface FleetVehicleInfo {
  id: string | null
  plates: string | null
  brand: string | null
  model: string | null
  year: number | null
}

interface FleetUnit {
  vehicle: FleetVehicleInfo
  last_order_id: string | null
  last_folio: string | null
  last_status: string | null
  last_received_at: string | null
  estimated_ready_at: string | null
  delivered_at: string | null
  service_name: string | null
  branch_name: string | null
}

interface FleetResponse {
  total: number
  in_workshop: number
  ready_for_delivery: number
  items: FleetUnit[]
}

interface CorpKPIs {
  units_total: number
  in_workshop: number
  ready_for_delivery: number
  delivered_last_30d: number
  spend_current_month: number
  spend_previous_month: number
  customer_id: string | null
  customer_label: string | null
}

interface CorpWorkOrderItem {
  id: string
  folio: string
  status: string
  received_at: string | null
  estimated_ready_at: string | null
  delivered_at: string | null
  service_name: string | null
  vehicle: FleetVehicleInfo
  branch_name: string | null
}

interface CorpWorkOrdersResponse {
  total: number
  page: number
  page_size: number
  items: CorpWorkOrderItem[]
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Recibido',
  assigned: 'Asignado',
  in_progress: 'En proceso',
  waiting_parts: 'Esp. refacciones',
  quality_check: 'Calidad',
  completed: 'Listo p/entrega',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_COLOR: Record<string, string> = {
  received: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  assigned: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  in_progress: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
  waiting_parts: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  quality_check: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  delivered: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  cancelled: 'bg-red-500/10 text-red-300 border-red-500/30',
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status
  const cls = STATUS_COLOR[status] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  )
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return '—'
  }
}

function vehicleLabel(v: FleetVehicleInfo): string {
  const parts: string[] = []
  if (v.brand) parts.push(v.brand)
  if (v.model) parts.push(v.model)
  if (v.year) parts.push(String(v.year))
  return parts.join(' ') || '—'
}

const OPEN_STATUSES = new Set([
  'received',
  'assigned',
  'in_progress',
  'waiting_parts',
  'quality_check',
])

const DELIVERY_STATUSES = new Set(['completed', 'delivered', 'cancelled'])

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estatus' },
  { value: 'received', label: 'Recibido' },
  { value: 'assigned', label: 'Asignado' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'waiting_parts', label: 'Esp. refacciones' },
  { value: 'quality_check', label: 'Calidad' },
  { value: 'completed', label: 'Listo p/entrega' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
]

export function ClientCorpPage() {
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  const summaryQuery = useQuery({
    queryKey: ['client-corp', 'summary'],
    queryFn: async (): Promise<CorpKPIs> => {
      const r = await api.get<CorpKPIs>('/v1/client-corp/summary')
      return r.data
    },
  })

  const fleetQuery = useQuery({
    queryKey: ['client-corp', 'fleet'],
    queryFn: async (): Promise<FleetResponse> => {
      const r = await api.get<FleetResponse>('/v1/client-corp/fleet')
      const data = r.data
      return {
        total: Number(data?.total ?? 0),
        in_workshop: Number(data?.in_workshop ?? 0),
        ready_for_delivery: Number(data?.ready_for_delivery ?? 0),
        items: Array.isArray(data?.items) ? data.items : [],
      }
    },
  })

  const historyQuery = useQuery({
    queryKey: ['client-corp', 'history', { statusFilter, dateFrom, dateTo }],
    queryFn: async (): Promise<CorpWorkOrdersResponse> => {
      const params: Record<string, string | number> = { page: 1, page_size: 10 }
      if (statusFilter) params.status = statusFilter
      else params.status = 'delivered'
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString()
      if (dateTo) params.date_to = new Date(dateTo).toISOString()
      const r = await api.get<CorpWorkOrdersResponse>('/v1/client-corp/work-orders', { params })
      const data = r.data
      return {
        total: Number(data?.total ?? 0),
        page: Number(data?.page ?? 1),
        page_size: Number(data?.page_size ?? 10),
        items: Array.isArray(data?.items) ? data.items : [],
      }
    },
  })

  const customerLabel =
    summaryQuery.data?.customer_label ?? user?.email?.split('@')[1]?.split('.')[0] ?? 'Tu flota'

  const fleetItems = useMemo(() => {
    const items = fleetQuery.data?.items ?? []
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((u) =>
      [u.vehicle.plates, u.vehicle.brand, u.vehicle.model, u.last_folio, u.service_name]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    )
  }, [fleetQuery.data, search])

  const spendDelta = useMemo(() => {
    const s = summaryQuery.data
    if (!s) return null
    const prev = s.spend_previous_month
    const curr = s.spend_current_month
    if (!prev) return curr > 0 ? 1 : 0
    return (curr - prev) / prev
  }, [summaryQuery.data])

  const fleetCols: TableColumn<FleetUnit>[] = [
    {
      key: 'unit',
      header: 'Unidad',
      render: (u) => (
        <div className="flex flex-col">
          <span className="font-bold" style={{ color: 'var(--text)' }}>
            {u.vehicle.plates ?? '—'}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {vehicleLabel(u.vehicle)}
          </span>
        </div>
      ),
      width: '220px',
    },
    {
      key: 'service',
      header: 'Servicio',
      render: (u) => u.service_name ?? '—',
    },
    {
      key: 'status',
      header: 'Estatus',
      render: (u) => (u.last_status ? <StatusBadge status={u.last_status} /> : '—'),
      width: '180px',
    },
    {
      key: 'eta',
      header: 'ETA',
      render: (u) => formatDate(u.estimated_ready_at),
      width: '140px',
    },
    {
      key: 'branch',
      header: 'Sede',
      render: (u) => u.branch_name ?? '—',
      width: '160px',
    },
    {
      key: 'folio',
      header: 'Folio',
      align: 'right',
      render: (u) =>
        u.last_folio ? (
          <Link
            to={`/client/${u.last_folio}`}
            className="inline-flex items-center gap-1 text-xs font-bold"
            style={{ color: 'var(--color-brand-yellow, #fbbf24)' }}
          >
            {u.last_folio}
            <ExternalLink size={12} />
          </Link>
        ) : (
          '—'
        ),
      width: '160px',
    },
  ]

  const historyCols: TableColumn<CorpWorkOrderItem>[] = [
    {
      key: 'folio',
      header: 'Folio',
      render: (w) => (
        <Link
          to={`/client/${w.folio}`}
          className="inline-flex items-center gap-1 text-xs font-bold"
          style={{ color: 'var(--color-brand-yellow, #fbbf24)' }}
        >
          {w.folio}
          <ExternalLink size={12} />
        </Link>
      ),
      width: '160px',
    },
    {
      key: 'unit',
      header: 'Unidad',
      render: (w) => (
        <div className="flex flex-col">
          <span className="font-bold" style={{ color: 'var(--text)' }}>
            {w.vehicle.plates ?? '—'}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {vehicleLabel(w.vehicle)}
          </span>
        </div>
      ),
    },
    {
      key: 'service',
      header: 'Servicio',
      render: (w) => w.service_name ?? '—',
    },
    {
      key: 'status',
      header: 'Estatus',
      render: (w) => <StatusBadge status={w.status} />,
      width: '160px',
    },
    {
      key: 'closed',
      header: 'Cierre',
      render: (w) => formatDate(w.delivered_at ?? w.received_at),
      width: '160px',
      align: 'right',
    },
  ]

  return (
    <PageShell>
      <header className="flex flex-col gap-2">
        <p
          className="text-xs uppercase font-bold tracking-[0.25em]"
          style={{ color: 'var(--text-faint)' }}
        >
          Cliente corporativo
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="hidden h-12 w-12 sm:flex items-center justify-center rounded-2xl border"
              style={{
                borderColor: 'var(--border)',
                background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                color: 'var(--text)',
              }}
            >
              <Building2 size={22} />
            </div>
            <div>
              <h1
                className="text-2xl font-extrabold tracking-tight"
                style={{ color: 'var(--text)' }}
              >
                Panel de flota
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {customerLabel} · vista en tiempo real de tus unidades en taller
              </p>
            </div>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-faint)' }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar placa, marca, folio..."
              className="rounded-xl border bg-transparent py-2 pl-9 pr-3 text-sm outline-none"
              style={{
                borderColor: 'var(--border)',
                color: 'var(--text)',
                minWidth: '280px',
              }}
            />
          </div>
        </div>
      </header>

      {/* KPI cards */}
      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Indicadores de flota"
      >
        <KpiCard
          icon={<Car size={20} />}
          label="Unidades totales"
          value={summaryQuery.data?.units_total ?? '—'}
          loading={summaryQuery.isLoading}
          accent="brand"
        />
        <KpiCard
          icon={<Truck size={20} />}
          label="En taller"
          value={summaryQuery.data?.in_workshop ?? '—'}
          loading={summaryQuery.isLoading}
          accent="amber"
        />
        <KpiCard
          icon={<ClipboardCheck size={20} />}
          label="Listas p/entrega"
          value={summaryQuery.data?.ready_for_delivery ?? '—'}
          loading={summaryQuery.isLoading}
          accent="emerald"
        />
        <KpiCard
          icon={<Wallet size={20} />}
          label="Gasto del mes"
          value={summaryQuery.data ? formatMoney(summaryQuery.data.spend_current_month) : '—'}
          loading={summaryQuery.isLoading}
          accent="sky"
          footer={
            spendDelta !== null && summaryQuery.data ? (
              <span
                className="inline-flex items-center gap-1 text-xs font-bold"
                style={{ color: spendDelta >= 0 ? '#fb923c' : '#34d399' }}
              >
                {spendDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(spendDelta * 100).toFixed(0)}% vs mes ant.
                <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
                  ({formatMoney(summaryQuery.data.spend_previous_month)})
                </span>
              </span>
            ) : null
          }
        />
      </section>

      {/* Fleet table */}
      <section className="flex flex-col gap-3">
        <header className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>
              Flota
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Última orden de servicio por unidad
            </p>
          </div>
          {fleetQuery.data ? (
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {fleetItems.length} / {fleetQuery.data.total} unidades
            </span>
          ) : null}
        </header>

        {fleetQuery.isError ? (
          <div
            className="rounded-2xl border px-4 py-6 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            No se pudo cargar la flota. Intenta de nuevo en unos segundos.
          </div>
        ) : fleetQuery.isLoading ? (
          <FleetSkeleton />
        ) : fleetItems.length === 0 ? (
          <div
            className="rounded-2xl border"
            style={{
              borderColor: 'var(--border)',
              background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
            }}
          >
            <EmptyState
              icon={<Car size={28} />}
              title={search ? 'Sin coincidencias' : 'Aún no hay unidades en tu flota'}
              description={
                search
                  ? 'Ajusta el término de búsqueda o limpia el filtro.'
                  : 'En cuanto BJX registre una OS para alguna unidad tuya, aparecerá aquí.'
              }
            />
          </div>
        ) : (
          <Table
            columns={fleetCols}
            rows={fleetItems}
            keyExtractor={(u) => u.vehicle.id ?? u.last_order_id ?? Math.random().toString()}
          />
        )}
      </section>

      {/* History */}
      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>
              Historial reciente
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Últimas órdenes con filtros por estatus y fecha
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              aria-label="Desde"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              aria-label="Hasta"
            />
          </div>
        </header>

        {historyQuery.isError ? (
          <div
            className="rounded-2xl border px-4 py-6 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            No se pudo cargar el historial.
          </div>
        ) : (
          <Table
            columns={historyCols}
            rows={historyQuery.data?.items ?? []}
            loading={historyQuery.isLoading}
            keyExtractor={(w) => w.id}
            emptyMessage="No hay órdenes en el rango seleccionado."
          />
        )}
      </section>
    </PageShell>
  )
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  loading?: boolean
  accent: 'brand' | 'amber' | 'emerald' | 'sky'
  footer?: React.ReactNode
}

function KpiCard({ icon, label, value, loading, accent, footer }: KpiCardProps) {
  const accents: Record<KpiCardProps['accent'], { bg: string; border: string; text: string }> = {
    brand: {
      bg: 'color-mix(in srgb, var(--color-brand-yellow, #fbbf24) 8%, transparent)',
      border: 'color-mix(in srgb, var(--color-brand-yellow, #fbbf24) 30%, var(--border))',
      text: 'var(--color-brand-yellow, #fbbf24)',
    },
    amber: {
      bg: 'color-mix(in srgb, #f59e0b 8%, transparent)',
      border: 'color-mix(in srgb, #f59e0b 28%, var(--border))',
      text: '#fbbf24',
    },
    emerald: {
      bg: 'color-mix(in srgb, #10b981 8%, transparent)',
      border: 'color-mix(in srgb, #10b981 28%, var(--border))',
      text: '#34d399',
    },
    sky: {
      bg: 'color-mix(in srgb, #0ea5e9 8%, transparent)',
      border: 'color-mix(in srgb, #0ea5e9 28%, var(--border))',
      text: '#7dd3fc',
    },
  }
  const a = accents[accent]
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl border px-4 py-4"
      style={{ background: a.bg, borderColor: a.border }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: a.text }}>{icon}</span>
        <p
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {label}
        </p>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <p
          className="text-2xl font-extrabold leading-none tracking-tight"
          style={{ color: 'var(--text)' }}
        >
          {value}
        </p>
      )}
      {footer && <div className="pt-1">{footer}</div>}
    </div>
  )
}

function FleetSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  )
}

// Silenciar warnings de lint para constantes "no usadas" en runtime.
void OPEN_STATUSES
void DELIVERY_STATUSES
