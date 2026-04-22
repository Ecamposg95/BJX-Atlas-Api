import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAllModels, createModel, updateModel, deleteModel,
  getServices, createService, updateService,
  getCosts, getMissingCosts, updateCost,
} from '../api'
import type { VehicleModel, Service, CatalogCost } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/Skeleton'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCurrency = (val: number | null) =>
  val == null ? '—' : '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const CATEGORIES = ['frenos', 'motor', 'suspension', 'electrico', 'neumaticos', 'otros'] as const
const CATEGORY_LABELS: Record<string, string> = {
  frenos: 'Frenos', motor: 'Motor', suspension: 'Suspensión',
  electrico: 'Eléctrico', neumaticos: 'Neumáticos', otros: 'Otros',
}

// ── Generic CRUD Modal ────────────────────────────────────────────────────────
interface Field { key: string; label: string; type?: string; options?: string[] }

interface CrudModalProps {
  title: string
  fields: Field[]
  initial: Record<string, string | boolean>
  onClose: () => void
  onSave: (data: Record<string, string | boolean>) => Promise<void>
}

function CrudModal({ title, fields, initial, onClose, onSave }: CrudModalProps) {
  const [form, setForm] = useState<Record<string, string | boolean>>(initial)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      await onSave(form)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="text-xl leading-none">&times;</button>
        </div>
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={String(form[f.key] ?? '')}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {f.options?.map((opt) => (
                    <option key={opt} value={opt}>{CATEGORY_LABELS[opt] ?? opt}</option>
                  ))}
                </select>
              ) : f.type === 'toggle' ? (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, [f.key]: !p[f.key] }))}
                  className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                  style={{ background: form[f.key] ? 'var(--primary)' : 'var(--surface-2)' }}
                >
                  <span
                    className="pointer-events-none inline-block h-4 w-4 rounded-full shadow transition duration-200"
                    style={{ background: '#fff', transform: form[f.key] ? 'translateX(16px)' : 'translateX(0)' }}
                  />
                </button>
              ) : (
                <input
                  type={f.type ?? 'text'}
                  value={String(form[f.key] ?? '')}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              )}
            </div>
          ))}
        </div>
        {error && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>Confirmar</Button>
        </div>
      </div>
    </div>
  )
}

// ── Models Tab ────────────────────────────────────────────────────────────────
function ModelsTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState<{ mode: 'create' | 'edit'; item?: VehicleModel } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const query = useQuery({ queryKey: ['catalog-all-models'], queryFn: getAllModels })
  const items = (query.data ?? []).filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.brand ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const createMut = useMutation({
    mutationFn: (d: { name: string; brand?: string }) => createModel(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-all-models'] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; brand?: string; active?: boolean } }) => updateModel(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-all-models'] }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteModel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-all-models'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          placeholder="Buscar modelo o marca…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <Button variant="primary" size="sm" onClick={() => setModal({ mode: 'create' })}>
          + Nuevo modelo
        </Button>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {query.isLoading ? (
          <div className="p-5"><TableSkeleton rows={6} cols={4} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left">Marca</th>
                <th className="px-5 py-3 text-center">Servicios</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{m.name}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{m.brand ?? '—'}</td>
                  <td className="px-5 py-3 text-center" style={{ color: 'var(--text-muted)' }}>{m.service_count}</td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant={m.active ? 'ok' : 'cancelled'}>{m.active ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => setModal({ mode: 'edit', item: m })}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary-dark)' }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmId(m.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal?.mode === 'create' && (
        <CrudModal
          title="Nuevo modelo"
          fields={[
            { key: 'name', label: 'Nombre del modelo' },
            { key: 'brand', label: 'Marca (opcional)' },
          ]}
          initial={{ name: '', brand: '' }}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            await createMut.mutateAsync({ name: String(d.name), brand: String(d.brand) || undefined })
            setModal(null)
          }}
        />
      )}

      {modal?.mode === 'edit' && modal.item && (
        <CrudModal
          title="Editar modelo"
          fields={[
            { key: 'name', label: 'Nombre del modelo' },
            { key: 'brand', label: 'Marca' },
            { key: 'active', label: 'Activo', type: 'toggle' },
          ]}
          initial={{ name: modal.item.name, brand: modal.item.brand ?? '', active: modal.item.active }}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            await updateMut.mutateAsync({ id: modal.item!.id, data: { name: String(d.name), brand: String(d.brand) || undefined, active: Boolean(d.active) } })
            setModal(null)
          }}
        />
      )}

      {confirmId && (
        <ConfirmModal
          message="¿Eliminar este modelo? Se marcará como inactivo."
          onConfirm={() => { deleteMut.mutate(confirmId); setConfirmId(null) }}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  )
}

// ── Services Tab ──────────────────────────────────────────────────────────────
function ServicesTab() {
  const qc = useQueryClient()
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [modal, setModal]         = useState<{ mode: 'create' | 'edit'; item?: Service } | null>(null)

  const query = useQuery({ queryKey: ['catalog-all-services'], queryFn: () => getServices() })
  const items = (query.data ?? []).filter((s) => {
    const matchCat    = !catFilter || s.category === catFilter
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const createMut = useMutation({
    mutationFn: (d: { name: string; category: string }) => createService(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-all-services'] }),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; category?: string; active?: boolean } }) => updateService(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-all-services'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Buscar servicio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <Button variant="primary" size="sm" onClick={() => setModal({ mode: 'create' })}>
          + Nuevo servicio
        </Button>
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {query.isLoading ? (
          <div className="p-5"><TableSkeleton rows={6} cols={4} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-5 py-3 text-left">Categoría</th>
                <th className="px-5 py-3 text-center">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{s.name}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary-dark)' }}>
                      {CATEGORY_LABELS[s.category] ?? s.category}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <Badge variant={s.active ? 'ok' : 'cancelled'}>{s.active ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => setModal({ mode: 'edit', item: s })}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary-dark)' }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal?.mode === 'create' && (
        <CrudModal
          title="Nuevo servicio"
          fields={[
            { key: 'name', label: 'Nombre del servicio' },
            { key: 'category', label: 'Categoría', type: 'select', options: [...CATEGORIES] },
          ]}
          initial={{ name: '', category: 'otros' }}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            await createMut.mutateAsync({ name: String(d.name), category: String(d.category) })
            setModal(null)
          }}
        />
      )}

      {modal?.mode === 'edit' && modal.item && (
        <CrudModal
          title="Editar servicio"
          fields={[
            { key: 'name', label: 'Nombre del servicio' },
            { key: 'category', label: 'Categoría', type: 'select', options: [...CATEGORIES] },
            { key: 'active', label: 'Activo', type: 'toggle' },
          ]}
          initial={{ name: modal.item.name, category: modal.item.category, active: modal.item.active }}
          onClose={() => setModal(null)}
          onSave={async (d) => {
            await updateMut.mutateAsync({ id: modal.item!.id, data: { name: String(d.name), category: String(d.category), active: Boolean(d.active) } })
            setModal(null)
          }}
        />
      )}
    </div>
  )
}

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditableCell({ value, onSave, saving }: { value: number | null; onSave: (val: number) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(String(value ?? ''))

  const commit = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) onSave(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus type="number" min="0" step="0.01" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-28 px-2 py-0.5 text-sm focus:outline-none"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--primary)', borderRadius: 6, color: 'var(--text)' }}
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(String(value ?? '')); setEditing(true) }}
      disabled={saving}
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-left disabled:cursor-wait"
      title="Click para editar"
    >
      <span className="text-sm" style={{ color: 'var(--text)' }}>{fmtCurrency(value)}</span>
      <span className="text-xs opacity-0 group-hover:opacity-100" style={{ color: 'var(--primary-dark)' }}>✎</span>
    </button>
  )
}

// ── Costs Tab ─────────────────────────────────────────────────────────────────
function CostsTab() {
  const queryClient = useQueryClient()
  const [filterModel, setFilterModel]     = useState('')
  const [filterService, setFilterService] = useState('')

  const modelsQuery   = useQuery({ queryKey: ['catalog-models'], queryFn: () => getAllModels() })
  const servicesQuery = useQuery({ queryKey: ['catalog-services'], queryFn: () => getServices() })
  const costsQuery    = useQuery({
    queryKey: ['catalog-costs', filterModel, filterService],
    queryFn: () => getCosts({ model_id: filterModel || undefined, service_id: filterService || undefined }),
  })

  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const mutation = useMutation({
    mutationFn: ({ model_id, service_id, data }: { model_id: string; service_id: string; data: Partial<CatalogCost> }) =>
      updateCost(model_id, service_id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog-costs'] }),
  })

  const handleSave = (cost: CatalogCost, field: 'bjx_labor_cost' | 'bjx_parts_cost', val: number) => {
    const key = `${cost.model_id}:${cost.service_id}:${field}`
    setSaving((p) => ({ ...p, [key]: true }))
    mutation.mutate(
      { model_id: cost.model_id, service_id: cost.service_id, data: { [field]: val } },
      { onSettled: () => setSaving((p) => ({ ...p, [key]: false })) }
    )
  }

  const models   = modelsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const costs    = costsQuery.data ?? []
  const modelMap   = Object.fromEntries(models.map((m) => [m.id, m.name]))
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={filterModel}
          onChange={(e) => setFilterModel(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Todos los modelos</option>
          {models.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Todos los servicios</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(filterModel || filterService) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterModel(''); setFilterService('') }}>
            Limpiar
          </Button>
        )}
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {costsQuery.isLoading ? (
          <div className="p-5"><TableSkeleton rows={6} cols={6} /></div>
        ) : costsQuery.isError ? (
          <p className="p-5 text-sm" style={{ color: '#fca5a5' }}>Error cargando costos</p>
        ) : costs.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>Sin resultados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left">Modelo</th>
                <th className="px-5 py-3 text-left">Servicio</th>
                <th className="px-5 py-3 text-right">Duración (hrs)</th>
                <th className="px-5 py-3 text-right">Costo MO</th>
                <th className="px-5 py-3 text-right">Costo Refacción</th>
                <th className="px-5 py-3 text-center">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((cost) => {
                const savingMO    = saving[`${cost.model_id}:${cost.service_id}:bjx_labor_cost`]
                const savingParts = saving[`${cost.model_id}:${cost.service_id}:bjx_parts_cost`]
                const isEst       = cost.data_source === 'estimated'
                return (
                  <tr key={cost.id} style={isEst ? { background: 'rgba(251,191,36,0.06)' } : {}}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{modelMap[cost.model_id] ?? cost.model_id}</td>
                    <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{serviceMap[cost.service_id] ?? cost.service_id}</td>
                    <td className="px-5 py-3 text-right" style={{ color: 'var(--text-muted)' }}>{cost.duration_hrs.toFixed(1)}</td>
                    <td className="px-5 py-3 text-right" style={isEst ? { background: 'rgba(251,191,36,0.10)' } : {}}>
                      <EditableCell value={cost.bjx_labor_cost} saving={savingMO ?? false} onSave={(v) => handleSave(cost, 'bjx_labor_cost', v)} />
                    </td>
                    <td className="px-5 py-3 text-right" style={isEst ? { background: 'rgba(251,191,36,0.10)' } : {}}>
                      <EditableCell value={cost.bjx_parts_cost} saving={savingParts ?? false} onSave={(v) => handleSave(cost, 'bjx_parts_cost', v)} />
                    </td>
                    <td className="px-5 py-3 text-center">
                      {isEst ? (
                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fde68a', border: '1px solid rgba(251,191,36,0.3)' }}>
                          ⚠ Estimado
                        </span>
                      ) : (
                        <Badge variant="ok">Catálogo</Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Missing Costs Tab ─────────────────────────────────────────────────────────
function MissingTab() {
  const missingQuery = useQuery({ queryKey: ['catalog-costs-missing'], queryFn: getMissingCosts })
  const missing = missingQuery.data ?? []

  return (
    <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {missingQuery.isLoading ? (
        <div className="p-5"><TableSkeleton rows={6} cols={2} /></div>
      ) : missingQuery.isError ? (
        <p className="p-5 text-sm" style={{ color: '#fca5a5' }}>Error cargando datos faltantes</p>
      ) : missing.length === 0 ? (
        <p className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>¡Todo cubierto! No hay combos sin datos.</p>
      ) : (
        <>
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {missing.length} combo{missing.length !== 1 ? 's' : ''} sin costos registrados
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left">Modelo</th>
                <th className="px-5 py-3 text-left">Servicio</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((item) => (
                <tr key={`${item.model_id}:${item.service_id}`}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{item.model_name}</td>
                  <td className="px-5 py-3" style={{ color: 'var(--text-muted)' }}>{item.service_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

// ── Catalog Page ──────────────────────────────────────────────────────────────
type Tab = 'models' | 'services' | 'costs' | 'missing'

const TABS: { key: Tab; label: string }[] = [
  { key: 'models',   label: 'Modelos' },
  { key: 'services', label: 'Servicios' },
  { key: 'costs',    label: 'Costos' },
  { key: 'missing',  label: 'Combos Sin Datos' },
]

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<Tab>('models')

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Catálogo</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Modelos, servicios y costos por combinación
        </p>
      </div>

      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-4 py-2.5 text-sm font-bold transition-colors -mb-px"
            style={{
              borderBottom: activeTab === key ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === key ? 'var(--primary-dark)' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'models'   && <ModelsTab />}
      {activeTab === 'services' && <ServicesTab />}
      {activeTab === 'costs'    && <CostsTab />}
      {activeTab === 'missing'  && <MissingTab />}
    </div>
  )
}
