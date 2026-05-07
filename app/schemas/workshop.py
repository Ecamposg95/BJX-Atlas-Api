"""Schemas para extensiones de taller (bays, líneas, evidencias)."""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


# ---- Service Bays ----

class BayCreate(BaseModel):
    code: str = Field(..., max_length=32)
    name: str = Field(..., max_length=120)
    branch_id: Optional[str] = None


class BayUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None


class BayRead(BaseModel):
    id: str
    branch_id: str
    code: str
    name: str
    active: bool
    model_config = ConfigDict(from_attributes=True)


# ---- Work Order Lines ----

class LineCreate(BaseModel):
    service_id: str
    bay_id: Optional[str] = None
    mechanic_id: Optional[str] = None
    standard_duration_hrs: Optional[float] = None
    notes: Optional[str] = None


class LineUpdate(BaseModel):
    bay_id: Optional[str] = None
    mechanic_id: Optional[str] = None
    notes: Optional[str] = None


class LineRead(BaseModel):
    id: str
    branch_id: str
    work_order_id: str
    service_id: str
    bay_id: Optional[str]
    mechanic_id: Optional[str]
    status: str
    standard_duration_hrs: Optional[float]
    started_at: Optional[datetime]
    paused_at: Optional[datetime]
    finished_at: Optional[datetime]
    actual_duration_minutes: Optional[int]
    notes: Optional[str]
    # enrichment
    service_name: Optional[str] = None
    bay_name: Optional[str] = None
    mechanic_email: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---- Evidence ----

class EvidenceCreate(BaseModel):
    work_order_id: str
    work_order_line_id: Optional[str] = None
    kind: Literal["photo", "video", "document", "note"] = "photo"
    stage: Optional[Literal["before", "during", "after", "quality_check"]] = None
    note: Optional[str] = None


class EvidenceRead(BaseModel):
    id: str
    branch_id: str
    work_order_id: str
    work_order_line_id: Optional[str]
    document_id: Optional[str]
    kind: str
    stage: Optional[str]
    note: Optional[str]
    captured_by: Optional[str]
    created_at: datetime
    # signed URL para descarga (poblado por el router)
    download_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)
