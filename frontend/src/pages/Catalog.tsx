import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getModels, getServices, getCosts, getMissingCosts, updateCost } from '../api'
import type { CatalogCost } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/Skeleton'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCurrency = (val: number | null) =>
  val == null ? '—' : '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2 })

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  saving,
}: {
  value: number | null
  onSave: (val: number) => void
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))

  const commit = () => {
    const parsed = parseFloat(draft)
    if (!isNaN(parsed)) onSave(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min="0"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-28 rounded border border-blue-400 px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    )
  }

  return (
    <button
      onClick={() => { setDraft(String(value ?? '')); setEditing(true) }}
      disabled={saving}
      className="group flex items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-blue-50 disabled:cursor-wait"
      title="Click para editar"
    >
      <span className="text-sm text-gray-800">{fmtCurrency(value)}</span>
      <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100">✎</span>
    </button>
  )
}

// ── Costs Tab ─────────────────────────────────────────────────────────────────
function CostsTab() {
  const queryClient = useQueryClient()
  const [filterModel, setFilterModel] = useState('')
  const [filterService, setFilterService] = useState('')

  const modelsQuery = useQuery({ queryKey: ['catalog-models'], queryFn: () => getModels() })
  const servicesQuery = useQuery({ queryKey: ['catalog-services'], queryFn: () => getServices() })
  const costsQuery = useQuery({
    queryKey: ['catalog-costs', filterModel, filterService],
    queryFn: () =>
      getCosts({
        model_id: filterModel || undefined,
        service_id: filterService || undefined,
      }),
  })

  // Track which rows are saving: "model_id:service_id" → field
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const mutation = useMutation({
    mutationFn: ({
      model_id,
      service_id,
      data,
    }: {
      model_id: string
      service_id: string
      data: Partial<CatalogCost>
    }) => updateCost(model_id, service_id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-costs'] })
    },
  })

  const handleSave = (
    cost: CatalogCost,
    field: 'bjx_labor_cost' | 'bjx_parts_cost',
    val: number
  ) => {
    const key = `${cost.model_id}:${cost.service_id}:${field}`
    setSaving((prev) => ({ ...prev, [key]: true }))
    mutation.mutate(
      { model_id: cost.model_id, service_id: cost.service_id, data: { [field]: val } },
      { onSettled: () => setSaving((prev) => ({ ...prev, [key]: false })) }
    )
  }

  const models = modelsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const costs = costsQuery.data ?? []

  // Build lookup maps for names
  const modelMap = Object.fromEntries(models.map((m) => [m.id, m.name]))
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterModel}
          onChange={(e) => setFilterModel(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los modelos</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <select
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los servicios</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {(filterModel || filterService) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterModel(''); setFilterService('') }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        {costsQuery.isLoading ? (
          <div className="p-5">
            <TableSkeleton rows={6} cols={7} />
          </div>
        ) : costsQuery.isError ? (
          <p className="p-5 text-sm text-red-500">Error cargando costos</p>
        ) : costs.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">Sin resultados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Modelo</th>
                <th className="px-5 py-3">Servicio</th>
                <th className="px-5 py-3 text-right">Duración (hrs)</th>
                <th className="px-5 py-3 text-right">Costo MO</th>
                <th className="px-5 py-3 text-right">Costo Refacción</th>
                <th className="px-5 py-3 text-center">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {costs.map((cost) => {
                const savingMO = saving[`${cost.model_id}:${cost.service_id}:bjx_labor_cost`]
                const savingParts = saving[`${cost.model_id}:${cost.service_id}:bjx_parts_cost`]
                const isEstimated = cost.data_source === 'estimated'
                return (
                  <tr key={cost.id} className={`transition-colors ${isEstimated ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50'}`}>
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {modelMap[cost.model_id] ?? cost.model_id}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {serviceMap[cost.service_id] ?? cost.service_id}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {cost.duration_hrs.toFixed(1)}
                    </td>
                    <td className={`px-5 py-3 text-right ${isEstimated ? 'bg-yellow-100' : ''}`}>
                      <EditableCell
                        value={cost.bjx_labor_cost}
                        saving={savingMO ?? false}
                        onSave={(val) => handleSave(cost, 'bjx_labor_cost', val)}
                      />
                    </td>
                    <td className={`px-5 py-3 text-right ${isEstimated ? 'bg-yellow-100' : ''}`}>
                      <EditableCell
                        value={cost.bjx_parts_cost}
                        saving={savingParts ?? false}
                        onSave={(val) => handleSave(cost, 'bjx_parts_cost', val)}
                      />
                    </td>
                    <td className="px-5 py-3 text-center">
                      {isEstimated ? (
                        <span className="inline-flex items-center rounded-full bg-yellow-200 px-2.5 py-0.5 text-xs font-medium text-yellow-900">
                          ⚠️ Estimado
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
  const missingQuery = useQuery({
    queryKey: ['catalog-costs-missing'],
    queryFn: getMissingCosts,
  })

  const missing = missingQuery.data ?? []

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
      {missingQuery.isLoading ? (
        <div className="p-5">
          <TableSkeleton rows={6} cols={2} />
        </div>
      ) : missingQuery.isError ? (
        <p className="p-5 text-sm text-red-500">Error cargando datos faltantes</p>
      ) : missing.length === 0 ? (
        <p className="p-5 text-sm text-gray-400">No hay combos sin datos. ¡Todo cubierto!</p>
      ) : (
        <>
          <div className="border-b border-gray-100 px-5 py-3">
            <p className="text-sm text-gray-500">
              {missing.length} combo{missing.length !== 1 ? 's' : ''} sin costos registrados
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3">Modelo</th>
                <th className="px-5 py-3">Servicio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {missing.map((item) => (
                <tr
                  key={`${item.model_id}:${item.service_id}`}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-5 py-3 font-medium text-gray-900">{item.model_name}</td>
                  <td className="px-5 py-3 text-gray-600">{item.service_name}</td>
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
type Tab = 'costs' | 'missing'

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<Tab>('costs')

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Catálogo</h1>
        <p className="mt-1 text-sm text-gray-500">
          Costos de mano de obra y refacciones por modelo y servicio
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            { key: 'costs', label: 'Costos' },
            { key: 'missing', label: 'Combos Sin Datos' },
          ] as { key: Tab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'costs' ? <CostsTab /> : <MissingTab />}
    </div>
  )
}
