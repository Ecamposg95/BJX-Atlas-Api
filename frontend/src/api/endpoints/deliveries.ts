/** Client de /api/v1/work-orders/.../deliver-with-signature + acuse. */
import api from "@/api/client";

export interface DeliveryRead {
  id: string;
  branch_id: string;
  work_order_id: string;
  customer_name: string;
  customer_id_type: string | null;
  customer_id_number: string | null;
  signature_url: string;
  pdf_url: string | null;
  delivered_at: string;
  delivered_by_id: string | null;
}

export interface DeliverResponse {
  delivery: DeliveryRead;
  work_order: {
    id: string;
    order_number: string;
    status: string;
    branch_id: string;
    closed_at: string | null;
  };
  pdf_url: string | null;
  whatsapp_link: string | null;
}

export interface DeliverPayload {
  customer_name: string;
  customer_id_type?: string | null;
  customer_id_number?: string | null;
  signature_base64: string;
  evidence_ids?: string[];
  notes?: string | null;
  exit_mileage?: number | null;
}

export const deliveriesApi = {
  deliverWithSignature: (workOrderId: string, payload: DeliverPayload) =>
    api
      .post<DeliverResponse>(`/v1/work-orders/${workOrderId}/deliver-with-signature`, payload)
      .then((r) => r.data),

  acusePdfUrl: (workOrderId: string) => `/v1/work-orders/${workOrderId}/acuse.pdf`,
};

export const workshopQAApi = {
  qaPass: (workOrderId: string, note?: string) =>
    api
      .post<{ id: string; status: string; qa: string }>(`/workshop/work-orders/${workOrderId}/qa-pass`, { note })
      .then((r) => r.data),

  qaFail: (workOrderId: string, reason: string) =>
    api
      .post<{ id: string; status: string; qa: string; reason: string }>(
        `/workshop/work-orders/${workOrderId}/qa-fail`,
        { reason },
      )
      .then((r) => r.data),
};
