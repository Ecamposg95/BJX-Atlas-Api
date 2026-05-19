"""Asignación de mecánico a OS/línea. Append-only para historial."""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class AssignmentStatus(str, enum.Enum):
    active = "active"
    reassigned = "reassigned"
    completed = "completed"
    cancelled = "cancelled"


class Assignment(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "assignments"

    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    work_order_line_id = Column(
        String(36),
        ForeignKey("work_order_lines.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    mechanic_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    assigned_by = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(String(16), nullable=False, default=AssignmentStatus.active.value)
    assigned_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    released_at = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=True)
    override_level_check = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("ix_assignments_active", "work_order_id", "status"),
        Index("ix_assignments_mechanic_active", "mechanic_id", "status"),
    )
