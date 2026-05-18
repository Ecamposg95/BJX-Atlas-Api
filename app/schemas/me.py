"""Schemas para /api/v1/me/*."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


SemaphoreStatus = Literal["green", "yellow", "red", "pending"]
LoadStatus = Literal["green", "yellow", "red"]


class MechanicSummary(BaseModel):
    id: str
    level: str
    current_load_hrs: float
    available_hrs: float
    load_status: LoadStatus


class VehicleBrief(BaseModel):
    plates: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None


class WorkOrderBrief(BaseModel):
    id: str
    order_number: str
    type: str
    priority: str
    vehicle: VehicleBrief


class LineBrief(BaseModel):
    id: str
    service_name: str
    service_required_level: str
    standard_duration_hrs: Optional[float] = None
    status: str
    bay_name: Optional[str] = None


class TimerState(BaseModel):
    started_at: Optional[datetime] = None
    elapsed_minutes: int
    remaining_estimated_minutes: Optional[int] = None
    semaphore: SemaphoreStatus


class PartsStatus(BaseModel):
    total: int
    available: int
    blocking: bool


class MyTaskItem(BaseModel):
    assignment_id: str
    work_order: WorkOrderBrief
    line: LineBrief
    timer: TimerState
    parts_needed: PartsStatus
    available_actions: list[str]


class MyTasksResponse(BaseModel):
    mechanic: MechanicSummary
    items: list[MyTaskItem]
    summary: dict


class FindingReportRequest(BaseModel):
    description: str
    suggested_service_id: Optional[str] = None
    estimated_extra_hrs: Optional[float] = None
