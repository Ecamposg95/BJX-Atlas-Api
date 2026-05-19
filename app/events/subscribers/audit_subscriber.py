"""Audit subscriber — escribe contexto adicional al audit_log existente."""
from __future__ import annotations

import logging

from app.events import BaseEvent

logger = logging.getLogger("bjx-atlas.events.audit")


def audit_workshop_event(event: BaseEvent) -> None:
    """Loggea el evento. La escritura a audit_log la maneja el listener SQLAlchemy
    existente; este subscriber añade trazabilidad de eventos en logs estructurados."""
    payload = {
        k: v
        for k, v in event.__dict__.items()
        if k not in ("event_id", "occurred_at", "branch_id", "actor_id", "request_id")
    }
    logger.info(
        "Domain event",
        extra={
            "event_type": type(event).__name__,
            "event_id": event.event_id,
            "branch_id": event.branch_id,
            "actor_id": event.actor_id,
            "payload": payload,
        },
    )
