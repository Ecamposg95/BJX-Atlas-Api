/** Client del Portal Cliente público (US-12).
 *
 * Usa una instancia de axios SEPARADA — sin interceptor de Bearer token —
 * porque el endpoint /api/v1/client/units/{folio} es público y un token
 * residual podría confundir el flujo o filtrarse innecesariamente.
 */
import axios from "axios";

const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

export interface ClientVehicleInfo {
  plates: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
}

export interface ClientTimelineEntry {
  status: string;
  timestamp: string;
  note: string | null;
}

export interface ClientUnitView {
  folio: string;
  status: string;
  vehicle: ClientVehicleInfo;
  received_at: string | null;
  estimated_ready_at: string | null;
  delivered_at: string | null;
  progress_pct: number;
  branch_name: string | null;
  timeline: ClientTimelineEntry[];
}

export async function getClientUnit(folio: string): Promise<ClientUnitView> {
  const r = await publicApi.get<ClientUnitView>(`/v1/client/units/${encodeURIComponent(folio)}`);
  return r.data;
}
