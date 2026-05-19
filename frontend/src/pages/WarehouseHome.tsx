/**
 * Vista mobile-first del almacén (rol `almacen`).
 *
 * Lista solicitudes de refacciones agrupadas por estado, con KPIs rápidos
 * y CTA grande para abrir el flujo "Recibir mercancía".
 *
 * Coexiste con la vista desktop /inventory/requests sin reemplazarla.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Inbox, PackageCheck, AlertTriangle, ClipboardList,
  ChevronRight, Truck,
} from 'lucide-react'
import { listInventoryRequests, listParts } from '../api'
import type {
  InventoryRequest, InventoryRequestStatus, Paginated, Part,
} from '../api/types'
import { MobileShell } from '../components/mobile/MobileShell'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { useBranch } from '../hooks/useBranch'
import { fmtDate } from '../utils/format'

type TabKey = 'pendientes' | 'surtir' | 'recibidas'

const TAB_LABELS: Record<TabKey, string> = {
  pendientes: 'Pendientes',
  surtir: 'Surtir',
  recibidas: 'Recibidas',
}

const TAB_STATUSES: Record<TabKey, InventoryRequestStatus[]> = {
  pendientes: ['pending', 'approved'],
  surtir: ['picked'],
  recibidas: ['delivered', 'used'],
}

export function WarehouseHomePage() {
  const navigate = useNavigate()
  const { activeBranch } = useBranch()
  const [tab, setTab] = useState<TabKey>('pendientes')

  const requestsQuery = useQuery<Paginated<InventoryRequest>>({
    queryKey: ['warehouse', 'requests'],
    queryFn: () => listInventoryRequests({ page: 1, page_size: 200 }),
    refetchInterval: 30_000,
  })

  const lowStockQuery = useQuery<Paginated<Part>>({
    queryKey: ['warehouse', 'parts', 'low'],
    queryFn: () => listParts({ only_low_stock: true, page: 1, page_size: 100 }),
    refetchInterval: 60_000,
  })

  const all = requestsQuery.data?.items ?? []

  const kpis = useMemo(() => {
    const pending = all.filter(r => r.status === 'pending' || r.status === 'approved').length
    const stalled = all.filter(r => r.status === 'pending' && r.priority === 'urgent').length
    const lowStock = lowStockQuery.data?.total ?? lowStockQuery.data?.items.length ?? 0
    return { pending, stalled, lowStock }
  }, [all, lowStockQuery.data])

  const filtered = useMemo(() => {
    const allowed = TAB_STATUSES[tab]
    return all.filter(r => allowed.includes(r.status))
  }, [all, tab])

  return (
    <MobileShell
      title="Almacén"
      subtitle={activeBranch?.name ?? 'Sin sucursal'}
    >
      {/* KPI rail — horizontal scroll on mobile, grid on tablet+ */}
      <section
        className="-mx-4 px-4 mb-4 flex gap-3 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible"
        aria-label="Indicadores"
      >
        <KpiCard
          icon={<ClipboardList size={18} />}
          label="Solicitudes pendientes"
          value={kpis.pending}
          tone="amber"
        />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          label="OS detenidas por refacción"
          value={kpis.stalled}
          tone="red"
        />
        <KpiCard
          icon={<PackageCheck size={18} />}
          label="Stock crítico"
          value={kpis.lowStock}
          tone="slate"
        />
      </section>

      {/* Tab pills */}
      <div
        role="tablist"
        aria-label="Filtrar solicitudes"
        className="flex gap-2 mb-3 overflow-x-auto pb-1"
      >
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => {
          const isActive = tab === key
          const count = all.filter(r => TAB_STATUSES[key].includes(r.status)).length
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setTab(key)}
              className={
                'inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ' +
                (isActive
                  ? 'bg-amber-400 text-slate-900 shadow-sm'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')
              }
            >
              {TAB_LABELS[key]}
              <span
                className={
                  'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ' +
                  (isActive ? 'bg-slate-900/15 text-slate-900' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')
                }
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Request list */}
      <div className="flex flex-col gap-2 pb-24">
        {requestsQuery.isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox size={26} />}
            title="Sin solicitudes en esta vista"
            description="Cuando lleguen solicitudes aparecerán aquí en tiempo real."
          />
        ) : (
          filtered.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              onClick={() => navigate(`/warehouse/requests/${r.id}`)}
            />
          ))
        )}
      </div>

      {/* FAB-style primary CTA */}
      <button
        type="button"
        onClick={() => {
          const target = filtered.find(r => r.status === 'picked')
            ?? all.find(r => r.status === 'picked')
            ?? filtered[0]
            ?? all[0]
          if (target) navigate(`/warehouse/receive/${target.id}`)
        }}
        className="fixed right-4 bottom-6 z-30 min-h-14 px-5 rounded-full bg-amber-400 text-slate-900 font-extrabold text-sm uppercase tracking-wider shadow-xl shadow-amber-400/40 inline-flex items-center gap-2 active:scale-[0.97] transition-transform"
        style={{ paddingBottom: 'calc(0px + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Recibir mercancía"
      >
        <Truck size={18} />
        Recibir mercancía
      </button>
    </MobileShell>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'amber' | 'red' | 'slate'
}

function KpiCard({ icon, label, value, tone }: KpiCardProps) {
  const toneClasses: Record<KpiCardProps['tone'], string> = {
    amber: 'border-amber-300/60 bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300',
    red:   'border-red-300/60 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
    slate: 'border-slate-300/60 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200',
  }
  return (
    <article
      className={
        'snap-start flex-shrink-0 min-w-[180px] rounded-2xl border-2 px-4 py-3 flex flex-col gap-1 ' +
        toneClasses[tone]
      }
    >
      <div className="inline-flex items-center gap-2 text-[0.7rem] uppercase font-bold tracking-wider opacity-80">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <strong className="text-2xl font-black tabular-nums leading-none">{value}</strong>
    </article>
  )
}

// ── Request Row ──────────────────────────────────────────────────────────────

interface RequestRowProps {
  request: InventoryRequest
  onClick: () => void
}

function RequestRow({ request, onClick }: RequestRowProps) {
  const folio = `SA-${request.id.slice(0, 6).toUpperCase()}`
  const mechanic = request.requested_by_email ?? (request.requested_by ? request.requested_by.slice(0, 8) : '—')
  const wo = request.work_order_number ?? request.work_order_id.slice(0, 8)
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition-all hover:border-amber-400"
      style={{ borderColor: 'var(--border)', minHeight: '4.5rem' }}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{folio}</span>
          <StatusBadge status={request.status} />
        </div>
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
          {request.part_name ?? `Refacción ${request.part_id.slice(0, 6)}`}
          <span className="opacity-60 font-normal"> · {request.quantity} {request.quantity === 1 ? 'pieza' : 'piezas'}</span>
        </p>
        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          OS {wo} · {mechanic} · {fmtDate(request.created_at, { relative: true })}
        </p>
      </div>
      <ChevronRight size={18} style={{ color: 'var(--text-faint)' }} className="flex-shrink-0" />
    </button>
  )
}

// ── Status Badge (semaphore tones) ───────────────────────────────────────────

export function StatusBadge({ status }: { status: InventoryRequestStatus }) {
  const cfg: Record<InventoryRequestStatus, { label: string; cls: string }> = {
    pending:   { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300' },
    approved:  { label: 'Aprobada',   cls: 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300' },
    picked:    { label: 'Surtida',    cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300' },
    delivered: { label: 'Entregada',  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300' },
    used:      { label: 'Usada',      cls: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200' },
    returned:  { label: 'Devuelta',   cls: 'bg-purple-100 text-purple-800 dark:bg-purple-400/15 dark:text-purple-300' },
    rejected:  { label: 'Rechazada',  cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' },
  }
  const c = cfg[status]
  return (
    <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ' + c.cls}>
      {c.label}
    </span>
  )
}
