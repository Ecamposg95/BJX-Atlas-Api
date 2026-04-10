from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.quotes import QuoteStatus


# ---------------------------------------------------------------------------
# QuoteCreate
# ---------------------------------------------------------------------------


class QuoteCreate(BaseModel):
    model_id: str
    service_ids: list[str] = Field(..., min_length=1, max_length=20)
    technician_cost_hr: Optional[float] = None
    target_margin: Optional[float] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# QuoteLine
# ---------------------------------------------------------------------------


class QuoteLineRead(BaseModel):
    id: str
    service_id: str
    service_name: str
    supplier_id: Optional[str] = None
    duration_hrs: float
    labor_cost: float
    parts_cost: float
    total_bjx_cost: float
    brame_price: float
    margin_pesos: float
    margin_pct: float
    suggested_price: float
    gap_vs_target: float
    margin_status: str
    data_source: str

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# QuoteSummary (embedded in QuoteRead)
# ---------------------------------------------------------------------------


class QuoteSummary(BaseModel):
    total_bjx_cost: float
    total_brame_price: float
    blended_margin_pct: float
    blended_margin_pesos: float
    ok_count: int
    low_count: int
    critical_count: int
    no_data_count: int = 0


# ---------------------------------------------------------------------------
# QuoteRead (with lines + summary)
# ---------------------------------------------------------------------------


class QuoteRead(BaseModel):
    id: str
    quote_number: str
    model_id: str
    model_name: str
    created_by: str
    status: QuoteStatus
    technician_cost_hr: float
    target_margin: float
    notes: Optional[str] = None
    created_at: datetime

    lines: list[QuoteLineRead] = []
    summary: QuoteSummary

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# QuoteListItem (without lines, for paginated listings)
# ---------------------------------------------------------------------------


class QuoteListItem(BaseModel):
    id: str
    quote_number: str
    model_id: str
    model_name: str
    created_by: str
    status: QuoteStatus
    technician_cost_hr: float
    target_margin: float
    notes: Optional[str] = None
    created_at: datetime
    summary: QuoteSummary

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# QuoteUpdate
# ---------------------------------------------------------------------------


class QuoteUpdate(BaseModel):
    status: Optional[QuoteStatus] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# QuoteStats
# ---------------------------------------------------------------------------


class QuoteStatsByModel(BaseModel):
    model_id: str
    model_name: str
    count: int


class QuoteStats(BaseModel):
    period: dict[str, Any]
    total_quotes: int
    by_status: dict[str, int]
    avg_blended_margin_pct: float
    critical_quotes_count: int
    ok_quotes_count: int
    by_model: list[QuoteStatsByModel]
