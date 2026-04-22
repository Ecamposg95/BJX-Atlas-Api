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
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '10px 16px',
      boxShadow: 'var(--shadow)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: STATUS_COLORS[status] }}>{fmtPct(val)}</p>
      <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
        {status === 'ok' ? 'Rentable' : status === 'low' ? 'Margen bajo' : 'Crítico'}
      </p>
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
      icon: 'bg-[color:color-mix(in_srgb,var(--primary)_16%,transparent)] text-[color:var(--primary-dark)]',
      bar: 'bg-[color:var(--primary)]',
    },
    emerald: {
      icon: 'bg-emerald-500/20 text-emerald-400',
      bar: 'bg-emerald-500',
    },
    orange: {
      icon: 'bg-orange-500/20 text-orange-400',
      bar: 'bg-orange-500',
    },
    red: {
      icon: 'bg-rose-500/20 text-rose-400',
      bar: 'bg-rose-500',
    },
  }

  const colors = accentMap[accent]

  return (
    <div className="relative overflow-hidden rounded-2xl p-6 transition-all hover:border-violet-500/20" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Accent bar */}
      <div className={`absolute left-0 top-0 h-full w-1 ${colors.bar}`} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums" style={{ color: 'var(--text)' }}>{value}</p>
          {sub && (
            <p className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
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
    <div className="relative overflow-hidden rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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
  const color = isCritical ? '#EF4444' : '#F97316'

  return (
    <div
      className="flex items-start gap-4 rounded-2xl p-4"
      style={{
        background: `rgba(${isCritical ? '239,68,68' : '249,115,22'},0.08)`,
        border: `1px solid rgba(${isCritical ? '239,68,68' : '249,115,22'},0.25)`,
      }}
    >
      <div
        className="mt-0.5 shrink-0 rounded-full p-1.5"
        style={{ background: `rgba(${isCritical ? '239,68,68' : '249,115,22'},0.15)`, color }}
      >
        <AlertTriangle size={15} />
      </div>
      <div>
        <p className="text-sm font-bold" style={{ color }}>
          {isCritical ? 'Rentabilidad crítica detectada' : 'Atención requerida'}
        </p>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
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
    { label: 'Nueva cotización', icon: Calculator, to: '/calculator', color: 'color-mix(in srgb, var(--primary) 14%, transparent)', text: 'var(--primary-dark)' },
    { label: 'Ver cotizaciones', icon: FileText, to: '/quotes', color: 'color-mix(in srgb, #4f8df7 12%, transparent)', text: '#4f8df7' },
    { label: 'Catálogo de costos', icon: Layers, to: '/catalog', color: 'color-mix(in srgb, var(--success) 12%, transparent)', text: 'var(--success)' },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => navigate(action.to)}
          className="flex items-center gap-3 rounded-xl px-5 py-4 text-left transition-all hover:opacity-90"
          style={{ background: action.color, border: '1px solid var(--border)' }}
        >
          <action.icon size={18} strokeWidth={1.8} style={{ color: action.text, flexShrink: 0 }} />
          <span className="text-sm font-semibold" style={{ color: action.text }}>{action.label}</span>
          <ChevronRight size={13} className="ml-auto opacity-40" style={{ color: action.text }} />
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
      <tspan x="50%" dy="-8" fontSize="22" fontWeight="700" fill="var(--text)">{pct}%</tspan>
      <tspan x="50%" dy="20" fontSize="11" fill="var(--text-faint)">críticos</tspan>
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
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg p-1.5" style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
              <Zap size={16} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Simular Escenario</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Ajusta los parámetros para ver cómo impactarían en los márgenes sin alterar la configuración actual.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { label: 'Costo/hr técnico ($)', value: techCostHr, onChange: setTechCostHr, placeholder: 'Ej. 250.00', step: '0.01', min: '0' },
              { label: 'Margen objetivo (%)', value: targetMargin, onChange: setTargetMargin, placeholder: 'Ej. 30', step: '0.1', min: '0', max: '100' },
              { label: '% aumento Brame', value: bramePctIncrease, onChange: setBramePctIncrease, placeholder: 'Ej. 5', step: '0.1', min: '-100', max: '100' },
            ].map((field) => (
              <div key={field.label}>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {field.label}
                </label>
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3.5 py-2.5 text-sm focus:outline-none"
                  style={{ borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            ))}

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
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                Impacto del escenario
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Margen Δ', value: `${delta.avg_margin_pct_delta >= 0 ? '+' : ''}${(delta.avg_margin_pct_delta * 100).toFixed(1)}pp`, positive: delta.avg_margin_pct_delta >= 0 },
                  { label: 'Críticos Δ', value: `${delta.critical_combos_delta > 0 ? '+' : ''}${delta.critical_combos_delta}`, positive: delta.critical_combos_delta <= 0 },
                  { label: 'OK Δ', value: `${delta.ok_combos_delta > 0 ? '+' : ''}${delta.ok_combos_delta}`, positive: delta.ok_combos_delta >= 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{item.label}</p>
                    <p className="mt-1 text-lg font-bold" style={{ color: item.positive ? '#34d399' : '#fb7185' }}>
                      {item.value}
                    </p>
                  </div>
                ))}
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
    <div className="min-h-full">
      <div className="space-y-7 max-w-7xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Dashboard</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Rentabilidad y márgenes · BJX Atlas
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))', boxShadow: '0 8px 18px color-mix(in srgb, var(--primary) 24%, transparent)' }}
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
          <div className="col-span-1 lg:col-span-2 rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Margen por modelo</h2>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Porcentaje de margen promedio</p>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
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
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={models} margin={{ top: 4, right: 8, left: 0, bottom: 52 }}>
                  <XAxis
                    dataKey="model_name"
                    tick={{ fontSize: 10, fill: 'var(--text-faint)' }}
                    angle={-40}
                    textAnchor="end"
                    interval={0}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => (v * 100).toFixed(0) + '%'}
                    tick={{ fontSize: 10, fill: 'var(--text-faint)' }}
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
          <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-6">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Distribución</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Combos por estado de margen</p>
            </div>
            {isLoading ? (
              <Skeleton className="mx-auto h-48 w-48 rounded-full" />
            ) : donutData.every((d) => d.value === 0) ? (
              <div className="flex h-56 items-center justify-center">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin datos</p>
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
                    <div key={d.name} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: `${d.color}10`, border: `1px solid ${d.color}25` }}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{d.name}</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: d.color }}>
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
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Rentabilidad por modelo</h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>Clic en una fila para ver detalle en catálogo</p>
            </div>
            {models.length > 0 && (
              <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
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
                <div className="mb-3 rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
                  <Car size={28} style={{ color: 'var(--text-faint)' }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Sin datos de rentabilidad</p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>Completa el catálogo de costos para ver los márgenes</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left">Modelo</th>
                    <th className="px-6 py-3 text-right">Servicios</th>
                    <th className="px-6 py-3 text-right hidden sm:table-cell">Costo BJX</th>
                    <th className="px-6 py-3 text-right hidden sm:table-cell">Precio Brame</th>
                    <th className="px-6 py-3 text-right hidden md:table-cell">Margen $</th>
                    <th className="px-6 py-3 text-right">Margen %</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((row) => (
                    <tr
                      key={row.model_id}
                      onClick={() => navigate(`/catalog?model_id=${row.model_id}`)}
                      className="cursor-pointer group"
                      style={{ borderLeft: `3px solid ${STATUS_COLORS[row.margin_status]}22` }}
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-6 w-1 rounded-full shrink-0" style={{ background: STATUS_COLORS[row.margin_status] }} />
                          <span className="font-semibold transition-colors" style={{ color: 'var(--text)' }}>
                            {row.model_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-right" style={{ color: 'var(--text-muted)' }}>{row.service_count}</td>
                      <td className="px-6 py-3.5 text-right hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                        {fmtCurrency(row.avg_bjx_cost)}
                      </td>
                      <td className="px-6 py-3.5 text-right hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
                        {fmtCurrency(row.avg_brame_price)}
                      </td>
                      <td className="px-6 py-3.5 text-right hidden md:table-cell" style={{ color: 'var(--text-muted)' }}>
                        {fmtCurrency(row.avg_margin_pesos)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold" style={{ color: STATUS_COLORS[row.margin_status] }}>
                        {fmtPct(row.avg_margin_pct)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
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
