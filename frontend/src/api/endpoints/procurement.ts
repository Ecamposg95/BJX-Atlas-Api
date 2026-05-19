/** Procurement endpoints (Ola 6). */
import api from '@/api/client'
import type {
  PendingInventoryRequestPage,
  PurchaseOrder,
  PurchaseOrderCreate,
  PurchaseOrderStatus,
  PurchaseOrderUpdate,
  ReceivePayload,
} from '@/api/types'

export interface PurchaseOrderPage {
  total: number
  page: number
  page_size: number
  items: PurchaseOrder[]
}

export interface ListPurchaseOrdersParams {
  status?: PurchaseOrderStatus
  supplier_id?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

export const procurementApi = {
  list: (params?: ListPurchaseOrdersParams) =>
    api
      .get<PurchaseOrderPage>('/v1/procurement/purchase-orders', { params })
      .then((r) => r.data),

  get: (id: string) =>
    api
      .get<PurchaseOrder>(`/v1/procurement/purchase-orders/${id}`)
      .then((r) => r.data),

  create: (payload: PurchaseOrderCreate) =>
    api
      .post<PurchaseOrder>('/v1/procurement/purchase-orders', payload)
      .then((r) => r.data),

  update: (id: string, payload: PurchaseOrderUpdate) =>
    api
      .patch<PurchaseOrder>(`/v1/procurement/purchase-orders/${id}`, payload)
      .then((r) => r.data),

  submit: (id: string) =>
    api
      .post<PurchaseOrder>(`/v1/procurement/purchase-orders/${id}/submit`)
      .then((r) => r.data),

  approve: (id: string) =>
    api
      .post<PurchaseOrder>(`/v1/procurement/purchase-orders/${id}/approve`)
      .then((r) => r.data),

  cancel: (id: string, reason?: string) =>
    api
      .post<PurchaseOrder>(`/v1/procurement/purchase-orders/${id}/cancel`, { reason })
      .then((r) => r.data),

  receive: (id: string, payload: ReceivePayload) =>
    api
      .post<PurchaseOrder>(`/v1/procurement/purchase-orders/${id}/receive`, payload)
      .then((r) => r.data),

  pendingInventoryRequests: (limit = 200) =>
    api
      .get<PendingInventoryRequestPage>(
        '/v1/procurement/inventory-requests/pending',
        { params: { limit } },
      )
      .then((r) => r.data),
}
