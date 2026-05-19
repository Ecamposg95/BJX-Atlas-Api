/** Client de /api/v1/findings (listado + aprobación). */
import api from "@/api/client";
import type { FindingRead } from "./me";

export const findingsApi = {
  list: (status?: string) =>
    api.get<FindingRead[]>(`/v1/findings${status ? "?status=" + status : ""}`).then((r) => r.data),

  approve: (id: string) =>
    api.post<FindingRead>(`/v1/findings/${id}/approve`, {}).then((r) => r.data),

  reject: (id: string, reason: string) =>
    api.post<FindingRead>(`/v1/findings/${id}/reject`, { reason }).then((r) => r.data),
};

export type { FindingRead };
