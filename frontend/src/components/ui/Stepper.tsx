import { Check } from "lucide-react";
import { clsx } from "clsx";

export interface StepperStep {
  key: string;
  label: string;
  pct: number;
}

export interface StepperProps {
  steps: StepperStep[];
  className?: string;
}

type Tone = "done" | "active" | "pending";

function toneFor(pct: number): Tone {
  if (pct >= 100) return "done";
  if (pct > 0) return "active";
  return "pending";
}

const DOT_CLS: Record<Tone, string> = {
  done: "bg-emerald-500 text-white border-emerald-500",
  active:
    "bg-amber-400 text-amber-900 border-amber-400 ring-4 ring-amber-200/60 dark:ring-amber-500/30",
  pending:
    "bg-white dark:bg-gray-800 text-gray-400 border-gray-300 dark:border-gray-600",
};

const BAR_CLS: Record<Tone, string> = {
  done: "bg-emerald-500",
  active: "bg-amber-400",
  pending: "bg-gray-200 dark:bg-gray-700",
};

const LABEL_CLS: Record<Tone, string> = {
  done: "text-emerald-700 dark:text-emerald-300",
  active: "text-amber-700 dark:text-amber-300",
  pending: "text-gray-500 dark:text-gray-400",
};

export function Stepper({ steps, className }: StepperProps) {
  if (!steps.length) return null;
  return (
    <div className={clsx("w-full", className)}>
      {/* Mobile: vertical */}
      <ol className="flex flex-col gap-3 sm:hidden">
        {steps.map((s, i) => {
          const t = toneFor(s.pct);
          const isLast = i === steps.length - 1;
          return (
            <li key={s.key} className="flex gap-3 items-start">
              <div className="flex flex-col items-center">
                <div
                  className={clsx(
                    "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition",
                    DOT_CLS[t],
                  )}
                  aria-hidden="true"
                >
                  {t === "done" ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {!isLast && (
                  <span
                    className={clsx(
                      "mt-1 w-0.5 flex-1 min-h-6 rounded-full",
                      BAR_CLS[t],
                    )}
                  />
                )}
              </div>
              <div className="flex-1 pt-1">
                <div
                  className={clsx(
                    "text-sm font-semibold",
                    LABEL_CLS[t],
                  )}
                >
                  {s.label}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {s.pct >= 100
                    ? "Listo"
                    : s.pct > 0
                    ? `En proceso · ${s.pct}%`
                    : "Pendiente"}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Desktop: horizontal */}
      <ol className="hidden sm:flex items-start justify-between gap-2">
        {steps.map((s, i) => {
          const t = toneFor(s.pct);
          const isLast = i === steps.length - 1;
          return (
            <li key={s.key} className="flex-1 flex items-start min-w-0">
              <div className="flex flex-col items-center text-center min-w-0 flex-1">
                <div
                  className={clsx(
                    "w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition",
                    DOT_CLS[t],
                  )}
                  aria-hidden="true"
                >
                  {t === "done" ? <Check className="w-5 h-5" /> : i + 1}
                </div>
                <div className="mt-2 px-1 w-full">
                  <div
                    className={clsx(
                      "text-xs font-semibold truncate",
                      LABEL_CLS[t],
                    )}
                  >
                    {s.label}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                    {s.pct >= 100 ? "100%" : `${s.pct}%`}
                  </div>
                </div>
              </div>
              {!isLast && (
                <div className="flex-shrink-0 w-full max-w-16 h-0.5 mt-5 mx-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={clsx("h-full transition-all", BAR_CLS[t])}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
