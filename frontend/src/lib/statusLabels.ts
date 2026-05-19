/** Labels en español para enums del backend. */

export type WorkOrderStatus =
  | "received"
  | "assigned"
  | "in_progress"
  | "waiting_parts"
  | "quality_check"
  | "completed"
  | "delivered"
  | "cancelled";

export type WorkOrderType =
  | "appointment"
  | "walk_in"
  | "tow"
  | "standby"
  | "warranty"
  | "internal";

export type WorkOrderLineStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "waiting_parts"
  | "completed"
  | "cancelled";

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  received: "Recibido",
  assigned: "Asignado",
  in_progress: "En proceso",
  waiting_parts: "Esperando refacción",
  quality_check: "Control de calidad",
  completed: "Terminado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export const WORK_ORDER_TYPE_LABEL: Record<WorkOrderType, string> = {
  appointment: "Cita",
  walk_in: "Sin cita",
  tow: "Grúa",
  standby: "Stand-by",
  warranty: "Garantía",
  internal: "Interno",
};

export const WORK_ORDER_LINE_STATUS_LABEL: Record<WorkOrderLineStatus, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  paused: "Pausada",
  waiting_parts: "Esperando refacción",
  completed: "Terminada",
  cancelled: "Cancelada",
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export const MECHANIC_LEVEL_LABEL: Record<string, string> = {
  junior: "Junior",
  intermedio: "Intermedio",
  master: "Master",
};

export const ACTION_LABEL: Record<string, string> = {
  start: "▶ Iniciar",
  pause: "⏸ Pausar",
  resume: "▶ Reanudar",
  finish: "✓ Finalizar",
  request_part: "📦 Pedir refacción",
  report_finding: "✎ Hallazgo",
  view_detail: "Ver detalle",
};
