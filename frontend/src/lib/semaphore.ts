/** Helpers de semáforo (verde/amarillo/rojo/pending) consistentes con backend. */

export type SemaphoreStatus = "green" | "yellow" | "red" | "pending";

export const SEMAPHORE_COLORS: Record<SemaphoreStatus, { bg: string; text: string; solid: string; ring: string }> = {
  green: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-800 dark:text-emerald-200", solid: "bg-emerald-500", ring: "ring-emerald-500" },
  yellow: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-800 dark:text-amber-200", solid: "bg-amber-500", ring: "ring-amber-500" },
  red: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-800 dark:text-red-200", solid: "bg-red-500", ring: "ring-red-500" },
  pending: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", solid: "bg-gray-400", ring: "ring-gray-400" },
};

/**
 * Calcula el semáforo de un timer en curso.
 * - green: faltan más de 15 min al estándar
 * - yellow: dentro del estándar pero quedan ≤15 min
 * - red: excedió el estándar
 * - pending: timer no iniciado
 */
export function semaphoreFromTimer(
  elapsedMinutes: number | null | undefined,
  standardHours: number | null | undefined,
): SemaphoreStatus {
  if (elapsedMinutes == null || standardHours == null) return "pending";
  const standardMin = Math.round(standardHours * 60);
  if (elapsedMinutes < standardMin - 15) return "green";
  if (elapsedMinutes <= standardMin) return "yellow";
  return "red";
}

/** Semáforo de carga del mecánico según porcentaje de capacidad usada. */
export function semaphoreFromLoad(loadPct: number): "green" | "yellow" | "red" {
  if (loadPct < 0.6) return "green";
  if (loadPct < 0.9) return "yellow";
  return "red";
}
