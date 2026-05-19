"""WorkOrder — orden de servicio con state machine ampliada."""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class WorkOrderType(str, enum.Enum):
    appointment = "appointment"
    walk_in = "walk_in"
    tow = "tow"
    standby = "standby"
    warranty = "warranty"
    internal = "internal"


class WorkOrderStatus(str, enum.Enum):
    received = "received"
    assigned = "assigned"
    in_progress = "in_progress"
    waiting_parts = "waiting_parts"
    quality_check = "quality_check"
    completed = "completed"
    delivered = "delivered"
    cancelled = "cancelled"


class WorkOrder(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "work_orders"

    order_number = Column(String(20), unique=True, nullable=False, index=True)
    vehicle_id = Column(String(36), ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False, index=True)
    model_id = Column(String(36), ForeignKey("models.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    assigned_mechanic_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Status como VARCHAR(32) — migración add_workshop_workflow_core convirtió desde Enum nativo
    status = Column(String(32), nullable=False, default=WorkOrderStatus.received.value, index=True)

    # Tipo de OS (US-01) y prioridad
    type = Column(String(32), nullable=False, default=WorkOrderType.walk_in.value, index=True)
    priority = Column(String(16), nullable=False, default="normal", index=True)

    # Tiempos
    received_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    promised_at = Column(DateTime(timezone=True), nullable=True)
    work_started_at = Column(DateTime(timezone=True), nullable=True)
    work_finished_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    # Contexto adicional
    customer_id = Column(String(36), nullable=True)
    tow_provider = Column(String(120), nullable=True)
    entry_mileage = Column(Integer, nullable=True)
    exit_mileage = Column(Integer, nullable=True)
    portal_token = Column(String(64), nullable=True, unique=True)
    delay_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relaciones
    vehicle = relationship("Vehicle")
    model = relationship("VehicleModel")
    service = relationship("Service")
    assigned_mechanic = relationship("User")
