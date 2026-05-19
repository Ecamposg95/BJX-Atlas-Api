from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.catalog import Service
from app.models.notifications import NotificationKind
from app.models.service_proposals import ServiceProposal, ServiceProposalStatus
from app.models.users import Role, User
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.schemas.service_proposals import ServiceProposalCreate
from app.services.notifications import create_notification


_OPEN_WO_STATUSES = {
    WorkOrderStatus.in_progress.value,
    WorkOrderStatus.waiting_parts.value,
}


def _raise(status_code: int, code: str, message: str) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message}},
    )


def _resolve_service_name(db: Session, payload: ServiceProposalCreate) -> str:
    if payload.service_id:
        svc = db.query(Service).filter(Service.id == payload.service_id).first()
        if svc is None:
            _raise(404, "SERVICE_NOT_FOUND", "Servicio no encontrado en el catálogo")
        return payload.service_name or svc.name
    return payload.service_name


def _notify_managers(db: Session, proposal: ServiceProposal) -> None:
    managers = (
        db.query(User)
        .filter(
            User.role == Role.gerente_sede.value,
            User.default_branch_id == proposal.branch_id,
            User.active.is_(True),
        )
        .all()
    )
    for mgr in managers:
        create_notification(
            db,
            user_id=mgr.id,
            kind=NotificationKind.system,
            title="Nueva propuesta de servicio",
            body=f"Propuesta '{proposal.service_name}' requiere tu aprobación.",
            link_url=f"/manager?proposal={proposal.id}",
            branch_id=proposal.branch_id,
            entity_type="service_proposal",
            entity_id=proposal.id,
        )


def create_proposal(
    db: Session,
    *,
    user: User,
    payload: ServiceProposalCreate,
) -> ServiceProposal:
    wo = db.query(WorkOrder).filter(WorkOrder.id == payload.work_order_id).first()
    if wo is None:
        _raise(404, "WORK_ORDER_NOT_FOUND", "Orden de servicio no encontrada")

    if wo.status not in _OPEN_WO_STATUSES:
        _raise(
            409,
            "WORK_ORDER_NOT_OPEN",
            "La OS no acepta propuestas en su estado actual",
        )

    service_name = _resolve_service_name(db, payload)
    now = datetime.now(timezone.utc)

    proposal = ServiceProposal(
        branch_id=wo.branch_id,
        work_order_id=wo.id,
        service_id=payload.service_id,
        service_name=service_name,
        quantity=payload.quantity,
        estimated_hours=payload.estimated_hours,
        estimated_parts_cost=payload.estimated_parts_cost,
        estimated_total=payload.estimated_total,
        reason=payload.reason,
        status=ServiceProposalStatus.pending.value,
        proposed_by_id=user.id,
        proposed_at=now,
    )
    db.add(proposal)
    db.flush()

    _notify_managers(db, proposal)

    db.commit()
    db.refresh(proposal)
    return proposal


def approve_proposal(
    db: Session,
    *,
    proposal_id: str,
    user: User,
    notes: Optional[str] = None,
) -> ServiceProposal:
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        _raise(404, "PROPOSAL_NOT_FOUND", "Propuesta no encontrada")

    if proposal.status != ServiceProposalStatus.pending.value:
        _raise(409, "PROPOSAL_NOT_PENDING", "La propuesta no está pendiente")

    wo = db.query(WorkOrder).filter(WorkOrder.id == proposal.work_order_id).first()
    if wo is None:
        _raise(404, "WORK_ORDER_NOT_FOUND", "OS asociada no encontrada")

    if wo.status not in _OPEN_WO_STATUSES:
        _raise(
            409,
            "WORK_ORDER_NOT_OPEN",
            "La OS no acepta nuevos servicios en su estado actual",
        )

    service_id_for_line = proposal.service_id or wo.service_id

    standard_hours: Optional[float] = None
    if proposal.estimated_hours is not None:
        standard_hours = float(proposal.estimated_hours)

    line = WorkOrderLine(
        branch_id=proposal.branch_id,
        work_order_id=proposal.work_order_id,
        service_id=service_id_for_line,
        status=WorkOrderLineStatus.pending.value,
        standard_duration_hrs=standard_hours,
        notes=f"Propuesta aprobada {proposal.id}: {proposal.service_name}",
    )
    db.add(line)
    db.flush()

    proposal.status = ServiceProposalStatus.approved.value
    proposal.reviewed_by_id = user.id
    proposal.reviewed_at = datetime.now(timezone.utc)
    proposal.review_notes = notes
    proposal.materialized_line_id = line.id

    db.commit()
    db.refresh(proposal)
    return proposal


def reject_proposal(
    db: Session,
    *,
    proposal_id: str,
    user: User,
    notes: Optional[str] = None,
) -> ServiceProposal:
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        _raise(404, "PROPOSAL_NOT_FOUND", "Propuesta no encontrada")

    if proposal.status != ServiceProposalStatus.pending.value:
        _raise(409, "PROPOSAL_NOT_PENDING", "La propuesta no está pendiente")

    proposal.status = ServiceProposalStatus.rejected.value
    proposal.reviewed_by_id = user.id
    proposal.reviewed_at = datetime.now(timezone.utc)
    proposal.review_notes = notes

    db.commit()
    db.refresh(proposal)
    return proposal


def cancel_proposal(
    db: Session,
    *,
    proposal_id: str,
    user: User,
) -> ServiceProposal:
    proposal = db.query(ServiceProposal).filter(ServiceProposal.id == proposal_id).first()
    if proposal is None:
        _raise(404, "PROPOSAL_NOT_FOUND", "Propuesta no encontrada")

    if proposal.status != ServiceProposalStatus.pending.value:
        _raise(409, "PROPOSAL_NOT_PENDING", "La propuesta no está pendiente")

    if proposal.proposed_by_id != user.id:
        role = getattr(user, "role", None)
        role_value = role.value if hasattr(role, "value") else role
        if role_value not in {Role.admin.value, Role.director.value}:
            _raise(403, "PROPOSAL_CANCEL_FORBIDDEN", "Solo quien propuso puede cancelar")

    proposal.status = ServiceProposalStatus.cancelled.value
    proposal.reviewed_by_id = user.id
    proposal.reviewed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(proposal)
    return proposal
