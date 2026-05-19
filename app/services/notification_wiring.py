"""Notification wiring helpers (Wave 4 close).

Centralized fan-out helpers used by routers to emit in-app + email notifications
when key events occur. Kept aparte de `notifications.py` para no romper firma
de `create_notification` (que ya se usa en muchos sitios).
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.users import User
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.services.notifications import create_notification

logger = logging.getLogger("bjx-atlas.notif-wiring")


def _branch_users(db: Session, branch_id: Optional[str], roles: list[str]) -> list[User]:
    if not branch_id:
        return []
    return (
        db.query(User)
        .filter(
            User.default_branch_id == branch_id,
            User.role.in_(roles),
            User.active.is_(True),
        )
        .all()
    )


def _emit(db: Session, *, user: User, background_tasks, **kwargs) -> None:
    try:
        create_notification(
            db,
            user_id=user.id,
            send_email=bool(user.email),
            background_tasks=background_tasks,
            **kwargs,
        )
    except Exception:  # noqa: BLE001
        logger.warning(
            "notification emit failed user=%s kind=%s", user.id, kwargs.get("kind"),
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# WO status changed (also dispatches qa_pending / delivery_ready as needed)
# ---------------------------------------------------------------------------

def notify_wo_status_changed(
    db: Session,
    *,
    wo: WorkOrder,
    previous_status: str,
    background_tasks=None,
) -> None:
    """Emit notifications when a WO transitions status.

    - kind=wo_status_changed → mecánico asignado (si lo hay), recepción.
    - Si pasó a `quality_check` → kind=qa_pending al jefe_taller.
    - Si pasó a `completed` o `delivered` desde otra cosa → kind=delivery_ready
      a recepción.
    """
    new_status = wo.status
    title = f"OS {wo.order_number}: {previous_status} → {new_status}"
    body = f"La orden {wo.order_number} cambió a estado '{new_status}'."
    link = f"/work-orders/{wo.id}"

    recipients: list[User] = []

    # Mecánico asignado siempre
    if wo.assigned_mechanic_id:
        mech = db.query(User).filter(User.id == wo.assigned_mechanic_id).first()
        if mech and mech.active:
            recipients.append(mech)

    # Recepción de la sucursal
    recipients.extend(_branch_users(db, wo.branch_id, ["recepcion"]))

    seen: set[str] = set()
    for u in recipients:
        if u.id in seen:
            continue
        seen.add(u.id)
        _emit(
            db,
            user=u,
            background_tasks=background_tasks,
            kind="wo_status_changed",
            title=title,
            body=body,
            link_url=link,
            branch_id=wo.branch_id,
            entity_type="work_order",
            entity_id=wo.id,
        )

    # quality_check → notificar jefe_taller (qa_pending)
    if new_status == WorkOrderStatus.quality_check.value and previous_status != new_status:
        notify_qa_pending(db, wo=wo, background_tasks=background_tasks)

    # completed o delivered → notificar recepción (delivery_ready)
    if (
        new_status in {WorkOrderStatus.completed.value, WorkOrderStatus.delivered.value}
        and previous_status != new_status
    ):
        notify_delivery_ready(db, wo=wo, background_tasks=background_tasks)


# ---------------------------------------------------------------------------
# QA pending
# ---------------------------------------------------------------------------

def notify_qa_pending(
    db: Session, *, wo: WorkOrder, background_tasks=None
) -> None:
    title = f"QA pendiente — OS {wo.order_number}"
    body = "La OS está lista para revisión de calidad (quality_check)."
    link = f"/work-orders/{wo.id}"

    jefes = _branch_users(db, wo.branch_id, ["jefe_taller"])
    for u in jefes:
        _emit(
            db,
            user=u,
            background_tasks=background_tasks,
            kind="qa_pending",
            title=title,
            body=body,
            link_url=link,
            branch_id=wo.branch_id,
            entity_type="work_order",
            entity_id=wo.id,
        )


# ---------------------------------------------------------------------------
# Delivery ready
# ---------------------------------------------------------------------------

def notify_delivery_ready(
    db: Session, *, wo: WorkOrder, background_tasks=None
) -> None:
    title = f"OS {wo.order_number} lista para entrega"
    body = f"La OS {wo.order_number} está {wo.status} y lista para entregar al cliente."
    link = f"/work-orders/{wo.id}"

    recep = _branch_users(db, wo.branch_id, ["recepcion", "gerente_sede"])
    for u in recep:
        _emit(
            db,
            user=u,
            background_tasks=background_tasks,
            kind="delivery_ready",
            title=title,
            body=body,
            link_url=link,
            branch_id=wo.branch_id,
            entity_type="work_order",
            entity_id=wo.id,
        )


# ---------------------------------------------------------------------------
# Parts request approved
# ---------------------------------------------------------------------------

def notify_parts_request_approved(
    db: Session, *, request, background_tasks=None
) -> None:
    """Notify the mechanic who created the inventory request."""
    if not request.requested_by:
        return
    user = db.query(User).filter(User.id == request.requested_by).first()
    if user is None or not user.active:
        return

    title = "Solicitud de refacción aprobada"
    body = (
        f"Tu solicitud de refacción para la OS fue aprobada "
        f"(cantidad: {request.quantity})."
    )
    link = f"/warehouse/requests/{request.id}"

    _emit(
        db,
        user=user,
        background_tasks=background_tasks,
        kind="parts_request",
        title=title,
        body=body,
        link_url=link,
        branch_id=request.branch_id,
        entity_type="inventory_request",
        entity_id=request.id,
    )
