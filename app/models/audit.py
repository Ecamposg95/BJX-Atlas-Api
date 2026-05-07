from sqlalchemy import Column, String, DateTime, ForeignKey, Index, Text
from sqlalchemy.types import JSON
from datetime import datetime, timezone
from app.database import Base
from app.models.mixins import UUIDMixin


class AuditLog(Base, UUIDMixin):
    __tablename__ = "audit_logs"

    branch_id = Column(String(36), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    user_email = Column(String(255), nullable=True)
    action = Column(String(32), nullable=False, index=True)  # insert | update | delete
    table_name = Column(String(120), nullable=False, index=True)
    record_id = Column(String(36), nullable=True, index=True)
    old_data = Column(JSON, nullable=True)
    new_data = Column(JSON, nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    __table_args__ = (
        Index("ix_audit_logs_table_record", "table_name", "record_id"),
    )
