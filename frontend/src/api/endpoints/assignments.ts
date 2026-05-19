/** Client de /api/v1/assignments. */
import api from "@/api/client";

export interface AssignmentCreatePayload {
  work_order_id: string;
  work_order_line_id?: string | null;
  mechanic_id: string;
  override_level_check?: boolean;
  reason?: string;
}

export interface AssignmentCreateResponse {
  id: string;
  work_order_id: string;
  work_order_line_id: string | null;
  mechanic: { id: string; email: string; level: string };
  service_required_level: string;
  level_check: "pass" | "override";
  assigned_at: string;
  assigned_by: { id: string; email: string };
}

export const assignmentsApi = {
  create: (payload: AssignmentCreatePayload) =>
    api.post<AssignmentCreateResponse>(`/v1/assignments`, payload).then((r) => r.data),
};
