import { AlertTriangle, CircleAlert, ShieldAlert } from 'lucide-react'
import type { DashboardSummary } from '../../api/types'

interface PriorityAlertsProps {
  summary?: DashboardSummary
  isLoading: boolean
}

export function PriorityAlerts({ summary, isLoading }: PriorityAlertsProps) {
  const criticalCount = summary?.critical_combos ?? 0
  const lowCount = summary?.low_combos ?? 0
  const coverageRisk = summary ? Math.max(summary.total_services - summary.ok_combos, 0) : 0

  const alerts = [
    {
      title: 'Margen crítico',
      body: isLoading
        ? 'Analizando combinaciones críticas…'
        : `${criticalCount} combinaciones modelo-servicio están por debajo del umbral esperado.`,
      icon: ShieldAlert,
      tone: 'danger',
    },
    {
      title: 'Margen bajo',
      body: isLoading
        ? 'Analizando margen bajo…'
        : `${lowCount} combinaciones necesitan ajuste comercial o revisión de costos.`,
      icon: AlertTriangle,
      tone: 'warn',
    },
    {
      title: 'Cobertura en observación',
      body: isLoading
        ? 'Consolidando cobertura actual…'
        : `${coverageRisk} registros aún no están en estado saludable dentro del resumen ejecutivo.`,
      icon: CircleAlert,
      tone: 'neutral',
    },
  ] as const

  return (
    <section className="executive-panel">
      <div className="executive-panel__header">
        <div>
          <p className="executive-panel__eyebrow">Prioridades</p>
          <h2 className="executive-panel__title">Alertas ejecutivas</h2>
        </div>
      </div>

      <div className="executive-alerts">
        {alerts.map((alert) => (
          <article key={alert.title} className={`executive-alert executive-alert--${alert.tone}`}>
            <div className="executive-alert__icon">
              <alert.icon size={16} />
            </div>
            <div>
              <p className="executive-alert__title">{alert.title}</p>
              <p className="executive-alert__body">{alert.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
