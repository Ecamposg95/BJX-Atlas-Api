import type { DashboardSummary } from '../../api/types'

interface ExecutiveBriefProps {
  summary?: DashboardSummary
  isLoading: boolean
}

export function ExecutiveBrief({ summary, isLoading }: ExecutiveBriefProps) {
  return (
    <section className="executive-panel">
      <div className="executive-panel__header">
        <div>
          <p className="executive-panel__eyebrow">Executive brief</p>
          <h2 className="executive-panel__title">Panorama del negocio</h2>
        </div>
      </div>

      <div className="executive-brief__list">
        <article className="executive-brief__item">
          <span className="executive-brief__label">Rentabilidad</span>
          <p className="executive-brief__text">
            {isLoading
              ? 'Cargando lectura ejecutiva…'
              : `El margen promedio actual es de ${((summary?.avg_margin_pct ?? 0) * 100).toFixed(1)}%, con ${summary?.ok_combos ?? 0} combinaciones dentro de rango saludable.`}
          </p>
        </article>

        <article className="executive-brief__item">
          <span className="executive-brief__label">Operación comercial</span>
          <p className="executive-brief__text">
            {isLoading
              ? 'Cargando lectura ejecutiva…'
              : `El catálogo activo cubre ${summary?.total_models ?? 0} modelos y ${summary?.total_services ?? 0} servicios, suficiente para sostener una vista ejecutiva consolidada.`}
          </p>
        </article>

        <article className="executive-brief__item">
          <span className="executive-brief__label">Atención inmediata</span>
          <p className="executive-brief__text">
            {isLoading
              ? 'Cargando lectura ejecutiva…'
              : `Se detectan ${summary?.critical_combos ?? 0} combinaciones críticas y ${summary?.low_combos ?? 0} de margen bajo; ese frente merece seguimiento prioritario.`}
          </p>
        </article>
      </div>
    </section>
  )
}
