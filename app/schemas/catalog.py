from __future__ import annotations

from datetime import datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict

# ---------------------------------------------------------------------------
# Generic pagination wrapper
# ---------------------------------------------------------------------------

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# CatalogImportResult
# ---------------------------------------------------------------------------


class CatalogImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[dict]


# ---------------------------------------------------------------------------
# VehicleModel schemas
# ---------------------------------------------------------------------------


class VehicleModelRead(BaseModel):
    id: str
    name: str
    brand: Optional[str] = None
    active: bool
    created_at: datetime
    service_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class VehicleModelCreate(BaseModel):
    name: str
    brand: Optional[str] = None


class VehicleModelUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Service schemas
# ---------------------------------------------------------------------------


class ServiceRead(BaseModel):
    id: str
    name: str
    category: str
    active: bool
    created_at: datetime
    coverage_pct: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class ServiceCreate(BaseModel):
    name: str
    category: str = "otros"


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    active: Optional[bool] = None


# ---------------------------------------------------------------------------
# ServiceCatalog (costs) schemas
# ---------------------------------------------------------------------------


class ServiceCatalogRead(BaseModel):
    id: str
    model_id: str
    service_id: str
    bjx_labor_cost: Optional[float] = None
    bjx_parts_cost: Optional[float] = None
    duration_hrs: float
    source: Optional[str] = None
    is_current: bool
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ServiceCatalogReadEnriched(ServiceCatalogRead):
    """ServiceCatalogRead with joined model_name and service_name."""

    model_name: Optional[str] = None
    service_name: Optional[str] = None


class ServiceCatalogUpdate(BaseModel):
    bjx_labor_cost: Optional[float] = None
    bjx_parts_cost: Optional[float] = None
    duration_hrs: Optional[float] = None
    source: Optional[str] = None


# ---------------------------------------------------------------------------
# Missing costs
# ---------------------------------------------------------------------------


class MissingCostItem(BaseModel):
    model_id: str
    service_id: str
    model_name: Optional[str] = None
    service_name: Optional[str] = None
