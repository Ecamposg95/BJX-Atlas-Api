from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.mixins import AuditMixin, UUIDMixin


class WorkOrderStatus(str, enum.Enum):
    received = "received"
    in_progress = "in_progress"
    waiting_parts = "waiting_parts"
    completed = "completed"
    delivered = "delivered"


class WorkOrder(Base, UUIDMixin, AuditMixin):
    __tablename__ = "work_orders"

    order_number = Column(String(20), unique=True, nullable=False, index=True)
    vehicle_id = Column(String(36), ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False, index=True)
    model_id = Column(String(36), ForeignKey("models.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    assigned_mechanic_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(Enum(WorkOrderStatus, create_type=False), nullable=False, default=WorkOrderStatus.received, index=True)
    received_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    work_started_at = Column(DateTime(timezone=True), nullable=True)
    work_finished_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    delay_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    vehicle = relationship("Vehicle")
    model = relationship("VehicleModel")
    service = relationship("Service")
    assigned_mechanic = relationship("User")
