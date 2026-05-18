"""Historial inmutable de transiciones de estado de WorkOrder."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class WorkOrderStatusHistory(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "work_order_status_history"

    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_status = Column(String(32), nullable=True)
    to_status = Column(String(32), nullable=False)
    changed_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    occurred_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_wo_status_history_wo_occurred", "work_order_id", "occurred_at"),
    )
