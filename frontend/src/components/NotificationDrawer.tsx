import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Inbox,
  Package,
  Settings,
  Wrench,
} from "lucide-react";

import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { useNotifications } from "@/hooks/useNotifications";
import { formatRelative } from "@/lib/time";
import type { NotificationItem, NotificationKind } from "@/api/endpoints/notifications";

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  appointment_confirmed: CalendarCheck,
  wo_status_changed: Wrench,
  parts_request: Package,
  qa_pending: ClipboardCheck,
  delivery_ready: CheckCircle2,
  system: Settings,
};

const KIND_COLOR: Record<NotificationKind, string> = {
  appointment_confirmed: "#3b82f6",
  wo_status_changed: "#f59e0b",
  parts_request: "#8b5cf6",
  qa_pending: "#eab308",
  delivery_ready: "#22c55e",
  system: "#64748b",
};

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationItem;
  onClick: () => void;
}) {
  const Icon = KIND_ICON[notification.kind] ?? Bell;
  const color = KIND_COLOR[notification.kind] ?? "#64748b";
  const isUnread = notification.read_at == null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors"
      style={{
        background: isUnread
          ? "color-mix(in srgb, var(--primary) 8%, transparent)"
          : "transparent",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "color-mix(in srgb, var(--surface-2) 80%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isUnread
          ? "color-mix(in srgb, var(--primary) 8%, transparent)"
          : "transparent";
      }}
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{
          background: `color-mix(in srgb, ${color} 18%, transparent)`,
          color,
        }}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="truncate text-sm font-semibold leading-tight"
            style={{ color: "var(--text)" }}
          >
            {notification.title}
          </h4>
          {isUnread && (
            <span
              aria-label="No leída"
              className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: "var(--primary)" }}
            />
          )}
        </div>
        {notification.body && (
          <p
            className="mt-0.5 line-clamp-2 text-xs leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            {notification.body}
          </p>
        )}
        <span
          className="mt-1 block text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          {formatRelative(notification.created_at)}
        </span>
      </div>
    </button>
  );
}

export function NotificationDrawer() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead, isLoading } =
    useNotifications();

  const handleClick = async (n: NotificationItem) => {
    if (n.read_at == null) {
      await markRead(n.id);
    }
    if (n.link_url) {
      setOpen(false);
      navigate(n.link_url);
    }
  };

  const showBadge = unreadCount > 0;
  const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Notificaciones${showBadge ? ` (${unreadCount} no leídas)` : ""}`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        style={{
          color: "var(--text-muted)",
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        <Bell size={16} />
        {showBadge && (
          <span
            className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
            style={{
              background: "linear-gradient(135deg, var(--primary-dark), var(--primary))",
              boxShadow: "0 0 0 2px var(--surface)",
            }}
          >
            {badgeText}
          </span>
        )}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Notificaciones"
        description={
          unreadCount > 0 ? `${unreadCount} sin leer` : "Estás al día"
        }
        size="sm"
        footer={
          notifications.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => markAllRead()}
              disabled={unreadCount === 0}
            >
              Marcar todas como leídas
            </Button>
          ) : undefined
        }
      >
        {isLoading && notifications.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-12 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Cargando…
          </div>
        ) : notifications.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-12 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            <Inbox size={36} style={{ opacity: 0.5 }} />
            <p className="text-sm font-medium">No tienes notificaciones</p>
            <p className="text-xs leading-relaxed" style={{ maxWidth: 240 }}>
              Aquí aparecerán las alertas de citas, órdenes y entregas.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                onClick={() => handleClick(n)}
              />
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
