"""Schemas para /api/v1/evidence — uploads desde clientes mobile."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class EvidenceKind(str, Enum):
    damage_photo = "damage_photo"
    parts_receipt = "parts_receipt"
    finding_photo = "finding_photo"


class EvidenceRead(BaseModel):
    """Respuesta para uploads de evidencia mobile."""

    id: str
    kind: EvidenceKind
    url: str
    work_order_id: Optional[str] = None
    uploaded_by_id: Optional[str] = None
    note: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvidenceLinkRequest(BaseModel):
    """Vincula una evidencia previamente subida a una OS recién creada."""

    work_order_id: str = Field(..., min_length=1)
