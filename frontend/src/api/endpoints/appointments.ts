/** Client de /api/v1/appointments. */
import api from "@/api/client";

export type AppointmentStatus =
  | "scheduled"
  | "arrived"
  | "cancelled"
  | "no_show"
  | "converted_to_wo";

export interface AppointmentRead {
  id: string;
  branch_id: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_plates: string | null;
  vehicle_model_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  service_type: string;
  notes: string | null;
  status: AppointmentStatus;
  work_order_id: string | null;
  cancel_reason: string | null;
  created_by_id: string | null;
  arrived_at: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface AppointmentCreatePayload {
  customer_name: string;
  customer_phone?: string | null;
  vehicle_plates?: string | null;
  vehicle_model_id?: string | null;
  scheduled_at: string;
  duration_minutes?: number;
  service_type: string;
  notes?: string | null;
}

export interface AppointmentConvertResponse {
  appointment: AppointmentRead;
  work_order: {
    id: string;
    order_number: string;
    status: string;
    branch_id: string;
  };
  whatsapp_link: string | null;
}

export interface AppointmentListParams {
  date_from?: string;
  date_to?: string;
  branch_id?: string;
  status?: AppointmentStatus;
}

export const appointmentsApi = {
  list: (params: AppointmentListParams = {}) =>
    api.get<AppointmentRead[]>(`/v1/appointments`, { params }).then((r) => (Array.isArray(r.data) ? r.data : [])),

  create: (payload: AppointmentCreatePayload) =>
    api.post<AppointmentRead>(`/v1/appointments`, payload).then((r) => r.data),

  update: (id: string, payload: Partial<AppointmentCreatePayload>) =>
    api.patch<AppointmentRead>(`/v1/appointments/${id}`, payload).then((r) => r.data),

  remove: (id: string) => api.delete(`/v1/appointments/${id}`).then(() => undefined),

  markArrived: (id: string) =>
    api.post<AppointmentRead>(`/v1/appointments/${id}/arrived`).then((r) => r.data),

  cancel: (id: string, reason: string) =>
    api.post<AppointmentRead>(`/v1/appointments/${id}/cancel`, { reason }).then((r) => r.data),

  convert: (
    id: string,
    payload: { service_id: string; vehicle_id?: string; assigned_mechanic_id?: string; notes?: string },
  ) => api.post<AppointmentConvertResponse>(`/v1/appointments/${id}/convert`, payload).then((r) => r.data),
};
