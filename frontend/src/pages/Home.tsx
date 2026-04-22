import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary } from '../api'
import { ExecutiveAccess } from '../components/home/ExecutiveAccess'
import { ExecutiveBrief } from '../components/home/ExecutiveBrief'
import { ExecutiveHero } from '../components/home/ExecutiveHero'
import { KpiRail } from '../components/home/KpiRail'
import { PriorityAlerts } from '../components/home/PriorityAlerts'

export function HomePage() {
  const summaryQuery = useQuery({
    queryKey: ['executive-home-summary'],
    queryFn: getDashboardSummary,
  })

  return (
    <div className="executive-home">
      <div className="executive-home__container">
        <ExecutiveHero />
        <KpiRail summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

        <div className="executive-home__grid">
          <ExecutiveBrief summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />
          <PriorityAlerts summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />
        </div>

        <ExecutiveAccess />
      </div>
    </div>
  )
}
