/** Client de /api/v1/me/*. */
import api from "@/api/client";

export interface MyTaskItem {
  assignment_id: string;
  work_order: {
    id: string;
    order_number: string;
    type: string;
    priority: string;
    vehicle: { plates: string | null; brand: string | null; model: string | null };
  };
  line: {
    id: string;
    service_name: string;
    service_required_level: string;
    standard_duration_hrs: number | null;
    status: string;
    bay_name: string | null;
  };
  timer: {
    started_at: string | null;
    elapsed_minutes: number;
    remaining_estimated_minutes: number | null;
    semaphore: "green" | "yellow" | "red" | "pending";
  };
  parts_needed: { total: number; available: number; blocking: boolean };
  available_actions: string[];
}

export interface MyTasksResponse {
  mechanic: {
    id: string;
    level: string;
    current_load_hrs: number;
    available_hrs: number;
    load_status: "green" | "yellow" | "red";
  };
  items: MyTaskItem[];
  summary: Record<string, number>;
}

export interface FindingReportPayload {
  description: string;
  suggested_service_id?: string;
  estimated_extra_hrs?: number;
}

export interface FindingRead {
  id: string;
  work_order_id: string;
  work_order_line_id: string | null;
  description: string;
  suggested_service_id: string | null;
  estimated_extra_hrs: number | null;
  status: "pending" | "approved" | "rejected";
  reported_by: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  resulting_line_id: string | null;
  created_at: string;
}

export const meApi = {
  getTasks: () => api.get<MyTasksResponse>(`/v1/me/tasks`).then((r) => r.data),

  reportFinding: (lineId: string, payload: FindingReportPayload) =>
    api.post<FindingRead>(`/v1/me/tasks/${lineId}/findings`, payload).then((r) => r.data),
};
