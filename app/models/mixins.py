import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import declarative_mixin


@declarative_mixin
class UUIDMixin:
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))


@declarative_mixin
class AuditMixin:
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    deleted_at = Column(DateTime(timezone=True), nullable=True)
