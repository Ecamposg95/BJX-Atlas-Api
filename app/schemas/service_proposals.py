from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ServiceProposalCreate(BaseModel):
    work_order_id: str
    service_id: Optional[str] = None
    service_name: str = Field(..., min_length=2, max_length=255)
    quantity: int = Field(default=1, ge=1)
    estimated_hours: Optional[Decimal] = Field(default=None, ge=0)
    estimated_parts_cost: Optional[Decimal] = Field(default=None, ge=0)
    estimated_total: Optional[Decimal] = Field(default=None, ge=0)
    reason: str = Field(..., min_length=3, max_length=4000)


class ServiceProposalReview(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=4000)


class ServiceProposalRead(BaseModel):
    id: str
    branch_id: str
    work_order_id: str
    service_id: Optional[str] = None
    service_name: str
    quantity: int
    estimated_hours: Optional[Decimal] = None
    estimated_parts_cost: Optional[Decimal] = None
    estimated_total: Optional[Decimal] = None
    reason: str
    status: Literal["pending", "approved", "rejected", "cancelled"]
    proposed_by_id: Optional[str] = None
    proposed_at: Optional[datetime] = None
    reviewed_by_id: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    materialized_line_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ServiceProposalListResponse(BaseModel):
    items: list[ServiceProposalRead]
    total: int
