import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, ArrowDown, ArrowUp, Download, Loader2 } from 'lucide-react'
import { getBranchesComparison } from '../../api/endpoints/dashboard'
import type { BranchComparisonRow } from '../../api/types'
import { fmtCurrency, fmtNumber, fmtPct } from '../../utils/format'

type SortKey =
  | 'branch_name'
  | 'city'
  | 'cycle_time_avg_hrs'
  | 'on_time_pct'
  | 'margin_pct_avg'
  | 'revenue_period'
  | 'completed_count'
  | 'open_count'

type SortDir = 'asc' | 'desc'
type PeriodDays = 7 | 30 | 90

const PERIODS: { value: PeriodDays; label: string }[] = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
]

type Tone = 'good' | 'warn' | 'bad' | 'mute'

const TONE_COLOR: Record<Tone, string> = {
  good: '#16a34a',
  warn: '#d97706',
  bad: '#dc2626',
  mute: 'var(--text-muted)',
}

function toneForCycle(hrs: number): Tone {
  if (hrs <= 0) return 'mute'
  if (hrs < 48) return 'good'
  if (hrs <= 72) return 'warn'
  return 'bad'
}

function toneForOnTime(pct: number): Tone {
  if (pct >= 0.85) return 'good'
  if (pct >= 0.7) return 'warn'
  return 'bad'
}

function toneForMargin(pct: number | null): Tone {
  if (pct === null || pct === undefined) return 'mute'
  if (pct >= 0.4) return 'good'
  if (pct >= 0.3) return 'warn'
  return 'bad'
}

function MetricBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const color = TONE_COLOR[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          boxShadow: tone !== 'mute' ? `0 0 8px ${color}66` : undefined,
        }}
      />
      {children}
    </span>
  )
}

function compare(a: BranchComparisonRow, b: BranchComparisonRow, key: SortKey, dir: SortDir): number {
  const va = a[key]
  const vb = b[key]
  const mul = dir === 'asc' ? 1 : -1
  if (va == null && vb == null) return 0
  if (va == null) return 1
  if (vb == null) return -1
  if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul
  return String(va).localeCompare(String(vb)) * mul
}

function toCsv(rows: BranchComparisonRow[]): string {
  const headers = [
    'codigo',
    'sucursal',
    'ciudad',
    'cycle_avg_hrs',
    'cycle_p95_hrs',
    'on_time_pct',
    'margin_pct_avg',
    'revenue_period',
    'completed',
    'open',
  ]
  const lines = rows.map((r) =>
    [
      r.branch_code,
      `"${r.branch_name.replace(/"/g, '""')}"`,
      r.city ?? '',
      r.cycle_time_avg_hrs,
      r.cycle_time_p95_hrs,
      r.on_time_pct,
      r.margin_pct_avg ?? '',
      r.revenue_period,
      r.completed_count,
      r.open_count,
    ].join(','),
  )
  return [headers.join(','), ...lines].join('\n')
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface ColumnHeaderProps {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right' | 'center'
}

function ColumnHeader({ label, sortKey, activeKey, dir, onSort, align = 'left' }: ColumnHeaderProps) {
  const active = activeKey === sortKey
  const Icon = !active ? ArrowDownUp : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: align,
        fontSize: 11,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: '1px solid var(--border)',
        whiteSpace: 'nowrap',
        background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)',
        position: 'sticky',
        top: 0,
      }}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          font: 'inherit',
          letterSpacing: 'inherit',
          textTransform: 'inherit',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span>{label}</span>
        <Icon size={12} style={{ opacity: active ? 1 : 0.45 }} />
      </button>
    </th>
  )
}

export function BranchComparison() {
  const [days, setDays] = useState<PeriodDays>(30)
  const [sortKey, setSortKey] = useState<SortKey>('revenue_period')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const query = useQuery({
    queryKey: ['executive', 'branches-comparison', days],
    queryFn: () => getBranchesComparison({ days }),
    refetchOnWindowFocus: false,
  })

  const rows = useMemo(() => {
    const list = Array.isArray(query.data?.rows) ? query.data!.rows : []
    return [...list].sort((a, b) => compare(a, b, sortKey, sortDir))
  }, [query.data, sortKey, sortDir])

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'branch_name' || k === 'city' ? 'asc' : 'desc')
    }
  }

  const isLoading = query.isLoading
  const isEmpty = !isLoading && rows.length === 0
  const isError = query.isError

  return (
    <section className="executive-panel">
      <div
        className="executive-panel__header"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
      >
        <div>
          <p className="executive-panel__eyebrow">Comparativo</p>
          <h2 className="executive-panel__title">KPIs por sucursal</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            role="tablist"
            aria-label="Período"
            style={{
              display: 'inline-flex',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              background: 'color-mix(in srgb, var(--surface-2) 50%, transparent)',
            }}
          >
            {PERIODS.map((p) => {
              const active = p.value === days
              return (
                <button
                  key={p.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setDays(p.value)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    background: active ? 'var(--primary)' : 'transparent',
                    color: active ? 'var(--primary-foreground, #fff)' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(`branches-comparison-${days}d.csv`, toCsv(rows))}
            disabled={rows.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--surface-2) 50%, transparent)',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 700,
              cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: rows.length === 0 ? 0.5 : 1,
            }}
          >
            <Download size={12} />
            Exportar CSV
          </button>
        </div>
      </div>

      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '2rem 0',
            color: 'var(--text-muted)',
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontSize: 13 }}>Cargando comparativo…</span>
        </div>
      )}

      {isError && (
        <p style={{ color: 'var(--danger, #dc2626)', fontSize: 13, padding: '1rem 0' }}>
          No fue posible cargar los KPIs de sucursales.
        </p>
      )}

      {isEmpty && !isError && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '1rem 0' }}>
          Sin sucursales activas en el período seleccionado.
        </p>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'auto',
            maxHeight: 520,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <ColumnHeader label="Sucursal" sortKey="branch_name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                <ColumnHeader label="Ciudad" sortKey="city" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                <ColumnHeader label="Ciclo (h)" sortKey="cycle_time_avg_hrs" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <ColumnHeader label="On-time" sortKey="on_time_pct" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <ColumnHeader label="Margen" sortKey="margin_pct_avg" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <ColumnHeader label="Ingresos" sortKey="revenue_period" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <ColumnHeader label="OS terminadas" sortKey="completed_count" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
                <ColumnHeader label="OS abiertas" sortKey="open_count" activeKey={sortKey} dir={sortDir} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.branch_id}
                  style={{
                    background:
                      i % 2 === 0
                        ? 'transparent'
                        : 'color-mix(in srgb, var(--surface-2) 40%, transparent)',
                  }}
                >
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontWeight: 800, color: 'var(--text)' }}>{r.branch_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.05em' }}>
                        {r.branch_code}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {r.city ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                    <MetricBadge tone={toneForCycle(r.cycle_time_avg_hrs)}>
                      {r.cycle_time_avg_hrs > 0 ? `${fmtNumber(r.cycle_time_avg_hrs, 1)} h` : '—'}
                    </MetricBadge>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                    <MetricBadge tone={toneForOnTime(r.on_time_pct)}>
                      {fmtPct(r.on_time_pct, 1)}
                    </MetricBadge>
                  </td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                    <MetricBadge tone={toneForMargin(r.margin_pct_avg)}>
                      {r.margin_pct_avg == null ? '—' : fmtPct(r.margin_pct_avg, 1)}
                    </MetricBadge>
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: 'var(--text)',
                    }}
                  >
                    {fmtCurrency(r.revenue_period, { compact: true })}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'right',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {fmtNumber(r.completed_count)}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'right',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {fmtNumber(r.open_count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
