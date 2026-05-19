/**
 * Detalle mobile de una solicitud de refacción.
 * Acciones por status:
 *   pending   → Aprobar / Rechazar
 *   approved  → Pickear (necesita warehouse_id)
 *   picked    → Confirmar entrega (navega a /warehouse/receive/:id)
 *   delivered → Marcar como usada
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, XCircle, Package, Truck, RotateCcw, AlertTriangle,
  User as UserIcon, FileText, Calendar, Hash,
} from 'lucide-react'
import {
  listInventoryRequests,
  listWarehouses,
  approveInventoryRequest,
  rejectInventoryRequest,
  pickInventoryRequest,
  useInventoryRequest,
  returnInventoryRequest,
} from '../api'
import type { InventoryRequest, Paginated, Warehouse } from '../api/types'
import { MobileShell } from '../components/mobile/MobileShell'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { FormField } from '../components/ui/FormField'
import { Button } from '../components/ui/Button'
import { useToast } from '../components/ui/ToastProvider'
import { fmtDate } from '../utils/format'
import { StatusBadge } from './WarehouseHome'
import type { BottomAction } from '../components/mobile/BottomActionBar'

export function WarehouseRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  const [rejectOpen, setRejectOpen] = useState(false)
  const [pickOpen, setPickOpen] = useState(false)

  // Carga lista paginada y selecciona — más simple que un endpoint /requests/{id}
  const query = useQuery<Paginated<InventoryRequest>>({
    queryKey: ['warehouse', 'requests'],
    queryFn: () => listInventoryRequests({ page: 1, page_size: 200 }),
  })

  const request = useMemo(
    () => (query.data?.items ?? []).find(r => r.id === id) ?? null,
    [query.data, id],
  )

  const invalidate = () => qc.invalidateQueries({ queryKey: ['warehouse', 'requests'] })

  const approve = useMutation({
    mutationFn: () => approveInventoryRequest(id!),
    onSuccess: () => { toast.success('Solicitud aprobada'); invalidate() },
    onError: () => toast.error('No se pudo aprobar'),
  })

  const useReq = useMutation({
    mutationFn: () => useInventoryRequest(id!),
    onSuccess: () => { toast.success('Marcada como usada'); invalidate() },
    onError: () => toast.error('Error'),
  })

  const ret = useMutation({
    mutationFn: () => returnInventoryRequest(id!),
    onSuccess: () => { toast.success('Devolución registrada'); invalidate() },
    onError: () => toast.error('Error'),
  })

  const bottomActions = useMemo<BottomAction[] | undefined>(() => {
    if (!request) return undefined
    switch (request.status) {
      case 'pending':
        return [
          { label: 'Rechazar', variant: 'danger', icon: <XCircle size={16} />, onClick: () => setRejectOpen(true) },
          { label: 'Aprobar', variant: 'primary', icon: <CheckCircle size={16} />, loading: approve.isPending, onClick: () => approve.mutate() },
        ]
      case 'approved':
        return [
          { label: 'Rechazar', variant: 'danger', icon: <XCircle size={16} />, onClick: () => setRejectOpen(true) },
          { label: 'Marcar surtida', variant: 'primary', icon: <Package size={16} />, onClick: () => setPickOpen(true) },
        ]
      case 'picked':
        return [
          { label: 'Confirmar entrega', variant: 'primary', icon: <Truck size={16} />, onClick: () => navigate(`/warehouse/receive/${request.id}`) },
        ]
      case 'delivered':
        return [
          { label: 'Devolver', variant: 'secondary', icon: <RotateCcw size={16} />, loading: ret.isPending, onClick: () => ret.mutate() },
          { label: 'Marcar usada', variant: 'primary', icon: <CheckCircle size={16} />, loading: useReq.isPending, onClick: () => useReq.mutate() },
        ]
      default:
        return undefined
    }
  }, [request, approve, useReq, ret, navigate])

  return (
    <MobileShell
      title={request ? `SA-${request.id.slice(0, 6).toUpperCase()}` : 'Solicitud'}
      subtitle={request ? `Estado: ${request.status}` : undefined}
      onBack={() => navigate('/warehouse')}
      headerAction={request ? <StatusBadge status={request.status} /> : undefined}
      bottomActions={bottomActions}
    >
      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !request ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          Solicitud no encontrada o sin acceso.
        </div>
      ) : (
        <RequestBody request={request} />
      )}

      {request && rejectOpen && (
        <RejectModal requestId={request.id} onClose={() => setRejectOpen(false)} />
      )}
      {request && pickOpen && (
        <PickModal requestId={request.id} onClose={() => setPickOpen(false)} />
      )}
    </MobileShell>
  )
}

// ── Body ─────────────────────────────────────────────────────────────────────

function RequestBody({ request }: { request: InventoryRequest }) {
  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Datos solicitud */}
      <section className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Datos solicitud
        </h2>
        <DataRow icon={<Hash size={14} />} label="Folio" value={`SA-${request.id.slice(0, 6).toUpperCase()}`} mono />
        <DataRow icon={<Calendar size={14} />} label="Solicitada" value={fmtDate(request.created_at, { relative: true })} />
        <DataRow icon={<UserIcon size={14} />} label="Mecánico" value={request.requested_by_email ?? '—'} />
        <DataRow icon={<FileText size={14} />} label="OS asociada" value={request.work_order_number ?? request.work_order_id.slice(0, 8)} mono />
        <DataRow
          icon={<AlertTriangle size={14} />}
          label="Prioridad"
          value={PRIORITY_LABEL[request.priority] ?? request.priority}
          highlight={request.priority === 'urgent' || request.priority === 'high'}
        />
        {request.notes && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {request.notes}
          </div>
        )}
      </section>

      {/* Items solicitados */}
      <section className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Item solicitado
        </h2>
        <div className="flex items-start gap-3 py-2">
          <div className="rounded-xl bg-amber-100 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300 w-11 h-11 flex items-center justify-center flex-shrink-0">
            <Package size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              {request.part_name ?? `Refacción ${request.part_id.slice(0, 6)}`}
            </p>
            <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {request.part_sku ?? request.part_id.slice(0, 8)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tabular-nums leading-none" style={{ color: 'var(--text)' }}>
              {request.quantity}
            </p>
            <p className="text-[10px] uppercase font-bold tracking-wider mt-1" style={{ color: 'var(--text-faint)' }}>
              piezas
            </p>
          </div>
        </div>
      </section>

      {/* Timeline simple */}
      <section className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
          Historial
        </h2>
        <TimelineEntry
          label="Solicitud creada"
          when={request.created_at}
          done
        />
        {request.updated_at && request.updated_at !== request.created_at && (
          <TimelineEntry
            label={`Estado actual: ${request.status}`}
            when={request.updated_at}
            done
            highlight
          />
        )}
        {request.rejected_reason && (
          <p className="mt-2 text-xs rounded-lg bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 p-3">
            Motivo de rechazo: {request.rejected_reason}
          </p>
        )}
      </section>
    </div>
  )
}

// ── Reusable bits ────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
}

function DataRow({
  icon, label, value, mono, highlight,
}: {
  icon: React.ReactNode; label: string; value: string; mono?: boolean; highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
        {icon}
        {label}
      </div>
      <span
        className={
          'text-sm font-semibold ' +
          (mono ? 'font-mono ' : '') +
          (highlight ? 'text-amber-700 dark:text-amber-300' : '')
        }
        style={!highlight ? { color: 'var(--text)' } : undefined}
      >
        {value}
      </span>
    </div>
  )
}

function TimelineEntry({
  label, when, done, highlight,
}: { label: string; when: string; done: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span
        className={
          'mt-1 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ' +
          (highlight ? 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.25)]' : done ? 'bg-emerald-500' : 'bg-slate-300')
        }
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold capitalize" style={{ color: 'var(--text)' }}>{label}</p>
        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{fmtDate(when, { relative: true })}</p>
      </div>
    </div>
  )
}

// ── Modals ───────────────────────────────────────────────────────────────────

function RejectModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => rejectInventoryRequest(requestId, reason),
    onSuccess: () => {
      toast.success('Solicitud rechazada')
      qc.invalidateQueries({ queryKey: ['warehouse', 'requests'] })
      onClose()
    },
    onError: () => toast.error('No se pudo rechazar'),
  })

  return (
    <Modal open onClose={onClose} title="Rechazar solicitud">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) mutation.mutate() }}>
        <FormField
          name="reason"
          label="Motivo del rechazo"
          type="textarea"
          required
          rows={3}
          value={reason}
          onChange={setReason}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={mutation.isPending}>Rechazar</Button>
        </div>
      </form>
    </Modal>
  )
}

function PickModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [warehouseId, setWarehouseId] = useState('')

  const whQuery = useQuery({ queryKey: ['inventory', 'warehouses'], queryFn: listWarehouses })
  const warehouses: Warehouse[] = whQuery.data ?? []

  const mutation = useMutation({
    mutationFn: () => pickInventoryRequest(requestId, warehouseId),
    onSuccess: () => {
      toast.success('Solicitud surtida')
      qc.invalidateQueries({ queryKey: ['warehouse', 'requests'] })
      onClose()
    },
    onError: () => toast.error('No se pudo surtir'),
  })

  return (
    <Modal open onClose={onClose} title="Marcar como surtida">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (warehouseId) mutation.mutate() }}>
        <FormField
          name="warehouse_id"
          label="Almacén origen"
          type="select"
          required
          value={warehouseId}
          onChange={setWarehouseId}
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
