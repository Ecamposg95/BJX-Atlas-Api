/** Helpers de fecha/hora con date-fns + locale es. */
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return format(date, "dd MMM yyyy HH:mm", { locale: es });
}

export function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Formato MM:SS o HH:MM para timers cortos/largos.
 * Si totalMinutes está dado, devuelve "elapsed / total".
 */
export function formatTimer(elapsedMinutes: number, totalMinutes: number | null = null): string {
  const hh = String(Math.floor(elapsedMinutes / 60)).padStart(2, "0");
  const mm = String(elapsedMinutes % 60).padStart(2, "0");
  if (totalMinutes == null) return `${hh}:${mm}`;
  const thh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const tmm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm} / ${thh}:${tmm}`;
}
