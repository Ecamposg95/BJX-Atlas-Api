"""Schemas — Dashboard cliente corporativo (Ola 5)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class FleetVehicleInfo(BaseModel):
    id: Optional[str] = None
    plates: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class FleetUnit(BaseModel):
    """Una unidad (vehículo) de la flota del cliente con su última OS."""

    vehicle: FleetVehicleInfo
    last_order_id: Optional[str] = None
    last_folio: Optional[str] = None
    last_status: Optional[str] = None
    last_received_at: Optional[datetime] = None
    estimated_ready_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    service_name: Optional[str] = None
    branch_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FleetResponse(BaseModel):
    total: int
    in_workshop: int
    ready_for_delivery: int
    items: list[FleetUnit] = []


class CorpWorkOrderItem(BaseModel):
    id: str
    folio: str
    status: str
    received_at: Optional[datetime] = None
    estimated_ready_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    service_name: Optional[str] = None
    vehicle: FleetVehicleInfo
    branch_name: Optional[str] = None


class CorpWorkOrdersResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[CorpWorkOrderItem] = []


class CorpKPIs(BaseModel):
    units_total: int
    in_workshop: int
    ready_for_delivery: int
    delivered_last_30d: int
    spend_current_month: float
    spend_previous_month: float
    customer_id: Optional[str] = None
    customer_label: Optional[str] = None
