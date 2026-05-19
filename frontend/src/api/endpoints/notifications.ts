/** Client de /api/v1/notifications/*. */
import api from "@/api/client";

export type NotificationKind =
  | "appointment_confirmed"
  | "wo_status_changed"
  | "parts_request"
  | "qa_pending"
  | "delivery_ready"
  | "system";

export interface NotificationItem {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link_url: string | null;
  read_at: string | null;
  branch_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export interface UnreadCount {
  count: number;
}

export const notificationsApi = {
  list: (params: { unread_only?: boolean; limit?: number; skip?: number } = {}) =>
    api
      .get<NotificationListResponse>("/v1/notifications", { params })
      .then((r) => r.data),

  unreadCount: () =>
    api.get<UnreadCount>("/v1/notifications/unread-count").then((r) => r.data),

  markRead: (id: string) =>
    api.post<NotificationItem>(`/v1/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    api.post<{ updated: number }>("/v1/notifications/mark-all-read").then((r) => r.data),
};
