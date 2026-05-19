"""Schemas for /branches/stats — Mexico map showcase + Manager dashboard."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


Metric = Literal["operation", "revenue", "alerts"]
Semaphore = Literal["green", "amber", "red"]


class BranchKPIs(BaseModel):
    open_orders: int = 0
    in_progress: int = 0
    finished_today: int = 0
    active_mechanics: int = 0
    revenue_today: float = 0.0
    avg_completion_hrs: float = 0.0
    stalled_parts: int = 0
    alerts_count: int = 0
    cycle_time_avg_hrs: float = 0.0
    cycle_time_p95_hrs: float = 0.0
    margin_pct_avg: Optional[float] = None
    on_time_pct: float = 0.0


class StalledOrder(BaseModel):
    id: str
    order_number: str
    status: str
    hours_in_status: float


class BranchStat(BaseModel):
    branch_id: str
    code: str
    name: str
    city: str | None = None
    state: str | None = None
    lat: float
    lng: float
    kpis: BranchKPIs
    semaphore: Semaphore
    pulse: bool = False


class ManagerDashboard(BaseModel):
    branch_id: str
    code: str
    name: str
    city: str | None = None
    state: str | None = None
    kpis: BranchKPIs
    semaphore: Semaphore
    top_stalled_orders: list[StalledOrder] = []
    calculated_at: str
