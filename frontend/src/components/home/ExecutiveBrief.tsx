import type { DashboardSummary } from '../../api/types'
import { fmtPct } from '../../utils/format'

interface ExecutiveBriefProps {
  summary?: DashboardSummary
  isLoading: boolean
}

export function ExecutiveBrief({ summary, isLoading }: ExecutiveBriefProps) {
  return (
    <section className="executive-panel">
      <div className="executive-panel__header">
        <p className="executive-panel__eyebrow">Brief</p>
        <h2 className="executive-panel__title">Lectura del día</h2>
      </div>

      <div className="executive-brief__list">
        <article className="executive-brief__item">
          <span className="executive-brief__label">Margen promedio</span>
          <p className="executive-brief__text">
            {isLoading ? '—' : fmtPct(summary?.avg_margin_pct ?? 0)}
          </p>
        </article>

        <article className="executive-brief__item">
          <span className="executive-brief__label">Combos saludables</span>
          <p className="executive-brief__text">
            {isLoading ? '—' : `${summary?.ok_combos ?? 0} combinaciones`}
          </p>
        </article>

        <article className="executive-brief__item">
          <span className="executive-brief__label">Atención prioritaria</span>
          <p className="executive-brief__text">
            {isLoading
              ? '—'
              : `${summary?.critical_combos ?? 0} críticas · ${summary?.low_combos ?? 0} bajo objetivo`}
          </p>
        </article>
      </div>
    </section>
  )
}
