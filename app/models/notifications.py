"""In-app notifications model (Wave 4 — notification center)."""
from __future__ import annotations

import enum

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, UUIDMixin


class NotificationKind(str, enum.Enum):
    appointment_confirmed = "appointment_confirmed"
    wo_status_changed = "wo_status_changed"
    parts_request = "parts_request"
    qa_pending = "qa_pending"
    delivery_ready = "delivery_ready"
    system = "system"


class Notification(Base, UUIDMixin, AuditMixin):
    __tablename__ = "notifications"

    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind = Column(String(32), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False, default="")
    link_url = Column(String(500), nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    branch_id = Column(
        String(36),
        ForeignKey("branches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    entity_type = Column(String(64), nullable=True)
    entity_id = Column(String(36), nullable=True)

    __table_args__ = (
        Index("ix_notifications_user_read", "user_id", "read_at"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )
