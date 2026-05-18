"""Asignación de mecánico con validación de nivel + manejo de reasignación."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.events import EventBus
from app.events.workshop_events import MechanicAssigned
from app.models.assignments import Assignment, AssignmentStatus
from app.models.catalog import Service
from app.models.mechanic_profiles import LEVEL_ORDER, MechanicProfile
from app.models.users import User
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.security.permissions import Permission, has_permission


class AssignmentError(Exception):
    def __init__(self, code: str, detail: dict, http_status: int = 409):
        self.code = code
        self.detail = detail
        self.http_status = http_status
        super().__init__(code)


class AssignmentLevelInsufficient(AssignmentError):
    pass


class CrossBranchAssignmentBlocked(AssignmentError):
    pass


class MechanicInactive(AssignmentError):
    pass


def assign_mechanic(
    db: Session,
    *,
    work_order_id: str,
    work_order_line_id: Optional[str],
    mechanic_user_id: str,
    actor: User,
    override_level_check: bool = False,
    reason: Optional[str] = None,
) -> Assignment:
    """Crea una nueva Assignment.active. Si existía una previa, la marca reassigned.

    Reglas:
    - R8: Solo un Assignment.active por (work_order_id, line_id) — enforced en DB
    - R9: No asignar a mecánico inactivo o de otra sucursal
    - R10: No asignar si mechanic.level < service.required_level salvo override + reason
    - R12: Liberar/reasignar línea in_progress → línea pasa a paused
    """
    # 1. WorkOrder existe
    wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if wo is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "WORK_ORDER_NOT_FOUND", "message": "OS no existe"}},
        )

    # 2. Línea (si aplica)
    line = None
    if work_order_line_id:
        line = db.query(WorkOrderLine).filter(WorkOrderLine.id == work_order_line_id).first()
        if line is None:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "WORK_ORDER_LINE_NOT_FOUND"}},
            )

    # 3. Service required level
    service_id = line.service_id if line else wo.service_id
    service = db.query(Service).filter(Service.id == service_id).first()
    required_level = getattr(service, "required_level", "junior") if service else "junior"

    # 4. MechanicProfile activo, mismo branch
    profile = (
        db.query(MechanicProfile)
        .filter(MechanicProfile.user_id == mechanic_user_id)
        .first()
    )
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "MECHANIC_PROFILE_NOT_FOUND"}},
        )
    if not profile.active:
        raise MechanicInactive(
            code="MECHANIC_INACTIVE",
            detail={"user_id": mechanic_user_id},
        )
    if profile.branch_id != wo.branch_id:
        raise CrossBranchAssignmentBlocked(
            code="CROSS_BRANCH_NOT_ALLOWED",
            detail={
                "work_order_branch": wo.branch_id,
                "mechanic_branch": profile.branch_id,
            },
        )

    # 5. Validación de nivel
    mech_level_num = LEVEL_ORDER.get(profile.level, 1)
    req_level_num = LEVEL_ORDER.get(required_level, 1)

    level_check_result = "pass"
    if mech_level_num < req_level_num:
        if not override_level_check:
            raise AssignmentLevelInsufficient(
                code="ASSIGNMENT_LEVEL_INSUFFICIENT",
                detail={
                    "required_level": required_level,
                    "mechanic_level": profile.level,
                },
            )
        if not has_permission(actor, Permission.ASSIGNMENT_OVERRIDE):
            raise HTTPException(
                status_code=403,
                detail={"error": {"code": "FORBIDDEN_PERMISSION", "message": "override requiere permiso"}},
            )
        if not (reason and reason.strip()):
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "REASON_REQUIRED", "message": "override requiere reason"}},
            )
        level_check_result = "override"

    # 6. Buscar asignación activa previa y marcarla reassigned
    prev_query = (
        db.query(Assignment)
        .filter(
            Assignment.work_order_id == work_order_id,
            Assignment.status == AssignmentStatus.active.value,
        )
    )
    if work_order_line_id:
        prev_query = prev_query.filter(Assignment.work_order_line_id == work_order_line_id)
    else:
        prev_query = prev_query.filter(Assignment.work_order_line_id.is_(None))
    prev_assignment = prev_query.first()

    if prev_assignment is not None:
        prev_assignment.status = AssignmentStatus.reassigned.value
        prev_assignment.released_at = datetime.now(timezone.utc)

        # R12: Si la línea estaba in_progress, pausarla
        if line is not None and line.status == WorkOrderLineStatus.in_progress.value:
            line.status = WorkOrderLineStatus.paused.value
            line.paused_at = datetime.now(timezone.utc)
            line.notes = (line.notes or "") + "\n[Sistema] Pausada por reasignación de mecánico."

    # 7. Crear nueva asignación
    new_assignment = Assignment(
        branch_id=wo.branch_id,
        work_order_id=work_order_id,
        work_order_line_id=work_order_line_id,
        mechanic_id=mechanic_user_id,
        assigned_by=actor.id,
        status=AssignmentStatus.active.value,
        assigned_at=datetime.now(timezone.utc),
        reason=reason,
        override_level_check=override_level_check,
    )
    db.add(new_assignment)

    # 8. Backward-compat: actualizar WorkOrder.assigned_mechanic_id
    wo.assigned_mechanic_id = mechanic_user_id

    # 9. Auto-transición received → assigned
    if wo.status == WorkOrderStatus.received.value:
        from app.services.state_machines.work_order_sm import transition
        transition(db, wo, WorkOrderStatus.assigned, actor, reason=None)

    db.flush()

    # 10. Emitir evento
    EventBus.publish(MechanicAssigned(
        work_order_id=work_order_id,
        work_order_line_id=work_order_line_id,
        mechanic_id=mechanic_user_id,
        level_check_result=level_check_result,
        branch_id=wo.branch_id,
        actor_id=actor.id,
    ))

    return new_assignment
