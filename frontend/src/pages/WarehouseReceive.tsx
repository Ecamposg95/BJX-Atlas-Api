/**
 * Flujo móvil "Recibir mercancía" para una solicitud de refacción.
 *
 * - Lee la solicitud (via list + filter) y muestra el item con checkbox
 *   + input de cantidad recibida.
 * - Permite adjuntar foto(s) acuse vía <PhotoCapture autoUpload>.
 * - Al confirmar: si la solicitud está en `picked`, llama deliver.
 *   Si está en `approved`, hace pick→deliver. Si ya está delivered, sólo
 *   guarda evidencias.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, Plus, Trash2 } from 'lucide-react'
import {
  listInventoryRequests,
  listWarehouses,
  deliverInventoryRequest,
  pickInventoryRequest,
} from '../api'
import type {
  InventoryRequest, Paginated, Warehouse,
} from '../api/types'
import { MobileShell } from '../components/mobile/MobileShell'
import { PhotoCapture, type UploadedEvidence } from '../components/mobile/PhotoCapture'
import { Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/ToastProvider'
import { StatusBadge } from './WarehouseHome'

export function WarehouseReceivePage() {
  const { requestId } = useParams<{ requestId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  // State
  const [checked, setChecked] = useState(true)
  const [receivedQty, setReceivedQty] = useState<number | ''>('')
  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [evidences, setEvidences] = useState<UploadedEvidence[]>([])
  const [extraCapture, setExtraCapture] = useState(false)

  // Data
  const query = useQuery<Paginated<InventoryRequest>>({
    queryKey: ['warehouse', 'requests'],
    queryFn: () => listInventoryRequests({ page: 1, page_size: 200 }),
  })
  const whQuery = useQuery<Warehouse[]>({
    queryKey: ['inventory', 'warehouses'],
    queryFn: listWarehouses,
  })

  const request = useMemo(
    () => (query.data?.items ?? []).find(r => r.id === requestId) ?? null,
    [query.data, requestId],
  )

  // Initialize received qty default to requested qty
  useEffect(() => {
    if (request && receivedQty === '') {
      setReceivedQty(request.quantity)
    }
  }, [request, receivedQty])

  const warehouses = whQuery.data ?? []

  // Mutation
  const confirm = useMutation({
    mutationFn: async () => {
      if (!request) throw new Error('No request')
      // Necesita pick antes de deliver si está en approved
      if (request.status === 'approved') {
        if (!warehouseId) throw new Error('Selecciona almacén')
        await pickInventoryRequest(request.id, warehouseId)
      }
      if (request.status === 'approved' || request.status === 'picked') {
        await deliverInventoryRequest(request.id)
      }
      // Si está pending: el flujo correcto sería approve → pick → deliver,
      // pero ese flujo lo hace el detalle. Aquí asumimos ya está aprobada.
      return true
    },
    onSuccess: () => {
      toast.success('Recepción confirmada')
      qc.invalidateQueries({ queryKey: ['warehouse', 'requests'] })
      navigate('/warehouse')
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'No se pudo confirmar'
      toast.error(msg)
    },
  })

  // Validation
  const canSubmit =
    !!request
    && checked
    && typeof receivedQty === 'number'
    && receivedQty > 0
    && (request.status !== 'approved' || !!warehouseId)
    && !confirm.isPending

  const handleEvidence = (ev: UploadedEvidence) => {
    setEvidences(prev => [...prev, ev])
    setExtraCapture(false)
  }

  return (
    <MobileShell
      title={request ? `Recibir SA-${request.id.slice(0, 6).toUpperCase()}` : 'Recibir mercancía'}
      subtitle={request ? `OS ${request.work_order_number ?? request.work_order_id.slice(0, 8)}` : undefined}
      onBack={() => navigate('/warehouse')}
      bottomActions={[
        { label: 'Cancelar', variant: 'secondary', onClick: () => navigate('/warehouse') },
        {
          label: 'Confirmar recepción',
          variant: 'primary',
          loading: confirm.isPending,
          disabled: !canSubmit,
          onClick: () => confirm.mutate(),
        },
      ]}
    >
      {query.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !request ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 dark:bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          Solicitud no encontrada.
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-6">
          {/* Header card */}
          <section
            className="rounded-2xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-400/10 p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[0.7rem] uppercase font-bold tracking-wider" style={{ color: 'var(--text-faint)' }}>
                  Folio
                </p>
                <p className="font-mono font-extrabold text-base" style={{ color: 'var(--text)' }}>
                  SA-{request.id.slice(0, 6).toUpperCase()}
                </p>
              </div>
              <StatusBadge status={request.status} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{request.requested_by_email ?? 'Mecánico'}</strong>
              {' · '}
              OS {request.work_order_number ?? request.work_order_id.slice(0, 8)}
            </p>
          </section>

          {/* Items list */}
          <section className="rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <header className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Items a recibir
              </h2>
            </header>
            <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1 h-5 w-5 accent-amber-500 flex-shrink-0"
                aria-label="Marcar item como recibido"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                  {request.part_name ?? `Refacción ${request.part_id.slice(0, 6)}`}
                </p>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
                  {request.part_sku ?? request.part_id.slice(0, 8)}
                </p>
                <div className="flex items-end gap-3 mt-3">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
                      Solicitada
                    </label>
                    <p className="text-lg font-black tabular-nums" style={{ color: 'var(--text-muted)' }}>{request.quantity}</p>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
                      Recibida
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={request.quantity}
                      value={receivedQty}
                      onChange={(e) => {
                        const v = e.target.value
                        setReceivedQty(v === '' ? '' : Math.max(0, Math.min(request.quantity, Number(v))))
                      }}
                      disabled={!checked}
                      className="w-full min-h-12 px-3 py-2 text-lg font-black text-center rounded-xl border-2 disabled:opacity-50"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
                    />
                  </div>
                </div>
              </div>
            </label>
          </section>

          {/* Warehouse selector (only required if status=approved) */}
          {request.status === 'approved' && (
            <section className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Almacén origen
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="min-h-12 px-3 py-2 rounded-xl border-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
                required
              >
                <option value="">Seleccionar almacén...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </section>
          )}

          {/* Photo evidence */}
          <section className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Fotos acuse
              </h2>
              <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                {evidences.length} {evidences.length === 1 ? 'foto' : 'fotos'}
              </span>
            </div>

            {evidences.length > 0 && (
              <ul className="flex flex-col gap-2">
                {evidences.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex items-center gap-3 rounded-xl border p-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <img
                      src={ev.url}
                      alt="Evidencia"
                      className="w-14 h-14 object-cover rounded-lg flex-shrink-0 bg-slate-200 dark:bg-slate-800"
                      loading="lazy"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
                        Evidencia #{ev.id.slice(0, 6)}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                        {ev.mime_type ?? 'image'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEvidences(prev => prev.filter(e => e.id !== ev.id))}
                      className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                      aria-label="Quitar foto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(evidences.length === 0 || extraCapture) ? (
              <PhotoCapture
                label={evidences.length === 0 ? 'Tomar foto acuse' : 'Agregar otra foto'}
                helper="Recomendado: foto del acuse firmado o de los componentes recibidos."
                autoUpload={{
                  kind: 'parts_receipt',
                  workOrderId: request.work_order_id,
                  note: `Solicitud ${request.id}`,
                }}
                onUploaded={handleEvidence}
              />
            ) : (
              <button
                type="button"
                onClick={() => setExtraCapture(true)}
                className="min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10"
              >
                <Plus size={16} /> Agregar otra foto
              </button>
            )}
          </section>

          {/* Notes */}
          <section className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
            <label htmlFor="notes" className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Notas (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Observaciones de la recepción..."
              className="min-h-20 px-3 py-2 rounded-xl border-2 text-sm resize-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            />
          </section>

          {!canSubmit && checked && typeof receivedQty === 'number' && receivedQty === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Camera size={12} /> Indica una cantidad recibida mayor que cero.
            </p>
          )}
        </div>
      )}
    </MobileShell>
  )
}
