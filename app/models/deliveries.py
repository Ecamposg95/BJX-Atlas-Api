"""Delivery — acuse de entrega final con firma del cliente.

Asociado a una WorkOrder (1:1 práctico, aunque permitimos varios registros
para reentregas / garantías). Guarda la URL de la firma capturada en canvas
y la del acuse PDF generado.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class Delivery(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "deliveries"

    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    customer_name = Column(String(255), nullable=False)
    customer_id_type = Column(String(32), nullable=True)
    customer_id_number = Column(String(64), nullable=True)

    signature_url = Column(String(500), nullable=False)
    signature_storage_key = Column(String(500), nullable=True)

    pdf_url = Column(String(500), nullable=True)
    pdf_storage_key = Column(String(500), nullable=True)

    notes = Column(Text, nullable=True)

    delivered_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    delivered_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    work_order = relationship("WorkOrder")
