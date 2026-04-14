import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Plus,
  X,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  FileText,
  Clock,
  ShieldCheck,
  Star,
  RefreshCw,
  Wrench,
} from 'lucide-react'
import { getModels, getServices, getCosts, calculate, createQuote, getConfig } from '../api'
import type { EngineResponse, CalculationResult } from '../api/types'
import { MarginBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_TECH_COST = 156.25
const DEFAULT_TARGET_MARGIN = 40

const STATUS_COLORS = { ok: '#10B981', low: '#F97316', critical: '#EF4444' } as const
const STATUS_TEXT = { ok: 'text-emerald-600', low: 'text-orange-500', critical: 'text-red-500' } as const
const STATUS_BG = { ok: 'bg-emerald-50 border-emerald-200', low: 'bg-orange-50 border-orange-200', critical: 'bg-red-50 border-red-200' } as const

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtPct = (v: number) => (v * 100).toFixed(1) + '%'

// ── Margin Arc Gauge ──────────────────────────────────────────────────────────
function MarginGauge({ result, targetPct }: { result: CalculationResult; targetPct: number }) {
  const size = 180
  const sw = 16
  const r = (size - sw) / 2
  const cx = size / 2
  const cy = size / 2
  const arcDeg = 240
  const circumference = 2 * Math.PI * r
  const arcLen = (arcDeg / 360) * circumference
  const clampedPct = Math.max(0, Math.min(1, result.margin_pct / (targetPct / 100 * 2)))
  const filled = clampedPct * arcLen
  const startDeg = 150
  const color = STATUS_COLORS[result.margin_status]

  // Target marker position
  const targetFraction = 1 / 2 // target is always at 50% of the gauge max
  const targetAngleDeg = startDeg + targetFraction * arcDeg
  const targetAngleRad = (targetAngleDeg * Math.PI) / 180
  const markerX = cx + r * Math.cos(targetAngleRad)
  const markerY = cy + r * Math.sin(targetAngleRad)

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        {/* Background track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="#F3F4F6"
          strokeWidth={sw}
          strokeDasharray={`${arcLen} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${startDeg}, ${cx}, ${cy})`}
        />
        {/* Colored fill */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(${startDeg}, ${cx}, ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
        />
        {/* Target marker */}
        <circle cx={markerX} cy={markerY} r={4} fill="white" stroke="#6B7280" strokeWidth={2} />

        {/* Center: margin % */}
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize="30" fontWeight="800" fill="#111827">
          {(result.margin_pct * 100).toFixed(1)}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#9CA3AF" fontWeight="500">
          MARGEN BRUTO
        </text>
        <text x={cx} y={cy + 30} textAnchor="middle" fontSize="10" fill={color} fontWeight="600">
          {result.margin_status === 'ok' ? '✓ Objetivo alcanzado' : result.margin_status === 'low' ? '⚠ Margen bajo' : '✗ Margen crítico'}
        </text>
      </svg>

      {/* Key metrics row */}
      <div className="mt-1 grid w-full grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-400">Margen $</p>
          <p className={`text-sm font-bold ${STATUS_TEXT[result.margin_status]}`}>{fmt$(result.margin_pesos)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Objetivo</p>
          <p className="text-sm font-bold text-gray-700">{targetPct}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Gap</p>
          <p className={`text-sm font-bold ${result.gap_vs_target >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {result.gap_vs_target >= 0 ? '+' : ''}{fmt$(result.gap_vs_target)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Cost Breakdown Bar ────────────────────────────────────────────────────────
function CostBreakdownBar({ result }: { result: CalculationResult }) {
  const total = result.brame_price
  const laborPct = (result.labor_cost / total) * 100
  const partsPct = (result.parts_cost / total) * 100
  const marginPct = (result.margin_pesos / total) * 100

  const segments = [
    { label: 'Mano de obra', pct: laborPct, color: 'bg-blue-400', value: result.labor_cost },
    { label: 'Refacciones', pct: partsPct, color: 'bg-indigo-400', value: result.parts_cost },
    { label: 'Margen', pct: Math.max(0, marginPct), color: marginPct < 0 ? 'bg-red-400' : 'bg-emerald-400', value: result.margin_pesos },
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Composición del precio</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
        {segments.map((s) => (
          <div
            key={s.label}
            className={`${s.color} transition-all duration-500`}
            style={{ width: `${Math.max(0, s.pct)}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            <span className="text-xs text-gray-500">{s.label}</span>
            <span className="text-xs font-semibold text-gray-700">{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Supplier Row ──────────────────────────────────────────────────────────────
function SupplierRow({ s, maxScore }: { s: EngineResponse['suppliers'][0]; maxScore: number }) {
  const scorePct = maxScore > 0 ? (s.score / maxScore) * 100 : 0
  return (
    <div className={`rounded-xl border p-3 transition-colors ${s.recommended ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.rank === 1 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {s.rank}
            </span>
            <span className="truncate text-sm font-semibold text-gray-900">{s.supplier_name}</span>
            {s.recommended && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                <Star size={10} fill="white" /> Mejor
              </span>
            )}
          </div>

          {/* Score bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${s.recommended ? 'bg-blue-500' : 'bg-gray-400'}`}
                style={{ width: `${scorePct}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-bold text-gray-700">{s.score.toFixed(2)}</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-base font-bold text-gray-900">{fmt$(s.price)}</p>
        </div>
      </div>

      <div className="mt-2 flex gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><Clock size={11} />{s.lead_time_days}d entrega</span>
        <span className="flex items-center gap-1"><ShieldCheck size={11} />{s.warranty_days}d garantía</span>
      </div>
    </div>
  )
}

// ── Results Panel ─────────────────────────────────────────────────────────────
function ResultsPanel({
  result,
  targetMargin,
  techCost,
  isLoading,
  hasSelection,
}: {
  result: EngineResponse | null
  targetMargin: number
  techCost: number
  isLoading: boolean
  hasSelection: boolean
}) {
  const r = result?.result ?? null
  const suppliers = result?.suppliers ?? []
  const maxScore = Math.max(...suppliers.map((s) => s.score), 0)

  if (!hasSelection) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
        <div className="mb-4 rounded-2xl bg-gray-100 p-5">
          <Wrench size={36} className="text-gray-300" strokeWidth={1.5} />
        </div>
        <p className="text-base font-semibold text-gray-500">Selecciona modelo y servicio</p>
        <p className="mt-1 text-sm text-gray-400">Los resultados del motor de cálculo aparecerán aquí</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center rounded-2xl border border-gray-100 bg-white p-8">
          <RefreshCw size={24} className="animate-spin text-blue-500" />
        </div>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    )
  }

  if (!r) return null

  const rows: Array<{ label: string; value: string; bold?: boolean; color?: string; separator?: boolean }> = [
    { label: 'Duración del servicio', value: `${r.duration_hrs} hrs` },
    { label: 'Costo/hr técnico', value: fmt$(techCost) },
    { label: 'Costo mano de obra', value: fmt$(r.labor_cost) },
    { label: 'Costo refacciones', value: fmt$(r.parts_cost) },
    { label: 'Costo total BJX', value: fmt$(r.total_bjx_cost), bold: true, separator: true },
    { label: 'Precio Brame', value: fmt$(r.brame_price), bold: true },
    { label: 'Margen bruto ($)', value: fmt$(r.margin_pesos), bold: true, color: STATUS_TEXT[r.margin_status], separator: true },
    { label: 'Margen bruto (%)', value: fmtPct(r.margin_pct), bold: true, color: STATUS_TEXT[r.margin_status] },
    { label: 'Precio sugerido (obj.)', value: fmt$(r.suggested_price), separator: true },
    { label: 'Gap vs objetivo', value: `${r.gap_vs_target >= 0 ? '+' : ''}${fmt$(r.gap_vs_target)}`, color: r.gap_vs_target >= 0 ? 'text-emerald-600' : 'text-red-500' },
  ]

  return (
    <div className="space-y-4">
      {/* Data source warning */}
      {r.data_source === 'estimated' && (
        <div className="flex items-center gap-2.5 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3">
          <AlertTriangle size={15} className="shrink-0 text-yellow-600" />
          <p className="text-xs text-yellow-700 font-medium">Valores estimados — sin datos exactos en catálogo</p>
        </div>
      )}

      {/* Gauge + breakdown */}
      <div className={`rounded-2xl border p-5 bg-white ${STATUS_BG[r.margin_status].split(' ')[1]} border`} style={{ borderColor: `${STATUS_COLORS[r.margin_status]}30` }}>
        <MarginGauge result={r} targetPct={targetMargin} />
        <div className="mt-4 border-t border-gray-100 pt-4">
          <CostBreakdownBar result={r} />
        </div>
      </div>

      {/* Cost detail table */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Desglose detallado</h3>
        <div className="divide-y divide-gray-50">
          {rows.map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between py-2 ${row.separator ? 'mt-1 border-t border-gray-200 pt-3' : ''}`}
            >
              <span className="text-sm text-gray-500">{row.label}</span>
              <span className={`text-sm ${row.bold ? 'font-bold' : 'font-medium'} ${row.color ?? 'text-gray-900'}`}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <span className="text-xs text-gray-400">Estado</span>
          <MarginBadge status={r.margin_status} />
        </div>
      </div>

      {/* Suppliers */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Comparativo de proveedores
          {suppliers.length > 0 && (
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 normal-case tracking-normal">
              {suppliers.length}
            </span>
          )}
        </h3>

        {suppliers.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm text-gray-400">Sin proveedores con precio registrado</p>
            <p className="mt-1 text-xs text-gray-300">Agrega precios en el módulo de Proveedores</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suppliers.map((s) => (
              <SupplierRow key={s.supplier_id} s={s} maxScore={maxScore} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Param Slider ──────────────────────────────────────────────────────────────
function ParamSlider({
  label, value, min, max, step, unit, defaultValue, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  unit: string; defaultValue: number; onChange: (v: number) => void
}) {
  const modified = value !== defaultValue
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          {modified && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              Reset
            </button>
          )}
          <span className={`text-sm font-bold tabular-nums ${modified ? 'text-blue-600' : 'text-gray-900'}`}>
            {unit === '$' ? `$${value.toFixed(2)}` : `${value}%`}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full accent-blue-600"
        style={{
          background: `linear-gradient(to right, #3B82F6 ${pct}%, #E5E7EB ${pct}%)`,
        }}
      />
      <div className="mt-0.5 flex justify-between text-xs text-gray-300">
        <span>{unit === '$' ? `$${min}` : `${min}%`}</span>
        <span>{unit === '$' ? `$${max}` : `${max}%`}</span>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CalculatorPage() {
  const navigate = useNavigate()

  // ── Selection state ─────────────────────────────────────────────────────
  const [modelId, setModelId] = useState('')
  const [modelSearch, setModelSearch] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')

  // ── Params ───────────────────────────────────────────────────────────────
  const [techCost, setTechCost] = useState(DEFAULT_TECH_COST)
  const [targetMargin, setTargetMargin] = useState(DEFAULT_TARGET_MARGIN)
  const [wPrice, setWPrice] = useState(50)
  const [wTime, setWTime] = useState(30)
  const [wTc, setWTc] = useState(20)
  const weightSum = wPrice + wTime + wTc
  const [configLoaded, setConfigLoaded] = useState(false)

  // ── Quote cart (multi-service) ───────────────────────────────────────────
  const [cartServices, setCartServices] = useState<Array<{ id: string; name: string }>>([])

  // ── Result + UI state ────────────────────────────────────────────────────
  const [result, setResult] = useState<EngineResponse | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [notes, setNotes] = useState('')
  const [toast, setToast] = useState<{ message: string; quoteId: string } | null>(null)
  const calcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: () => getModels({ active: true }),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: () => getServices(),
  })

  const { data: modelCosts = [] } = useQuery({
    queryKey: ['catalog-costs-for-model', modelId],
    queryFn: () => getCosts({ model_id: modelId }),
    enabled: Boolean(modelId),
  })

  // Load defaults from API config
  useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !configLoaded,
    staleTime: Infinity,
    select: (params) => {
      if (configLoaded) return params
      const get = (key: string) => params.find((p) => p.key === key)?.value
      const tc = parseFloat(get('technician_cost_hr') ?? '')
      const tm = parseFloat(get('target_margin') ?? '')
      const wp = parseFloat(get('scoring_weight_price') ?? '')
      const wt = parseFloat(get('scoring_weight_time') ?? '')
      const wtc = parseFloat(get('scoring_weight_tc') ?? '')
      if (!isNaN(tc)) setTechCost(tc)
      if (!isNaN(tm)) setTargetMargin(tm * 100)
      if (!isNaN(wp)) setWPrice(Math.round(wp * 100))
      if (!isNaN(wt)) setWTime(Math.round(wt * 100))
      if (!isNaN(wtc)) setWTc(Math.round(wtc * 100))
      setConfigLoaded(true)
      return params
    },
  })

  // ── Derived data ─────────────────────────────────────────────────────────
  const selectedModel = models.find((m) => m.id === modelId)
  const selectedService = services.find((s) => s.id === serviceId)
  const availableServiceIds = new Set(modelCosts.map((c) => c.service_id))

  const filteredModels = models.filter((m) => {
    const q = modelSearch.toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.brand.toLowerCase().includes(q)
  })

  const filteredServices = services.filter((s) => {
    if (modelId && !availableServiceIds.has(s.id)) return false
    const q = serviceSearch.toLowerCase()
    return !q || s.name.toLowerCase().includes(q)
  })

  // ── Calculate mutation ────────────────────────────────────────────────────
  const calcMutation = useMutation({
    mutationFn: calculate,
    onSuccess: (data) => setResult(data),
  })

  const triggerCalc = useCallback(() => {
    if (!modelId || !serviceId) return
    if (calcTimerRef.current) clearTimeout(calcTimerRef.current)
    calcTimerRef.current = setTimeout(() => {
      const totalW = wPrice + wTime + wTc
      // Normalize weights to always sum to 1.0 before sending
      const normPrice = totalW > 0 ? wPrice / totalW : 1 / 3
      const normTime = totalW > 0 ? wTime / totalW : 1 / 3
      const normTc = totalW > 0 ? wTc / totalW : 1 / 3
      calcMutation.mutate({
        model_id: modelId,
        service_id: serviceId,
        technician_cost_hr: techCost,
        target_margin: targetMargin / 100,
        scoring_weight_price: normPrice,
        scoring_weight_time: normTime,
        scoring_weight_tc: normTc,
      })
    }, 350)
  }, [modelId, serviceId, techCost, targetMargin, wPrice, wTime, wTc]) // eslint-disable-line

  useEffect(() => {
    triggerCalc()
    return () => { if (calcTimerRef.current) clearTimeout(calcTimerRef.current) }
  }, [triggerCalc])

  useEffect(() => {
    if (!modelId || !serviceId) setResult(null)
  }, [modelId, serviceId])

  // Reset service when model changes
  useEffect(() => {
    setServiceId('')
    setResult(null)
    setCartServices([])
    setServiceSearch('')
  }, [modelId])

  // ── Cart management ──────────────────────────────────────────────────────
  const removeFromCart = (id: string) => {
    setCartServices((prev) => prev.filter((s) => s.id !== id))
  }

  // ── Quote mutation ────────────────────────────────────────────────────────
  const quoteMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: (data) => {
      setShowModal(false)
      setNotes('')
      setCartServices([])
      setToast({ message: `Cotización ${data.quote_number} creada`, quoteId: data.id })
      setTimeout(() => setToast(null), 5000)
    },
  })

  const handleSaveQuote = () => {
    if (!modelId) return
    const serviceIds = cartServices.length > 0
      ? cartServices.map((s) => s.id)
      : serviceId ? [serviceId] : []
    if (serviceIds.length === 0) return
    quoteMutation.mutate({
      model_id: modelId,
      service_ids: serviceIds,
      notes: notes || undefined,
      technician_cost_hr: techCost,
      target_margin: targetMargin / 100,
    })
  }

  const quoteServiceCount = cartServices.length > 0 ? cartServices.length : (serviceId ? 1 : 0)
  const canSave = Boolean(modelId) && quoteServiceCount > 0
  const hasSelection = Boolean(modelId && serviceId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl bg-gray-900 px-5 py-3.5 text-sm text-white shadow-2xl">
          <CheckCircle size={16} className="shrink-0 text-emerald-400" />
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => { setToast(null); navigate('/quotes') }}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs hover:bg-white/20 transition-colors"
          >
            Ver <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calculadora</h1>
          <p className="mt-0.5 text-sm text-gray-500">Motor de precios y márgenes BJX × Brame</p>
        </div>
        <button
          disabled={!canSave}
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          <FileText size={15} />
          Guardar cotización
          {quoteServiceCount > 0 && (
            <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs">
              {quoteServiceCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[380px_1fr]">
        {/* ── Left Panel ────────────────────────────────────────────────── */}
        <div className="space-y-4">

            {/* Step 1: Model */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">1</span>
                  <h2 className="text-sm font-semibold text-gray-800">Modelo de vehículo</h2>
                </div>
              </div>

              <div className="p-3">
                {/* Search */}
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar modelo..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>

                {/* Model list */}
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                  {filteredModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setModelId(m.id === modelId ? '' : m.id)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        m.id === modelId
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div>
                        <span className="font-medium">{m.name}</span>
                        <span className={`ml-1.5 text-xs ${m.id === modelId ? 'text-blue-200' : 'text-gray-400'}`}>{m.brand}</span>
                      </div>
                      {m.id === modelId && <CheckCircle size={14} />}
                    </button>
                  ))}
                  {filteredModels.length === 0 && (
                    <p className="py-4 text-center text-xs text-gray-400">Sin resultados</p>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2: Service */}
            <div className={`rounded-2xl border bg-white shadow-sm transition-opacity ${!modelId ? 'opacity-50' : ''}`}>
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${modelId ? 'bg-blue-600' : 'bg-gray-300'}`}>2</span>
                    <h2 className="text-sm font-semibold text-gray-800">Servicio</h2>
                  </div>
                  {modelId && (
                    <span className="text-xs text-gray-400">{filteredServices.length} disponibles</span>
                  )}
                </div>
              </div>

              <div className="p-3">
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar servicio..."
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    disabled={!modelId}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {filteredServices.map((s) => {
                    const inCart = cartServices.some((c) => c.id === s.id)
                    const isSelected = s.id === serviceId
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${
                          isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <button
                          className="flex-1 text-left"
                          onClick={() => setServiceId(s.id === serviceId ? '' : s.id)}
                        >
                          <p className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>{s.name}</p>
                          <p className="text-xs text-gray-400">{s.category}</p>
                        </button>
                        <button
                          onClick={() => {
                            setServiceId(s.id)
                            // Add to cart if not already there
                            if (!cartServices.some((c) => c.id === s.id)) {
                              setCartServices((prev) => [...prev, { id: s.id, name: s.name }])
                            } else {
                              removeFromCart(s.id)
                            }
                          }}
                          title={inCart ? 'Quitar de cotización' : 'Agregar a cotización'}
                          className={`shrink-0 rounded-lg p-1.5 transition-colors ${
                            inCart
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                          }`}
                        >
                          {inCart ? <X size={12} /> : <Plus size={12} />}
                        </button>
                      </div>
                    )
                  })}
                  {filteredServices.length === 0 && modelId && (
                    <p className="py-4 text-center text-xs text-gray-400">Sin servicios disponibles</p>
                  )}
                </div>
              </div>
            </div>

            {/* Quote cart */}
            {cartServices.length > 0 && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Cotización — {cartServices.length} servicio{cartServices.length !== 1 ? 's' : ''}
                </p>
                <div className="space-y-1.5">
                  {cartServices.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5">
                      <span className="text-xs font-medium text-gray-700 truncate">{s.name}</span>
                      <button onClick={() => removeFromCart(s.id)} className="ml-2 shrink-0 text-gray-300 hover:text-red-400">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Params */}
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">3</span>
                <h2 className="text-sm font-semibold text-gray-800">Parámetros</h2>
              </div>

              <div className="space-y-5">
                <ParamSlider
                  label="Costo/hr técnico"
                  value={techCost}
                  min={50}
                  max={500}
                  step={0.25}
                  unit="$"
                  defaultValue={DEFAULT_TECH_COST}
                  onChange={setTechCost}
                />
                <ParamSlider
                  label="Margen objetivo"
                  value={targetMargin}
                  min={10}
                  max={80}
                  step={0.5}
                  unit="%"
                  defaultValue={DEFAULT_TARGET_MARGIN}
                  onChange={setTargetMargin}
                />
              </div>

              {/* Scoring weights */}
              <div className="mt-5 border-t border-gray-100 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pesos scoring proveedores</p>
                  <span className={`text-xs font-bold ${weightSum === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {weightSum}/100
                  </span>
                </div>
                <div className="space-y-3">
                  {([
                    { label: 'Precio', value: wPrice, setter: setWPrice },
                    { label: 'Tiempo entrega', value: wTime, setter: setWTime },
                    { label: 'Cobertura técnica', value: wTc, setter: setWTc },
                  ] as Array<{ label: string; value: number; setter: (v: number) => void }>).map(({ label, value, setter }) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-semibold text-gray-800">{value}</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={value}
                        onChange={(e) => setter(parseInt(e.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-blue-500"
                        style={{ background: `linear-gradient(to right, #3B82F6 ${value}%, #E5E7EB ${value}%)` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Panel ───────────────────────────────────────────────── */}
          <ResultsPanel
            result={result}
            targetMargin={targetMargin}
            techCost={techCost}
            isLoading={calcMutation.isPending}
            hasSelection={hasSelection}
          />
        </div>

      {/* ── Save Quote Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Guardar Cotización</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedModel ? `${selectedModel.brand} ${selectedModel.name}` : ''} ·{' '}
                  {quoteServiceCount} servicio{quoteServiceCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => { setShowModal(false); setNotes('') }}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Services summary */}
              <div className="rounded-xl bg-gray-50 p-3 space-y-1.5">
                {(cartServices.length > 0 ? cartServices : selectedService ? [selectedService] : []).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle size={13} className="shrink-0 text-blue-500" />
                    <span className="text-gray-700">{s.name}</span>
                  </div>
                ))}
              </div>

              {/* Params summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-gray-400">Costo/hr técnico</p>
                  <p className="font-semibold text-gray-800">${techCost.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-gray-400">Margen objetivo</p>
                  <p className="font-semibold text-gray-800">{targetMargin}%</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Notas (opcional)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones, requerimientos especiales..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                />
              </div>

              {quoteMutation.isError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">
                  Error al guardar. Intenta de nuevo.
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowModal(false); setNotes('') }}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <Button onClick={handleSaveQuote} loading={quoteMutation.isPending} className="flex-1">
                  Confirmar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
