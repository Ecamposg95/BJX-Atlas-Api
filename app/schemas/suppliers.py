from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# Supplier schemas
# ---------------------------------------------------------------------------


class SupplierRead(BaseModel):
    id: str
    name: str
    lead_time_days: int
    warranty_days: int
    return_policy: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    active: bool
    created_at: datetime

    # Computed / aggregated fields
    price_count: int = 0
    model_coverage: int = 0
    service_coverage: int = 0
    avg_price_index: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class SupplierCreate(BaseModel):
    name: str
    lead_time_days: int = Field(..., ge=1)
    warranty_days: int = Field(..., ge=0)
    return_policy: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    lead_time_days: Optional[int] = Field(default=None, ge=1)
    warranty_days: Optional[int] = Field(default=None, ge=0)
    return_policy: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    active: Optional[bool] = None


# ---------------------------------------------------------------------------
# SupplierPrice schemas
# ---------------------------------------------------------------------------


class SupplierPriceRead(BaseModel):
    id: str
    supplier_id: str
    service_id: str
    model_id: str
    ref_cost: float
    labor_cost: float
    total_price: float
    price_date: Optional[date] = None
    is_current: bool
    created_at: datetime

    # Enriched / computed fields
    service_name: str = ""
    model_name: str = ""
    price_change_pct: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class SupplierPriceCreate(BaseModel):
    service_id: str
    model_id: str
    ref_cost: float
    labor_cost: float = 0.0
    total_price: float
    price_date: Optional[date] = None


class SupplierPriceUpdate(BaseModel):
    ref_cost: Optional[float] = None
    labor_cost: Optional[float] = None
    total_price: Optional[float] = None
    price_date: Optional[date] = None


# ---------------------------------------------------------------------------
# Import result
# ---------------------------------------------------------------------------


class PriceImportError(BaseModel):
    row: int
    reason: str


class PriceImportResult(BaseModel):
    imported: int
    skipped: int
    errors: list[PriceImportError]


# ---------------------------------------------------------------------------
# Compare request / response
# ---------------------------------------------------------------------------


class SupplierCompareRequest(BaseModel):
    model_id: str
    service_id: str
    weights: Optional[str] = "50,30,20"
