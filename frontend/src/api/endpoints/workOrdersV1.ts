/** Client de endpoints /api/v1/work-orders (Fase 1: status, history, cancel). */
import api from "@/api/client";

export interface WorkOrderStatusTransitionRequest {
  to_status:
    | "received"
    | "assigned"
    | "in_progress"
    | "waiting_parts"
    | "quality_check"
    | "completed"
    | "delivered"
    | "cancelled";
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkOrderStatusTransitionResponse {
  id: string;
  status: string;
  previous_status: string;
  history_entry_id: string;
  transitioned_at: string;
  transitioned_by: { id: string; email: string };
}

export interface WorkOrderStatusHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_by: { id: string; email: string; role: string } | null;
  reason: string | null;
  occurred_at: string;
  duration_in_previous_status_seconds: number | null;
}

export interface WorkOrderStatusHistoryResponse {
  work_order_id: string;
  current_status: string;
  entries: WorkOrderStatusHistoryEntry[];
}

export const workOrdersV1Api = {
  transitionStatus: (id: string, payload: WorkOrderStatusTransitionRequest) =>
    api
      .patch<WorkOrderStatusTransitionResponse>(`/v1/work-orders/${id}/status`, payload)
      .then((r) => r.data),

  getStatusHistory: (id: string) =>
    api.get<WorkOrderStatusHistoryResponse>(`/v1/work-orders/${id}/status-history`).then((r) => r.data),

  cancel: (id: string, reason: string) =>
    api
      .post<WorkOrderStatusTransitionResponse>(`/v1/work-orders/${id}/cancel`, { reason })
      .then((r) => r.data),
};
