import { motion } from 'framer-motion'
import { Marker } from 'react-simple-maps'
import type { BranchStat, BranchMetric } from '../../api/types'
import { SEMAPHORE_HEX, SEMAPHORE_HEX_DARK } from './colors'

interface BranchPinProps {
  branch: BranchStat
  metric: BranchMetric
  selected: boolean
  onClick: () => void
  onHover: (b: BranchStat | null, x: number, y: number) => void
  reducedMotion: boolean
}

function radiusFor(b: BranchStat, metric: BranchMetric): number {
  if (metric === 'revenue') {
    return Math.min(18, Math.max(6, 6 + b.kpis.revenue_today / 50000))
  }
  if (metric === 'alerts') {
    return Math.min(18, Math.max(6, 6 + b.kpis.alerts_count * 2.5))
  }
  // operation
  return Math.min(18, Math.max(6, 6 + (b.kpis.in_progress + b.kpis.open_orders) * 0.6))
}

export function BranchPin({ branch, metric, selected, onClick, onHover, reducedMotion }: BranchPinProps) {
  const r = radiusFor(branch, metric)
  const fill = SEMAPHORE_HEX[branch.semaphore]
  const stroke = SEMAPHORE_HEX_DARK[branch.semaphore]
  const shouldPulse = branch.pulse && !reducedMotion

  return (
    <Marker
      coordinates={[branch.lng, branch.lat]}
      onMouseEnter={(e) => onHover(branch, (e as unknown as MouseEvent).clientX, (e as unknown as MouseEvent).clientY)}
      onMouseMove={(e) => onHover(branch, (e as unknown as MouseEvent).clientX, (e as unknown as MouseEvent).clientY)}
      onMouseLeave={() => onHover(null, 0, 0)}
      onClick={onClick}
    >
      <g style={{ cursor: 'pointer' }}>
      {/* Halo / pulse ring */}
      {shouldPulse && (
        <motion.circle
          r={r}
          fill="none"
          stroke={fill}
          strokeWidth={1.5}
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          style={{ pointerEvents: 'none', transformOrigin: 'center' }}
        />
      )}

      {/* Selection ring */}
      {selected && (
        <circle
          r={r + 5}
          fill="none"
          stroke={fill}
          strokeWidth={2}
          strokeDasharray="3 3"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Outer soft glow */}
      <circle r={r + 2} fill={fill} opacity={0.18} />

      {/* Main pin */}
      <circle
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        style={{
          filter: selected ? `drop-shadow(0 0 6px ${fill})` : `drop-shadow(0 1px 2px rgba(0,0,0,0.35))`,
          transition: 'r 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />

      {/* Inner dot */}
      <circle r={Math.max(2, r / 3)} fill="#fff" opacity={0.85} />
      </g>
    </Marker>
  )
}
