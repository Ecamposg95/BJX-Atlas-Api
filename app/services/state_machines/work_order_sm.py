"""State machine de WorkOrder.

TRANSITIONS es la fuente única de verdad. transition() valida y aplica.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.events import EventBus
from app.events.workshop_events import WorkOrderStatusChanged
from app.models.assignments import Assignment, AssignmentStatus
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop_history import WorkOrderStatusHistory
from app.security.permissions import Permission, has_permission
from app.services.state_machines import Forbidden, InvalidTransition

S = WorkOrderStatus


# (from_status, to_status) -> rule dict
TRANSITIONS: dict[tuple[S, S], dict] = {
    (S.received, S.assigned):           {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.received, S.cancelled):          {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.assigned, S.in_progress):        {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION, "actor_must_own_assignment": True},
    (S.assigned, S.received):           {"reason": True,  "permission": Permission.ASSIGNMENT_RELEASE},
    (S.assigned, S.cancelled):          {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.in_progress, S.waiting_parts):   {"reason": True,  "permission": Permission.WORK_ORDER_TRANSITION},
    (S.in_progress, S.quality_check):   {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.in_progress, S.completed):       {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.in_progress, S.cancelled):       {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.waiting_parts, S.in_progress):   {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.waiting_parts, S.cancelled):     {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.quality_check, S.completed):     {"reason": False, "permission": Permission.WORK_ORDER_QA_PASS},
    (S.quality_check, S.in_progress):   {"reason": True,  "permission": Permission.WORK_ORDER_QA_FAIL},
    (S.completed, S.delivered):         {"reason": False, "permission": Permission.WORK_ORDER_DELIVER},
}

TERMINAL_STATES: set[S] = {S.delivered, S.cancelled}


def allowed_targets_from(status: S) -> list[str]:
    return [t.value for (f, t) in TRANSITIONS if f == status]


def transition(
    db: Session,
    work_order: WorkOrder,
    to_status: S,
    actor,
    reason: Optional[str],
    metadata: Optional[dict] = None,
) -> WorkOrderStatusHistory:
    from_status = S(work_order.status)

    if from_status in TERMINAL_STATES:
        raise InvalidTransition(
            code="WORK_ORDER_TERMINAL",
            detail={"from_status": from_status.value},
        )

    rule = TRANSITIONS.get((from_status, to_status))
    if rule is None:
        raise InvalidTransition(
            code="WORK_ORDER_INVALID_TRANSITION",
            detail={
                "from_status": from_status.value,
                "to_status": to_status.value,
                "allowed_targets": allowed_targets_from(from_status),
            },
        )

    if rule["reason"] and not (reason and reason.strip()):
        raise InvalidTransition(code="REASON_REQUIRED", detail={"to_status": to_status.value})

    if not has_permission(actor, rule["permission"]):
        raise Forbidden(code="FORBIDDEN_TRANSITION", detail={"required": rule["permission"].value})

    if rule.get("actor_must_own_assignment"):
        owns = (
            db.query(Assignment.id)
            .filter(
                Assignment.work_order_id == work_order.id,
                Assignment.mechanic_id == actor.id,
                Assignment.status == AssignmentStatus.active.value,
            )
            .first()
        )
        if not owns:
            raise Forbidden(code="NOT_ASSIGNED_MECHANIC", detail={"work_order_id": work_order.id})

    # Aplicar transición
    work_order.status = to_status.value
    _set_timestamp_for_status(work_order, to_status)

    history = WorkOrderStatusHistory(
        branch_id=work_order.branch_id,
        work_order_id=work_order.id,
        from_status=from_status.value,
        to_status=to_status.value,
        changed_by=getattr(actor, "id", None),
        reason=reason,
        metadata_json=json.dumps(metadata) if metadata else None,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(history)
    if hasattr(db, "flush"):
        db.flush()

    EventBus.publish(WorkOrderStatusChanged(
        work_order_id=work_order.id,
        from_status=from_status.value,
        to_status=to_status.value,
        reason=reason,
        branch_id=work_order.branch_id,
        actor_id=getattr(actor, "id", None),
    ))

    return history


def _set_timestamp_for_status(wo: WorkOrder, status: S) -> None:
    now = datetime.now(timezone.utc)
    if status == S.in_progress and wo.work_started_at is None:
        wo.work_started_at = now
    elif status == S.completed and wo.work_finished_at is None:
        wo.work_finished_at = now
    elif status in (S.delivered, S.cancelled) and wo.closed_at is None:
        wo.closed_at = now
