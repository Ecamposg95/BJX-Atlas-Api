from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Summary sub-schemas
# ---------------------------------------------------------------------------


class MarginDistribution(BaseModel):
    count: int
    pct: float


class MarginDistributions(BaseModel):
    ok: MarginDistribution
    low: MarginDistribution
    critical: MarginDistribution


class ConfigUsed(BaseModel):
    technician_cost_hr: float
    target_margin: float


class DashboardSummary(BaseModel):
    total_services: int
    total_models: int
    total_combos: int
    avg_margin_pct: float
    critical_combos: int
    low_combos: int
    ok_combos: int
    critical_pct: float
    margin_distribution: MarginDistributions
    config_used: ConfigUsed
    last_calculated: datetime


# ---------------------------------------------------------------------------
# By-model / by-service profitability
# ---------------------------------------------------------------------------


class ModelProfitability(BaseModel):
    model_id: str
    model_name: str
    service_count: int
    avg_bjx_cost: float
    avg_brame_price: float
    avg_margin_pct: float
    avg_margin_pesos: float
    critical_count: int
    low_count: int
    ok_count: int
    margin_status: str
    worst_services: list[dict]


class ServiceProfitability(BaseModel):
    service_id: str
    service_name: str
    category: str
    model_count: int
    critical_model_count: int
    avg_margin_pct: float
    worst_model: Optional[dict] = None
    best_model: Optional[dict] = None


# ---------------------------------------------------------------------------
# Simulate
# ---------------------------------------------------------------------------


class SimulateRequest(BaseModel):
    technician_cost_hr: Optional[float] = None
    target_margin: Optional[float] = None
    brame_price_increase_pct: float = 0.0


class SimulateDelta(BaseModel):
    avg_margin_pct_delta: float
    critical_combos_delta: int
    ok_combos_delta: int


class SimulateResponse(BaseModel):
    scenario: dict
    summary: DashboardSummary
    delta_vs_current: SimulateDelta
