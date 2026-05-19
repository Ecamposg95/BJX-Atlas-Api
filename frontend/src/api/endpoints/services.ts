/** Cliente de /catalog/services con workflow de aprobación (US-07). */
import api from "@/api/client";
import type { Service, ServiceStatus } from "@/api/types";

export const servicesApi = {
  list: (params?: { status?: ServiceStatus; search?: string; category?: string }) =>
    api
      .get<{ items: Service[] }>("/catalog/services", { params })
      .then((r) => r.data.items),

  approve: (id: string, reason?: string) =>
    api
      .post<Service>(`/catalog/services/${id}/approve`, reason ? { reason } : {})
      .then((r) => r.data),

  reject: (id: string, reason: string) =>
    api
      .post<Service>(`/catalog/services/${id}/reject`, { reason })
      .then((r) => r.data),
};

export type { Service, ServiceStatus };
