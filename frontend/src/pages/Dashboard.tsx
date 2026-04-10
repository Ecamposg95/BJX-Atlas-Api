import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { getDashboardSummary, getByModel, simulate } from '../api'
import type { SimulateRequest, SimulateResponse } from '../api/types'
import { MarginBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton'

// ── Color constants ───────────────────────────────────────────────────────────
const STATUS_COLORS: Record<'ok' | 'low' | 'critical', string> = {
  ok: '#10B981',
  low: '#F97316',
  critical: '#EF4444',
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPct = (val: number) => (val * 100).toFixed(1) + '%'
const fmtCurrency = (val: number) =>
  '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2 })

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

// ── Simulate Modal ────────────────────────────────────────────────────────────
function SimulateModal({ onClose }: { onClose: () => void }) {
  const [techCostHr, setTechCostHr] = useState('')
  const [targetMargin, setTargetMargin] = useState('')
  const [bramePctIncrease, setBramePctIncrease] = useState('')
  const [result, setResult] = useState<SimulateResponse | null>(null)

  const mutation = useMutation({
    mutationFn: (data: SimulateRequest) => simulate(data),
    onSuccess: (data) => setResult(data),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: SimulateRequest = {}
    if (techCostHr !== '') payload.technician_cost_hr = parseFloat(techCostHr)
    if (targetMargin !== '') payload.target_margin = parseFloat(targetMargin) / 100
    if (bramePctIncrease !== '') payload.brame_price_increase_pct = parseFloat(bramePctIncrease) / 100
    mutation.mutate(payload)
  }

  const delta = result?.delta_vs_current

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Simular Escenario</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Costo/hr técnico ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={techCostHr}
              onChange={(e) => setTechCostHr(e.target.value)}
              placeholder="Ej. 250.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Margen objetivo (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={targetMargin}
              onChange={(e) => setTargetMargin(e.target.value)}
              placeholder="Ej. 30"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              % aumento Brame
            </label>
            <input
              type="number"
              min="-100"
              max="100"
              step="0.1"
              value={bramePctIncrease}
              onChange={(e) => setBramePctIncrease(e.target.value)}
              placeholder="Ej. 5"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              Error al simular. Intenta de nuevo.
            </p>
          )}

          <Button type="submit" className="w-full" loading={mutation.isPending}>
            Simular
          </Button>
        </form>

        {delta && (
          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">Resultados del escenario</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-gray-500">Margen Prom. Delta</p>
                <p
                  className={`mt-0.5 text-base font-bold ${
                    delta.avg_margin_pct_delta >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {delta.avg_margin_pct_delta >= 0 ? '+' : ''}
                  {(delta.avg_margin_pct_delta * 100).toFixed(1)}pp
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Combos Críticos</p>
                <p
                  className={`mt-0.5 text-base font-bold ${
                    delta.critical_combos_delta <= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {delta.critical_combos_delta > 0 ? '+' : ''}
                  {delta.critical_combos_delta}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Combos OK</p>
                <p
                  className={`mt-0.5 text-base font-bold ${
                    delta.ok_combos_delta >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {delta.ok_combos_delta > 0 ? '+' : ''}
                  {delta.ok_combos_delta}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dashboard Page ────────────────────────────────────────────────────────────
export function DashboardPage() {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
  })

  const byModelQuery = useQuery({
    queryKey: ['dashboard-by-model'],
    queryFn: () => getByModel(),
  })

  const summary = summaryQuery.data
  const models = byModelQuery.data ?? []

  const hasError = summaryQuery.isError || byModelQuery.isError
  const isLoading = summaryQuery.isLoading || byModelQuery.isLoading

  // ── Pie data ──────────────────────────────────────────────────────────────
  const pieData = summary
    ? [
        { name: 'OK', value: summary.margin_distribution.ok.count, color: STATUS_COLORS.ok },
        { name: 'Bajo', value: summary.margin_distribution.low.count, color: STATUS_COLORS.low },
        { name: 'Crítico', value: summary.margin_distribution.critical.count, color: STATUS_COLORS.critical },
      ]
    : []

  if (hasError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-red-500 text-sm">Error cargando datos</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Rentabilidad y márgenes — BJX Atlas
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>Simular Escenario</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              label="Total Servicios"
              value={summary?.total_services ?? 0}
            />
            <KpiCard
              label="Total Modelos"
              value={summary?.total_models ?? 0}
            />
            <KpiCard
              label="Margen Promedio"
              value={summary ? fmtPct(summary.avg_margin_pct) : '—'}
            />
            <KpiCard
              label="Combos Críticos"
              value={summary ? `${summary.critical_combos} / ${summary.total_combos}` : '—'}
              sub={summary ? fmtPct(summary.critical_pct) + ' del total' : undefined}
            />
          </>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Bar Chart — margen por modelo */}
        <div className="col-span-1 lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Margen promedio por modelo (%)
          </h2>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : models.length === 0 ? (
            <p className="text-sm text-gray-400">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={models} margin={{ top: 4, right: 8, left: 0, bottom: 48 }}>
                <XAxis
                  dataKey="model_name"
                  tick={{ fontSize: 11 }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  tickFormatter={(v: number) => (v * 100).toFixed(0) + '%'}
                  tick={{ fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [fmtPct(Number(value)), 'Margen']}
                />
                <Bar dataKey="avg_margin_pct" radius={[4, 4, 0, 0]}>
                  {models.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STATUS_COLORS[entry.margin_status]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pie Chart — distribución de márgenes */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Distribución de márgenes
          </h2>
          {isLoading ? (
            <Skeleton className="h-56 w-full rounded-full" />
          ) : pieData.every((d) => d.value === 0) ? (
            <p className="text-sm text-gray-400">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={72}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`pie-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => (
                    <span className="text-xs text-gray-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Rentabilidad por modelo table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-700">
            Rentabilidad por modelo
          </h2>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-5">
              <TableSkeleton rows={6} cols={7} />
            </div>
          ) : models.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">Sin datos disponibles</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="px-5 py-3">Modelo</th>
                  <th className="px-5 py-3 text-right">Servicios</th>
                  <th className="px-5 py-3 text-right">Costo BJX Prom</th>
                  <th className="px-5 py-3 text-right">Precio Brame Prom</th>
                  <th className="px-5 py-3 text-right">Margen $</th>
                  <th className="px-5 py-3 text-right">Margen %</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {models.map((row) => (
                  <tr
                    key={row.model_id}
                    onClick={() => navigate(`/catalog?model_id=${row.model_id}`)}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                  >
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {row.model_name}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {row.service_count}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {fmtCurrency(row.avg_bjx_cost)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {fmtCurrency(row.avg_brame_price)}
                    </td>
                    <td className="px-5 py-3 text-right text-gray-600">
                      {fmtCurrency(row.avg_margin_pesos)}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-gray-900">
                      {fmtPct(row.avg_margin_pct)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <MarginBadge status={row.margin_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Simulate Modal */}
      {isModalOpen && <SimulateModal onClose={() => setIsModalOpen(false)} />}
    </div>
  )
}
