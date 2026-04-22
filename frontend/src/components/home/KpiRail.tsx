import type { DashboardSummary } from '../../api/types'

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

interface KpiRailProps {
  summary?: DashboardSummary
  isLoading: boolean
}

const KPI_ITEMS = (summary?: DashboardSummary) => [
  {
    label: 'Margen promedio',
    value: summary ? fmtPct(summary.avg_margin_pct) : '—',
    tone: summary && summary.avg_margin_pct >= 0.4 ? 'good' : 'warn',
  },
  {
    label: 'Combos críticos',
    value: summary ? String(summary.critical_combos) : '—',
    tone: summary && summary.critical_combos > 0 ? 'warn' : 'good',
  },
  {
    label: 'Servicios activos',
    value: summary ? String(summary.total_services) : '—',
    tone: 'neutral',
  },
  {
    label: 'Modelos cubiertos',
    value: summary ? String(summary.total_models) : '—',
    tone: 'neutral',
  },
]

export function KpiRail({ summary, isLoading }: KpiRailProps) {
  return (
    <section className="executive-kpi-rail">
      {KPI_ITEMS(summary).map((item) => (
        <article key={item.label} className={`executive-kpi executive-kpi--${item.tone}`}>
          <span className="executive-kpi__label">{item.label}</span>
          <strong className="executive-kpi__value">{isLoading ? '…' : item.value}</strong>
        </article>
      ))}
    </section>
  )
}
