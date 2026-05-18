"""Hallazgos adicionales del mecánico que requieren aprobación del jefe."""
from __future__ import annotations

import enum

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class FindingStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class WorkOrderFinding(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "work_order_findings"

    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    work_order_line_id = Column(
        String(36),
        ForeignKey("work_order_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reported_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    description = Column(Text, nullable=False)
    suggested_service_id = Column(
        String(36),
        ForeignKey("services.id", ondelete="SET NULL"),
        nullable=True,
    )
    estimated_extra_hrs = Column(Float, nullable=True)
    status = Column(String(16), nullable=False, default=FindingStatus.pending.value)
    reviewed_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    resulting_line_id = Column(
        String(36),
        ForeignKey("work_order_lines.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        Index("ix_findings_branch_status", "branch_id", "status"),
    )
