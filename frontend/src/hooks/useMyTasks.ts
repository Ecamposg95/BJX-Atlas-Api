/** Hook para vista mecánico: GET /api/v1/me/tasks con poll 30s. */
import { meApi, type MyTasksResponse } from "@/api/endpoints/me";
import { queryKeys } from "@/api/queryKeys";
import { usePoll } from "./usePoll";

export function useMyTasks() {
  return usePoll<MyTasksResponse>(queryKeys.myTasks(), () => meApi.getTasks(), {
    intervalMs: 30_000,
  });
}
