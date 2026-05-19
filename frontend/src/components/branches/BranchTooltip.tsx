import type { BranchStat } from '../../api/types'
import { SEMAPHORE_HEX, SEMAPHORE_LABEL } from './colors'

interface BranchTooltipProps {
  branch: BranchStat | null
  x: number
  y: number
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

export function BranchTooltip({ branch, x, y }: BranchTooltipProps) {
  if (!branch) return null
  const semColor = SEMAPHORE_HEX[branch.semaphore]
  // Offset slightly to not block the pin
  const left = Math.min(x + 14, window.innerWidth - 240)
  const top = Math.max(8, y - 10)

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 80,
        pointerEvents: 'none',
        minWidth: 200,
        maxWidth: 240,
        padding: '0.65rem 0.8rem',
        borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: 'var(--text)',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: semColor,
            boxShadow: `0 0 6px ${semColor}`,
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-[11px] truncate" style={{ letterSpacing: '0.03em' }}>
            {branch.code}
          </p>
          <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
            {branch.city ?? branch.name}
          </p>
        </div>
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
          style={{
            background: `color-mix(in srgb, ${semColor} 18%, transparent)`,
            color: semColor,
            letterSpacing: '0.05em',
          }}
        >
          {SEMAPHORE_LABEL[branch.semaphore]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1.5" style={{ borderTop: '1px solid var(--border)' }}>
        <Stat label="OS abiertas" value={String(branch.kpis.open_orders)} />
        <Stat label="En proceso" value={String(branch.kpis.in_progress)} />
        <Stat label="Ingresos" value={fmtMoney(branch.kpis.revenue_today)} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-faint)', letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p className="text-[11px] font-extrabold mt-0.5" style={{ color: 'var(--text)' }}>
        {value}
      </p>
    </div>
  )
}
