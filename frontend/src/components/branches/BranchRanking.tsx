import { TrendingUp, Activity, AlertTriangle } from 'lucide-react'
import type { BranchStat, BranchMetric } from '../../api/types'
import { SEMAPHORE_HEX } from './colors'

interface BranchRankingProps {
  branches: BranchStat[]
  metric: BranchMetric
  onSelect: (b: BranchStat) => void
  selectedId?: string
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

function valueFor(b: BranchStat, m: BranchMetric): { v: number; label: string } {
  if (m === 'revenue') return { v: b.kpis.revenue_today, label: fmtMoney(b.kpis.revenue_today) }
  if (m === 'alerts') return { v: b.kpis.alerts_count, label: `${b.kpis.alerts_count} alertas` }
  return {
    v: b.kpis.in_progress + b.kpis.open_orders,
    label: `${b.kpis.in_progress + b.kpis.open_orders} OS`,
  }
}

export function BranchRanking({ branches, metric, onSelect, selectedId }: BranchRankingProps) {
  const sorted = [...branches].sort(
    (a, b) => valueFor(b, metric).v - valueFor(a, metric).v,
  )
  const max = Math.max(1, ...sorted.map((b) => valueFor(b, metric).v))
  const top = sorted.slice(0, 5)

  const Icon = metric === 'revenue' ? TrendingUp : metric === 'alerts' ? AlertTriangle : Activity
  const title =
    metric === 'revenue' ? 'Top ingresos' : metric === 'alerts' ? 'Top alertas' : 'Top operación'

  return (
    <section
      className="executive-panel"
      style={{
        padding: '1.1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 26,
              height: 26,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary-dark)',
            }}
          >
            <Icon size={14} />
          </span>
          <h3 className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
            {title}
          </h3>
        </div>
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
        >
          Top 5
        </span>
      </header>

      <ol style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0, padding: 0, listStyle: 'none' }}>
        {top.map((b, idx) => {
          const { v, label } = valueFor(b, metric)
          const pct = Math.max(4, Math.round((v / max) * 100))
          const fill = SEMAPHORE_HEX[b.semaphore]
          const isSel = selectedId === b.branch_id
          return (
            <li key={b.branch_id}>
              <button
                type="button"
                onClick={() => onSelect(b)}
                className="w-full text-left transition-all"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '0.55rem 0.7rem',
                  minHeight: 48,
                  borderRadius: 'var(--radius-md)',
                  border: isSel ? `1px solid ${fill}` : '1px solid var(--border)',
                  background: isSel
                    ? `color-mix(in srgb, ${fill} 10%, transparent)`
                    : 'color-mix(in srgb, var(--surface-2) 50%, transparent)',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[10px] font-extrabold"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <span
                      className="text-xs font-extrabold truncate"
                      style={{ color: 'var(--text)' }}
                    >
                      {b.code}
                    </span>
                    <span
                      className="text-[10px] truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {b.city ?? ''}
                    </span>
                  </div>
                  <span
                    className="text-[11px] font-extrabold whitespace-nowrap"
                    style={{ color: fill }}
                  >
                    {label}
                  </span>
                </div>
                <div
                  style={{
                    height: 4,
                    borderRadius: 4,
                    background: 'color-mix(in srgb, var(--border) 60%, transparent)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${fill}, ${fill}cc)`,
                      transition: 'width 400ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  />
                </div>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
