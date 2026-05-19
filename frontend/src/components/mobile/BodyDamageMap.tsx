import { useState, type MouseEvent } from 'react'
import { Trash2, AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import { clsx } from 'clsx'

export type DamageSeverity = 'low' | 'medium' | 'high'
export type DamageView = 'lateral' | 'top'

export interface DamageMark {
  id: string
  view: DamageView
  /** 0-100 (porcentaje del viewbox) */
  x: number
  /** 0-100 */
  y: number
  severity: DamageSeverity
  note?: string
}

interface Props {
  marks: DamageMark[]
  onMarksChange: (marks: DamageMark[]) => void
  readonly?: boolean
  className?: string
}

const SEVERITY_META: Record<DamageSeverity, { color: string; label: string; icon: typeof Info }> = {
  low: { color: '#22c55e', label: 'Leve', icon: Info },
  medium: { color: '#f59e0b', label: 'Medio', icon: AlertTriangle },
  high: { color: '#dc2626', label: 'Grave', icon: AlertOctagon },
}

const SEVERITY_LABEL_ES: Record<DamageSeverity, string> = {
  low: 'leve',
  medium: 'medio',
  high: 'grave',
}

const VIEW_LABEL_ES: Record<DamageView, string> = {
  lateral: 'vista lateral',
  top: 'vista superior',
}

function genId(): string {
  return `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Mapa interactivo de carrocería (silueta sedán). El usuario toca para añadir
 * un punto de daño con severidad seleccionada via chip. SVG inline, sin libs.
 */
export function BodyDamageMap({ marks, onMarksChange, readonly, className }: Props) {
  const [severity, setSeverity] = useState<DamageSeverity>('medium')

  function handleTap(view: DamageView) {
    return (e: MouseEvent<SVGSVGElement>) => {
      if (readonly) return
      const svg = e.currentTarget
      const rect = svg.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      const m: DamageMark = {
        id: genId(),
        view,
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        severity,
      }
      onMarksChange([...marks, m])
    }
  }

  function clearAll() {
    onMarksChange([])
  }

  function renderMarks(view: DamageView) {
    return marks
      .filter((m) => m.view === view)
      .map((m) => {
        const meta = SEVERITY_META[m.severity]
        return (
          <g
            key={m.id}
            role="img"
            aria-label={`Daño ${SEVERITY_LABEL_ES[m.severity]} en ${VIEW_LABEL_ES[m.view]}`}
            onClick={(ev) => {
              if (readonly) return
              ev.stopPropagation()
              onMarksChange(marks.filter((x) => x.id !== m.id))
            }}
            style={{ cursor: readonly ? 'default' : 'pointer' }}
          >
            <circle cx={m.x} cy={m.y} r="3.2" fill={meta.color} fillOpacity="0.85" stroke="#0f172a" strokeWidth="0.6" />
            <text
              x={m.x}
              y={m.y + 1.1}
              fontSize="3"
              fontWeight="700"
              fill="#0f172a"
              textAnchor="middle"
              pointerEvents="none"
            >
              {marks.filter((x) => x.view === view).indexOf(m) + 1}
            </text>
          </g>
        )
      })
  }

  return (
    <div className={clsx('body-damage-map flex flex-col gap-3', className)}>
      {/* Selector de severidad */}
      {!readonly && (
        <div role="radiogroup" aria-label="Severidad del daño" className="flex flex-wrap gap-2">
          {(['low', 'medium', 'high'] as DamageSeverity[]).map((s) => {
            const meta = SEVERITY_META[s]
            const Icon = meta.icon
            const active = severity === s
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSeverity(s)}
                className={clsx(
                  'min-h-12 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold border-2 transition-all',
                  active
                    ? 'shadow-md scale-[1.02]'
                    : 'opacity-70',
                )}
                style={{
                  borderColor: meta.color,
                  background: active ? `${meta.color}22` : 'transparent',
                  color: 'var(--text)',
                }}
              >
                <Icon size={16} style={{ color: meta.color }} />
                {meta.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Lateral */}
        <figure className="flex flex-col gap-1.5">
          <figcaption
            className="text-[0.65rem] font-extrabold uppercase tracking-widest"
            style={{ color: 'var(--text-faint)' }}
          >
            Vista lateral
          </figcaption>
          <svg
            viewBox="0 0 100 50"
            onClick={handleTap('lateral')}
            className={clsx(
              'w-full h-auto rounded-xl border bg-slate-50 dark:bg-slate-900',
              !readonly && 'cursor-crosshair',
            )}
            style={{ borderColor: 'var(--border)' }}
            role="img"
            aria-label="Silueta lateral del vehículo. Toca para marcar daño."
          >
            <path
              d="M5 35 L12 22 L30 18 L40 12 L65 12 L78 18 L92 22 L95 35 Z"
              fill="#cbd5e1"
              stroke="#475569"
              strokeWidth="0.7"
              strokeLinejoin="round"
            />
            {/* Ventanas */}
            <path d="M32 21 L42 14 L56 14 L63 21 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.4" />
            <path d="M65 21 L68 14 L74 14 L76 21 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.4" />
            {/* Manija */}
            <line x1="48" y1="26" x2="54" y2="26" stroke="#475569" strokeWidth="0.6" />
            {/* Ruedas */}
            <circle cx="22" cy="38" r="5.5" fill="#1e293b" />
            <circle cx="22" cy="38" r="2.5" fill="#cbd5e1" />
            <circle cx="78" cy="38" r="5.5" fill="#1e293b" />
            <circle cx="78" cy="38" r="2.5" fill="#cbd5e1" />
            {renderMarks('lateral')}
          </svg>
        </figure>

        {/* Top */}
        <figure className="flex flex-col gap-1.5">
          <figcaption
            className="text-[0.65rem] font-extrabold uppercase tracking-widest"
            style={{ color: 'var(--text-faint)' }}
          >
            Vista superior
          </figcaption>
          <svg
            viewBox="0 0 100 50"
            onClick={handleTap('top')}
            className={clsx(
              'w-full h-auto rounded-xl border bg-slate-50 dark:bg-slate-900',
              !readonly && 'cursor-crosshair',
            )}
            style={{ borderColor: 'var(--border)' }}
            role="img"
            aria-label="Silueta superior del vehículo. Toca para marcar daño."
          >
            <rect x="8" y="14" width="84" height="22" rx="6" ry="6" fill="#cbd5e1" stroke="#475569" strokeWidth="0.7" />
            {/* Parabrisas / luneta */}
            <path d="M22 16 L34 19 L34 31 L22 34 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.4" />
            <path d="M78 16 L66 19 L66 31 L78 34 Z" fill="#94a3b8" stroke="#475569" strokeWidth="0.4" />
            {/* Capó / cajuela divisores */}
            <line x1="18" y1="14" x2="18" y2="36" stroke="#475569" strokeWidth="0.4" />
            <line x1="82" y1="14" x2="82" y2="36" stroke="#475569" strokeWidth="0.4" />
            {/* Techo */}
            <rect x="34" y="19" width="32" height="12" fill="#a3b1c2" stroke="#475569" strokeWidth="0.4" />
            {/* Ruedas (visibles desde arriba) */}
            <rect x="13" y="10" width="6" height="3" fill="#1e293b" />
            <rect x="13" y="37" width="6" height="3" fill="#1e293b" />
            <rect x="81" y="10" width="6" height="3" fill="#1e293b" />
            <rect x="81" y="37" width="6" height="3" fill="#1e293b" />
            {renderMarks('top')}
          </svg>
        </figure>
      </div>

      {/* Footer: contadores + limpiar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap gap-3" aria-live="polite">
          {(['low', 'medium', 'high'] as DamageSeverity[]).map((s) => {
            const count = marks.filter((m) => m.severity === s).length
            const meta = SEVERITY_META[s]
            const Icon = meta.icon
            return (
              <span key={s} className="inline-flex items-center gap-1.5 font-bold" style={{ color: meta.color }}>
                <Icon size={14} /> {count} {meta.label}
              </span>
            )
          })}
        </div>
        {!readonly && marks.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="min-h-9 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
          >
            <Trash2 size={14} /> Limpiar
          </button>
        )}
      </div>
    </div>
  )
}
