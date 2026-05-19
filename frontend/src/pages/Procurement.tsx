import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart, Plus, Trash2, Search, X, ClipboardList,
} from 'lucide-react'
import {
  getSuppliers, listParts, listWarehouses,
} from '../api'
import { procurementApi } from '../api/endpoints/procurement'
import type {
  Part, PendingInventoryRequest, PurchaseOrder, PurchaseOrderStatus,
  PurchaseOrderItemCreate, ReceiveItemPayload, Supplier, Warehouse,
} from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Drawer } from '../components/ui/Drawer'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/ToastProvider'

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtCurrency = (val: number | string) =>
  '$' + Number(val).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDateTime = (s: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_BADGE: Record<PurchaseOrderStatus, { label: string; variant: 'draft' | 'confirmed' | 'low' | 'ok' | 'cancelled' }> = {
  draft:              { label: 'Borrador',         variant: 'draft' },
  submitted:          { label: 'Enviada',          variant: 'confirmed' },
  approved:           { label: 'Aprobada',         variant: 'low' },
  partially_received: { label: 'Recibida parcial', variant: 'confirmed' },
  received:           { label: 'Recibida',         variant: 'ok' },
  cancelled:          { label: 'Cancelada',        variant: 'cancelled' },
}

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cfg = STATUS_BADGE[status]
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

// ── New PO Modal ─────────────────────────────────────────────────────────────
interface NewPOModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  seedFromIrs?: PendingInventoryRequest[]
}

function NewPOModal({ open, onClose, onSaved, seedFromIrs }: NewPOModalProps) {
  const toast = useToast()
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [expectedAt, setExpectedAt] = useState('')
  const [items, setItems] = useState<Array<PurchaseOrderItemCreate & { _key: string; _label?: string; _sku?: string }>>([])
  const [partSearch, setPartSearch] = useState('')
  const [showPartPicker, setShowPartPicker] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Pre-cargar items desde IRs pendientes (cuando se abre el modal con seed)
  useEffect(() => {
    if (!open || !seedFromIrs || seedFromIrs.length === 0) return
    setItems(
      seedFromIrs.map((r) => ({
        _key: `ir-${r.id}`,
        _label: r.part_name ?? r.part_id,
        _sku: r.part_sku ?? undefined,
        part_id: r.part_id,
        quantity: r.quantity,
        unit_cost: r.last_unit_cost ?? 0,
        inventory_request_id: r.id,
      })),
    )
    const supplierIds = new Set(
      seedFromIrs.map((r) => r.default_supplier_id).filter(Boolean) as string[],
    )
    if (supplierIds.size === 1) {
      const only = [...supplierIds][0]
      if (only) setSupplierId(only)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedFromIrs?.map((r) => r.id).join('|')])

  const suppliersQ = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
    enabled: open,
  })

  const partsQ = useQuery({
    queryKey: ['inventory', 'parts', partSearch],
    queryFn: () => listParts({ q: partSearch || undefined, page: 1, page_size: 30, only_active: true }),
    enabled: open && showPartPicker,
  })

  const reset = () => {
    setSupplierId('')
    setNotes('')
    setExpectedAt('')
    setItems([])
    setPartSearch('')
    setShowPartPicker(false)
  }

  const close = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const addPart = (p: Part) => {
    if (items.some((it) => it.part_id === p.id)) {
      toast.warning('Esa refacción ya está en la orden')
      return
    }
    setItems((prev) => [
      ...prev,
      {
        _key: `${p.id}-${Date.now()}`,
        part_id: p.id,
        quantity: 1,
        unit_cost: p.last_unit_cost ?? 0,
      },
    ])
    setShowPartPicker(false)
    setPartSearch('')
  }

  const updateItem = (key: string, patch: Partial<PurchaseOrderItemCreate>) => {
    setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)))
  }

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((it) => it._key !== key))

  const total = useMemo(
    () => items.reduce((acc, it) => acc + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0),
    [items],
  )

  const partsById = useMemo(() => {
    const map = new Map<string, Part>()
    for (const it of items) {
      const found = (partsQ.data?.items ?? []).find((p) => p.id === it.part_id)
      if (found) map.set(it.part_id, found)
    }
    return map
  }, [items, partsQ.data])

  const submit = async () => {
    if (!supplierId) return toast.warning('Selecciona un proveedor')
    if (items.length === 0) return toast.warning('Agrega al menos un item')
    for (const it of items) {
      if (!it.quantity || it.quantity <= 0) return toast.warning('Cantidad debe ser > 0')
      if (it.unit_cost < 0) return toast.warning('Costo inválido')
    }
    setSubmitting(true)
    try {
      await procurementApi.create({
        supplier_id: supplierId,
        notes: notes || null,
        expected_at: expectedAt || null,
        items: items.map(({ _key, _label, _sku, ...rest }) => rest),
      })
      toast.success('Orden creada')
      onSaved()
      reset()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Error creando orden')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nueva orden de compra"
      description="Selecciona proveedor y agrega refacciones"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={submitting}>
            Crear borrador
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Supplier */}
        <div>
          <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
            Proveedor
          </label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">— Selecciona —</option>
            {(suppliersQ.data ?? []).filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Expected + notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
              Fecha esperada (opcional)
            </label>
            <input
              type="datetime-local"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referencia interna, OC ext, etc."
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Items ({items.length})
            </p>
            <Button variant="secondary" size="sm" onClick={() => setShowPartPicker(true)}>
              <Plus size={14} /> Agregar refacción
            </Button>
          </div>

          {items.length === 0 ? (
            <div
              className="rounded-lg px-4 py-6 text-center text-sm italic"
              style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)', color: 'var(--text-faint)' }}
            >
              Sin items todavía
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const part = partsById.get(it.part_id)
                return (
                  <div
                    key={it._key}
                    className="grid grid-cols-12 gap-2 items-center rounded-lg px-3 py-2"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="col-span-12 sm:col-span-5 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                        {part?.name ?? it._label ?? it.part_id}
                      </p>
                      {(part?.sku || it._sku) && (
                        <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                          {part?.sku ?? it._sku}
                        </p>
                      )}
                      {it.inventory_request_id && (
                        <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                          ← solicitud {it.inventory_request_id.slice(0, 8)}…
                        </p>
                      )}
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      value={it.quantity}
                      onChange={(e) => updateItem(it._key, { quantity: Number(e.target.value) })}
                      className="col-span-4 sm:col-span-2 px-2 py-1.5 rounded-lg text-sm text-right focus:outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      placeholder="Cant"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.unit_cost}
                      onChange={(e) => updateItem(it._key, { unit_cost: Number(e.target.value) })}
                      className="col-span-4 sm:col-span-3 px-2 py-1.5 rounded-lg text-sm text-right focus:outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      placeholder="Costo"
                    />
                    <div className="col-span-3 sm:col-span-1 text-right text-xs font-bold" style={{ color: 'var(--text)' }}>
                      {fmtCurrency(Number(it.quantity || 0) * Number(it.unit_cost || 0))}
                    </div>
                    <button
                      onClick={() => removeItem(it._key)}
                      className="col-span-1 sm:col-span-1 flex justify-end"
                      style={{ color: '#fca5a5' }}
                      aria-label="Quitar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
              <div className="flex justify-end pt-2">
                <p className="text-sm font-black" style={{ color: 'var(--text)' }}>
                  Total: {fmtCurrency(total)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Part picker overlay */}
      {showPartPicker && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4"
          style={{ background: 'rgba(2,6,23,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => e.target === e.currentTarget && setShowPartPicker(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                autoFocus
                value={partSearch}
                onChange={(e) => setPartSearch(e.target.value)}
                placeholder="Buscar por SKU o nombre…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: 'var(--text)' }}
              />
              <button onClick={() => setShowPartPicker(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {partsQ.isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (partsQ.data?.items ?? []).length === 0 ? (
                <p className="p-6 text-center text-sm italic" style={{ color: 'var(--text-faint)' }}>
                  Sin resultados
                </p>
              ) : (
                (partsQ.data?.items ?? []).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addPart(p)}
                    className="w-full text-left px-4 py-2 hover:bg-[var(--surface-2)] transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{p.name}</p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                      {p.sku} {p.last_unit_cost != null && `· último costo ${fmtCurrency(p.last_unit_cost)}`}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Receive Modal ────────────────────────────────────────────────────────────
interface ReceiveModalProps {
  po: PurchaseOrder
  onClose: () => void
  onSaved: () => void
}

function ReceiveModal({ po, onClose, onSaved }: ReceiveModalProps) {
  const toast = useToast()
  const [warehouseId, setWarehouseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [receipts, setReceipts] = useState<Record<string, ReceiveItemPayload>>(() =>
    Object.fromEntries(
      po.items.map((it) => {
        const pending = Math.max(0, Number(it.quantity) - Number(it.quantity_received ?? 0))
        return [
          it.id,
          { item_id: it.id, quantity_received: pending, unit_cost: Number(it.unit_cost) },
        ]
      }),
    ),
  )

  const whQ = useQuery<Warehouse[]>({
    queryKey: ['inventory', 'warehouses'],
    queryFn: listWarehouses,
  })

  const submit = async () => {
    if (!warehouseId) return toast.warning('Selecciona el almacén destino')
    const payload = Object.values(receipts).filter((r) => Number(r.quantity_received) > 0)
    if (payload.length === 0) return toast.warning('Captura al menos una cantidad recibida')
    setSubmitting(true)
    try {
      await procurementApi.receive(po.id, {
        warehouse_id: warehouseId,
        receipts: payload,
      })
      toast.success('Recepción registrada')
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Error al recibir')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Recibir ${po.folio}`}
      description="Captura cantidades parciales si la mercancía llega en varias entregas. Ajusta el costo final si difiere."
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={submitting}>
            Confirmar recepción
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
            Almacén destino
          </label>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">— Selecciona —</option>
            {(whQ.data ?? []).filter((w) => w.active).map((w) => (
              <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          {po.items.map((it) => {
            const r = receipts[it.id]
            const received = Number(it.quantity_received ?? 0)
            const ordered = Number(it.quantity)
            const pending = Math.max(0, ordered - received)
            return (
              <div
                key={it.id}
                className="grid grid-cols-12 gap-2 items-center rounded-lg px-3 py-2"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="col-span-12 sm:col-span-5 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                    {it.part_name ?? it.part_id}
                  </p>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                    {it.part_sku} · recibido {received}/{ordered} · pendiente {pending}
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={pending}
                  step="0.001"
                  value={r.quantity_received}
                  onChange={(e) =>
                    setReceipts((prev) => ({
                      ...prev,
                      [it.id]: { ...prev[it.id], quantity_received: Number(e.target.value) },
                    }))
                  }
                  className="col-span-6 sm:col-span-3 px-2 py-1.5 rounded-lg text-sm text-right focus:outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Cant recibida"
                  disabled={pending === 0}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={r.unit_cost ?? ''}
                  onChange={(e) =>
                    setReceipts((prev) => ({
                      ...prev,
                      [it.id]: {
                        ...prev[it.id],
                        unit_cost: e.target.value === '' ? null : Number(e.target.value),
                      },
                    }))
                  }
                  className="col-span-6 sm:col-span-4 px-2 py-1.5 rounded-lg text-sm text-right focus:outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Costo final"
                />
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

// ── Detail Drawer ────────────────────────────────────────────────────────────
interface DetailDrawerProps {
  poId: string | null
  onClose: () => void
}

function DetailDrawer({ poId, onClose }: DetailDrawerProps) {
  const qc = useQueryClient()
  const toast = useToast()
  const [showReceive, setShowReceive] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const poQ = useQuery({
    queryKey: ['procurement', 'po', poId],
    queryFn: () => procurementApi.get(poId!),
    enabled: !!poId,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['procurement'] })
  }

  const submit = useMutation({
    mutationFn: () => procurementApi.submit(poId!),
    onSuccess: () => { toast.success('Orden enviada'); invalidate() },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Error')
    },
  })

  const approve = useMutation({
    mutationFn: () => procurementApi.approve(poId!),
    onSuccess: () => { toast.success('Orden aprobada'); invalidate() },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Error')
    },
  })

  const cancel = useMutation({
    mutationFn: () => procurementApi.cancel(poId!, cancelReason || undefined),
    onSuccess: () => {
      toast.success('Orden cancelada')
      setCancelOpen(false)
      setCancelReason('')
      invalidate()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Error')
    },
  })

  if (!poId) return null

  const po = poQ.data
  const loading = poQ.isLoading

  return (
    <>
      <Drawer
        open={!!poId}
        onClose={onClose}
        title={po?.folio ?? 'Cargando…'}
        description={po?.supplier_name ?? ''}
        size="lg"
        footer={
          po && (
            <div className="flex flex-wrap gap-2 justify-end w-full">
              {po.status === 'draft' && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>Cancelar</Button>
                  <Button variant="primary" size="sm" onClick={() => submit.mutate()} loading={submit.isPending}>
                    Enviar a aprobación
                  </Button>
                </>
              )}
              {po.status === 'submitted' && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>Cancelar</Button>
                  <Button variant="primary" size="sm" onClick={() => approve.mutate()} loading={approve.isPending}>
                    Aprobar
                  </Button>
                </>
              )}
              {po.status === 'approved' && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}>Cancelar</Button>
                  <Button variant="primary" size="sm" onClick={() => setShowReceive(true)}>
                    Recibir mercancía
                  </Button>
                </>
              )}
              {po.status === 'partially_received' && (
                <Button variant="primary" size="sm" onClick={() => setShowReceive(true)}>
                  Continuar recepción
                </Button>
              )}
            </div>
          )
        }
      >
        {loading || !po ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge status={po.status} />
              <span className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>
                {po.id.slice(0, 8)}…
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Creada</p>
                <p style={{ color: 'var(--text)' }}>{fmtDateTime(po.created_at)}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Esperada</p>
                <p style={{ color: 'var(--text)' }}>{fmtDateTime(po.expected_at)}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Enviada</p>
                <p style={{ color: 'var(--text)' }}>{fmtDateTime(po.submitted_at)}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Aprobada</p>
                <p style={{ color: 'var(--text)' }}>{fmtDateTime(po.approved_at)}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Recibida</p>
                <p style={{ color: 'var(--text)' }}>{fmtDateTime(po.received_at)}</p>
              </div>
              <div>
                <p className="font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Total</p>
                <p style={{ color: 'var(--text)' }} className="font-bold">{fmtCurrency(po.total_amount)}</p>
              </div>
            </div>

            {po.notes && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
                  Notas
                </p>
                <p className="text-sm" style={{ color: 'var(--text)' }}>{po.notes}</p>
              </div>
            )}

            {po.cancel_reason && (
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-0.5">Motivo cancelación</p>
                <p className="text-sm">{po.cancel_reason}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
                Items ({po.items.length})
              </p>
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--surface-2)' }}>
                    <tr>
                      <th className="px-3 py-2 text-left">Refacción</th>
                      <th className="px-3 py-2 text-right">Cant</th>
                      <th className="px-3 py-2 text-right">Recibido</th>
                      <th className="px-3 py-2 text-right">Costo</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((it) => {
                      const ordered = Number(it.quantity)
                      const received = Number(it.quantity_received ?? 0)
                      const complete = received >= ordered && ordered > 0
                      return (
                        <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                          <td className="px-3 py-2">
                            <p className="font-bold" style={{ color: 'var(--text)' }}>{it.part_name ?? '—'}</p>
                            <p className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>{it.part_sku}</p>
                            {it.inventory_request_id && (
                              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                                ← solicitud {it.inventory_request_id.slice(0, 8)}…
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: 'var(--text-muted)' }}>{ordered}</td>
                          <td
                            className="px-3 py-2 text-right font-bold"
                            style={{ color: complete ? 'var(--text)' : '#fbbf24' }}
                          >
                            {received}/{ordered}
                          </td>
                          <td className="px-3 py-2 text-right" style={{ color: 'var(--text-muted)' }}>{fmtCurrency(it.unit_cost)}</td>
                          <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--text)' }}>{fmtCurrency(it.line_total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {showReceive && po && (
        <ReceiveModal
          po={po}
          onClose={() => setShowReceive(false)}
          onSaved={() => {
            setShowReceive(false)
            invalidate()
          }}
        />
      )}

      {cancelOpen && (
        <Modal
          open
          onClose={() => setCancelOpen(false)}
          title="Cancelar orden"
          size="sm"
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)}>Cerrar</Button>
              <Button variant="danger" size="sm" onClick={() => cancel.mutate()} loading={cancel.isPending}>
                Confirmar cancelación
              </Button>
            </>
          }
        >
          <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
            Motivo (opcional)
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </Modal>
      )}
    </>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
type Tab = 'orders' | 'pending'

export function ProcurementPage() {
  const [tab, setTab] = useState<Tab>('orders')
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | ''>('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [openNew, setOpenNew] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [preselectedIrIds, setPreselectedIrIds] = useState<string[]>([])
  const qc = useQueryClient()

  const suppliersQ = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
  })

  const listQ = useQuery({
    queryKey: ['procurement', 'list', { statusFilter, supplierFilter, dateFrom, dateTo, page }],
    queryFn: () =>
      procurementApi.list({
        status: statusFilter || undefined,
        supplier_id: supplierFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: 25,
      }),
    enabled: tab === 'orders',
  })

  const pendingQ = useQuery({
    queryKey: ['procurement', 'pending'],
    queryFn: () => procurementApi.pendingInventoryRequests(),
    enabled: tab === 'pending',
  })

  const items = listQ.data?.items ?? []
  const pendingItems = pendingQ.data?.items ?? []

  const seedFromIrs: PendingInventoryRequest[] = useMemo(() => {
    if (preselectedIrIds.length === 0) return []
    return pendingItems.filter((r) => preselectedIrIds.includes(r.id))
  }, [pendingItems, preselectedIrIds])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Ola 6"
        title="Procurement"
        description="Órdenes de compra a proveedores. Borrador → enviada → aprobada → recibida (total o parcial)."
        actions={
          <Button variant="primary" size="sm" onClick={() => { setPreselectedIrIds([]); setOpenNew(true) }}>
            <Plus size={14} /> Nueva orden
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={() => setTab('orders')}
          className="px-4 py-2 text-sm font-bold transition-colors"
          style={{
            color: tab === 'orders' ? 'var(--text)' : 'var(--text-muted)',
            borderBottom: tab === 'orders' ? '2px solid var(--accent, #f97316)' : '2px solid transparent',
          }}
        >
          <ShoppingCart size={14} className="inline mr-1" /> Órdenes
        </button>
        <button
          onClick={() => setTab('pending')}
          className="px-4 py-2 text-sm font-bold transition-colors"
          style={{
            color: tab === 'pending' ? 'var(--text)' : 'var(--text-muted)',
            borderBottom: tab === 'pending' ? '2px solid var(--accent, #f97316)' : '2px solid transparent',
          }}
        >
          <ClipboardList size={14} className="inline mr-1" /> Solicitudes pendientes
          {pendingQ.data?.total ? (
            <span
              className="ml-2 inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 py-0.5"
              style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
            >
              {pendingQ.data.total}
            </span>
          ) : null}
        </button>
      </div>

      {tab === 'pending' ? (
        <PendingRequestsSection
          loading={pendingQ.isLoading}
          isError={pendingQ.isError}
          items={pendingItems}
          onCreatePO={(ids) => { setPreselectedIrIds(ids); setOpenNew(true) }}
        />
      ) : (
      <>
      {/* Filters */}
      <div
        className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as PurchaseOrderStatus | ''); setPage(1) }}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">Todos</option>
            <option value="draft">Borrador</option>
            <option value="submitted">Enviada</option>
            <option value="approved">Aprobada</option>
            <option value="partially_received">Recibida parcial</option>
            <option value="received">Recibida</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
            Proveedor
          </label>
          <select
            value={supplierFilter}
            onChange={(e) => { setSupplierFilter(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">Todos</option>
            {(suppliersQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
            Desde
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>
            Hasta
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* List */}
      {listQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : listQ.isError ? (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
          Error cargando órdenes
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-xl"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <EmptyState
            icon={<ShoppingCart size={28} />}
            title="Sin órdenes de compra"
            description="Crea tu primera orden para reabastecer inventario."
            action={
              <Button variant="primary" size="sm" onClick={() => setOpenNew(true)}>
                <Plus size={14} /> Nueva orden
              </Button>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--surface-2)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Folio</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Proveedor</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Status</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Items</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Total</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Creada</th>
                </tr>
              </thead>
              <tbody>
                {items.map((po) => (
                  <tr
                    key={po.id}
                    onClick={() => setDetailId(po.id)}
                    className="cursor-pointer transition-colors"
                    style={{ borderTop: '1px solid var(--border)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>{po.folio}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{po.supplier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={po.status} /></td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>{po.items.length}</td>
                    <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text)' }}>{fmtCurrency(po.total_amount)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(po.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {listQ.data && listQ.data.total > listQ.data.page_size && (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Página {listQ.data.page} · {listQ.data.total} en total
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * (listQ.data?.page_size ?? 25) >= (listQ.data?.total ?? 0)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Modals */}
      <NewPOModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSaved={() => {
          setOpenNew(false)
          setPreselectedIrIds([])
          qc.invalidateQueries({ queryKey: ['procurement'] })
        }}
        seedFromIrs={seedFromIrs.length > 0 ? seedFromIrs : undefined}
      />

      <DetailDrawer poId={detailId} onClose={() => setDetailId(null)} />
    </PageShell>
  )
}

// ── Pending Requests Section ─────────────────────────────────────────────────
interface PendingRequestsSectionProps {
  loading: boolean
  isError: boolean
  items: PendingInventoryRequest[]
  onCreatePO: (ids: string[]) => void
}

function PendingRequestsSection({ loading, isError, items, onCreatePO }: PendingRequestsSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const grouped = useMemo(() => {
    // Agrupar por default_supplier_id para sugerir crear un PO por proveedor
    const map = new Map<string, PendingInventoryRequest[]>()
    for (const r of items) {
      const key = r.default_supplier_id ?? '__none__'
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    return map
  }, [items])

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    )
  }
  if (isError) {
    return (
      <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
        Error cargando solicitudes pendientes
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="Sin solicitudes pendientes"
          description="Todas las solicitudes de inventario aprobadas ya están canalizadas a una orden de compra."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {selected.size} seleccionada{selected.size === 1 ? '' : 's'} de {items.length}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onCreatePO([...selected])}
          disabled={selected.size === 0}
        >
          <Plus size={14} /> Crear PO con seleccionadas
        </Button>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--surface-2)' }}>
            <tr>
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Refacción</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Cantidad</th>
              <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Prioridad</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Último costo</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].flatMap(([supplierKey, group]) => [
              <tr key={`group-${supplierKey}`} style={{ background: 'var(--surface-2)' }}>
                <td colSpan={6} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                  Proveedor default:{' '}
                  {supplierKey === '__none__' ? 'sin asignar' : supplierKey.slice(0, 8) + '…'}
                  {' · '}
                  {group.length} item{group.length === 1 ? '' : 's'}
                </td>
              </tr>,
              ...group.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold" style={{ color: 'var(--text)' }}>{r.part_name ?? '—'}</p>
                    <p className="font-mono text-[10px]" style={{ color: 'var(--text-faint)' }}>{r.part_sku ?? r.part_id}</p>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text)' }}>{r.quantity}</td>
                  <td className="px-4 py-3 text-center text-xs" style={{ color: 'var(--text-muted)' }}>{r.priority}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>
                    {r.last_unit_cost != null ? fmtCurrency(r.last_unit_cost) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{r.status}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}
