"""Schemas para /api/v1/assignments."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class AssignmentCreateRequest(BaseModel):
    work_order_id: str
    work_order_line_id: Optional[str] = None
    mechanic_id: str
    override_level_check: bool = False
    reason: Optional[str] = Field(None, max_length=2000)


class MechanicSummary(BaseModel):
    id: str
    email: str
    level: str


class _ActorBrief(BaseModel):
    id: str
    email: str


class AssignmentCreateResponse(BaseModel):
    id: str
    work_order_id: str
    work_order_line_id: Optional[str] = None
    mechanic: MechanicSummary
    service_required_level: str
    level_check: Literal["pass", "override"]
    assigned_at: datetime
    assigned_by: _ActorBrief


class AssignmentReleaseRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=2000)
