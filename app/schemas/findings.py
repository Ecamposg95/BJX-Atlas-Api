"""Schemas para /api/v1/findings y /api/v1/me/tasks/{id}/findings."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class FindingReportRequest(BaseModel):
    work_order_line_id: Optional[str] = None
    description: str = Field(..., min_length=5, max_length=4000)
    suggested_service_id: Optional[str] = None
    estimated_extra_hrs: Optional[float] = None


class FindingRead(BaseModel):
    id: str
    work_order_id: str
    work_order_line_id: Optional[str] = None
    description: str
    suggested_service_id: Optional[str] = None
    estimated_extra_hrs: Optional[float] = None
    status: Literal["pending", "approved", "rejected"]
    reported_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None
    resulting_line_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FindingRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)
