from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.service_proposals import ServiceProposal
from app.models.users import User
from app.schemas.service_proposals import (
    ServiceProposalCreate,
    ServiceProposalListResponse,
    ServiceProposalRead,
    ServiceProposalReview,
)
from app.security.permissions import Permission, require_permission
from app.security.tenant import (
    TenantContext,
    assert_branch_access,
    branch_scoped_query,
    get_tenant_context,
)
from app.services.service_proposals_engine import (
    approve_proposal,
    cancel_proposal,
    create_proposal,
    reject_proposal,
)


router = APIRouter(prefix="/v1", tags=["service-proposals-v1"])


def _serialize(p: ServiceProposal) -> ServiceProposalRead:
    return ServiceProposalRead.model_validate(p, from_attributes=True)


@router.post("/service-proposals", response_model=ServiceProposalRead, status_code=201)
def create_service_proposal(
    payload: ServiceProposalCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_PROPOSE)),
):
    proposal = create_proposal(db, user=user, payload=payload)
    assert_branch_access(proposal.branch_id, ctx)
    return _serialize(proposal)


@router.get("/service-proposals", response_model=ServiceProposalListResponse)
def list_service_proposals(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_PROPOSE)),
    status_filter: Optional[str] = Query(None, alias="status"),
    work_order_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
):
    q = branch_scoped_query(ServiceProposal, db, ctx).filter(ServiceProposal.deleted_at.is_(None))
    if status_filter:
        q = q.filter(ServiceProposal.status == status_filter)
    if work_order_id:
        q = q.filter(ServiceProposal.work_order_id == work_order_id)
    if branch_id and ctx.is_global:
        q = q.filter(ServiceProposal.branch_id == branch_id)
    items = q.order_by(ServiceProposal.created_at.desc()).all()
    return ServiceProposalListResponse(
        items=[_serialize(p) for p in items],
        total=len(items),
    )


@router.get("/service-proposals/{proposal_id}", response_model=ServiceProposalRead)
def get_service_proposal(
    proposal_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_PROPOSE)),
):
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        raise HTTPException(404, detail={"error": {"code": "PROPOSAL_NOT_FOUND"}})
    assert_branch_access(proposal.branch_id, ctx)
    return _serialize(proposal)


@router.post("/service-proposals/{proposal_id}/approve", response_model=ServiceProposalRead)
def approve_service_proposal(
    proposal_id: str,
    payload: ServiceProposalReview | None = None,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_APPROVE)),
):
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        raise HTTPException(404, detail={"error": {"code": "PROPOSAL_NOT_FOUND"}})
    assert_branch_access(proposal.branch_id, ctx)
    notes = payload.notes if payload else None
    proposal = approve_proposal(db, proposal_id=proposal_id, user=user, notes=notes)
    return _serialize(proposal)


@router.post("/service-proposals/{proposal_id}/reject", response_model=ServiceProposalRead)
def reject_service_proposal(
    proposal_id: str,
    payload: ServiceProposalReview | None = None,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_REJECT)),
):
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        raise HTTPException(404, detail={"error": {"code": "PROPOSAL_NOT_FOUND"}})
    assert_branch_access(proposal.branch_id, ctx)
    notes = payload.notes if payload else None
    proposal = reject_proposal(db, proposal_id=proposal_id, user=user, notes=notes)
    return _serialize(proposal)


@router.post("/service-proposals/{proposal_id}/cancel", response_model=ServiceProposalRead)
def cancel_service_proposal(
    proposal_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_PROPOSE)),
):
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        raise HTTPException(404, detail={"error": {"code": "PROPOSAL_NOT_FOUND"}})
    assert_branch_access(proposal.branch_id, ctx)
    proposal = cancel_proposal(db, proposal_id=proposal_id, user=user)
    return _serialize(proposal)


@router.get(
    "/work-orders/{work_order_id}/proposals",
    response_model=ServiceProposalListResponse,
)
def list_proposals_by_work_order(
    work_order_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(require_permission(Permission.SERVICE_PROPOSE)),
):
    q = branch_scoped_query(ServiceProposal, db, ctx).filter(
        ServiceProposal.work_order_id == work_order_id,
        ServiceProposal.deleted_at.is_(None),
    )
    items = q.order_by(ServiceProposal.created_at.desc()).all()
    return ServiceProposalListResponse(
        items=[_serialize(p) for p in items],
        total=len(items),
    )
