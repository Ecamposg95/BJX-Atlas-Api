"""Appointment — citas/agenda de recepción.

Permite agendar visitas previas a la creación de la OS. Al llegar el cliente,
el receptor puede marcar la cita como `arrived` y luego convertirla en una OS
real con `convert_to_wo`.
"""
from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class AppointmentStatus(str, enum.Enum):
    scheduled = "scheduled"
    arrived = "arrived"
    cancelled = "cancelled"
    no_show = "no_show"
    converted_to_wo = "converted_to_wo"


class Appointment(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "appointments"

    customer_name = Column(String(255), nullable=False, index=True)
    customer_phone = Column(String(64), nullable=True, index=True)
    vehicle_plates = Column(String(50), nullable=True, index=True)
    vehicle_model_id = Column(
        String(36),
        ForeignKey("models.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    scheduled_at = Column(DateTime(timezone=True), nullable=False, index=True)
    duration_minutes = Column(Integer, nullable=False, default=60)

    service_type = Column(String(120), nullable=False)
    notes = Column(Text, nullable=True)

    status = Column(
        String(32),
        nullable=False,
        default=AppointmentStatus.scheduled.value,
        index=True,
    )

    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    cancel_reason = Column(Text, nullable=True)

    created_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    arrived_at = Column(DateTime(timezone=True), nullable=True)
    converted_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    work_order = relationship("WorkOrder")
