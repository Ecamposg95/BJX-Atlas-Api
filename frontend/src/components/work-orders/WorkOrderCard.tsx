/**
 * Card de tarea mecánica con máximo 3 acciones primarias visibles.
 * Mobile-first: touch targets ≥ 44px, scale tap feedback.
 */
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { SemaphoreBadge } from "@/components/ui/SemaphoreBadge";
import { ACTION_LABEL, PRIORITY_LABEL, WORK_ORDER_LINE_STATUS_LABEL } from "@/lib/statusLabels";
import { formatTimer } from "@/lib/time";
import type { MyTaskItem } from "@/api/endpoints/me";

interface Props {
  task: MyTaskItem;
  onAction?: (action: string, task: MyTaskItem) => void;
}

export function WorkOrderCard({ task, onAction }: Props) {
  const { work_order: wo, line, timer, parts_needed, available_actions } = task;

  // Máx 2 acciones primarias visibles + overflow (≤3 total per US-04)
  const primary = available_actions.slice(0, 2);
  const hasOverflow = available_actions.length > 2;

  const stdMin = line.standard_duration_hrs != null ? line.standard_duration_hrs * 60 : null;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <SemaphoreBadge status={timer.semaphore} size="sm" />
            <span className="font-semibold text-sm">{wo.order_number}</span>
            {wo.priority !== "normal" && (
              <Badge variant={wo.priority === "urgent" ? "critical" : "low"}>
                {PRIORITY_LABEL[wo.priority] ?? wo.priority}
              </Badge>
            )}
          </div>

          <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {[wo.vehicle.brand, wo.vehicle.model].filter(Boolean).join(" ")}
            {wo.vehicle.plates && ` · ${wo.vehicle.plates}`}
          </div>

          <div className="text-sm font-medium mt-1">{line.service_name}</div>

          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>⏱ {formatTimer(timer.elapsed_minutes, stdMin)}</span>
            <span>·</span>
            <span>{WORK_ORDER_LINE_STATUS_LABEL[line.status as keyof typeof WORK_ORDER_LINE_STATUS_LABEL] ?? line.status}</span>
            {line.bay_name && (
              <>
                <span>·</span>
                <span>{line.bay_name}</span>
              </>
            )}
          </div>

          {parts_needed.blocking && (
            <div className="mt-2 text-xs px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 inline-block">
              ⚠ Refacción pendiente
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {primary.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => onAction?.(action, task)}
            className="px-3 py-2 min-h-12 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium active:scale-95 transition flex items-center"
          >
            {ACTION_LABEL[action] ?? action}
          </button>
        ))}
        {hasOverflow && (
          <Link
            to={`/mechanic/tasks/${line.id}`}
            className="px-3 py-2 min-h-12 rounded border border-gray-300 dark:border-gray-600 text-sm flex items-center"
            aria-label="Ver más acciones"
          >
            ⋮
          </Link>
        )}
      </div>
    </div>
  );
}
