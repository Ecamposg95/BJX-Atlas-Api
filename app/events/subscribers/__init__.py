"""Suscriptores del EventBus — registrados al boot."""
from __future__ import annotations


def setup_event_subscribers() -> None:
    """Registra todos los subscribers en el EventBus. Idempotente al boot."""
    from app.events import EventBus
    from app.events.subscribers.audit_subscriber import audit_workshop_event
    from app.events.workshop_events import (
        MechanicAssigned,
        WorkOrderCreated,
        WorkOrderFindingApproved,
        WorkOrderFindingReported,
        WorkOrderStatusChanged,
    )

    EventBus.subscribe(WorkOrderCreated, audit_workshop_event)
    EventBus.subscribe(WorkOrderStatusChanged, audit_workshop_event)
    EventBus.subscribe(MechanicAssigned, audit_workshop_event)
    EventBus.subscribe(WorkOrderFindingReported, audit_workshop_event)
    EventBus.subscribe(WorkOrderFindingApproved, audit_workshop_event)


__all__ = ["setup_event_subscribers"]
