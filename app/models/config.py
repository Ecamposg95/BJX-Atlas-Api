from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class ConfigParam(Base, UUIDMixin, AuditMixin):
    __tablename__ = "config_params"

    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    history = relationship("ConfigHistory", back_populates="config", lazy="dynamic")


class ConfigHistory(Base, UUIDMixin):
    __tablename__ = "config_history"

    config_id = Column(String(36), ForeignKey("config_params.id", ondelete="RESTRICT"), nullable=False, index=True)
    old_value = Column(String(255), nullable=True)
    new_value = Column(String(255), nullable=False)
    changed_by = Column(String(255), nullable=False)
    changed_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    config = relationship("ConfigParam", back_populates="history")
