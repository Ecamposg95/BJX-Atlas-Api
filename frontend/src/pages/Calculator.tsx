import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
const STATUS_TEXT   = { ok: 'text-emerald-400', low: 'text-orange-400', critical: 'text-rose-400' } as const

const CATEGORY_LABELS: Record<string, string> = {
  frenos:     'Frenos',
  motor:      'Motor',
  suspension: 'Suspensión',
  electrico:  'Eléctrico',
  neumaticos: 'Neumáticos',
  otros:      'Otros',
}
const CATEGORIES = Object.keys(CATEGORY_LABELS)

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

  const targetFraction = 1 / 2
  const targetAngleDeg = startDeg + targetFraction * arcDeg
  const targetAngleRad = (targetAngleDeg * Math.PI) / 180
  const markerX = cx + r * Math.cos(targetAngleRad)
  const markerY = cy + r * Math.sin(targetAngleRad)

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={sw}
          strokeDasharray={`${arcLen} ${circumference}`} strokeLinecap="round"
          transform={`rotate(${startDeg}, ${cx}, ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
          transform={`rotate(${startDeg}, ${cx}, ${cy})`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }} />
        <circle cx={markerX} cy={markerY} r={4} fill="#475569" stroke="#94a3b8" strokeWidth={2} />
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize="30" fontWeight="800" fill="#f1f5f9">
          {(result.margin_pct * 100).toFixed(1)}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="600">
          MARGEN BRUTO
        </text>
        <text x={cx} y={cy + 30} textAnchor="middle" fontSize="10" fill={color} fontWeight="600">
          {result.margin_status === 'ok' ? '✓ Objetivo alcanzado' : result.margin_status === 'low' ? '⚠ Margen bajo' : '✗ Margen crítico'}
        </text>
      </svg>

      <div className="mt-1 grid w-full grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Margen $</p>
          <p className={`text-sm font-bold ${STATUS_TEXT[result.margin_status]}`}>{fmt$(result.margin_pesos)}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Objetivo</p>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{targetPct}%</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Gap</p>
          <p className={`text-sm font-bold ${result.gap_vs_target >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
  const laborPct  = (result.labor_cost   / total) * 100
  const partsPct  = (result.parts_cost   / total) * 100
  const marginPct = (result.margin_pesos / total) * 100

  const segments = [
    { label: 'Mano de obra', pct: laborPct,              color: '#818cf8', value: result.labor_cost },
    { label: 'Refacciones',  pct: partsPct,              color: '#a78bfa', value: result.parts_cost },
    { label: 'Margen',       pct: Math.max(0, marginPct), color: marginPct < 0 ? '#fb7185' : '#34d399', value: result.margin_pesos },
  ]

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
        Composición del precio
      </p>
      <div className="flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
        {segments.map((s) => (
          <div key={s.label} className="transition-all duration-500" style={{ width: `${Math.max(0, s.pct)}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>{s.pct.toFixed(0)}%</span>
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
    <div
      className="rounded-xl p-3 transition-colors"
      style={{
        background: s.recommended ? 'rgba(139,92,246,0.10)' : 'var(--surface-2)',
        border: s.recommended ? '1px solid rgba(139,92,246,0.3)' : '1px solid var(--border)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={s.rank === 1 ? { background: '#f59e0b', color: '#fff' } : { background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {s.rank}
            </span>
            <span className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>{s.supplier_name}</span>
            {s.recommended && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                style={{ background: 'var(--primary)' }}>
                <Star size={10} fill="white" /> Mejor
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--surface)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${scorePct}%`, background: s.recommended ? 'var(--primary)' : '#475569' }}
              />
            </div>
            <span className="shrink-0 text-xs font-bold" style={{ color: 'var(--text-muted)' }}>{s.score.toFixed(2)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{fmt$(s.price)}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="flex items-center gap-1"><Clock size={11} />{s.lead_time_days}d entrega</span>
        <span className="flex items-center gap-1"><ShieldCheck size={11} />{s.warranty_days}d garantía</span>
      </div>
    </div>
  )
}

// ── Results Panel ─────────────────────────────────────────────────────────────
function ResultsPanel({
  result, targetMargin, techCost, isLoading, hasSelection,
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
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl p-10 text-center"
        style={{ border: '2px dashed rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.02)' }}>
        <div className="mb-4 rounded-2xl p-5" style={{ background: 'var(--surface-2)' }}>
          <Wrench size={36} style={{ color: 'var(--text-faint)' }} strokeWidth={1.5} />
        </div>
        <p className="text-base font-bold" style={{ color: 'var(--text-muted)' }}>Selecciona modelo y servicio</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-faint)' }}>Los resultados del motor de cálculo aparecerán aquí</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
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
    { label: 'Gap vs objetivo', value: `${r.gap_vs_target >= 0 ? '+' : ''}${fmt$(r.gap_vs_target)}`, color: r.gap_vs_target >= 0 ? 'text-emerald-400' : 'text-rose-400' },
  ]

  return (
    <div className="space-y-4">
      {r.data_source === 'estimated' && (
        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
          style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
          <AlertTriangle size={15} className="shrink-0" style={{ color: '#fbbf24' }} />
          <p className="text-xs font-semibold" style={{ color: '#fde68a' }}>Valores estimados — sin datos exactos en catálogo</p>
        </div>
      )}

      {/* Gauge + breakdown */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: `1px solid ${STATUS_COLORS[r.margin_status]}30` }}>
        <MarginGauge result={r} targetPct={targetMargin} />
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <CostBreakdownBar result={r} />
        </div>
      </div>

      {/* Cost detail table */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
          Desglose detallado
        </h3>
        <div style={{ borderTop: '1px solid var(--border-dim)' }}>
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5"
              style={{
                borderBottom: '1px solid var(--border-dim)',
                marginTop: row.separator ? '4px' : undefined,
                paddingTop: row.separator ? '12px' : undefined,
              }}
            >
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{row.label}</span>
              <span className={`text-sm ${row.bold ? 'font-bold' : 'font-medium'} ${row.color ?? ''}`}
                style={!row.color ? { color: 'var(--text)' } : undefined}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Estado</span>
          <MarginBadge status={r.margin_status} />
        </div>
      </div>

      {/* Suppliers */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
          Comparativo de proveedores
          {suppliers.length > 0 && (
            <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-bold normal-case tracking-normal"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {suppliers.length}
            </span>
          )}
        </h3>
        {suppliers.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin proveedores con precio registrado</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-faint)' }}>Agrega precios en el módulo de Proveedores</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suppliers.map((s) => <SupplierRow key={s.supplier_id} s={s} maxScore={maxScore} />)}
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
        <label className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</label>
        <div className="flex items-center gap-2">
          {modified && (
            <button onClick={() => onChange(defaultValue)} className="text-xs font-bold"
              style={{ color: 'var(--primary-light)' }}>
              Reset
            </button>
          )}
          <span className="text-sm font-black tabular-nums"
            style={{ color: modified ? 'var(--primary-light)' : 'var(--text)' }}>
            {unit === '$' ? `$${value.toFixed(2)}` : `${value}%`}
          </span>
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, #8b5cf6 ${pct}%, #1e293b ${pct}%)` }}
      />
      <div className="mt-0.5 flex justify-between text-xs" style={{ color: 'var(--text-faint)' }}>
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
  const [modelId, setModelId]           = useState('')
  const [modelSearch, setModelSearch]   = useState('')
  const [brandFilter, setBrandFilter]   = useState('')
  const [serviceId, setServiceId]       = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // ── Params ───────────────────────────────────────────────────────────────
  const [techCost, setTechCost]         = useState(DEFAULT_TECH_COST)
  const [targetMargin, setTargetMargin] = useState(DEFAULT_TARGET_MARGIN)
  const [wPrice, setWPrice]             = useState(50)
  const [wTime, setWTime]               = useState(30)
  const [wTc, setWTc]                   = useState(20)
  const weightSum = wPrice + wTime + wTc
  const [configLoaded, setConfigLoaded] = useState(false)

  // ── Quote cart (multi-service) ───────────────────────────────────────────
  const [cartServices, setCartServices] = useState<Array<{ id: string; name: string }>>([])

  // ── Result + UI state ────────────────────────────────────────────────────
  const [result, setResult]     = useState<EngineResponse | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [notes, setNotes]       = useState('')
  const [toast, setToast]       = useState<{ message: string; quoteId: string } | null>(null)
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

  useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
    enabled: !configLoaded,
    staleTime: Infinity,
    select: (params) => {
      if (configLoaded) return params
      const get = (key: string) => params.find((p) => p.key === key)?.value
      const tc  = parseFloat(get('technician_cost_hr') ?? '')
      const tm  = parseFloat(get('target_margin') ?? '')
      const wp  = parseFloat(get('scoring_weight_price') ?? '')
      const wt  = parseFloat(get('scoring_weight_time') ?? '')
      const wtc = parseFloat(get('scoring_weight_tc') ?? '')
      if (!isNaN(tc))  setTechCost(tc)
      if (!isNaN(tm))  setTargetMargin(tm * 100)
      if (!isNaN(wp))  setWPrice(Math.round(wp * 100))
      if (!isNaN(wt))  setWTime(Math.round(wt * 100))
      if (!isNaN(wtc)) setWTc(Math.round(wtc * 100))
      setConfigLoaded(true)
      return params
    },
  })

  // ── Derived data ─────────────────────────────────────────────────────────
  const selectedModel   = models.find((m) => m.id === modelId)
  const selectedService = services.find((s) => s.id === serviceId)
  const availableServiceIds = new Set(modelCosts.map((c) => c.service_id))

  // Distinct sorted brands from loaded models
  const brands = useMemo(
    () => [...new Set(models.map((m) => m.brand).filter(Boolean))].sort() as string[],
    [models]
  )

  // Filtered models: brand pill + search
  const filteredModels = useMemo(() => models.filter((m) => {
    const matchBrand  = !brandFilter || m.brand === brandFilter
    const q           = modelSearch.toLowerCase()
    const matchSearch = !q || m.name.toLowerCase().includes(q) || (m.brand ?? '').toLowerCase().includes(q)
    return matchBrand && matchSearch
  }), [models, brandFilter, modelSearch])

  // Filtered services: category tab + search + model availability
  const filteredServices = useMemo(() => services.filter((s) => {
    if (modelId && !availableServiceIds.has(s.id)) return false
    const matchCat    = !categoryFilter || s.category === categoryFilter
    const q           = serviceSearch.toLowerCase()
    const matchSearch = !q || s.name.toLowerCase().includes(q)
    return matchCat && matchSearch
  }), [services, modelId, availableServiceIds, categoryFilter, serviceSearch])

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
      const normPrice = totalW > 0 ? wPrice / totalW : 1 / 3
      const normTime  = totalW > 0 ? wTime  / totalW : 1 / 3
      const normTc    = totalW > 0 ? wTc    / totalW : 1 / 3
      calcMutation.mutate({
        model_id: modelId, service_id: serviceId,
        technician_cost_hr: techCost, target_margin: targetMargin / 100,
        scoring_weight_price: normPrice, scoring_weight_time: normTime, scoring_weight_tc: normTc,
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

  // Reset service + filters when model changes
  useEffect(() => {
    setServiceId('')
    setResult(null)
    setCartServices([])
    setServiceSearch('')
    setCategoryFilter('')
  }, [modelId])

  // ── Cart management ──────────────────────────────────────────────────────
  const removeFromCart = (id: string) =>
    setCartServices((prev) => prev.filter((s) => s.id !== id))

  // ── Quote mutation ────────────────────────────────────────────────────────
  const quoteMutation = useMutation({
    mutationFn: createQuote,
    onSuccess: (data) => {
      setShowModal(false); setNotes(''); setCartServices([])
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
      model_id: modelId, service_ids: serviceIds,
      notes: notes || undefined,
      technician_cost_hr: techCost, target_margin: targetMargin / 100,
    })
  }

  const quoteServiceCount = cartServices.length > 0 ? cartServices.length : (serviceId ? 1 : 0)
  const canSave     = Boolean(modelId) && quoteServiceCount > 0
  const hasSelection = Boolean(modelId && serviceId)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative">

      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl px-5 py-3.5 text-sm text-white shadow-2xl"
          style={{ background: 'var(--surface)', border: '1px solid rgba(139,92,246,0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <CheckCircle size={16} className="shrink-0 text-emerald-400" />
          <span className="flex-1" style={{ color: 'var(--text)' }}>{toast.message}</span>
          <button
            onClick={() => { setToast(null); navigate('/quotes') }}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}
          >
            Ver <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Calculadora</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Motor de precios y márgenes BJX × Brame</p>
        </div>
        <button
          disabled={!canSave}
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', boxShadow: canSave ? '0 4px 14px rgba(139,92,246,0.3)' : 'none' }}
        >
          <FileText size={15} />
          Guardar cotización
          {quoteServiceCount > 0 && (
            <span className="rounded-full px-1.5 py-0.5 text-xs font-black"
              style={{ background: 'rgba(255,255,255,0.25)' }}>
              {quoteServiceCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        {/* ── Left Panel ────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* ── Step 1: Modelo ── */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-black text-white"
                style={{ background: 'var(--primary)' }}>1</span>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Modelo de vehículo</h2>
              {selectedModel && (
                <span className="ml-auto text-xs font-bold truncate max-w-[120px]"
                  style={{ color: 'var(--primary-light)' }}>
                  {selectedModel.name}
                </span>
              )}
            </div>

            {/* Brand pills */}
            {brands.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  <button
                    onClick={() => setBrandFilter('')}
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all"
                    style={!brandFilter
                      ? { background: 'var(--primary)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                    }
                  >
                    Todas
                  </button>
                  {brands.map((brand) => (
                    <button
                      key={brand}
                      onClick={() => { setBrandFilter(brandFilter === brand ? '' : brand); setModelSearch('') }}
                      className="shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-all whitespace-nowrap"
                      style={brandFilter === brand
                        ? { background: 'var(--primary)', color: '#fff' }
                        : { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                      }
                    >
                      {brand}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
                <input
                  type="text"
                  placeholder={brandFilter ? `Buscar en ${brandFilter}…` : 'Buscar modelo…'}
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  className="w-full py-2 pl-8 pr-3 text-sm focus:outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
                />
              </div>
            </div>

            {/* Model list */}
            <div className="max-h-56 overflow-y-auto px-2 pb-2 space-y-0.5">
              {filteredModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModelId(m.id === modelId ? '' : m.id)}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all"
                  style={m.id === modelId
                    ? { background: 'var(--primary)', color: '#fff' }
                    : { color: 'var(--text)' }
                  }
                >
                  <div className="min-w-0">
                    <span className="font-semibold truncate block">{m.name}</span>
                    <span className="text-xs" style={{ color: m.id === modelId ? 'rgba(196,181,253,0.8)' : 'var(--text-faint)' }}>
                      {m.brand}
                    </span>
                  </div>
                  {m.id === modelId && <CheckCircle size={14} className="shrink-0 ml-2" />}
                </button>
              ))}
              {filteredModels.length === 0 && (
                <p className="py-6 text-center text-xs" style={{ color: 'var(--text-faint)' }}>Sin resultados</p>
              )}
            </div>
          </div>

          {/* ── Step 2: Servicio ── */}
          <div
            className="rounded-2xl overflow-hidden transition-opacity"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: !modelId ? 0.5 : 1 }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-black text-white"
                style={{ background: modelId ? 'var(--primary)' : 'var(--surface-2)', color: modelId ? '#fff' : 'var(--text-faint)' }}
              >2</span>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Servicio</h2>
              {modelId && (
                <span className="ml-auto text-xs" style={{ color: 'var(--text-faint)' }}>
                  {filteredServices.length} disponibles
                </span>
              )}
            </div>

            {/* Category tabs */}
            <div
              className="flex overflow-x-auto"
              style={{ borderBottom: '1px solid var(--border)', scrollbarWidth: 'none', pointerEvents: !modelId ? 'none' : 'auto' }}
            >
              <button
                onClick={() => setCategoryFilter('')}
                className="shrink-0 px-3.5 py-2.5 text-xs font-bold transition-colors whitespace-nowrap"
                style={{
                  borderBottom: !categoryFilter ? '2px solid var(--primary)' : '2px solid transparent',
                  color: !categoryFilter ? 'var(--primary-light)' : 'var(--text-muted)',
                }}
              >
                Todos
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setCategoryFilter(categoryFilter === cat ? '' : cat); setServiceSearch('') }}
                  className="shrink-0 px-3.5 py-2.5 text-xs font-bold transition-colors whitespace-nowrap"
                  style={{
                    borderBottom: categoryFilter === cat ? '2px solid var(--primary)' : '2px solid transparent',
                    color: categoryFilter === cat ? 'var(--primary-light)' : 'var(--text-muted)',
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 py-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
                <input
                  type="text"
                  placeholder={categoryFilter ? `Buscar en ${CATEGORY_LABELS[categoryFilter]}…` : 'Buscar servicio…'}
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  disabled={!modelId}
                  className="w-full py-2 pl-8 pr-3 text-sm focus:outline-none disabled:cursor-not-allowed"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
                />
              </div>
            </div>

            {/* Service list */}
            <div className="max-h-56 overflow-y-auto px-2 pb-2 space-y-0.5">
              {filteredServices.map((s) => {
                const inCart    = cartServices.some((c) => c.id === s.id)
                const isSelected = s.id === serviceId
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 transition-all"
                    style={isSelected
                      ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' }
                      : { border: '1px solid transparent' }
                    }
                  >
                    <button className="flex-1 text-left min-w-0" onClick={() => setServiceId(s.id === serviceId ? '' : s.id)}>
                      <p className="text-sm font-semibold truncate"
                        style={{ color: isSelected ? 'var(--primary-light)' : 'var(--text)' }}>
                        {s.name}
                      </p>
                      <p className="text-xs capitalize" style={{ color: 'var(--text-faint)' }}>{CATEGORY_LABELS[s.category] ?? s.category}</p>
                    </button>
                    <button
                      onClick={() => {
                        setServiceId(s.id)
                        if (!cartServices.some((c) => c.id === s.id)) {
                          setCartServices((prev) => [...prev, { id: s.id, name: s.name }])
                        } else {
                          removeFromCart(s.id)
                        }
                      }}
                      title={inCart ? 'Quitar de cotización' : 'Agregar a cotización'}
                      className="shrink-0 rounded-lg p-1.5 transition-all"
                      style={inCart
                        ? { background: 'var(--primary)', color: '#fff' }
                        : { background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--border)' }
                      }
                    >
                      {inCart ? <X size={12} /> : <Plus size={12} />}
                    </button>
                  </div>
                )
              })}
              {filteredServices.length === 0 && modelId && (
                <p className="py-6 text-center text-xs" style={{ color: 'var(--text-faint)' }}>Sin servicios disponibles</p>
              )}
            </div>
          </div>

          {/* Quote cart */}
          {cartServices.length > 0 && (
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--primary-light)' }}>
                Cotización — {cartServices.length} servicio{cartServices.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1.5">
                {cartServices.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <span className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>{s.name}</span>
                    <button onClick={() => removeFromCart(s.id)} className="ml-2 shrink-0 transition-colors"
                      style={{ color: 'var(--text-faint)' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Parámetros ── */}
          <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-black"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>3</span>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Parámetros</h2>
            </div>

            <div className="space-y-5">
              <ParamSlider label="Costo/hr técnico" value={techCost} min={50} max={500} step={0.25}
                unit="$" defaultValue={DEFAULT_TECH_COST} onChange={setTechCost} />
              <ParamSlider label="Margen objetivo" value={targetMargin} min={10} max={80} step={0.5}
                unit="%" defaultValue={DEFAULT_TARGET_MARGIN} onChange={setTargetMargin} />
            </div>

            {/* Scoring weights */}
            <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
                  Pesos scoring proveedores
                </p>
                <span className="text-xs font-black"
                  style={{ color: weightSum === 100 ? '#34d399' : '#fb7185' }}>
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
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span className="font-bold" style={{ color: 'var(--text)' }}>{value}</span>
                    </div>
                    <input
                      type="range" min={0} max={100} value={value}
                      onChange={(e) => setter(parseInt(e.target.value))}
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full"
                      style={{ background: `linear-gradient(to right, #8b5cf6 ${value}%, #1e293b ${value}%)` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Panel ───────────────────────────────────────────────── */}
        <ResultsPanel
          result={result} targetMargin={targetMargin} techCost={techCost}
          isLoading={calcMutation.isPending} hasSelection={hasSelection}
        />
      </div>

      {/* ── Save Quote Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.6)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="text-base font-black" style={{ color: 'var(--text)' }}>Guardar Cotización</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {selectedModel ? `${selectedModel.brand} ${selectedModel.name}` : ''} ·{' '}
                  {quoteServiceCount} servicio{quoteServiceCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => { setShowModal(false); setNotes('') }}
                className="rounded-lg p-1.5 transition-colors" style={{ color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Services summary */}
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {(cartServices.length > 0 ? cartServices : selectedService ? [selectedService] : []).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <CheckCircle size={13} className="shrink-0" style={{ color: 'var(--primary-light)' }} />
                    <span style={{ color: 'var(--text)' }}>{s.name}</span>
                  </div>
                ))}
              </div>

              {/* Params summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Costo/hr técnico', value: `$${techCost.toFixed(2)}` },
                  { label: 'Margen objetivo', value: `${targetMargin}%` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p style={{ color: 'var(--text-faint)' }}>{label}</p>
                    <p className="font-black mt-0.5" style={{ color: 'var(--text)' }}>{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}>Notas (opcional)</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observaciones, requerimientos especiales…"
                  className="w-full px-3 py-2.5 text-sm focus:outline-none resize-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)' }}
                />
              </div>

              {quoteMutation.isError && (
                <p className="text-sm rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)', color: '#fda4af' }}>
                  Error al guardar. Intenta de nuevo.
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowModal(false); setNotes('') }}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
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
