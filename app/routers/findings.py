"""Endpoints /api/v1/findings — listado, aprobación, rechazo."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.events import EventBus
from app.events.workshop_events import WorkOrderFindingApproved
from app.models.findings import FindingStatus, WorkOrderFinding
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.schemas.findings import FindingRead, FindingRejectRequest
from app.security.permissions import Permission, require_permission
from app.security.tenant import TenantContext, assert_branch_access, branch_scoped_query, get_tenant_context

router = APIRouter(prefix="/v1/findings", tags=["findings-v1"])


@router.get("", response_model=list[FindingRead])
def list_findings(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.FINDING_LIST)),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    q = branch_scoped_query(WorkOrderFinding, db, ctx).filter(WorkOrderFinding.deleted_at.is_(None))
    if status_filter:
        q = q.filter(WorkOrderFinding.status == status_filter)
    items = q.order_by(WorkOrderFinding.created_at.desc()).all()
    return [FindingRead.model_validate(f, from_attributes=True) for f in items]


@router.post("/{finding_id}/approve", response_model=FindingRead)
def approve_finding(
    finding_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.FINDING_APPROVE)),
):
    finding = db.query(WorkOrderFinding).filter(WorkOrderFinding.id == finding_id).first()
    if finding is None:
        raise HTTPException(404, detail={"error": {"code": "FINDING_NOT_FOUND"}})
    assert_branch_access(finding.branch_id, ctx)

    if finding.status != FindingStatus.pending.value:
        raise HTTPException(409, detail={"error": {"code": "FINDING_NOT_PENDING"}})

    # Si hay servicio sugerido, crear nueva WorkOrderLine
    new_line = None
    if finding.suggested_service_id:
        wo = db.query(WorkOrder).filter(WorkOrder.id == finding.work_order_id).first()
        if wo is not None:
            new_line = WorkOrderLine(
                branch_id=finding.branch_id,
                work_order_id=finding.work_order_id,
                service_id=finding.suggested_service_id,
                standard_duration_hrs=finding.estimated_extra_hrs,
                status=WorkOrderLineStatus.pending.value,
                notes=f"Auto-creada por finding {finding.id}: {finding.description[:200]}",
            )
            db.add(new_line)
            db.flush()

    finding.status = FindingStatus.approved.value
    finding.reviewed_by = ctx.user.id
    finding.reviewed_at = datetime.now(timezone.utc)
    if new_line:
        finding.resulting_line_id = new_line.id

    db.commit()
    db.refresh(finding)

    EventBus.publish(WorkOrderFindingApproved(
        work_order_id=finding.work_order_id,
        finding_id=finding.id,
        new_line_id=new_line.id if new_line else None,
        branch_id=finding.branch_id,
        actor_id=ctx.user.id,
    ))

    return FindingRead.model_validate(finding, from_attributes=True)


@router.post("/{finding_id}/reject", response_model=FindingRead)
def reject_finding(
    finding_id: str,
    payload: FindingRejectRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.FINDING_REJECT)),
):
    finding = db.query(WorkOrderFinding).filter(WorkOrderFinding.id == finding_id).first()
    if finding is None:
        raise HTTPException(404, detail={"error": {"code": "FINDING_NOT_FOUND"}})
    assert_branch_access(finding.branch_id, ctx)

    if finding.status != FindingStatus.pending.value:
        raise HTTPException(409, detail={"error": {"code": "FINDING_NOT_PENDING"}})

    finding.status = FindingStatus.rejected.value
    finding.reviewed_by = ctx.user.id
    finding.reviewed_at = datetime.now(timezone.utc)
    finding.rejection_reason = payload.reason

    db.commit()
    db.refresh(finding)
    return FindingRead.model_validate(finding, from_attributes=True)
