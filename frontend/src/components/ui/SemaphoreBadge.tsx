/**
 * Badge con semáforo verde/amarillo/rojo/pending consistente con backend.
 * Acepta texto opcional o solo el dot.
 */
import { type SemaphoreStatus, SEMAPHORE_COLORS } from "@/lib/semaphore";

interface Props {
  status: SemaphoreStatus;
  size?: "xs" | "sm" | "md" | "lg";
  pulse?: boolean;
  children?: React.ReactNode;
  withDot?: boolean;
  className?: string;
}

const SIZES = {
  xs: "px-1.5 py-0.5 text-xs",
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

const DOT_SIZES = {
  xs: "w-1.5 h-1.5",
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
};

export function SemaphoreBadge({
  status,
  size = "sm",
  pulse = false,
  children,
  withDot = true,
  className = "",
}: Props) {
  const c = SEMAPHORE_COLORS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${c.bg} ${c.text} ${SIZES[size]} ${className}`}
    >
      {withDot && (
        <span
          className={`inline-block rounded-full ${c.solid} ${DOT_SIZES[size]} ${pulse ? "animate-pulse" : ""}`}
        />
      )}
      {children}
    </span>
  );
}
