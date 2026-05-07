import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, CheckCircle, XCircle, Package, Truck, Search, AlertTriangle, RotateCcw,
} from 'lucide-react'
import {
  listInventoryRequests, approveInventoryRequest, rejectInventoryRequest,
  pickInventoryRequest, deliverInventoryRequest, useInventoryRequest, returnInventoryRequest,
  listWarehouses,
} from '../api'
import type {
  InventoryRequest, InventoryRequestStatus, Warehouse, Paginated,
} from '../api/types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { TableSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { FormField } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'
import { useToast } from '../components/ui/ToastProvider'
import { fmtDate } from '../utils/format'

const STATUS_LABELS: Record<InventoryRequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  picked: 'Pickeada',
  delivered: 'Entregada',
  used: 'Utilizada',
  returned: 'Devuelta',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

const STATUS_COUNTERS: InventoryRequestStatus[] = ['pending', 'approved', 'picked', 'delivered']

export function InventoryRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<InventoryRequestStatus | ''>('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [woSearch, setWoSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const allQuery = useQuery<Paginated<InventoryRequest>>({
    queryKey: ['inventory', 'requests', 'counters'],
    queryFn: () => listInventoryRequests({ page: 1, page_size: 200 }),
    refetchInterval: 30_000,
  })

  const filteredQuery = useQuery<Paginated<InventoryRequest>>({
    queryKey: ['inventory', 'requests', { statusFilter, page }],
    queryFn: () => listInventoryRequests({
      status: statusFilter || undefined,
      page,
      page_size: pageSize,
    }),
    refetchInterval: 30_000,
  })

  const counters = useMemo(() => {
    const items = allQuery.data?.items ?? []
    const map: Record<InventoryRequestStatus, number> = {
      pending: 0, approved: 0, rejected: 0, picked: 0, delivered: 0, used: 0, returned: 0,
    }
    items.forEach((it) => { map[it.status] = (map[it.status] ?? 0) + 1 })
    return map
  }, [allQuery.data])

  const items = (filteredQuery.data?.items ?? []).filter((r) => {
    if (priorityFilter && r.priority !== priorityFilter) return false
    if (woSearch && !(r.work_order_number ?? '').toLowerCase().includes(woSearch.toLowerCase())) return false
    return true
  })

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Solicitudes de refacciones</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Cola del almacén — aprueba, pickea y entrega
        </p>
      </header>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {STATUS_COUNTERS.map((s) => (
          <article key={s} className="executive-kpi">
            <span className="executive-kpi__label">{STATUS_LABELS[s]}</span>
            <strong className="executive-kpi__value">{counters[s]}</strong>
          </article>
        ))}
      </div>

      <section className="executive-panel">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between mb-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as InventoryRequestStatus | ''); setPage(1) }}
              className="px-3 py-2 text-sm"
            >
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 text-sm"
            >
              <option value="">Toda prioridad</option>
              {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
              <input
                type="text"
                value={woSearch}
                onChange={(e) => setWoSearch(e.target.value)}
                placeholder="Buscar OS"
                className="pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {filteredQuery.isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : items.length === 0 ? (
          <EmptyState icon={<ClipboardList size={28} />} title="Sin solicitudes" description="No hay solicitudes con esos filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">OS</th>
                  <th className="text-left">Refacción</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-left">Prioridad</th>
                  <th className="text-left">Solicitante</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <RequestRow key={r.id} request={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Row with actions per status ──────────────────────────────────────────────
function RequestRow({ request }: { request: InventoryRequest }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventory', 'requests'] })

  const approve = useMutation({
    mutationFn: () => approveInventoryRequest(request.id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['inventory', 'requests'] })
    },
    onSuccess: () => { toast.success('Aprobada'); invalidate() },
    onError: () => toast.error('No se pudo aprobar'),
  })

  const deliver = useMutation({
    mutationFn: () => deliverInventoryRequest(request.id),
    onSuccess: () => { toast.success('Entregada'); invalidate() },
    onError: () => toast.error('No se pudo entregar'),
  })

  const useReq = useMutation({
    mutationFn: () => useInventoryRequest(request.id),
    onSuccess: () => { toast.success('Marcada como usada'); invalidate() },
    onError: () => toast.error('Error'),
  })

  const ret = useMutation({
    mutationFn: () => returnInventoryRequest(request.id),
    onSuccess: () => { toast.success('Devolución registrada'); invalidate() },
    onError: () => toast.error('Error'),
  })

  return (
    <tr>
      <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
        {request.work_order_number ?? request.work_order_id.slice(0, 8)}
      </td>
      <td>
        <div className="flex flex-col">
          <span className="font-semibold" style={{ color: 'var(--text)' }}>{request.part_name ?? '—'}</span>
          <span className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{request.part_sku ?? request.part_id.slice(0, 8)}</span>
        </div>
      </td>
      <td className="text-right tabular-nums font-bold">{request.quantity}</td>
      <td><PriorityBadge priority={request.priority} /></td>
      <td style={{ color: 'var(--text-muted)' }}>{request.requested_by_email ?? '—'}</td>
      <td>
        <div className="flex flex-col gap-1">
          <Badge variant={statusVariant(request.status)}>{STATUS_LABELS[request.status]}</Badge>
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{fmtDate(request.created_at, { relative: true })}</span>
        </div>
      </td>
      <td className="text-right">
        <div className="inline-flex gap-1">
          {request.status === 'pending' && (
            <>
              <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate()}>
                <CheckCircle size={12} /> Aprobar
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>
                <XCircle size={12} /> Rechazar
              </Button>
            </>
          )}
          {request.status === 'approved' && (
            <>
              <Button size="sm" onClick={() => setPickOpen(true)}>
                <Package size={12} /> Pickear
              </Button>
              <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>
                <XCircle size={12} /> Rechazar
              </Button>
            </>
          )}
          {request.status === 'picked' && (
            <Button size="sm" loading={deliver.isPending} onClick={() => deliver.mutate()}>
              <Truck size={12} /> Entregar
            </Button>
          )}
          {request.status === 'delivered' && (
            <>
              <Button size="sm" loading={useReq.isPending} onClick={() => useReq.mutate()}>
                <CheckCircle size={12} /> Usada
              </Button>
              <Button size="sm" variant="secondary" loading={ret.isPending} onClick={() => ret.mutate()}>
                <RotateCcw size={12} /> Devolver
              </Button>
            </>
          )}
        </div>
      </td>
      {rejectOpen && (
        <RejectModal request={request} onClose={() => setRejectOpen(false)} />
      )}
      {pickOpen && (
        <PickModal request={request} onClose={() => setPickOpen(false)} />
      )}
    </tr>
  )
}

function statusVariant(s: InventoryRequestStatus): 'ok' | 'low' | 'critical' | 'draft' | 'confirmed' {
  switch (s) {
    case 'pending': return 'low'
    case 'approved': return 'confirmed'
    case 'picked': return 'confirmed'
    case 'delivered': return 'ok'
    case 'used': return 'ok'
    case 'rejected': return 'critical'
    case 'returned': return 'draft'
  }
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { variant: 'ok' | 'low' | 'critical' | 'draft' }> = {
    low: { variant: 'draft' },
    normal: { variant: 'ok' },
    high: { variant: 'low' },
    urgent: { variant: 'critical' },
  }
  return <Badge variant={cfg[priority]?.variant ?? 'draft'}>
    {priority === 'urgent' && <AlertTriangle size={10} className="mr-1" />}
    {PRIORITY_LABELS[priority] ?? priority}
  </Badge>
}

// ── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ request, onClose }: { request: InventoryRequest; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => rejectInventoryRequest(request.id, reason),
    onSuccess: () => {
      toast.success('Solicitud rechazada')
      qc.invalidateQueries({ queryKey: ['inventory', 'requests'] })
      onClose()
    },
    onError: () => toast.error('No se pudo rechazar'),
  })

  return (
    <Modal open onClose={onClose} title="Rechazar solicitud">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="reason" label="Motivo" type="textarea" required rows={3}
          value={reason} onChange={setReason}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={mutation.isPending}>Rechazar</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Pick Modal ───────────────────────────────────────────────────────────────
function PickModal({ request, onClose }: { request: InventoryRequest; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [warehouseId, setWarehouseId] = useState('')

  const whQuery = useQuery({ queryKey: ['inventory', 'warehouses'], queryFn: listWarehouses })
  const warehouses: Warehouse[] = whQuery.data ?? []

  const mutation = useMutation({
    mutationFn: () => pickInventoryRequest(request.id, warehouseId),
    onSuccess: () => {
      toast.success('Pickeada')
      qc.invalidateQueries({ queryKey: ['inventory', 'requests'] })
      onClose()
    },
    onError: () => toast.error('No se pudo pickear'),
  })

  return (
    <Modal open onClose={onClose} title="Pickear desde almacén">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="warehouse_id" label="Almacén" type="select" required
          value={warehouseId} onChange={setWarehouseId}
          placeholder="Seleccionar..."
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  )
}
