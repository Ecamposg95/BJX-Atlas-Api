/**
 * Portal Cliente público (US-12).
 *
 * Vista mobile-first del estatus de la unidad. Sin login: el folio en la URL
 * actúa como secret. Se accede en /client/:folio.
 */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Car, MapPin, Clock, AlertCircle, CheckCircle2, Wrench } from "lucide-react";

import { getClientUnit, type ClientUnitView } from "@/api/endpoints/clientPortal";
import { formatRelative, formatDateTime } from "@/lib/time";
import { WORK_ORDER_STATUS_LABEL, type WorkOrderStatus } from "@/lib/statusLabels";
import { Skeleton } from "@/components/ui/Skeleton";

type SemaphoreTone = "green" | "blue" | "yellow" | "gray";

function statusTone(status: string): SemaphoreTone {
  if (status === "completed" || status === "delivered") return "green";
  if (status === "in_progress" || status === "quality_check") return "blue";
  if (status === "assigned" || status === "waiting_parts") return "yellow";
  return "gray";
}

const TONE_CLASS: Record<SemaphoreTone, { bg: string; text: string; dot: string; bar: string }> = {
  green: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    text: "text-emerald-800 dark:text-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-200",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
  },
  yellow: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
  gray: {
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-700 dark:text-gray-300",
    dot: "bg-gray-400",
    bar: "bg-gray-400",
  },
};

function statusLabel(status: string): string {
  return WORK_ORDER_STATUS_LABEL[status as WorkOrderStatus] ?? status;
}

function ProgressBar({ pct, tone }: { pct: number; tone: SemaphoreTone }) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Avance</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{safe}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full ${TONE_CLASS[tone].bar} transition-all duration-500`}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

function VehicleCard({ unit }: { unit: ClientUnitView }) {
  const v = unit.vehicle;
  const title = [v.brand, v.model].filter(Boolean).join(" ") || "Vehículo";
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
          <Car className="w-6 h-6 text-gray-700 dark:text-gray-200" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Tu unidad
          </div>
          <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
            {title}
            {v.year ? <span className="text-gray-500 dark:text-gray-400 font-normal"> · {v.year}</span> : null}
          </div>
          {v.plates && (
            <div className="mt-1 inline-flex items-center px-2.5 py-1 rounded-md bg-gray-900 text-white text-sm font-mono font-semibold tracking-widest dark:bg-gray-100 dark:text-gray-900">
              {v.plates}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ unit }: { unit: ClientUnitView }) {
  const tone = statusTone(unit.status);
  const cls = TONE_CLASS[tone];
  return (
    <div className={`rounded-2xl ${cls.bg} border border-gray-200 dark:border-gray-700 p-5`}>
      <div className="flex items-center gap-3 mb-4">
        <span className={`inline-block w-3 h-3 rounded-full ${cls.dot}`} aria-hidden="true" />
        <span className={`text-sm font-semibold ${cls.text} uppercase tracking-wider`}>
          {statusLabel(unit.status)}
        </span>
      </div>
      <ProgressBar pct={unit.progress_pct} tone={tone} />
      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        {unit.branch_name && (
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <MapPin className="w-4 h-4 text-gray-500" />
            <span>{unit.branch_name}</span>
          </div>
        )}
        {unit.estimated_ready_at && (
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <Clock className="w-4 h-4 text-gray-500" />
            <span>
              Estimado listo: <strong>{formatRelative(unit.estimated_ready_at)}</strong>
            </span>
          </div>
        )}
        {unit.delivered_at && (
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4" />
            <span>Entregado {formatRelative(unit.delivered_at)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ entries }: { entries: ClientUnitView["timeline"] }) {
  if (!entries.length) {
    return (
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-5 text-sm text-gray-500">
        Aún no hay movimientos registrados.
      </div>
    );
  }
  // Mostrar más reciente arriba
  const ordered = [...entries].reverse();
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
        Historial
      </h2>
      <ol className="space-y-4">
        {ordered.map((entry, idx) => {
          const tone = statusTone(entry.status);
          const cls = TONE_CLASS[tone];
          const isLast = idx === ordered.length - 1;
          return (
            <li key={`${entry.status}-${entry.timestamp}-${idx}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-3 h-3 rounded-full ${cls.dot} mt-1.5`} aria-hidden="true" />
                {!isLast && <span className="w-px flex-1 bg-gray-200 dark:bg-gray-700 mt-1" />}
              </div>
              <div className="flex-1 pb-2">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {statusLabel(entry.status)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatRelative(entry.timestamp)} · {formatDateTime(entry.timestamp)}
                </div>
                {entry.note && (
                  <div className="mt-1 text-sm text-gray-700 dark:text-gray-300">{entry.note}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function ErrorState({ folio, onRetry }: { folio: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 mb-3">
        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-300" />
      </div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Folio no encontrado
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Verifica el número <span className="font-mono font-semibold">{folio}</span> con tu asesor.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
      >
        Reintentar
      </button>
    </div>
  );
}

export function ClientPortalPage() {
  const { folio = "" } = useParams<{ folio: string }>();

  const query = useQuery<ClientUnitView, Error>({
    queryKey: ["client-portal", folio],
    queryFn: () => getClientUnit(folio),
    enabled: Boolean(folio),
    retry: false,
    refetchInterval: 60_000,
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-gray-900 dark:bg-gray-100 p-2">
            <Wrench className="w-5 h-5 text-white dark:text-gray-900" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
              BJX Motors
            </div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Tu unidad · <span className="font-mono">{folio || "—"}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {query.isLoading && <LoadingState />}

        {query.isError && (
          <ErrorState folio={folio} onRetry={() => query.refetch()} />
        )}

        {query.data && (
          <>
            <VehicleCard unit={query.data} />
            <StatusCard unit={query.data} />
            <Timeline entries={query.data.timeline} />
            <p className="text-center text-xs text-gray-500 dark:text-gray-500 pt-2 pb-8">
              Recibido {formatRelative(query.data.received_at)}
            </p>
          </>
        )}
      </main>
    </div>
  );
}
