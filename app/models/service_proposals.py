from __future__ import annotations

import enum

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class ServiceProposalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class ServiceProposal(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "service_proposals"

    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_id = Column(
        String(36),
        ForeignKey("services.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    service_name = Column(String(255), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    estimated_hours = Column(Numeric(10, 2), nullable=True)
    estimated_parts_cost = Column(Numeric(12, 2), nullable=True)
    estimated_total = Column(Numeric(12, 2), nullable=True)
    reason = Column(Text, nullable=False, default="")
    status = Column(
        String(16),
        nullable=False,
        default=ServiceProposalStatus.pending.value,
        index=True,
    )
    proposed_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    proposed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_notes = Column(Text, nullable=True)
    materialized_line_id = Column(
        String(36),
        ForeignKey("work_order_lines.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_service_proposals_branch_status", "branch_id", "status"),
        Index("ix_service_proposals_wo_status", "work_order_id", "status"),
    )
