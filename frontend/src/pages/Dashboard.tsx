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
  ResponsiveContainer,
} from 'recharts'
import {
  AlertTriangle,
  TrendingUp,
  Layers,
  Car,
  Wrench,
  Calculator,
  FileText,
  ChevronRight,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
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

const STATUS_BG: Record<'ok' | 'low' | 'critical', string> = {
  ok: 'bg-emerald-50',
  low: 'bg-orange-50',
  critical: 'bg-red-50',
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPct = (val: number) => (val * 100).toFixed(1) + '%'
const fmtCurrency = (val: number) =>
  '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; payload: { margin_status: 'ok' | 'low' | 'critical' } }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  const status = payload[0].payload.margin_status
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold" style={{ color: STATUS_COLORS[status] }}>
        {fmtPct(val)}
      </p>
      <p className="text-xs text-gray-400 capitalize">{status === 'ok' ? 'Rentable' : status === 'low' ? 'Margen bajo' : 'Crítico'}</p>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  trend,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: 'blue' | 'emerald' | 'orange' | 'red'
  trend?: 'up' | 'down' | 'neutral'
}) {
  const accentMap = {
    blue: {
      icon: 'bg-blue-100 text-blue-600',
      bar: 'bg-blue-500',
    },
    emerald: {
      icon: 'bg-emerald-100 text-emerald-600',
      bar: 'bg-emerald-500',
    },
    orange: {
      icon: 'bg-orange-100 text-orange-600',
      bar: 'bg-orange-500',
    },
    red: {
      icon: 'bg-red-100 text-red-600',
      bar: 'bg-red-500',
    },
  }

  const colors = accentMap[accent]

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${colors.bar}`} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
          {sub && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
              {trend === 'up' && <ArrowUpRight size={12} className="text-red-500" />}
              {trend === 'down' && <ArrowDownRight size={12} className="text-emerald-500" />}
              {sub}
            </p>
          )}
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${colors.icon}`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>
      </div>
    </div>
  )
}

function KpiCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="absolute left-0 top-0 h-full w-1 bg-gray-100" />
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
    </div>
  )
}

// ── Alert Banner ──────────────────────────────────────────────────────────────
function AlertBanner({ criticalPct }: { criticalPct: number }) {
  if (criticalPct < 0.5) return null
  const isCritical = criticalPct >= 0.8

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 ${
        isCritical
          ? 'border-red-200 bg-red-50'
          : 'border-orange-200 bg-orange-50'
      }`}
    >
      <div
        className={`mt-0.5 shrink-0 rounded-full p-1.5 ${
          isCritical ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
        }`}
      >
        <AlertTriangle size={16} />
      </div>
      <div>
        <p className={`text-sm font-semibold ${isCritical ? 'text-red-800' : 'text-orange-800'}`}>
          {isCritical ? 'Rentabilidad crítica detectada' : 'Atención requerida'}
        </p>
        <p className={`mt-0.5 text-xs ${isCritical ? 'text-red-600' : 'text-orange-600'}`}>
          El {fmtPct(criticalPct)} de los combos modelo-servicio tiene margen por debajo del umbral mínimo.
          Revisa el catálogo de costos o ajusta los parámetros de configuración.
        </p>
      </div>
    </div>
  )
}

// ── Quick Actions ─────────────────────────────────────────────────────────────
function QuickActions() {
  const navigate = useNavigate()
  const actions = [
    { label: 'Nueva cotización', icon: Calculator, to: '/calculator', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
    { label: 'Ver cotizaciones', icon: FileText, to: '/quotes', color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100' },
    { label: 'Catálogo de costos', icon: Layers, to: '/catalog', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
    { label: 'Simular escenario', icon: Zap, to: null as string | null, color: 'text-orange-600 bg-orange-50 hover:bg-orange-100', action: true },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.filter(a => !a.action).map((action) => (
        <button
          key={action.label}
          onClick={() => action.to && navigate(action.to)}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${action.color}`}
        >
          <action.icon size={18} strokeWidth={1.8} />
          <span className="text-sm font-medium">{action.label}</span>
          <ChevronRight size={14} className="ml-auto opacity-50" />
        </button>
      ))}
    </div>
  )
}

// ── Donut Chart Center Label ──────────────────────────────────────────────────
function DonutCenter({ totalCombos, criticalCount }: { totalCombos: number; criticalCount: number }) {
  const pct = totalCombos > 0 ? Math.round((criticalCount / totalCombos) * 100) : 0
  return (
    <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle">
      <tspan x="50%" dy="-8" fontSize="22" fontWeight="700" fill="#111827">{pct}%</tspan>
      <tspan x="50%" dy="20" fontSize="11" fill="#9CA3AF">críticos</tspan>
    </text>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-orange-100 p-1.5 text-orange-600">
              <Zap size={16} />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Simular Escenario</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-gray-400">
            Ajusta los parámetros para ver cómo impactarían en los márgenes sin alterar la configuración actual.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Costo/hr técnico ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={techCostHr}
                onChange={(e) => setTechCostHr(e.target.value)}
                placeholder="Ej. 250.00"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {mutation.isError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                Error al simular. Intenta de nuevo.
              </p>
            )}

            <Button type="submit" className="w-full" loading={mutation.isPending}>
              Calcular impacto
            </Button>
          </form>

          {delta && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Impacto del escenario
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-white border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">Margen Δ</p>
                  <p className={`mt-1 text-lg font-bold ${delta.avg_margin_pct_delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {delta.avg_margin_pct_delta >= 0 ? '+' : ''}
                    {(delta.avg_margin_pct_delta * 100).toFixed(1)}pp
                  </p>
                </div>
                <div className="rounded-lg bg-white border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">Críticos Δ</p>
                  <p className={`mt-1 text-lg font-bold ${delta.critical_combos_delta <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {delta.critical_combos_delta > 0 ? '+' : ''}
                    {delta.critical_combos_delta}
                  </p>
                </div>
                <div className="rounded-lg bg-white border border-gray-100 p-3">
                  <p className="text-xs text-gray-400">OK Δ</p>
                  <p className={`mt-1 text-lg font-bold ${delta.ok_combos_delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {delta.ok_combos_delta > 0 ? '+' : ''}
                    {delta.ok_combos_delta}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
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
  const isLoading = summaryQuery.isLoading || byModelQuery.isLoading

  // ── Donut data ────────────────────────────────────────────────────────────
  const donutData = summary
    ? [
        { name: 'OK', value: summary.margin_distribution.ok.count, color: STATUS_COLORS.ok },
        { name: 'Bajo', value: summary.margin_distribution.low.count, color: STATUS_COLORS.low },
        { name: 'Crítico', value: summary.margin_distribution.critical.count, color: STATUS_COLORS.critical },
      ]
    : []

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="space-y-6 p-6 max-w-7xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Rentabilidad y márgenes — BJX Atlas
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-gray-800 transition-colors"
          >
            <Zap size={15} />
            Simular Escenario
          </button>
        </div>

        {/* ── Alert Banner ───────────────────────────────────────────────── */}
        {summary && <AlertBanner criticalPct={summary.critical_pct} />}

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              <KpiCard
                label="Servicios"
                value={summary?.total_services ?? 0}
                sub="en el catálogo"
                icon={Wrench}
                accent="blue"
              />
              <KpiCard
                label="Modelos"
                value={summary?.total_models ?? 0}
                sub="vehículos activos"
                icon={Car}
                accent="blue"
              />
              <KpiCard
                label="Margen Promedio"
                value={summary ? fmtPct(summary.avg_margin_pct) : '—'}
                sub={summary && summary.avg_margin_pct >= 0.4 ? 'sobre objetivo' : 'bajo objetivo'}
                icon={TrendingUp}
                accent={summary && summary.avg_margin_pct >= 0.4 ? 'emerald' : summary && summary.avg_margin_pct >= 0.2 ? 'orange' : 'red'}
                trend={summary && summary.avg_margin_pct >= 0.4 ? 'down' : 'up'}
              />
              <KpiCard
                label="Combos Críticos"
                value={summary ? `${summary.critical_combos} / ${summary.total_combos}` : '—'}
                sub={summary ? fmtPct(summary.critical_pct) + ' del total' : undefined}
                icon={AlertTriangle}
                accent={summary && summary.critical_pct < 0.3 ? 'emerald' : summary && summary.critical_pct < 0.6 ? 'orange' : 'red'}
                trend={summary && summary.critical_pct > 0 ? 'up' : 'neutral'}
              />
            </>
          )}
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        <QuickActions />

        {/* ── Charts ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Bar Chart */}
          <div className="col-span-1 lg:col-span-2 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Margen por modelo</h2>
                <p className="mt-0.5 text-xs text-gray-400">Porcentaje de margen promedio</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {(['ok', 'low', 'critical'] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                    {s === 'ok' ? 'OK' : s === 'low' ? 'Bajo' : 'Crítico'}
                  </span>
                ))}
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : models.length === 0 ? (
              <div className="flex h-56 items-center justify-center">
                <p className="text-sm text-gray-400">Sin datos</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={models} margin={{ top: 4, right: 8, left: 0, bottom: 52 }}>
                  <XAxis
                    dataKey="model_name"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => (v * 100).toFixed(0) + '%'}
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    width={42}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)', radius: 8 }} />
                  <Bar dataKey="avg_margin_pct" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {models.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={STATUS_COLORS[entry.margin_status]}
                        fillOpacity={0.9}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Donut Chart */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-5">
              <h2 className="text-sm font-semibold text-gray-800">Distribución</h2>
              <p className="mt-0.5 text-xs text-gray-400">Combos por estado de margen</p>
            </div>
            {isLoading ? (
              <Skeleton className="mx-auto h-48 w-48 rounded-full" />
            ) : donutData.every((d) => d.value === 0) ? (
              <div className="flex h-56 items-center justify-center">
                <p className="text-sm text-gray-400">Sin datos</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={76}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`pie-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    {summary && (
                      <DonutCenter
                        totalCombos={summary.total_combos}
                        criticalCount={summary.critical_combos}
                      />
                    )}
                  </PieChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="mt-2 space-y-2">
                  {donutData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: `${d.color}12` }}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-xs font-medium text-gray-600">{d.name}</span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: d.color }}>
                        {d.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Rentabilidad por modelo table ───────────────────────────────── */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Rentabilidad por modelo</h2>
              <p className="mt-0.5 text-xs text-gray-400">Haz clic en una fila para ver detalle</p>
            </div>
            {models.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                {models.length} modelos
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-5">
                <TableSkeleton rows={6} cols={7} />
              </div>
            ) : models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="mb-3 rounded-xl bg-gray-100 p-4">
                  <Car size={28} className="text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600">Sin datos de rentabilidad</p>
                <p className="mt-1 text-xs text-gray-400">Completa el catálogo de costos para ver los márgenes</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3">Modelo</th>
                    <th className="px-5 py-3 text-right">Servicios</th>
                    <th className="px-5 py-3 text-right hidden sm:table-cell">Costo BJX</th>
                    <th className="px-5 py-3 text-right hidden sm:table-cell">Precio Brame</th>
                    <th className="px-5 py-3 text-right hidden md:table-cell">Margen $</th>
                    <th className="px-5 py-3 text-right">Margen %</th>
                    <th className="px-5 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {models.map((row) => (
                    <tr
                      key={row.model_id}
                      onClick={() => navigate(`/catalog?model_id=${row.model_id}`)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 group ${STATUS_BG[row.margin_status]} hover:brightness-95`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-7 w-1 rounded-full shrink-0"
                            style={{ background: STATUS_COLORS[row.margin_status] }}
                          />
                          <span className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                            {row.model_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-500">{row.service_count}</td>
                      <td className="px-5 py-3.5 text-right text-gray-500 hidden sm:table-cell">
                        {fmtCurrency(row.avg_bjx_cost)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-500 hidden sm:table-cell">
                        {fmtCurrency(row.avg_brame_price)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-gray-500 hidden md:table-cell">
                        {fmtCurrency(row.avg_margin_pesos)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold" style={{ color: STATUS_COLORS[row.margin_status] }}>
                        {fmtPct(row.avg_margin_pct)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <MarginBadge status={row.margin_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* ── Simulate Modal ─────────────────────────────────────────────────── */}
      {isModalOpen && <SimulateModal onClose={() => setIsModalOpen(false)} />}
    </div>
  )
}
