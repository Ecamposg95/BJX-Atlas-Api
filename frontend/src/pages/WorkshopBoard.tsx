import { useMemo, useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, Plus, Camera, Clock, AlertTriangle, Play, Pause, Square, Package,
} from 'lucide-react'
import api from '../api/client'
import {
  listLines, startLine, pauseLine, resumeLine, finishLine,
  listEvidence, uploadEvidence, createInventoryRequest, listParts,
} from '../api'
import type {
  WorkOrderLine, Evidence, LineStatus, Part,
} from '../api/types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { Drawer } from '../components/ui/Drawer'
import { FormField } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/ToastProvider'
import { fmtDate } from '../utils/format'

// ── Local Work Order types (not exposed in api/index.ts) ─────────────────────
type WorkOrderStatus = 'received' | 'in_progress' | 'waiting_parts' | 'completed' | 'delivered'

interface WorkOrder {
  id: string
  branch_id: string
  order_number: string
  vehicle_id: string | null
  customer_id: string | null
  assigned_mechanic_id: string | null
  status: WorkOrderStatus
  notes: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  delivered_at: string | null
  vehicle_plates?: string
  vehicle_model?: string
  mechanic_email?: string
  customer_name?: string
}

const fetchWorkOrders = () =>
  api.get<{ items: WorkOrder[] }>('/workshop/work-orders').then(r => r.data.items)

const createWorkOrder = (data: {
  vehicle_plates: string
  vehicle_model?: string
  service_id?: string
  mechanic_id?: string
  notes?: string
}) =>
  api.post<WorkOrder>('/workshop/work-orders', data).then(r => r.data)

// ── Status config ────────────────────────────────────────────────────────────
const STATUS_COLUMNS: Array<{ key: WorkOrderStatus; label: string; color: string }> = [
  { key: 'received', label: 'Recibida', color: '#6b7280' },
  { key: 'in_progress', label: 'En proceso', color: '#4f8df7' },
  { key: 'waiting_parts', label: 'Esperando piezas', color: '#f97316' },
  { key: 'completed', label: 'Completada', color: '#10b981' },
  { key: 'delivered', label: 'Entregada', color: 'var(--primary)' },
]

// ── Page ─────────────────────────────────────────────────────────────────────
export function WorkshopBoardPage() {
  const [selected, setSelected] = useState<WorkOrder | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const woQuery = useQuery({
    queryKey: ['workshop', 'work-orders'],
    queryFn: () => fetchWorkOrders(),
    refetchInterval: 60_000,
  })

  const orders = woQuery.data ?? []

  const kpis = useMemo(() => {
    const active = orders.filter(o => o.status !== 'delivered')
    const avgTime = active.length
      ? active.reduce((acc, o) => acc + (Date.now() - new Date(o.created_at).getTime()), 0) / active.length / 60000
      : 0
    const inSla = active.filter(o => (Date.now() - new Date(o.created_at).getTime()) / 3600000 < 24).length
    const slaPct = active.length ? (inSla / active.length) * 100 : 100
    return { totalActive: active.length, avgTimeMin: Math.round(avgTime), slaPct: Math.round(slaPct) }
  }, [orders])

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Taller"
        title="Tablero del taller"
        description="Estado de las órdenes de servicio en tiempo real"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Recepción rápida
          </Button>
        }
      />

      <div className="executive-kpi-rail executive-kpi-rail--3">
        <article className="executive-kpi">
          <span className="executive-kpi__label">Autos en taller</span>
          <strong className="executive-kpi__value">{kpis.totalActive}</strong>
        </article>
        <article className="executive-kpi">
          <span className="executive-kpi__label">Tiempo promedio</span>
          <strong className="executive-kpi__value">{kpis.avgTimeMin} min</strong>
        </article>
        <article className={`executive-kpi executive-kpi--${kpis.slaPct >= 80 ? 'good' : 'warn'}`}>
          <span className="executive-kpi__label">% en SLA</span>
          <strong className="executive-kpi__value">{kpis.slaPct}%</strong>
        </article>
      </div>

      {woQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-5">
          {STATUS_COLUMNS.map((c) => (
            <div key={c.key} className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      ) : woQuery.isError ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="No se pudo cargar el tablero"
          description="Verifica que el endpoint /workshop/work-orders esté disponible."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {STATUS_COLUMNS.map((col) => {
            const colOrders = orders.filter(o => o.status === col.key)
            return (
              <div key={col.key} className="space-y-3">
                <header
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ background: 'var(--surface-2)', borderLeft: `3px solid ${col.color}` }}
                >
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text)' }}>
                    {col.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-bold"
                    style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}
                  >
                    {colOrders.length}
                  </span>
                </header>
                <div className="space-y-2">
                  {colOrders.length === 0 ? (
                    <p className="text-xs italic" style={{ color: 'var(--text-faint)' }}>Sin órdenes</p>
                  ) : (
                    colOrders.map((o) => (
                      <KanbanCard key={o.id} order={o} onClick={() => setSelected(o)} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <WorkOrderDrawer order={selected} onClose={() => setSelected(null)} />
      )}
      {createOpen && (
        <QuickReceptionModal onClose={() => setCreateOpen(false)} />
      )}
    </PageShell>
  )
}

// ── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({ order, onClick }: { order: WorkOrder; onClick: () => void }) {
  const ageHours = (Date.now() - new Date(order.created_at).getTime()) / 3600000
  const semaphore: 'green' | 'amber' | 'red' =
    ageHours < 8 ? 'green' : ageHours < 24 ? 'amber' : 'red'
  const semColor = semaphore === 'green' ? '#10b981' : semaphore === 'amber' ? '#f97316' : '#ef4444'

  return (
    <button
      onClick={onClick}
      className="executive-panel w-full text-left transition-all hover:-translate-y-0.5"
      style={{ padding: '0.85rem' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{order.order_number}</span>
        <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1" style={{ background: semColor }} title={`SLA ${semaphore}`} />
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        {order.vehicle_plates ?? '—'} · {order.vehicle_model ?? 'Vehículo'}
      </p>
      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        {order.mechanic_email ?? 'Sin asignar'}
      </p>
      <p className="mt-1 inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-faint)' }}>
        <Clock size={10} /> {fmtDate(order.created_at, { relative: true })}
      </p>
    </button>
  )
}

// ── Work Order Drawer ────────────────────────────────────────────────────────
function WorkOrderDrawer({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const [reqOpen, setReqOpen] = useState(false)

  const linesQuery = useQuery({
    queryKey: ['workshop', 'lines', order.id],
    queryFn: () => listLines(order.id),
  })

  const evidenceQuery = useQuery({
    queryKey: ['workshop', 'evidence', order.id],
    queryFn: () => listEvidence(order.id),
  })

  return (
    <Drawer open onClose={onClose} title={`OS ${order.order_number}`} size="lg">
      <div className="space-y-5">
        <section className="executive-panel" style={{ padding: '1rem' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Vehículo</p>
          <p className="mt-1 font-bold" style={{ color: 'var(--text)' }}>
            {order.vehicle_plates ?? '—'} · {order.vehicle_model ?? '—'}
          </p>
          {order.mechanic_email && (
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              Mecánico: {order.mechanic_email}
            </p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Servicios
            </h3>
            <Button size="sm" onClick={() => setReqOpen(true)}>
              <Package size={12} /> Solicitar refacción
            </Button>
          </div>
          {linesQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (linesQuery.data ?? []).length === 0 ? (
            <EmptyState icon={<Wrench size={28} />} title="Sin servicios" description="Aún no hay líneas en esta OS." />
          ) : (
            <div className="space-y-2">
              {linesQuery.data!.map((line) => (
                <LineCard key={line.id} line={line} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-muted)' }}>
            Evidencias
          </h3>
          <EvidenceGallery workOrderId={order.id} evidence={evidenceQuery.data ?? []} loading={evidenceQuery.isLoading} />
        </section>
      </div>

      {reqOpen && (
        <PartRequestModal workOrderId={order.id} onClose={() => setReqOpen(false)} />
      )}
    </Drawer>
  )
}

// ── Line Card ────────────────────────────────────────────────────────────────
function LineCard({ line }: { line: WorkOrderLine }) {
  const qc = useQueryClient()
  const toast = useToast()

  const refresh = () => qc.invalidateQueries({ queryKey: ['workshop', 'lines'] })

  const start = useMutation({ mutationFn: () => startLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })
  const pause = useMutation({ mutationFn: () => pauseLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })
  const resume = useMutation({ mutationFn: () => resumeLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })
  const finish = useMutation({ mutationFn: () => finishLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })

  return (
    <div className="executive-panel" style={{ padding: '0.85rem' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{line.service_name ?? 'Servicio'}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {line.mechanic_email ?? 'Sin asignar'} · {line.bay_name ?? 'Sin bahía'}
          </p>
          <LineStatusBadge status={line.status} />
          {line.actual_duration_minutes != null && (
            <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
              {line.actual_duration_minutes} min trabajados
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {line.status === 'pending' && (
            <Button size="sm" loading={start.isPending} onClick={() => start.mutate()}>
              <Play size={12} /> Iniciar
            </Button>
          )}
          {line.status === 'in_progress' && (
            <>
              <Button size="sm" variant="secondary" loading={pause.isPending} onClick={() => pause.mutate()}>
                <Pause size={12} /> Pausar
              </Button>
              <Button size="sm" loading={finish.isPending} onClick={() => finish.mutate()}>
                <Square size={12} /> Finalizar
              </Button>
            </>
          )}
          {line.status === 'paused' && (
            <Button size="sm" loading={resume.isPending} onClick={() => resume.mutate()}>
              <Play size={12} /> Reanudar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function LineStatusBadge({ status }: { status: LineStatus }) {
  const cfg: Record<LineStatus, { label: string; variant: 'ok' | 'low' | 'critical' | 'draft' | 'confirmed' }> = {
    pending: { label: 'Pendiente', variant: 'draft' },
    in_progress: { label: 'En proceso', variant: 'confirmed' },
    paused: { label: 'Pausada', variant: 'low' },
    waiting_parts: { label: 'Espera piezas', variant: 'low' },
    completed: { label: 'Completada', variant: 'ok' },
    cancelled: { label: 'Cancelada', variant: 'critical' },
  }
  const c = cfg[status]
  return <div className="mt-2"><Badge variant={c.variant}>{c.label}</Badge></div>
}

// ── Evidence Gallery ─────────────────────────────────────────────────────────
function EvidenceGallery({
  workOrderId, evidence, loading,
}: { workOrderId: string; evidence: Evidence[]; loading: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: (file: File) => uploadEvidence(workOrderId, file, { kind: 'photo' }),
    onSuccess: () => {
      toast.success('Foto cargada')
      qc.invalidateQueries({ queryKey: ['workshop', 'evidence', workOrderId] })
    },
    onError: () => toast.error('No se pudo subir'),
  })

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) upload.mutate(file)
    e.target.value = ''
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />
      <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
        <Camera size={12} /> Subir evidencia
      </Button>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : evidence.length === 0 ? (
        <p className="text-xs italic" style={{ color: 'var(--text-faint)' }}>Sin evidencias.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {evidence.map((e) => (
            <a
              key={e.id}
              href={e.download_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="aspect-square overflow-hidden rounded-lg block"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              {e.kind === 'photo' && e.download_url ? (
                <img src={e.download_url} alt={e.note ?? ''} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  {e.kind}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Part Request Modal ───────────────────────────────────────────────────────
function PartRequestModal({ workOrderId, onClose }: { workOrderId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [partId, setPartId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal')
  const [notes, setNotes] = useState('')

  const partsQuery = useQuery({
    queryKey: ['inventory', 'parts', 'wo-request', search],
    queryFn: () => listParts({ q: search || undefined, page: 1, page_size: 30 }),
  })

  const parts: Part[] = partsQuery.data?.items ?? []

  const mutation = useMutation({
    mutationFn: () => createInventoryRequest({
      work_order_id: workOrderId,
      part_id: partId,
      quantity: Number(quantity),
      priority,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Solicitud creada')
      qc.invalidateQueries({ queryKey: ['inventory', 'requests'] })
      onClose()
    },
    onError: () => toast.error('Error al solicitar'),
  })

  return (
    <Modal open onClose={onClose} title="Solicitar refacción">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="search" label="Buscar refacción" placeholder="SKU o nombre"
          value={search} onChange={setSearch}
        />
        <FormField
          name="part_id" label="Refacción" type="select" required
          value={partId} onChange={setPartId}
          placeholder="Seleccionar..."
          options={parts.map(p => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="quantity" label="Cantidad" type="number" required min={1}
            value={quantity} onChange={setQuantity}
          />
          <FormField
            name="priority" label="Prioridad" type="select"
            value={priority} onChange={(v) => setPriority(v as typeof priority)}
            options={[
              { value: 'low', label: 'Baja' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Alta' },
              { value: 'urgent', label: 'Urgente' },
            ]}
          />
        </div>
        <FormField
          name="notes" label="Notas" type="textarea" rows={2}
          value={notes} onChange={setNotes}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Solicitar</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Quick Reception Modal ────────────────────────────────────────────────────
function QuickReceptionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    vehicle_plates: '',
    vehicle_model: '',
    notes: '',
  })

  const mutation = useMutation({
    mutationFn: () => createWorkOrder({
      vehicle_plates: form.vehicle_plates,
      vehicle_model: form.vehicle_model || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Recepción registrada')
      qc.invalidateQueries({ queryKey: ['workshop', 'work-orders'] })
      onClose()
    },
    onError: () => toast.error('No se pudo registrar'),
  })

  return (
    <Modal open onClose={onClose} title="Recepción rápida">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="vehicle_plates" label="Placas" required placeholder="ABC-1234"
          value={form.vehicle_plates}
          onChange={(v) => setForm(f => ({ ...f, vehicle_plates: v }))}
        />
        <FormField
          name="vehicle_model" label="Modelo" placeholder="Marca / Modelo"
          value={form.vehicle_model}
          onChange={(v) => setForm(f => ({ ...f, vehicle_model: v }))}
        />
        <FormField
          name="notes" label="Notas / Servicio inicial" type="textarea" rows={3}
          value={form.notes}
          onChange={(v) => setForm(f => ({ ...f, notes: v }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  )
}
