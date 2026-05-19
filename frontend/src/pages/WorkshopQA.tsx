/**
 * QA Workflow — jefe_taller revisa OS terminadas/en QA.
 *
 * Lista de OS en quality_check o in_progress (mecánico finalizó) → vista de
 * detalle con hallazgos, refacciones, evidencia → Aprobar / Rechazar QA.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Wrench, Camera,
} from 'lucide-react'
import api from '@/api/client'
import { workshopQAApi } from '@/api/endpoints/deliveries'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { FormField } from '@/components/ui/FormField'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/ToastProvider'
import { fmtDate } from '@/utils/format'

interface WorkOrderItem {
  id: string
  order_number: string
  status: string
  received_at: string
  work_finished_at: string | null
  vehicle_summary?: {
    plates?: string | null
    customer_name?: string | null
    brand?: string | null
    model?: string | null
  }
  service_name?: string
  assigned_mechanic_email?: string
  actual_duration_minutes?: number | null
  notes?: string | null
}

interface Paginated<T> { items: T[]; total: number; page: number; size: number }

interface LineRead {
  id: string
  service_name?: string
  status: string
  mechanic_email?: string | null
  bay_name?: string | null
  actual_duration_minutes?: number | null
  notes?: string | null
}

interface EvidenceRead {
  id: string
  kind: string
  download_url?: string
  note?: string | null
}

const QA_STATUSES = new Set(['quality_check', 'in_progress', 'completed'])

export function WorkshopQAPage() {
  const [selected, setSelected] = useState<WorkOrderItem | null>(null)

  const woQuery = useQuery({
    queryKey: ['qa-work-orders'],
    queryFn: async () => {
      const r = await api.get<Paginated<WorkOrderItem>>('/work-orders', { params: { size: 50, page: 1 } })
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      return items.filter((w) => QA_STATUSES.has(w.status))
    },
    refetchInterval: 30_000,
  })

  const orders = woQuery.data ?? []
  const kpis = useMemo(() => {
    const inQA = orders.filter((o) => o.status === 'quality_check').length
    const pending = orders.filter((o) => o.status === 'in_progress').length
    return { inQA, pending, total: orders.length }
  }, [orders])

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Taller"
        title="QA — Revisión de calidad"
        description="Aprueba o rechaza órdenes listas para entrega."
      />

      <div className="executive-kpi-rail executive-kpi-rail--3">
        <article className="executive-kpi">
          <span className="executive-kpi__label">En QA</span>
          <strong className="executive-kpi__value">{kpis.inQA}</strong>
        </article>
        <article className="executive-kpi">
          <span className="executive-kpi__label">Por revisar</span>
          <strong className="executive-kpi__value">{kpis.pending}</strong>
        </article>
        <article className="executive-kpi">
          <span className="executive-kpi__label">Total</span>
          <strong className="executive-kpi__value">{kpis.total}</strong>
        </article>
      </div>

      {woQuery.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : woQuery.isError ? (
        <EmptyState icon={<AlertTriangle size={28} />} title="Error" description="No se pudo cargar el listado." />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title="Sin órdenes para revisar"
          description="Todas las OS están entregadas o aún en proceso."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {orders.map((wo) => (
            <QACard key={wo.id} order={wo} onReview={() => setSelected(wo)} />
          ))}
        </div>
      )}

      {selected && (
        <QADrawer
          order={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </PageShell>
  )
}

function QACard({ order, onReview }: { order: WorkOrderItem; onReview: () => void }) {
  const statusLbl =
    order.status === 'quality_check' ? 'En QA' :
    order.status === 'completed' ? 'Completada' : 'En proceso'
  const statusColor =
    order.status === 'quality_check' ? '#7c3aed' :
    order.status === 'completed' ? '#10b981' : '#f59e0b'
  return (
    <div
      className="executive-panel"
      style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{order.order_number}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {order.vehicle_summary?.plates ?? '—'} · {order.vehicle_summary?.brand ?? ''} {order.vehicle_summary?.model ?? ''}
          </p>
        </div>
        <span
          className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold"
          style={{ background: 'rgba(124,58,237,0.12)', color: statusColor }}
        >
          {statusLbl}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Mecánico" value={order.assigned_mechanic_email?.split('@')[0] ?? '—'} icon={<Wrench size={12} />} />
        <Stat label="Tiempo" value={order.actual_duration_minutes != null ? `${order.actual_duration_minutes}m` : '—'} icon={<Clock size={12} />} />
        <Stat label="Recepción" value={fmtDate(order.received_at, { relative: true })} icon={<Clock size={12} />} />
      </div>

      <Button onClick={onReview}>
        <ShieldCheck size={14} /> Revisar
      </Button>
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className="font-semibold flex items-center gap-1" style={{ color: 'var(--text)' }}>{icon}{value}</span>
    </div>
  )
}

// ─── QA Drawer ──────────────────────────────────────────────────────────────
function QADrawer({ order, onClose }: { order: WorkOrderItem; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [failOpen, setFailOpen] = useState(false)
  const [failReason, setFailReason] = useState('')

  const linesQuery = useQuery({
    queryKey: ['qa-lines', order.id],
    queryFn: async () => {
      const r = await api.get<LineRead[]>(`/workshop/work-orders/${order.id}/lines`)
      return Array.isArray(r.data) ? r.data : []
    },
  })

  const evidenceQuery = useQuery({
    queryKey: ['qa-evidence', order.id],
    queryFn: async () => {
      const r = await api.get<EvidenceRead[]>(`/workshop/work-orders/${order.id}/evidence`)
      return Array.isArray(r.data) ? r.data : []
    },
  })

  const passMut = useMutation({
    mutationFn: () => workshopQAApi.qaPass(order.id),
    onSuccess: () => {
      toast.success('QA aprobada')
      qc.invalidateQueries({ queryKey: ['qa-work-orders'] })
      onClose()
    },
    onError: () => toast.error('No se pudo aprobar'),
  })

  const failMut = useMutation({
    mutationFn: () => workshopQAApi.qaFail(order.id, failReason),
    onSuccess: () => {
      toast.success('QA rechazada')
      qc.invalidateQueries({ queryKey: ['qa-work-orders'] })
      setFailOpen(false)
      onClose()
    },
    onError: () => toast.error('No se pudo rechazar'),
  })

  return (
    <>
      <Drawer open onClose={onClose} title={`QA · ${order.order_number}`} size="lg">
        <div className="space-y-5">
          <section className="executive-panel" style={{ padding: '1rem' }}>
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Vehículo</p>
            <p className="mt-1 font-bold" style={{ color: 'var(--text)' }}>
              {order.vehicle_summary?.plates ?? '—'} · {order.vehicle_summary?.brand ?? ''} {order.vehicle_summary?.model ?? ''}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Cliente: {order.vehicle_summary?.customer_name ?? '—'}
            </p>
            {order.notes && (
              <p className="text-sm mt-3 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
                {order.notes}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
              Servicios realizados
            </h3>
            {linesQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (linesQuery.data ?? []).length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--text-faint)' }}>Sin líneas registradas.</p>
            ) : (
              <ul className="space-y-2">
                {linesQuery.data!.map((line) => (
                  <li
                    key={line.id}
                    className="rounded-xl border p-3 flex items-center justify-between gap-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>
                        {line.service_name ?? 'Servicio'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {line.mechanic_email ?? '—'} · {line.bay_name ?? 'Sin bahía'}
                      </p>
                    </div>
                    <Badge variant={line.status === 'completed' ? 'ok' : 'draft'}>{line.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
              Evidencias
            </h3>
            {evidenceQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (evidenceQuery.data ?? []).length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--text-faint)' }}>Sin evidencias capturadas.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {evidenceQuery.data!.map((ev) => (
                  <a
                    key={ev.id}
                    href={ev.download_url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square overflow-hidden rounded-lg block"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    {ev.download_url ? (
                      <img src={ev.download_url} alt={ev.note ?? ''} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Camera size={20} />
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </section>

          <section
            className="rounded-2xl border p-4 flex flex-col sm:flex-row gap-2 sticky bottom-0 bg-white dark:bg-slate-900"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => passMut.mutate()}
              disabled={passMut.isPending}
              className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-500/30"
            >
              <CheckCircle2 size={16} /> Aprobar QA
            </button>
            <button
              type="button"
              onClick={() => setFailOpen(true)}
              className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 text-white font-bold text-sm shadow-md shadow-red-500/30"
            >
              <XCircle size={16} /> Rechazar
            </button>
          </section>
        </div>
      </Drawer>

      {failOpen && (
        <Modal open onClose={() => setFailOpen(false)} title="Rechazar QA" size="sm">
          <form
            onSubmit={(e) => { e.preventDefault(); failMut.mutate() }}
            className="space-y-4"
          >
            <FormField
              name="reason"
              label="Motivo del rechazo"
              type="textarea"
              required
              rows={3}
              value={failReason}
              onChange={setFailReason}
              helper="Describe qué corregir antes de aprobar."
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setFailOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!failReason.trim()} loading={failMut.isPending}>
                Rechazar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
