"""Schemas para entregas con firma digital."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DeliverWithSignatureRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_id_type: Optional[str] = Field(None, max_length=32)
    customer_id_number: Optional[str] = Field(None, max_length=64)
    signature_base64: str = Field(..., min_length=10)
    evidence_ids: Optional[list[str]] = None
    notes: Optional[str] = None
    exit_mileage: Optional[int] = None


class DeliveryRead(BaseModel):
    id: str
    branch_id: str
    work_order_id: str
    customer_name: str
    customer_id_type: Optional[str] = None
    customer_id_number: Optional[str] = None
    signature_url: str
    pdf_url: Optional[str] = None
    delivered_at: datetime
    delivered_by_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DeliverResponse(BaseModel):
    delivery: DeliveryRead
    work_order: dict
    pdf_url: Optional[str] = None
    whatsapp_link: Optional[str] = None
