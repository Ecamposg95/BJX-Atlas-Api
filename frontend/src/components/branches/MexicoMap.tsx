import { useEffect, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import type { BranchStat, BranchMetric } from '../../api/types'
import { useThemeStore } from '../../store/theme'
import { BranchPin } from './BranchPin'
import { BranchTooltip } from './BranchTooltip'

interface MexicoMapProps {
  branches: BranchStat[]
  metric: BranchMetric
  onBranchClick: (b: BranchStat) => void
  selectedBranchId?: string
  height?: number | string
}

const MEX_GEOJSON_URL = '/maps/mexico-states.json'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function MexicoMap({
  branches,
  metric,
  onBranchClick,
  selectedBranchId,
  height = 540,
}: MexicoMapProps) {
  const theme = useThemeStore((s) => s.theme)
  const reducedMotion = usePrefersReducedMotion()
  const [hover, setHover] = useState<{ branch: BranchStat | null; x: number; y: number }>({
    branch: null,
    x: 0,
    y: 0,
  })

  const isDark = theme === 'dark'
  const landFill = isDark ? '#101b30' : '#F1F5F9'
  const landHover = isDark ? '#15233f' : '#E2E8F0'
  const stateStroke = isDark ? 'rgba(251, 191, 36, 0.18)' : 'rgba(30, 41, 59, 0.18)'

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: isDark
          ? 'radial-gradient(ellipse at 30% 20%, rgba(251,191,36,0.06), transparent 60%), linear-gradient(180deg, #050b1a 0%, #0a1428 100%)'
          : 'radial-gradient(ellipse at 30% 20%, rgba(30,41,59,0.04), transparent 60%), linear-gradient(180deg, #ffffff 0%, #F1F5F9 100%)',
      }}
    >
      {/* Subtle grid pattern */}
      <svg
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: isDark ? 0.18 : 0.08,
          pointerEvents: 'none',
        }}
      >
        <defs>
          <pattern id="bjx-map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke={isDark ? '#FBBF24' : '#1E293B'}
              strokeWidth="0.4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bjx-map-grid)" />
      </svg>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-102, 23.5], scale: 1300 }}
        width={900}
        height={typeof height === 'number' ? height : 540}
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={MEX_GEOJSON_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                style={{
                  default: {
                    fill: landFill,
                    stroke: stateStroke,
                    strokeWidth: 0.6,
                    outline: 'none',
                    transition: 'fill 220ms cubic-bezier(0.22, 1, 0.36, 1)',
                  },
                  hover: { fill: landHover, stroke: stateStroke, strokeWidth: 0.6, outline: 'none' },
                  pressed: { fill: landHover, outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        {branches.map((b) => (
          <BranchPin
            key={b.branch_id}
            branch={b}
            metric={metric}
            selected={selectedBranchId === b.branch_id}
            onClick={() => onBranchClick(b)}
            onHover={(branch, x, y) => setHover({ branch, x, y })}
            reducedMotion={reducedMotion}
          />
        ))}
      </ComposableMap>

      <BranchTooltip branch={hover.branch} x={hover.x} y={hover.y} />

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          gap: 12,
          padding: '0.45rem 0.7rem',
          borderRadius: 999,
          background: 'color-mix(in srgb, var(--surface) 86%, transparent)',
          border: '1px solid var(--border)',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-muted)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <LegendDot color="#10B981" label="Operando" />
        <LegendDot color="#F59E0B" label="Atención" />
        <LegendDot color="#EF4444" label="Crítico" />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      {label}
    </span>
  )
}
