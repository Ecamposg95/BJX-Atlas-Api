import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, Play, Pause, Square, Camera, Package, Clock,
} from 'lucide-react'
import api from '../api/client'
import {
  listLines, startLine, pauseLine, resumeLine, finishLine,
  uploadEvidence, createInventoryRequest, listParts,
} from '../api'
import type { WorkOrderLine, LineStatus, Part } from '../api/types'
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
import { useAuthStore } from '../store/auth'

interface MyWorkOrder {
  id: string
  order_number: string
  status: string
  vehicle_plates?: string
  vehicle_model?: string
  created_at: string
  notes: string | null
}

const fetchMyWorkOrders = (mechanicId: string) =>
  api.get<{ items: MyWorkOrder[] }>('/work-orders', {
    params: { mechanic_id: mechanicId },
  }).then(r => Array.isArray(r.data?.items) ? r.data.items : []).catch(() => [])

const STATUS_LABELS: Record<string, string> = {
  received: 'Recibida',
  in_progress: 'En proceso',
  waiting_parts: 'Esperando piezas',
  completed: 'Completada',
  delivered: 'Entregada',
}

export function MechanicWorkPage() {
  const user = useAuthStore((s) => s.user)
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [reqWoId, setReqWoId] = useState<string | null>(null)
  const [evidenceWoId, setEvidenceWoId] = useState<string | null>(null)

  const ordersQuery = useQuery({
    queryKey: ['workshop', 'my-work-orders', user?.id],
    queryFn: () => fetchMyWorkOrders(user!.id),
    enabled: !!user?.id,
    refetchInterval: 30_000,
  })

  const orders = ordersQuery.data ?? []

  const grouped = useMemo(() => {
    const map: Record<string, MyWorkOrder[]> = {}
    orders.forEach((o) => {
      if (!map[o.status]) map[o.status] = []
      map[o.status].push(o)
    })
    return map
  }, [orders])

  return (
    <PageShell narrow>
      <PageHeader
        eyebrow="Mi trabajo"
        title="Mi trabajo"
        description={`Órdenes asignadas a ${user?.email ?? 'ti'}`}
      />

      {ordersQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon={<Wrench size={28} />} title="Sin órdenes asignadas" description="Cuando se te asigne una OS aparecerá aquí." />
      ) : (
        Object.entries(grouped).map(([status, list]) => (
          <section key={status} className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {STATUS_LABELS[status] ?? status} · {list.length}
            </h2>
            <div className="space-y-3">
              {list.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  open={openOrderId === o.id}
                  onToggle={() => setOpenOrderId(openOrderId === o.id ? null : o.id)}
                  onRequestPart={() => setReqWoId(o.id)}
                  onUploadPhoto={() => setEvidenceWoId(o.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {reqWoId && (
        <PartRequestModal workOrderId={reqWoId} onClose={() => setReqWoId(null)} />
      )}
      {evidenceWoId && (
        <PhotoUploadDrawer workOrderId={evidenceWoId} onClose={() => setEvidenceWoId(null)} />
      )}
    </PageShell>
  )
}

// ── Order Card with expandable lines ─────────────────────────────────────────
function OrderCard({
  order, open, onToggle, onRequestPart, onUploadPhoto,
}: {
  order: MyWorkOrder
  open: boolean
  onToggle: () => void
  onRequestPart: () => void
  onUploadPhoto: () => void
}) {
  const linesQuery = useQuery({
    queryKey: ['workshop', 'lines', order.id],
    queryFn: () => listLines(order.id),
    enabled: open,
  })

  return (
    <article className="executive-panel" style={{ padding: '1rem' }}>
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold" style={{ color: 'var(--text)' }}>{order.order_number}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {order.vehicle_plates ?? '—'} · {order.vehicle_model ?? '—'}
            </p>
            <p className="text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
              <Clock size={10} /> {fmtDate(order.created_at, { relative: true })}
            </p>
          </div>
          <Badge variant={order.status === 'completed' || order.status === 'delivered' ? 'ok' : 'confirmed'}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </div>
      </button>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="lg" onClick={onRequestPart} style={{ flex: '1 1 200px' }}>
          <Package size={14} /> Solicitar refacción
        </Button>
        <Button size="lg" variant="secondary" onClick={onUploadPhoto} style={{ flex: '1 1 200px' }}>
          <Camera size={14} /> Subir foto
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-2">
          {linesQuery.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (linesQuery.data ?? []).length === 0 ? (
            <p className="text-xs italic" style={{ color: 'var(--text-faint)' }}>Sin líneas asignadas.</p>
          ) : (
            linesQuery.data!.map((line) => <BigLineCard key={line.id} line={line} />)
          )}
        </div>
      )}
    </article>
  )
}

// ── Big Line Card — large touch targets for mechanic ─────────────────────────
function BigLineCard({ line }: { line: WorkOrderLine }) {
  const qc = useQueryClient()
  const toast = useToast()
  const refresh = () => qc.invalidateQueries({ queryKey: ['workshop', 'lines'] })

  const start = useMutation({ mutationFn: () => startLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })
  const pause = useMutation({ mutationFn: () => pauseLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })
  const resume = useMutation({ mutationFn: () => resumeLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })
  const finish = useMutation({ mutationFn: () => finishLine(line.id), onSuccess: refresh, onError: () => toast.error('Error') })

  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>{line.service_name ?? 'Servicio'}</p>
        <LineStatusPill status={line.status} />
      </div>
      {line.actual_duration_minutes != null && (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>
          {line.actual_duration_minutes} min trabajados
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {line.status === 'pending' && (
          <Button size="lg" loading={start.isPending} onClick={() => start.mutate()} className="col-span-2">
            <Play size={16} /> Iniciar
          </Button>
        )}
        {line.status === 'in_progress' && (
          <>
            <Button size="lg" variant="secondary" loading={pause.isPending} onClick={() => pause.mutate()}>
              <Pause size={16} /> Pausar
            </Button>
            <Button size="lg" loading={finish.isPending} onClick={() => finish.mutate()}>
              <Square size={16} /> Finalizar
            </Button>
          </>
        )}
        {line.status === 'paused' && (
          <Button size="lg" loading={resume.isPending} onClick={() => resume.mutate()} className="col-span-2">
            <Play size={16} /> Reanudar
          </Button>
        )}
      </div>
    </div>
  )
}

function LineStatusPill({ status }: { status: LineStatus }) {
  const cfg: Record<LineStatus, { label: string; variant: 'ok' | 'low' | 'critical' | 'draft' | 'confirmed' }> = {
    pending: { label: 'Pendiente', variant: 'draft' },
    in_progress: { label: 'En proceso', variant: 'confirmed' },
    paused: { label: 'Pausada', variant: 'low' },
    waiting_parts: { label: 'Espera piezas', variant: 'low' },
    completed: { label: 'Completada', variant: 'ok' },
    cancelled: { label: 'Cancelada', variant: 'critical' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
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
    queryKey: ['inventory', 'parts', 'mechanic-request', search],
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
      toast.success('Solicitud enviada')
      qc.invalidateQueries({ queryKey: ['inventory', 'requests'] })
      onClose()
    },
    onError: () => toast.error('Error al solicitar'),
  })

  return (
    <Modal open onClose={onClose} title="Solicitar refacción">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="search" label="Buscar" placeholder="SKU o nombre"
          value={search} onChange={setSearch}
        />
        <FormField
          name="part_id" label="Refacción" type="select" required
          value={partId} onChange={setPartId}
          placeholder="Seleccionar..."
          options={parts.map(p => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
        />
        <div className="grid gap-4 grid-cols-2">
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

// ── Photo Upload Drawer (camera) ─────────────────────────────────────────────
function PhotoUploadDrawer({ workOrderId, onClose }: { workOrderId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const upload = useMutation({
    mutationFn: () => uploadEvidence(workOrderId, file!, { kind: 'photo', note: note || undefined }),
    onSuccess: () => {
      toast.success('Foto cargada')
      qc.invalidateQueries({ queryKey: ['workshop', 'evidence', workOrderId] })
      onClose()
    },
    onError: () => toast.error('Error al subir'),
  })

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setPreview(URL.createObjectURL(f))
    }
  }

  return (
    <Drawer open onClose={onClose} title="Subir evidencia" size="md">
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileChange}
          className="hidden"
        />

        {preview ? (
          <img
            src={preview}
            alt="preview"
            className="w-full rounded-xl"
            style={{ border: '1px solid var(--border)' }}
          />
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="executive-panel w-full"
            style={{ padding: '3rem 1rem', cursor: 'pointer' }}
          >
            <Camera size={36} className="mx-auto" style={{ color: 'var(--text-faint)' }} />
            <p className="mt-2 text-sm font-bold text-center" style={{ color: 'var(--text)' }}>Tomar foto</p>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>Toca para abrir la cámara</p>
          </button>
        )}

        {preview && (
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} className="w-full">
            <Camera size={12} /> Cambiar foto
          </Button>
        )}

        <FormField
          name="note" label="Nota" type="textarea" rows={2}
          placeholder="Descripción de la evidencia"
          value={note} onChange={setNote}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => upload.mutate()} loading={upload.isPending} disabled={!file}>
            Subir
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
