import { useMemo, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  Gauge,
  PackageX,
  Percent,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react'
import { getManagerDashboard } from '../api'
import { serviceProposalsApi } from '../api/endpoints/serviceProposals'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Drawer } from '../components/ui/Drawer'
import { EmptyState } from '../components/ui/EmptyState'
import { FormField } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { PageShell } from '../components/ui/PageShell'
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton'
import { BranchSwitcher } from '../components/BranchSwitcher'
import { SEMAPHORE_HEX, SEMAPHORE_LABEL } from '../components/branches/colors'
import { useAuthStore } from '../store/auth'
import { useBranch } from '../hooks/useBranch'
import { useToast } from '../components/ui/ToastProvider'
import { fmtDate } from '../utils/format'
import type { BranchKPIs, ManagerDashboard, ServiceProposal, StalledOrder } from '../api/types'

const ALLOWED_ROLES = ['admin', 'director', 'gerente_sede']
const AUTO_REFRESH_MS = 60_000

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

const fmtHrs = (n: number) => (n > 0 ? `${n.toFixed(1)} h` : '—')
const fmtPct = (n: number | null) =>
  n === null || n === undefined ? '—' : `${(n * 100).toFixed(0)}%`

const STATUS_ES: Record<string, string> = {
  received: 'Recibida',
  assigned: 'Asignada',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando partes',
  quality_check: 'Calidad',
  completed: 'Completada',
  delivered: 'Entregada',
  cancelled: 'Cancelada',
}

const STATUS_COLOR: Record<string, string> = {
  received: '#94A3B8',
  assigned: '#3B82F6',
  in_progress: '#10B981',
  waiting_parts: '#F59E0B',
  quality_check: '#A855F7',
}

export function ManagerPage() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const { activeBranch, isGlobalUser } = useBranch()

  const canView = Boolean(user && ALLOWED_ROLES.includes(user.role))

  const dashboardQuery = useQuery<ManagerDashboard>({
    queryKey: ['manager-dashboard', activeBranch?.id ?? user?.default_branch_id ?? null],
    queryFn: () => getManagerDashboard(),
    enabled: canView,
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
  })

  const data = dashboardQuery.data
  const kpis: BranchKPIs | undefined = data?.kpis
  const semaphoreHex = data ? SEMAPHORE_HEX[data.semaphore] : SEMAPHORE_HEX.green

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }, [])

  const handleRefresh = async () => {
    await qc.invalidateQueries({ queryKey: ['manager-dashboard'] })
    await dashboardQuery.refetch()
  }

  if (!canView) {
    return (
      <PageShell>
        <EmptyState
          icon={<Building2 size={28} />}
          title="Acceso restringido"
          description="Esta vista es para administradores, directores y gerentes de sede."
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={`${greeting}, ${user?.email?.split('@')[0] ?? 'gerente'}`}
        title={data?.name ?? activeBranch?.name ?? 'Panel de sucursal'}
        description={
          data
            ? `${data.code} · ${data.city ?? '—'}${data.state ? `, ${data.state}` : ''} · Tablero actualizado ${formatRelative(data.calculated_at)}`
            : 'Cargando telemetría de la sucursal…'
        }
        actions={
          <div className="flex items-center gap-2">
            {isGlobalUser && <BranchSwitcher />}
            <Button
              variant="secondary"
              onClick={handleRefresh}
              loading={dashboardQuery.isFetching}
              aria-label="Refrescar"
            >
              <RefreshCw size={14} /> Actualizar
            </Button>
          </div>
        }
      />

      {/* Racing accent */}
      <div
        aria-hidden
        style={{
          height: 3,
          borderRadius: 999,
          background:
            'linear-gradient(90deg, transparent 0%, #FBBF24 25%, #1E293B 50%, #DC2626 75%, transparent 100%)',
          opacity: 0.55,
        }}
      />

      {/* Status banner */}
      {data && (
        <div
          className="executive-panel flex flex-wrap items-center gap-3"
          style={{ padding: '0.85rem 1.1rem' }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: 999,
              background: semaphoreHex,
              boxShadow: `0 0 18px ${semaphoreHex}80`,
            }}
          />
          <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--text)' }}>
            Estado: {SEMAPHORE_LABEL[data.semaphore]}
          </span>
          <span
            className="text-[11px] font-bold uppercase ml-auto"
            style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
          >
            {dashboardQuery.isFetching ? 'Sincronizando…' : `Auto-refresh · ${AUTO_REFRESH_MS / 1000}s`}
          </span>
        </div>
      )}

      {/* Error state */}
      {dashboardQuery.isError && (
        <div
          className="executive-panel"
          style={{
            padding: '1.2rem',
            borderColor: 'rgba(244,63,94,0.4)',
            background: 'rgba(225,29,72,0.08)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} style={{ color: '#fda4af' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#fda4af' }}>
                No pudimos cargar el tablero
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Verifica tu conexión o que tu sucursal esté correctamente asignada. Intenta de nuevo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI grid */}
      <section
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}
      >
        <KpiTile
          icon={Wrench}
          label="OS abiertas"
          value={kpis ? String(kpis.open_orders) : null}
          accent="#3B82F6"
          loading={dashboardQuery.isLoading}
        />
        <KpiTile
          icon={Activity}
          label="En proceso"
          value={kpis ? String(kpis.in_progress) : null}
          accent="#10B981"
          loading={dashboardQuery.isLoading}
        />
        <KpiTile
          icon={CheckCircle2}
          label="Finalizadas hoy"
          value={kpis ? String(kpis.finished_today) : null}
          accent="#FBBF24"
          loading={dashboardQuery.isLoading}
        />
        <KpiTile
          icon={Users}
          label="Mecánicos activos"
          value={kpis ? String(kpis.active_mechanics) : null}
          accent="#A855F7"
          loading={dashboardQuery.isLoading}
        />
        <KpiTile
          icon={TrendingUp}
          label="Ingresos hoy"
          value={kpis ? fmtMoney(kpis.revenue_today) : null}
          accent="#10B981"
          loading={dashboardQuery.isLoading}
        />
        <KpiTile
          icon={AlertTriangle}
          label="Alertas activas"
          value={kpis ? String(kpis.alerts_count) : null}
          accent={kpis && kpis.alerts_count > 0 ? '#F59E0B' : '#10B981'}
          loading={dashboardQuery.isLoading}
        />
      </section>

      {/* Performance grid */}
      <section
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <PerfTile
          icon={Timer}
          label="Cycle time promedio"
          subtitle="OS completadas · 30 días"
          value={kpis ? fmtHrs(kpis.cycle_time_avg_hrs) : null}
          hint={kpis ? `P95: ${fmtHrs(kpis.cycle_time_p95_hrs)}` : undefined}
          accent="#06B6D4"
          loading={dashboardQuery.isLoading}
        />
        <PerfTile
          icon={Gauge}
          label="On-time delivery"
          subtitle="vs. fecha prometida · 30 días"
          value={kpis ? fmtPct(kpis.on_time_pct) : null}
          accent={kpis && kpis.on_time_pct >= 0.85 ? '#10B981' : '#F59E0B'}
          loading={dashboardQuery.isLoading}
        />
        <PerfTile
          icon={Percent}
          label="Margen promedio"
          subtitle="OS completadas · 30 días"
          value={kpis ? fmtPct(kpis.margin_pct_avg) : null}
          hint={kpis && kpis.margin_pct_avg === null ? 'Pendiente de modelar' : undefined}
          accent="#FBBF24"
          loading={dashboardQuery.isLoading}
        />
        <PerfTile
          icon={Clock}
          label="Tiempo avg línea"
          subtitle="Líneas completadas hoy"
          value={kpis ? fmtHrs(kpis.avg_completion_hrs) : null}
          accent="#3B82F6"
          loading={dashboardQuery.isLoading}
        />
      </section>

      {/* Stalled orders */}
      <section className="executive-panel" style={{ padding: '1.2rem 1.35rem' }}>
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PackageX size={16} style={{ color: '#F59E0B' }} />
            <h2
              className="text-sm font-extrabold uppercase"
              style={{ color: 'var(--text)', letterSpacing: '0.1em' }}
            >
              OS estancadas
            </h2>
          </div>
          <span
            className="text-[10px] font-bold uppercase"
            style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
          >
            Top 5 por horas sin transición
          </span>
        </header>

        {dashboardQuery.isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : !data || data.top_stalled_orders.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={24} />}
            title="Sin OS estancadas"
            description="Todas las órdenes están avanzando con normalidad."
          />
        ) : (
          <StalledTable rows={data.top_stalled_orders} />
        )}
      </section>

      <ProposalsToApprove />
    </PageShell>
  )
}

function ProposalsToApprove() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<ServiceProposal | null>(null)

  const proposalsQuery = useQuery({
    queryKey: ['manager-proposals', 'pending'],
    queryFn: () => serviceProposalsApi.list({ status: 'pending' }),
    refetchInterval: 60_000,
  })

  const items = proposalsQuery.data?.items ?? []

  return (
    <section className="executive-panel" style={{ padding: '1.2rem 1.35rem' }}>
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} style={{ color: '#A855F7' }} />
          <h2
            className="text-sm font-extrabold uppercase"
            style={{ color: 'var(--text)', letterSpacing: '0.1em' }}
          >
            Propuestas por aprobar
          </h2>
          {items.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: '#A855F71f', color: '#A855F7' }}
            >
              {items.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => qc.invalidateQueries({ queryKey: ['manager-proposals'] })}
        >
          <RefreshCw size={12} /> Refrescar
        </Button>
      </header>

      {proposalsQuery.isLoading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={24} />}
          title="Sin propuestas pendientes"
          description="No hay propuestas de servicio esperando tu revisión."
        />
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="executive-panel w-full text-left transition-all hover:-translate-y-0.5"
              style={{ padding: '0.85rem' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
                    {p.service_name}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    OS {p.work_order_id.slice(0, 8)} · Qty {p.quantity}
                    {p.estimated_total ? ` · $${p.estimated_total}` : ''}
                  </p>
                  <p className="mt-1 text-xs italic line-clamp-1" style={{ color: 'var(--text-faint)' }}>
                    "{p.reason}"
                  </p>
                </div>
                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-faint)' }}>
                  <Clock size={10} className="inline mr-1" />
                  {fmtDate(p.created_at, { relative: true })}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ProposalReviewDrawer
          proposal={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  )
}

function ProposalReviewDrawer({
  proposal,
  onClose,
}: {
  proposal: ServiceProposal
  onClose: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const [notes, setNotes] = useState('')

  const approve = useMutation({
    mutationFn: () => serviceProposalsApi.approve(proposal.id, notes || undefined),
    onSuccess: () => {
      toast.success('Propuesta aprobada')
      qc.invalidateQueries({ queryKey: ['manager-proposals'] })
      onClose()
    },
    onError: () => toast.error('No se pudo aprobar'),
  })

  const reject = useMutation({
    mutationFn: () => serviceProposalsApi.reject(proposal.id, notes || undefined),
    onSuccess: () => {
      toast.success('Propuesta rechazada')
      qc.invalidateQueries({ queryKey: ['manager-proposals'] })
      onClose()
    },
    onError: () => toast.error('No se pudo rechazar'),
  })

  return (
    <Drawer open onClose={onClose} title="Revisar propuesta" size="md">
      <div className="space-y-4">
        <section className="executive-panel" style={{ padding: '1rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold" style={{ color: 'var(--text)' }}>
              {proposal.service_name}
            </h3>
            <Badge variant="draft">Pendiente</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <Field label="Cantidad" value={String(proposal.quantity)} />
            <Field label="OS" value={proposal.work_order_id.slice(0, 12)} />
            <Field label="Horas estimadas" value={proposal.estimated_hours ? String(proposal.estimated_hours) : '—'} />
            <Field label="Costo refacciones" value={proposal.estimated_parts_cost ? `$${proposal.estimated_parts_cost}` : '—'} />
            <Field label="Total estimado" value={proposal.estimated_total ? `$${proposal.estimated_total}` : '—'} />
            <Field label="Creada" value={fmtDate(proposal.created_at, { relative: true })} />
          </dl>
        </section>

        <section>
          <p className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--text-faint)' }}>
            Justificación del jefe
          </p>
          <p className="text-sm rounded-lg p-3" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
            {proposal.reason}
          </p>
        </section>

        <FormField
          name="review_notes"
          label="Notas de revisión (opcional)"
          type="textarea"
          rows={3}
          placeholder="Observaciones para el jefe de taller..."
          value={notes}
          onChange={setNotes}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => reject.mutate()}
            loading={reject.isPending}
          >
            <XCircle size={14} /> Rechazar
          </Button>
          <Button onClick={() => approve.mutate()} loading={approve.isPending}>
            <CheckCircle2 size={14} /> Aprobar y crear línea
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)', letterSpacing: '0.08em' }}>
        {label}
      </dt>
      <dd className="font-semibold mt-0.5" style={{ color: 'var(--text)' }}>{value}</dd>
    </div>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: typeof Wrench
  label: string
  value: string | null
  accent: string
  loading?: boolean
}) {
  return (
    <div
      className="executive-panel"
      style={{
        padding: '1rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 3,
          height: '100%',
          background: accent,
        }}
      />
      <div className="flex items-center gap-2">
        <span style={{ color: accent }}>
          <Icon size={14} />
        </span>
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
        >
          {label}
        </span>
      </div>
      {loading || value === null ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <p
          className="font-extrabold"
          style={{ color: 'var(--text)', fontSize: 'clamp(1.25rem, 2vw, 1.65rem)' }}
        >
          {value}
        </p>
      )}
    </div>
  )
}

function PerfTile({
  icon: Icon,
  label,
  subtitle,
  value,
  hint,
  accent,
  loading,
}: {
  icon: typeof Wrench
  label: string
  subtitle: string
  value: string | null
  hint?: string
  accent: string
  loading?: boolean
}) {
  return (
    <div
      className="executive-panel"
      style={{
        padding: '1.1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 130,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 100% 0%, ${accent}1a 0%, transparent 60%)`,
          pointerEvents: 'none',
        }}
      />
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `${accent}1f`,
            color: accent,
          }}
        >
          <Icon size={15} />
        </span>
        <div>
          <p
            className="text-[10px] font-bold uppercase"
            style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
          >
            {label}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </p>
        </div>
      </div>
      {loading || value === null ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p
          className="font-extrabold"
          style={{ color: 'var(--text)', fontSize: 'clamp(1.4rem, 2.2vw, 1.85rem)' }}
        >
          {value}
        </p>
      )}
      {hint && (
        <p className="text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

function StalledTable({ rows }: { rows: StalledOrder[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th
              className="text-left py-2 pr-3 text-[10px] font-bold uppercase"
              style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
            >
              Folio
            </th>
            <th
              className="text-left py-2 pr-3 text-[10px] font-bold uppercase"
              style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
            >
              Estado
            </th>
            <th
              className="text-right py-2 pl-3 text-[10px] font-bold uppercase"
              style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
            >
              Horas en estado
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const statusColor = STATUS_COLOR[row.status] ?? 'var(--text-muted)'
            const severity = row.hours_in_status >= 48
              ? '#EF4444'
              : row.hours_in_status >= 24
                ? '#F59E0B'
                : 'var(--text)'
            return (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-2.5 pr-3 font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                  {row.order_number}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      background: `${statusColor}1f`,
                      color: statusColor,
                      letterSpacing: '0.06em',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: statusColor,
                      }}
                    />
                    {STATUS_ES[row.status] ?? row.status}
                  </span>
                </td>
                <td
                  className="py-2.5 pl-3 text-right font-extrabold"
                  style={{ color: severity, fontVariantNumeric: 'tabular-nums' }}
                >
                  {row.hours_in_status.toFixed(1)} h
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatRelative(iso: string) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const sec = Math.round(diff / 1000)
  if (sec < 60) return `hace ${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `hace ${min} min`
  const hr = Math.round(min / 60)
  return `hace ${hr} h`
}
