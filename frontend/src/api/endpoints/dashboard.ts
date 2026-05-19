import api from '../client'
import type { BranchComparisonResponse } from '../types'

export const getBranchesComparison = (params?: { days?: number; refresh?: boolean }) =>
  api
    .get<BranchComparisonResponse>('/dashboard/branches-comparison', { params })
    .then((r) => r.data)
