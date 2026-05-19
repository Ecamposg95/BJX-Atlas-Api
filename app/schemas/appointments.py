"""Schemas para citas/agenda."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.appointments import AppointmentStatus


class AppointmentBase(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_phone: Optional[str] = Field(None, max_length=64)
    vehicle_plates: Optional[str] = Field(None, max_length=50)
    vehicle_model_id: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int = Field(60, ge=15, le=600)
    service_type: str = Field(..., min_length=1, max_length=120)
    notes: Optional[str] = None


class AppointmentCreate(AppointmentBase):
    branch_id: Optional[str] = None


class AppointmentUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    vehicle_plates: Optional[str] = None
    vehicle_model_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    service_type: Optional[str] = None
    notes: Optional[str] = None


class AppointmentRead(BaseModel):
    id: str
    branch_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    vehicle_plates: Optional[str] = None
    vehicle_model_id: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int
    service_type: str
    notes: Optional[str] = None
    status: AppointmentStatus
    work_order_id: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_by_id: Optional[str] = None
    arrived_at: Optional[datetime] = None
    converted_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AppointmentCancelRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class AppointmentConvertRequest(BaseModel):
    """Datos requeridos para convertir cita en OS.

    Si el vehículo ya existe (por placas) se reutiliza; si no, se crea.
    """

    service_id: str = Field(..., min_length=1)
    vehicle_id: Optional[str] = None  # si ya hay vehículo en sistema
    assigned_mechanic_id: Optional[str] = None
    notes: Optional[str] = None


class AppointmentConvertResponse(BaseModel):
    appointment: AppointmentRead
    work_order: dict
    whatsapp_link: Optional[str] = None
