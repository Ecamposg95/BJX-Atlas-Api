import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary } from '../api'
import { BranchComparison } from '../components/executive/BranchComparison'
import { ExecutiveAccess } from '../components/home/ExecutiveAccess'
import { ExecutiveBrief } from '../components/home/ExecutiveBrief'
import { ExecutiveHero } from '../components/home/ExecutiveHero'
import { KpiRail } from '../components/home/KpiRail'
import { OperationalPulse } from '../components/home/OperationalPulse'
import { PriorityAlerts } from '../components/home/PriorityAlerts'

export function ExecutivePage() {
  const summaryQuery = useQuery({
    queryKey: ['executive-home-summary'],
    queryFn: getDashboardSummary,
  })

  return (
    <div className="executive-home">
      <div className="executive-home__container">
        <ExecutiveHero />

        <KpiRail summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />

        <OperationalPulse />

        <div className="executive-home__grid">
          <ExecutiveBrief summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />
          <PriorityAlerts summary={summaryQuery.data} isLoading={summaryQuery.isLoading} />
        </div>

        <BranchComparison />

        <ExecutiveAccess />
      </div>
    </div>
  )
}
