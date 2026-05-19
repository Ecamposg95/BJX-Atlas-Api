/**
 * Vista mecánico mobile-first (US-04).
 * Consume GET /api/v1/me/tasks con poll 30s.
 *
 * Coexiste con la página legacy MechanicWork.tsx — se ofrece como /mechanic.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import api from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { useMyTasks } from "@/hooks/useMyTasks";
import { useAuth } from "@/hooks/useAuth";
import { WorkOrderCard } from "@/components/work-orders/WorkOrderCard";
import { SemaphoreBadge } from "@/components/ui/SemaphoreBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/ToastProvider";
import { MECHANIC_LEVEL_LABEL } from "@/lib/statusLabels";

type Filter = "all" | "pending" | "in_progress";

export function MechanicHomeV1() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMyTasks();
  const { push: toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");

  async function handleAction(action: string, task: { line: { id: string } }) {
    const lineId = task.line.id;
    try {
      if (action === "start") {
        await api.post(`/workshop/lines/${lineId}/start`);
        toast({ kind: "success", title: "Tarea iniciada" });
      } else if (action === "pause") {
        await api.post(`/workshop/lines/${lineId}/pause`);
        toast({ kind: "success", title: "Tarea pausada" });
      } else if (action === "resume") {
        await api.post(`/workshop/lines/${lineId}/resume`);
        toast({ kind: "success", title: "Tarea reanudada" });
      } else if (action === "finish") {
        await api.post(`/workshop/lines/${lineId}/finish`);
        toast({ kind: "success", title: "Tarea finalizada" });
      } else if (action === "view_detail" || action === "report_finding" || action === "request_part") {
        window.location.href = `/mechanic/tasks/${lineId}`;
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.myTasks() });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error en la operación";
      toast({ kind: "error", title: message });
    }
  }

  const filtered = (data?.items ?? []).filter((t) => {
    if (filter === "all") return true;
    if (filter === "pending") return t.line.status === "pending";
    if (filter === "in_progress") return t.line.status === "in_progress" || t.line.status === "paused";
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Header sticky */}
      <div className="sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl" aria-hidden="true">🛞</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{user?.email ?? "—"}</div>
            <div className="text-xs text-gray-500">
              {data?.mechanic ? MECHANIC_LEVEL_LABEL[data.mechanic.level] ?? data.mechanic.level : "—"}
            </div>
          </div>
        </div>
        {data?.mechanic && (
          <div className="flex items-center gap-2 text-sm">
            <SemaphoreBadge status={data.mechanic.load_status} size="sm">
              {data.mechanic.current_load_hrs.toFixed(1)}h / {(data.mechanic.current_load_hrs + data.mechanic.available_hrs).toFixed(1)}h
            </SemaphoreBadge>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="px-4 py-2 flex gap-2">
        {(["all", "pending", "in_progress"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm min-h-9 ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            }`}
          >
            {f === "all" ? "Todas" : f === "pending" ? "Pendientes" : "En proceso"}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="px-4 space-y-3 mt-2">
        {isLoading && (
          <>
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        )}
        {error && (
          <div className="rounded bg-red-50 dark:bg-red-900/40 text-red-800 dark:text-red-200 p-4 text-sm">
            Error al cargar tus tareas. Revisa tu conexión y reintenta.
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-center text-gray-500 py-12">🎉 No tienes tareas asignadas.</div>
        )}
        {filtered.map((task) => (
          <WorkOrderCard key={task.assignment_id} task={task} onAction={handleAction} />
        ))}
      </div>
    </div>
  );
}
