import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getModels, getServices, getCosts, calculate, createQuote } from '../api'
import type { EngineResponse } from '../api/types'
import { Badge, MarginBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/Skeleton'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_TECH_COST = 156.25
const DEFAULT_TARGET_MARGIN = 40

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val: number): string {
  return val.toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

function formatPct(val: number): string {
  return (val * 100).toFixed(1) + '%'
}

const marginColor: Record<'ok' | 'low' | 'critical', string> = {
  ok: 'text-emerald-600',
  low: 'text-orange-500',
  critical: 'text-red-500',
}

// ── Main Component ────────────────────────────────────────────────────────────
export function CalculatorPage() {
  // Selections
  const [modelId, setModelId] = useState<string>('')
  const [serviceId, setServiceId] = useState<string>('')

  // Params
  const [techCost, setTechCost] = useState<number>(DEFAULT_TECH_COST)
  const [targetMargin, setTargetMargin] = useState<number>(DEFAULT_TARGET_MARGIN)

  // Scoring weights (0–100 integers, must sum to 100)
  const [wPrice, setWPrice] = useState<number>(50)
  const [wTime, setWTime] = useState<number>(30)
  const [wTc, setWTc] = useState<number>(20)
  const weightSum = wPrice + wTime + wTc

  // Engine result
  const [result, setResult] = useState<EngineResponse | null>(null)

  // Quote modal
  const [showModal, setShowModal] = useState(false)
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // Debounce refs
  const calcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data queries ─────────────────────────────────────────────────────────
  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => getModels({ active: true }),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => getServices(),
  })

  // Services available for the selected model (from catalog costs)
  const { data: modelCosts = [] } = useQuery({
    queryKey: ['catalog-costs-for-model', modelId],
    queryFn: () => getCosts({ model_id: modelId }),
    enabled: Boolean(modelId),
  })

  const availableServiceIds = new Set(modelCosts.map((c) => c.service_id))
  const filteredServices = modelId
    ? services.filter((s) => availableServiceIds.has(s.id))
    : services

  // ── Calculate mutation ────────────────────────────────────────────────────
  const calcMutation = useMutation({
    mutationFn: calculate,
    onSuccess: (data) => setResult(data),
  })

  // ── Debounced recalculation ───────────────────────────────────────────────
  const triggerCalc = useCallback(() => {
    if (!modelId || !serviceId) return
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current)
    calcTimerRef.current = setTimeout(() => {
      calcMutation.mutate({
        model_id: modelId,
        service_id: serviceId,
        technician_cost_hr: techCost,
        target_margin: targetMargin / 100,
        scoring_weight_price: wPrice / 100,
        scoring_weight_time: wTime / 100,
        scoring_weight_tc: wTc / 100,
      })
    }, 300)
  }, [modelId, serviceId, techCost, targetMargin, wPrice, wTime, wTc]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    triggerCalc()
    return () => {
      if (calcTimerRef.current) clearTimeout(calcTimerRef.current)
    }
  }, [triggerCalc])

  // Reset result when selection cleared
  useEffect(() => {
    if (!modelId || !serviceId) setResult(null)
  }, [modelId, serviceId])

  // ── Create quote mutation ─────────────────────────────────────────────────
  const quoteMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: (data) => {
      setShowModal(false)
      setNotes('')
      setToast(`Cotización ${data.quote_number} creada`)
      setTimeout(() => setToast(null), 3000)
    },
  })

  const handleSaveQuote = () => {
    if (!modelId || !serviceId) return
    quoteMutation.mutate({
      model_id: modelId,
      service_ids: [serviceId],
      notes: notes || undefined,
      technician_cost_hr: techCost,
      target_margin: targetMargin / 100,
    })
  }

  const r = result?.result ?? null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative space-y-4">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Calculadora</h1>
          <p className="text-sm text-gray-500">Motor de precios y márgenes BJX × Brame</p>
        </div>
        <Button
          disabled={!modelId || !serviceId || !r}
          onClick={() => setShowModal(true)}
        >
          Guardar Cotización
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Selección */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Selección
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Modelo
                </label>
                <select
                  value={modelId}
                  onChange={(e) => {
                    setModelId(e.target.value)
                    setServiceId('')
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Selecciona un modelo --</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.brand} {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Servicio
                </label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  disabled={!modelId}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">-- Selecciona un servicio --</option>
                  {filteredServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Parámetros dinámicos */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Parámetros dinámicos
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Costo/hr técnico (MXN)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={techCost}
                  onChange={(e) => setTechCost(parseFloat(e.target.value) || 0)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    techCost !== DEFAULT_TECH_COST
                      ? 'border-blue-400 bg-blue-50 text-blue-800'
                      : 'border-gray-300'
                  }`}
                />
                {techCost !== DEFAULT_TECH_COST && (
                  <p className="mt-1 text-xs text-blue-600">
                    Valor modificado (default: ${DEFAULT_TECH_COST})
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Margen objetivo (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(parseFloat(e.target.value) || 0)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    targetMargin !== DEFAULT_TARGET_MARGIN
                      ? 'border-blue-400 bg-blue-50 text-blue-800'
                      : 'border-gray-300'
                  }`}
                />
                {targetMargin !== DEFAULT_TARGET_MARGIN && (
                  <p className="mt-1 text-xs text-blue-600">
                    Valor modificado (default: {DEFAULT_TARGET_MARGIN}%)
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Tabla de desglose */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Desglose de costos
            </h2>

            {/* Empty state */}
            {!modelId || !serviceId ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
                <svg
                  className="mb-3 h-10 w-10 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"
                  />
                </svg>
                <p className="text-sm">Selecciona un modelo y servicio para calcular</p>
              </div>
            ) : calcMutation.isPending ? (
              <TableSkeleton rows={10} cols={2} />
            ) : r ? (
              <>
                {result?.result.data_source === 'estimated' && (
                  <div className="mb-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
                    Sin datos en catálogo — valores estimados
                  </div>
                )}

                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {[
                      {
                        label: 'Duración del servicio',
                        value: `${r.duration_hrs} hrs`,
                        bold: false,
                        color: null,
                      },
                      {
                        label: 'Costo/hr técnico',
                        value: `$${formatCurrency(techCost)}`,
                        bold: false,
                        color: null,
                      },
                      {
                        label: 'Costo Mano de Obra',
                        value: `$${formatCurrency(r.labor_cost)}`,
                        bold: false,
                        color: null,
                      },
                      {
                        label: 'Costo Refacción',
                        value: `$${formatCurrency(r.parts_cost)}`,
                        bold: false,
                        color: null,
                      },
                      {
                        label: 'Costo Total BJX',
                        value: `$${formatCurrency(r.total_bjx_cost)}`,
                        bold: true,
                        color: null,
                      },
                      {
                        label: 'Precio que paga Brame',
                        value: `$${formatCurrency(r.brame_price)}`,
                        bold: true,
                        color: null,
                      },
                      {
                        label: 'Margen Bruto ($)',
                        value: `$${formatCurrency(r.margin_pesos)}`,
                        bold: true,
                        color: marginColor[r.margin_status],
                      },
                      {
                        label: 'Margen Bruto (%)',
                        value: formatPct(r.margin_pct),
                        bold: true,
                        color: marginColor[r.margin_status],
                      },
                      {
                        label: 'Precio sugerido (obj.)',
                        value: `$${formatCurrency(r.suggested_price)}`,
                        bold: false,
                        color: null,
                      },
                      {
                        label: 'Gap vs objetivo',
                        value: `$${formatCurrency(r.gap_vs_target)}`,
                        bold: false,
                        color: r.gap_vs_target < 0 ? 'text-red-500' : 'text-gray-700',
                      },
                    ].map((row, idx) => (
                      <tr key={idx}>
                        <td className="py-2 pr-4 text-gray-600">{row.label}</td>
                        <td
                          className={`py-2 text-right ${row.bold ? 'font-semibold' : ''} ${row.color ?? 'text-gray-900'}`}
                        >
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-400">Estado del margen</span>
                  <MarginBadge status={r.margin_status} />
                </div>
              </>
            ) : null}
          </section>
        </div>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* Scoring weights */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Pesos de puntaje proveedores
            </h2>
            <p
              className={`mb-4 text-xs font-medium ${
                weightSum === 100 ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              Suma: {weightSum}/100{weightSum !== 100 && ' — debe sumar 100'}
            </p>

            <div className="space-y-4">
              {(
                [
                  { label: 'Precio', value: wPrice, setter: setWPrice },
                  { label: 'Tiempo de entrega', value: wTime, setter: setWTime },
                  { label: 'Cobertura técnica', value: wTc, setter: setWTc },
                ] as Array<{ label: string; value: number; setter: (v: number) => void }>
              ).map(({ label, value, setter }) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between">
                    <span className="text-sm text-gray-700">{label}</span>
                    <span className="text-sm font-medium text-gray-900">{value}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) => setter(parseInt(e.target.value))}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-blue-600"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Supplier comparison table */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Comparativo de proveedores
            </h2>

            {!modelId || !serviceId ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-gray-400">
                <p className="text-sm">Selecciona un modelo y servicio para calcular</p>
              </div>
            ) : calcMutation.isPending ? (
              <TableSkeleton rows={4} cols={5} />
            ) : result && result.suppliers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      <th className="pb-2 pr-3">#</th>
                      <th className="pb-2 pr-3">Proveedor</th>
                      <th className="pb-2 pr-3 text-right">Precio</th>
                      <th className="pb-2 pr-3 text-right">Días</th>
                      <th className="pb-2 pr-3 text-right">Garantía</th>
                      <th className="pb-2 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {result.suppliers.map((s) => (
                      <tr
                        key={s.supplier_id}
                        className={s.recommended ? 'bg-blue-50' : ''}
                      >
                        <td className="py-2 pr-3 font-medium text-gray-600">{s.rank}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-gray-900">{s.supplier_name}</span>
                            {s.recommended && <Badge variant="confirmed">Recomendado</Badge>}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-700">
                          ${formatCurrency(s.price)}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-700">{s.lead_time_days}</td>
                        <td className="py-2 pr-3 text-right text-gray-700">{s.warranty_days}d</td>
                        <td className="py-2 text-right font-semibold text-gray-900">
                          {s.score.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : result && result.suppliers.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No hay proveedores con precio registrado para este modelo/servicio.
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {/* ── Save quote modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-base font-semibold text-gray-900">Guardar Cotización</h2>
            <p className="mb-4 text-sm text-gray-500">
              Se generará una cotización con el modelo y servicio seleccionados.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notas (opcional)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones, requerimientos especiales..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowModal(false)
                  setNotes('')
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveQuote}
                loading={quoteMutation.isPending}
              >
                Confirmar
              </Button>
            </div>

            {quoteMutation.isError && (
              <p className="mt-3 text-sm text-red-600">
                Error al guardar la cotización. Intenta de nuevo.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
