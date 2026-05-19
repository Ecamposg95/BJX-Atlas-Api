import api from '@/api/client'
import type {
  ServiceProposal,
  ServiceProposalCreate,
  ServiceProposalListResponse,
} from '../types'

export const serviceProposalsApi = {
  list: (params?: {
    status?: string
    work_order_id?: string
    branch_id?: string
  }) => {
    const qs = new URLSearchParams()
    if (params?.status) qs.set('status', params.status)
    if (params?.work_order_id) qs.set('work_order_id', params.work_order_id)
    if (params?.branch_id) qs.set('branch_id', params.branch_id)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return api
      .get<ServiceProposalListResponse>(`/v1/service-proposals${suffix}`)
      .then((r) => r.data)
  },

  listByWorkOrder: (workOrderId: string) =>
    api
      .get<ServiceProposalListResponse>(
        `/v1/work-orders/${workOrderId}/proposals`,
      )
      .then((r) => r.data),

  get: (id: string) =>
    api.get<ServiceProposal>(`/v1/service-proposals/${id}`).then((r) => r.data),

  create: (payload: ServiceProposalCreate) =>
    api
      .post<ServiceProposal>('/v1/service-proposals', payload)
      .then((r) => r.data),

  approve: (id: string, notes?: string) =>
    api
      .post<ServiceProposal>(`/v1/service-proposals/${id}/approve`, { notes })
      .then((r) => r.data),

  reject: (id: string, notes?: string) =>
    api
      .post<ServiceProposal>(`/v1/service-proposals/${id}/reject`, { notes })
      .then((r) => r.data),

  cancel: (id: string) =>
    api
      .post<ServiceProposal>(`/v1/service-proposals/${id}/cancel`)
      .then((r) => r.data),
}
