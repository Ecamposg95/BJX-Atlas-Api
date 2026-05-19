"""Endpoints /me/* — vista personal del usuario autenticado (principalmente mecánico)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.events import EventBus
from app.events.workshop_events import WorkOrderFindingReported
from app.models.assignments import Assignment, AssignmentStatus
from app.models.catalog import Service
from app.models.findings import FindingStatus, WorkOrderFinding
from app.models.mechanic_profiles import MechanicProfile
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.models.workshop import WorkOrderLine
from app.schemas.me import (
    FindingReportRequest,
    LineBrief,
    MechanicSummary,
    MyTaskItem,
    MyTasksResponse,
    PartsStatus,
    TimerState,
    VehicleBrief,
    WorkOrderBrief,
)
from app.schemas.findings import FindingRead  # se crea en Task 1.2.5
from app.security.permissions import Permission, require_permission

router = APIRouter(prefix="/v1/me", tags=["me-v1"])


_ACTIONS_BY_STATUS: dict[str, list[str]] = {
    "pending":       ["start", "request_part", "report_finding"],
    "in_progress":   ["pause", "finish", "request_part"],
    "paused":        ["resume", "finish"],
    "waiting_parts": ["view_detail"],
    "completed":     ["view_detail"],
    "cancelled":     ["view_detail"],
}


def _actions_for_status(line_status: str) -> list[str]:
    return _ACTIONS_BY_STATUS.get(line_status, ["view_detail"])


def _compute_load(db: Session, mechanic_id: str, capacity_hrs_day: float):
    """Suma horas estándar de líneas activas del mecánico."""
    active_lines = (
        db.query(WorkOrderLine)
        .join(Assignment, Assignment.work_order_line_id == WorkOrderLine.id)
        .filter(
            Assignment.mechanic_id == mechanic_id,
            Assignment.status == AssignmentStatus.active.value,
            WorkOrderLine.status.in_(["pending", "in_progress", "paused", "waiting_parts"]),
        )
        .all()
    )
    total_hrs = sum((l.standard_duration_hrs or 1.0) for l in active_lines)
    available = max(0.0, capacity_hrs_day - total_hrs)
    pct = total_hrs / capacity_hrs_day if capacity_hrs_day > 0 else 1.0
    if pct < 0.60:
        load_status = "green"
    elif pct < 0.90:
        load_status = "yellow"
    else:
        load_status = "red"
    return total_hrs, available, load_status


@router.get("/tasks", response_model=MyTasksResponse)
def get_my_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.ME_TASKS_READ)),
):
    profile = (
        db.query(MechanicProfile)
        .filter(MechanicProfile.user_id == current_user.id)
        .first()
    )
    if profile is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "MECHANIC_PROFILE_NOT_FOUND"}},
        )

    total_load, available, load_status = _compute_load(db, current_user.id, profile.capacity_hrs_day)

    active_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.mechanic_id == current_user.id,
            Assignment.status == AssignmentStatus.active.value,
        )
        .all()
    )

    items: list[MyTaskItem] = []
    summary = {"pending": 0, "in_progress": 0, "paused": 0, "waiting_parts": 0}

    for asg in active_assignments:
        wo = (
            db.query(WorkOrder)
            .options(joinedload(WorkOrder.vehicle))
            .filter(WorkOrder.id == asg.work_order_id)
            .first()
        )
        if wo is None:
            continue

        # Línea: la asignada explícitamente o la primera no terminada
        line = None
        if asg.work_order_line_id:
            line = (
                db.query(WorkOrderLine)
                .filter(WorkOrderLine.id == asg.work_order_line_id)
                .first()
            )
        if line is None:
            line = (
                db.query(WorkOrderLine)
                .filter(WorkOrderLine.work_order_id == wo.id)
                .filter(WorkOrderLine.status.in_(["pending", "in_progress", "paused", "waiting_parts"]))
                .first()
            )
        if line is None:
            continue

        svc = db.query(Service).filter(Service.id == line.service_id).first()
        service_name = svc.name if svc else "Servicio"
        required_level = getattr(svc, "required_level", "junior") if svc else "junior"

        # Timer
        elapsed_minutes = 0
        remaining = None
        semaphore = "pending"
        if line.started_at:
            elapsed_minutes = int((datetime.now(timezone.utc) - line.started_at).total_seconds() / 60)
            if line.standard_duration_hrs:
                std_min = int(line.standard_duration_hrs * 60)
                remaining = max(0, std_min - elapsed_minutes)
                if elapsed_minutes < std_min - 15:
                    semaphore = "green"
                elif elapsed_minutes <= std_min:
                    semaphore = "yellow"
                else:
                    semaphore = "red"

        items.append(MyTaskItem(
            assignment_id=asg.id,
            work_order=WorkOrderBrief(
                id=wo.id,
                order_number=wo.order_number,
                type=wo.type,
                priority=wo.priority,
                vehicle=VehicleBrief(
                    plates=wo.vehicle.plates if wo.vehicle else None,
                    brand=wo.vehicle.brand if wo.vehicle else None,
                    model=wo.vehicle.model if wo.vehicle else None,
                ),
            ),
            line=LineBrief(
                id=line.id,
                service_name=service_name,
                service_required_level=required_level,
                standard_duration_hrs=line.standard_duration_hrs,
                status=line.status,
                bay_name=None,
            ),
            timer=TimerState(
                started_at=line.started_at,
                elapsed_minutes=elapsed_minutes,
                remaining_estimated_minutes=remaining,
                semaphore=semaphore,
            ),
            parts_needed=PartsStatus(total=0, available=0, blocking=False),  # Fase 2 lo poblará
            available_actions=_actions_for_status(line.status),
        ))

        if line.status in summary:
            summary[line.status] += 1

    return MyTasksResponse(
        mechanic=MechanicSummary(
            id=current_user.id,
            level=profile.level,
            current_load_hrs=total_load,
            available_hrs=available,
            load_status=load_status,
        ),
        items=items,
        summary=summary,
    )


@router.post(
    "/tasks/{work_order_line_id}/findings",
    response_model=FindingRead,
    status_code=status.HTTP_201_CREATED,
)
def report_finding(
    work_order_line_id: str,
    payload: FindingReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(Permission.FINDING_REPORT)),
):
    line = db.query(WorkOrderLine).filter(WorkOrderLine.id == work_order_line_id).first()
    if line is None:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "WORK_ORDER_LINE_NOT_FOUND"}},
        )

    # El mecánico debe tener una Assignment.active en esta OS
    has_active = (
        db.query(Assignment)
        .filter(
            Assignment.mechanic_id == current_user.id,
            Assignment.status == AssignmentStatus.active.value,
            Assignment.work_order_id == line.work_order_id,
        )
        .first()
    )
    if has_active is None:
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "NOT_ASSIGNED_MECHANIC"}},
        )

    finding = WorkOrderFinding(
        branch_id=line.branch_id,
        work_order_id=line.work_order_id,
        work_order_line_id=work_order_line_id,
        reported_by=current_user.id,
        description=payload.description,
        suggested_service_id=payload.suggested_service_id,
        estimated_extra_hrs=payload.estimated_extra_hrs,
        status=FindingStatus.pending.value,
    )
    db.add(finding)
    db.commit()
    db.refresh(finding)

    EventBus.publish(WorkOrderFindingReported(
        work_order_id=line.work_order_id,
        finding_id=finding.id,
        mechanic_id=current_user.id,
        branch_id=line.branch_id,
        actor_id=current_user.id,
    ))

    return FindingRead.model_validate(finding, from_attributes=True)
