"""Construcción de links de notificación a clientes (WhatsApp wa.me)."""
from __future__ import annotations

import re
from urllib.parse import quote
from typing import Optional


_DIGITS_RE = re.compile(r"\D+")


def normalize_phone(phone: str) -> str:
    """Devuelve solo dígitos. Si empieza con 0+ lo limpiamos.

    wa.me espera el número completo con código de país sin +/-/() etc.
    Para MX se sugiere prefijar 521.
    """
    digits = _DIGITS_RE.sub("", phone or "")
    return digits


def build_whatsapp_link(phone: str, message: str) -> Optional[str]:
    """Construye un link wa.me con teléfono y mensaje URL-encoded.

    Si `phone` queda vacío tras normalizar, retorna None.
    """
    digits = normalize_phone(phone)
    if not digits:
        return None
    encoded = quote(message or "", safe="")
    return f"https://wa.me/{digits}?text={encoded}"


def build_appointment_confirmation_message(
    *,
    customer_name: str,
    order_number: str,
    plates: Optional[str],
    service_type: Optional[str] = None,
) -> str:
    parts = [
        f"Hola {customer_name},",
        f"Tu orden de servicio {order_number} ha sido registrada en BJX Motors.",
    ]
    if plates:
        parts.append(f"Vehículo: {plates}.")
    if service_type:
        parts.append(f"Servicio: {service_type}.")
    parts.append("Te avisaremos del avance. Gracias.")
    return " ".join(parts)


def build_delivery_message(
    *,
    customer_name: str,
    order_number: str,
    plates: Optional[str],
) -> str:
    parts = [
        f"Hola {customer_name},",
        f"Tu vehículo {plates or ''} (OS {order_number}) está listo para entrega.",
        "Adjuntamos acuse digital. Gracias por preferirnos.",
    ]
    return " ".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# In-app notification center (Wave 4)
# ---------------------------------------------------------------------------

def create_notification(
    db,
    *,
    user_id: str,
    kind,
    title: str,
    body: str = "",
    link_url: Optional[str] = None,
    branch_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    send_email: bool = False,
    background_tasks=None,
):
    """Persist an in-app notification for `user_id`.

    `kind` can be a NotificationKind enum or a string value.
    Caller is responsible for db.commit() if not part of an outer transaction.

    If `send_email=True`, also dispatches an email via `send_notification_email`.
    If `background_tasks` (FastAPI `BackgroundTasks`) is provided, the email is
    enqueued for after-response; otherwise it runs inline (wrapped in try/except,
    failures never break the request).
    """
    from app.models.notifications import Notification, NotificationKind

    kind_value = kind.value if isinstance(kind, NotificationKind) else str(kind)

    notif = Notification(
        user_id=user_id,
        kind=kind_value,
        title=title,
        body=body or "",
        link_url=link_url,
        branch_id=branch_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notif)
    db.flush()

    if send_email:
        try:
            from app.services.email import send_notification_email

            if background_tasks is not None:
                background_tasks.add_task(send_notification_email, db, notif.id)
            else:
                send_notification_email(db, notif.id)
        except Exception:  # noqa: BLE001
            # Never let email failures break the calling request.
            import logging
            logging.getLogger("bjx-atlas.email").warning(
                "send_notification_email failed for notif=%s", notif.id, exc_info=True,
            )

    return notif
