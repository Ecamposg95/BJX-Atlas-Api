from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict

from app.models.work_orders import WorkOrderStatus


SemaphoreStatus = Literal["green", "yellow", "red", "pending"]


class WorkOrderVehicleSummary(BaseModel):
    id: str
    customer_name: str
    contact: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    plates: Optional[str] = None
    vin: Optional[str] = None
    color: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WorkOrderCreate(BaseModel):
    vehicle_id: str
    model_id: str
    service_id: str
    assigned_mechanic_id: Optional[str] = None
    delay_reason: Optional[str] = None
    notes: Optional[str] = None


class WorkOrderUpdate(BaseModel):
    vehicle_id: Optional[str] = None
    model_id: Optional[str] = None
    service_id: Optional[str] = None
    assigned_mechanic_id: Optional[str] = None
    status: Optional[WorkOrderStatus] = None
    delay_reason: Optional[str] = None
    notes: Optional[str] = None


class WorkOrderRead(BaseModel):
    id: str
    order_number: str
    vehicle_id: str
    model_id: str
    service_id: str
    assigned_mechanic_id: Optional[str] = None
    status: WorkOrderStatus
    received_at: datetime
    work_started_at: Optional[datetime] = None
    work_finished_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    delay_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    vehicle_summary: WorkOrderVehicleSummary
    service_name: str
    assigned_mechanic_email: Optional[str] = None
    standard_duration_hrs: Optional[float] = None
    actual_duration_minutes: Optional[int] = None
    semaphore_status: SemaphoreStatus

    model_config = ConfigDict(from_attributes=True)
