import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Warehouse as WarehouseIcon, Truck, AlertTriangle, Plus, Search,
  Filter, ArrowDownToLine, ArrowUpFromLine, Repeat, Sliders,
} from 'lucide-react'
import {
  listParts, createPart, updatePart,
  listWarehouses, createWarehouse,
  listMovements, createMovement, listStock,
} from '../api'
import type {
  Part, Warehouse, InventoryMovement, StockLevel, Paginated,
} from '../api/types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { TableSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { FormField } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/ToastProvider'
import { fmtCurrency, fmtDate, fmtNumber } from '../utils/format'

type TabKey = 'parts' | 'warehouses' | 'movements' | 'low_stock'

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: 'parts', label: 'Refacciones', icon: Package },
  { key: 'warehouses', label: 'Almacenes', icon: WarehouseIcon },
  { key: 'movements', label: 'Movimientos', icon: Truck },
  { key: 'low_stock', label: 'Stock bajo', icon: AlertTriangle },
]

export function InventoryPage() {
  const [tab, setTab] = useState<TabKey>('parts')
  const [partModalOpen, setPartModalOpen] = useState(false)
  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<Part | null>(null)

  return (
    <PageShell>
      <PageHeader
        eyebrow="Inventario"
        title="Inventario"
        description="Refacciones, almacenes y movimientos del taller"
        actions={
          <>
            <Button variant="secondary" onClick={() => setMovementModalOpen(true)}>
              <Truck size={14} /> Nuevo movimiento
            </Button>
            <Button onClick={() => { setEditingPart(null); setPartModalOpen(true) }}>
              <Plus size={14} /> Nueva refacción
            </Button>
          </>
        }
      />

      <nav
        className="flex flex-wrap gap-1 rounded-2xl p-1"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all"
              style={{
                background: active ? 'var(--surface)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
                boxShadow: active ? 'var(--shadow)' : 'none',
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'parts' && <PartsTab onEdit={(p) => { setEditingPart(p); setPartModalOpen(true) }} />}
      {tab === 'warehouses' && <WarehousesTab />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'low_stock' && <PartsTab onlyLowStock onEdit={(p) => { setEditingPart(p); setPartModalOpen(true) }} />}

      {partModalOpen && (
        <PartModal
          part={editingPart}
          onClose={() => { setPartModalOpen(false); setEditingPart(null) }}
        />
      )}
      {movementModalOpen && <MovementModal onClose={() => setMovementModalOpen(false)} />}
    </PageShell>
  )
}

// ── Parts Tab ────────────────────────────────────────────────────────────────
function PartsTab({
  onlyLowStock, onEdit,
}: { onlyLowStock?: boolean; onEdit: (p: Part) => void }) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const partsQuery = useQuery<Paginated<Part>>({
    queryKey: ['inventory', 'parts', { search, page, onlyLowStock }],
    queryFn: () => listParts({
      q: search || undefined,
      only_low_stock: onlyLowStock || undefined,
      page,
      page_size: pageSize,
    }),
  })

  const items = partsQuery.data?.items ?? []
  const total = partsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="executive-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por SKU o nombre"
            className="w-full pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          {total} {total === 1 ? 'refacción' : 'refacciones'}
        </span>
      </div>

      {partsQuery.isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title={onlyLowStock ? 'Sin alertas de stock bajo' : 'Sin refacciones'}
          description={onlyLowStock ? 'Todo bajo control.' : 'Crea la primera refacción.'}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">SKU</th>
                <th className="text-left">Nombre</th>
                <th className="text-left">Categoría</th>
                <th className="text-right">Disponible</th>
                <th className="text-right">Min / Max</th>
                <th className="text-right">Último costo</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{p.sku}</td>
                  <td className="font-semibold" style={{ color: 'var(--text)' }}>{p.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{p.category ?? '—'}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <span className="font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                        {fmtNumber(p.total_available ?? 0)}
                      </span>
                      {p.is_low_stock && <Badge variant="critical">Bajo</Badge>}
                    </div>
                  </td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {p.min_stock} / {p.max_stock ?? '—'}
                  </td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {p.last_unit_cost != null ? fmtCurrency(p.last_unit_cost) : '—'}
                  </td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>Editar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
            {page} / {totalPages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}
    </section>
  )
}

// ── Warehouses Tab ───────────────────────────────────────────────────────────
function WarehousesTab() {
  const [selected, setSelected] = useState<Warehouse | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const whQuery = useQuery({
    queryKey: ['inventory', 'warehouses'],
    queryFn: listWarehouses,
  })

  const stockQuery = useQuery<StockLevel[]>({
    queryKey: ['inventory', 'stock', selected?.id],
    queryFn: () => listStock({ warehouse_id: selected!.id }),
    enabled: !!selected,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Almacenes activos
        </h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nuevo almacén
        </Button>
      </div>

      {whQuery.isLoading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : (whQuery.data ?? []).length === 0 ? (
        <EmptyState icon={<WarehouseIcon size={28} />} title="Sin almacenes" description="Crea el primer almacén." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(whQuery.data ?? []).map((w) => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className="executive-panel text-left transition-all hover:-translate-y-0.5"
              style={{ cursor: 'pointer' }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="rounded-xl p-2.5"
                  style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary-dark)' }}
                >
                  <WarehouseIcon size={18} />
                </div>
                <Badge variant={w.active ? 'ok' : 'cancelled'}>{w.active ? 'Activo' : 'Inactivo'}</Badge>
              </div>
              <h3 className="mt-3 font-bold" style={{ color: 'var(--text)' }}>{w.name}</h3>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {w.code} · {w.kind}
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Stock · ${selected.name}`} size="lg">
          {stockQuery.isLoading ? (
            <TableSkeleton rows={5} cols={3} />
          ) : (stockQuery.data ?? []).length === 0 ? (
            <EmptyState icon={<Package size={28} />} title="Sin stock" description="Este almacén aún no tiene refacciones." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Refacción</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Reservado</th>
                    <th className="text-right">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {(stockQuery.data ?? []).map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{s.part_id.slice(0, 8)}</td>
                      <td className="text-right tabular-nums">{fmtNumber(s.quantity)}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{fmtNumber(s.reserved)}</td>
                      <td className="text-right tabular-nums font-bold">{fmtNumber(s.available)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {createOpen && <WarehouseModal onClose={() => setCreateOpen(false)} />}
    </div>
  )
}

// ── Movements Tab ────────────────────────────────────────────────────────────
const MOVEMENT_TYPES: Array<{ value: string; label: string; icon: React.ElementType }> = [
  { value: '', label: 'Todos', icon: Filter },
  { value: 'inbound', label: 'Entrada', icon: ArrowDownToLine },
  { value: 'outbound', label: 'Salida', icon: ArrowUpFromLine },
  { value: 'adjustment', label: 'Ajuste', icon: Sliders },
  { value: 'transfer_out', label: 'Transferencia', icon: Repeat },
]

function MovementsTab() {
  const [movementType, setMovementType] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const movQuery = useQuery<Paginated<InventoryMovement>>({
    queryKey: ['inventory', 'movements', { movementType, page }],
    queryFn: () => listMovements({
      movement_type: movementType || undefined,
      page,
      page_size: pageSize,
    }),
  })

  const items = movQuery.data?.items ?? []
  const total = movQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className="executive-panel">
      <div className="flex flex-wrap gap-2 mb-4">
        {MOVEMENT_TYPES.map((t) => {
          const Icon = t.icon
          const active = movementType === t.value
          return (
            <button
              key={t.value || 'all'}
              onClick={() => { setMovementType(t.value); setPage(1) }}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all"
              style={{
                background: active ? 'color-mix(in srgb, var(--primary) 14%, transparent)' : 'var(--surface-2)',
                color: active ? 'var(--primary-dark)' : 'var(--text-muted)',
                border: `1px solid ${active ? 'color-mix(in srgb, var(--primary) 30%, transparent)' : 'var(--border)'}`,
              }}
            >
              <Icon size={12} /> {t.label}
            </button>
          )
        })}
      </div>

      {movQuery.isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Truck size={28} />} title="Sin movimientos" description="Aún no se han registrado movimientos." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Fecha</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Refacción</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Costo unit.</th>
                <th className="text-left">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{fmtDate(m.created_at, { time: true })}</td>
                  <td><MovementBadge type={m.movement_type} /></td>
                  <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{m.part_id.slice(0, 8)}</td>
                  <td className="text-right tabular-nums font-bold">{fmtNumber(m.quantity)}</td>
                  <td className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {m.unit_cost != null ? fmtCurrency(m.unit_cost) : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{m.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      )}
    </section>
  )
}

function MovementBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; variant: 'ok' | 'low' | 'critical' | 'confirmed' | 'draft' }> = {
    inbound: { label: 'Entrada', variant: 'ok' },
    outbound: { label: 'Salida', variant: 'low' },
    adjustment: { label: 'Ajuste', variant: 'draft' },
    transfer_out: { label: 'Transferencia', variant: 'confirmed' },
    transfer_in: { label: 'Recepción', variant: 'confirmed' },
  }
  const cfg = map[type] ?? { label: type, variant: 'draft' as const }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

// ── Part Modal ───────────────────────────────────────────────────────────────
function PartModal({ part, onClose }: { part: Part | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = !!part

  const [form, setForm] = useState({
    sku: part?.sku ?? '',
    name: part?.name ?? '',
    description: part?.description ?? '',
    category: part?.category ?? '',
    unit: part?.unit ?? 'pza',
    min_stock: String(part?.min_stock ?? 0),
    max_stock: part?.max_stock != null ? String(part.max_stock) : '',
    lead_time_days: String(part?.lead_time_days ?? 0),
  })

  const setField = <K extends keyof typeof form>(key: K, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Partial<Part> & { sku: string; name: string } = {
        sku: form.sku,
        name: form.name,
        description: form.description || null,
        category: form.category || null,
        unit: form.unit,
        min_stock: Number(form.min_stock) || 0,
        max_stock: form.max_stock ? Number(form.max_stock) : null,
        lead_time_days: Number(form.lead_time_days) || 0,
      }
      return isEdit ? updatePart(part!.id, payload) : createPart(payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Refacción actualizada' : 'Refacción creada')
      qc.invalidateQueries({ queryKey: ['inventory', 'parts'] })
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar refacción' : 'Nueva refacción'} size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="sku" label="SKU" required value={form.sku} onChange={(v) => setField('sku', v)} />
          <FormField name="unit" label="Unidad" value={form.unit} onChange={(v) => setField('unit', v)} />
        </div>
        <FormField name="name" label="Nombre" required value={form.name} onChange={(v) => setField('name', v)} />
        <FormField
          name="description" label="Descripción" type="textarea" rows={2}
          value={form.description ?? ''} onChange={(v) => setField('description', v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="category" label="Categoría" value={form.category ?? ''} onChange={(v) => setField('category', v)} />
          <FormField
            name="lead_time_days" label="Lead time (días)" type="number" min={0}
            value={form.lead_time_days} onChange={(v) => setField('lead_time_days', v)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="min_stock" label="Stock mínimo" type="number" min={0}
            value={form.min_stock} onChange={(v) => setField('min_stock', v)}
          />
          <FormField
            name="max_stock" label="Stock máximo" type="number" min={0}
            value={form.max_stock} onChange={(v) => setField('max_stock', v)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Warehouse Modal ──────────────────────────────────────────────────────────
function WarehouseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({ code: '', name: '', kind: 'main' })

  const mutation = useMutation({
    mutationFn: () => createWarehouse({ code: form.code, name: form.name, kind: form.kind }),
    onSuccess: () => {
      toast.success('Almacén creado')
      qc.invalidateQueries({ queryKey: ['inventory', 'warehouses'] })
      onClose()
    },
    onError: () => toast.error('No se pudo crear'),
  })

  return (
    <Modal open onClose={onClose} title="Nuevo almacén">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="code" label="Código" required
            value={form.code} onChange={(v) => setForm(f => ({ ...f, code: v }))}
          />
          <FormField
            name="kind" label="Tipo" type="select"
            value={form.kind} onChange={(v) => setForm(f => ({ ...f, kind: v }))}
            options={[
              { value: 'main', label: 'Principal' },
              { value: 'satellite', label: 'Satélite' },
              { value: 'mobile', label: 'Móvil' },
            ]}
          />
        </div>
        <FormField
          name="name" label="Nombre" required
          value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Crear</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Movement Modal ───────────────────────────────────────────────────────────
function MovementModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()

  const whQuery = useQuery({ queryKey: ['inventory', 'warehouses'], queryFn: listWarehouses })
  const partsQuery = useQuery({
    queryKey: ['inventory', 'parts', 'movement-modal'],
    queryFn: () => listParts({ page: 1, page_size: 200 }),
  })

  const [form, setForm] = useState({
    warehouse_id: '',
    part_id: '',
    movement_type: 'inbound' as 'inbound' | 'outbound' | 'adjustment' | 'transfer_out',
    quantity: '',
    unit_cost: '',
    counterpart_warehouse_id: '',
    reason: '',
  })

  const warehouses: Warehouse[] = whQuery.data ?? []
  const parts: Part[] = partsQuery.data?.items ?? []

  const mutation = useMutation({
    mutationFn: () => createMovement({
      warehouse_id: form.warehouse_id,
      part_id: form.part_id,
      movement_type: form.movement_type,
      quantity: Number(form.quantity),
      unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
      counterpart_warehouse_id: form.movement_type === 'transfer_out' ? form.counterpart_warehouse_id : undefined,
      reason: form.reason || undefined,
    }),
    onSuccess: () => {
      toast.success('Movimiento registrado')
      qc.invalidateQueries({ queryKey: ['inventory'] })
      onClose()
    },
    onError: () => toast.error('No se pudo registrar'),
  })

  return (
    <Modal open onClose={onClose} title="Nuevo movimiento" size="lg">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="movement_type" label="Tipo" type="select" required
          value={form.movement_type}
          onChange={(v) => setForm(f => ({ ...f, movement_type: v as typeof f.movement_type }))}
          options={[
            { value: 'inbound', label: 'Entrada' },
            { value: 'outbound', label: 'Salida' },
            { value: 'adjustment', label: 'Ajuste' },
            { value: 'transfer_out', label: 'Transferencia' },
          ]}
        />

        <FormField
          name="warehouse_id" label="Almacén" type="select" required
          value={form.warehouse_id}
          onChange={(v) => setForm(f => ({ ...f, warehouse_id: v }))}
          placeholder="Seleccionar..."
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
        />

        {form.movement_type === 'transfer_out' && (
          <FormField
            name="counterpart_warehouse_id" label="Almacén destino" type="select" required
            value={form.counterpart_warehouse_id}
            onChange={(v) => setForm(f => ({ ...f, counterpart_warehouse_id: v }))}
            placeholder="Seleccionar..."
            options={warehouses
              .filter(w => w.id !== form.warehouse_id)
              .map(w => ({ value: w.id, label: w.name }))}
          />
        )}

        <FormField
          name="part_id" label="Refacción" type="select" required
          value={form.part_id}
          onChange={(v) => setForm(f => ({ ...f, part_id: v }))}
          placeholder="Seleccionar..."
          options={parts.map(p => ({ value: p.id, label: `${p.sku} — ${p.name}` }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="quantity" label="Cantidad" type="number" required min={0} step={0.01}
            value={form.quantity} onChange={(v) => setForm(f => ({ ...f, quantity: v }))}
          />
          {form.movement_type === 'inbound' && (
            <FormField
              name="unit_cost" label="Costo unitario" type="number" min={0} step={0.01}
              value={form.unit_cost} onChange={(v) => setForm(f => ({ ...f, unit_cost: v }))}
            />
          )}
        </div>

        <FormField
          name="reason" label="Motivo" type="textarea" rows={2}
          value={form.reason} onChange={(v) => setForm(f => ({ ...f, reason: v }))}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Registrar</Button>
        </div>
      </form>
    </Modal>
  )
}
