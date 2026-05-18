"""Router de asignaciones — POST /api/v1/assignments."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog import Service
from app.models.mechanic_profiles import MechanicProfile
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.models.workshop import WorkOrderLine
from app.schemas.assignments import (
    AssignmentCreateRequest,
    AssignmentCreateResponse,
    MechanicSummary,
)
from app.security.permissions import Permission, require_permission
from app.security.tenant import TenantContext, get_tenant_context
from app.services.assignment_engine import (
    AssignmentLevelInsufficient,
    CrossBranchAssignmentBlocked,
    MechanicInactive,
    assign_mechanic,
)

router = APIRouter(prefix="/v1/assignments", tags=["assignments-v1"])


@router.post("", response_model=AssignmentCreateResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    payload: AssignmentCreateRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.ASSIGNMENT_CREATE)),
):
    try:
        assignment = assign_mechanic(
            db,
            work_order_id=payload.work_order_id,
            work_order_line_id=payload.work_order_line_id,
            mechanic_user_id=payload.mechanic_id,
            actor=ctx.user,
            override_level_check=payload.override_level_check,
            reason=payload.reason,
        )
    except (AssignmentLevelInsufficient, CrossBranchAssignmentBlocked, MechanicInactive) as e:
        raise HTTPException(
            status_code=e.http_status,
            detail={"error": {"code": e.code, "detail": e.detail}},
        )

    db.commit()
    db.refresh(assignment)

    # Resolve mechanic info
    mechanic_user = db.query(User).filter(User.id == assignment.mechanic_id).first()
    profile = (
        db.query(MechanicProfile)
        .filter(MechanicProfile.user_id == assignment.mechanic_id)
        .first()
    )

    # Resolve service required level
    wo = db.query(WorkOrder).filter(WorkOrder.id == assignment.work_order_id).first()
    if assignment.work_order_line_id:
        line = (
            db.query(WorkOrderLine)
            .filter(WorkOrderLine.id == assignment.work_order_line_id)
            .first()
        )
        svc_id = line.service_id if line else wo.service_id
    else:
        svc_id = wo.service_id
    svc = db.query(Service).filter(Service.id == svc_id).first()
    required_level = getattr(svc, "required_level", "junior") if svc else "junior"

    return AssignmentCreateResponse(
        id=assignment.id,
        work_order_id=assignment.work_order_id,
        work_order_line_id=assignment.work_order_line_id,
        mechanic=MechanicSummary(
            id=mechanic_user.id,
            email=mechanic_user.email,
            level=profile.level if profile else "junior",
        ),
        service_required_level=required_level,
        level_check="override" if assignment.override_level_check else "pass",
        assigned_at=assignment.assigned_at,
        assigned_by={"id": ctx.user.id, "email": ctx.user.email},
    )
