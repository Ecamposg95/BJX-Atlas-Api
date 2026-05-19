/** Client de /api/v1/mechanics. */
import api from "@/api/client";

export interface SkillRead {
  category: string;
  proficiency: number;
  certified: boolean;
}

export interface MechanicRead {
  id: string;
  user_id: string;
  email: string;
  branch_id: string | null;
  level: "junior" | "intermedio" | "master";
  capacity_hrs_day: number;
  current_load_hrs: number;
  available_hrs: number;
  load_status: "green" | "yellow" | "red";
  active_assignments_count: number;
  active: boolean;
  skills: SkillRead[];
}

export interface MechanicProfileCreatePayload {
  user_id: string;
  level?: "junior" | "intermedio" | "master";
  employee_number?: string;
  capacity_hrs_day?: number;
  hourly_cost?: number;
}

export interface MechanicProfileUpdatePayload {
  level?: "junior" | "intermedio" | "master";
  capacity_hrs_day?: number;
  hourly_cost?: number;
  active?: boolean;
  notes?: string;
}

export interface SkillUpsertPayload {
  category: string;
  proficiency: number;
  certified: boolean;
}

export const mechanicsApi = {
  list: (params: { only_active?: boolean; min_level?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<MechanicRead[]>(`/v1/mechanics${qs ? "?" + qs : ""}`).then((r) => r.data);
  },

  create: (payload: MechanicProfileCreatePayload) =>
    api.post<MechanicRead>(`/v1/mechanics`, payload).then((r) => r.data),

  update: (userId: string, payload: MechanicProfileUpdatePayload) =>
    api.patch<MechanicRead>(`/v1/mechanics/${userId}`, payload).then((r) => r.data),

  addSkill: (userId: string, payload: SkillUpsertPayload) =>
    api.post<SkillRead>(`/v1/mechanics/${userId}/skills`, payload).then((r) => r.data),
};
