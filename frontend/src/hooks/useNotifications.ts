/** Hook para el centro de notificaciones in-app. Poll cada 30s. */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { notificationsApi, type NotificationItem } from "@/api/endpoints/notifications";
import { queryKeys } from "@/api/queryKeys";
import { useAuthStore } from "@/store/auth";
import { usePoll } from "./usePoll";

const LIST_PARAMS = { limit: 20 };
const POLL_MS = 30_000;

export function useNotifications() {
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = Boolean(token && user);

  const listKey = queryKeys.notifications(LIST_PARAMS);
  const countKey = queryKeys.notificationsUnread();

  const listQuery = usePoll(
    listKey,
    () => notificationsApi.list(LIST_PARAMS),
    {
      intervalMs: POLL_MS,
      enabled: isAuthenticated,
    },
  );

  const countQuery = usePoll(
    countKey,
    () => notificationsApi.unreadCount(),
    {
      intervalMs: POLL_MS,
      enabled: isAuthenticated,
    },
  );

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await notificationsApi.markRead(id);
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
    } finally {
      refresh();
    }
  }, [refresh]);

  const notifications: NotificationItem[] = listQuery.data?.items ?? [];
  const unreadCount = countQuery.data?.count ?? listQuery.data?.unread ?? 0;

  return {
    notifications,
    unreadCount,
    isLoading: listQuery.isLoading,
    markRead,
    markAllRead,
    refresh,
  };
}
