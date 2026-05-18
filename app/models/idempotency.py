"""Idempotency keys con TTL 24h y hash de body."""
from __future__ import annotations

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, UUIDMixin


class IdempotencyKey(Base, UUIDMixin, AuditMixin):
    __tablename__ = "idempotency_keys"

    key = Column(String(128), nullable=False, unique=True, index=True)
    endpoint = Column(String(128), nullable=False)
    user_id = Column(String(36), nullable=True, index=True)
    request_hash = Column(String(128), nullable=False)
    response_status = Column(Integer, nullable=False)
    response_body = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
