from pydantic import BaseModel, model_validator
from typing import Literal, Optional


class CalculationInput(BaseModel):
    model_id: str
    service_id: str
    technician_cost_hr: float = 156.25
    target_margin: float = 0.40
    override_duration_hrs: Optional[float] = None

    # Datos del catálogo — inyectados por la capa de servicio (router/service layer)
    catalog_labor_cost: Optional[float] = None
    catalog_parts_cost: Optional[float] = None
    catalog_duration_hrs: float          # requerido siempre
    brame_ref_actual: float              # precio ref de Brame
    brame_total_actual: float            # precio total que paga Brame


class CalculationResult(BaseModel):
    duration_hrs: float
    labor_cost: float           # duration × technician_cost_hr (o catalog_labor_cost si existe)
    parts_cost: float           # brame_ref_actual (o catalog_parts_cost si existe)
    total_bjx_cost: float       # labor + parts
    brame_price: float          # brame_total_actual
    margin_pesos: float         # brame_price - total_bjx_cost
    margin_pct: float           # margin_pesos / brame_price (0 si brame_price == 0)
    suggested_price: float      # total_bjx_cost / (1 - target_margin)
    gap_vs_target: float        # brame_price - suggested_price
    margin_status: Literal["ok", "low", "critical"]
    data_source: Literal["catalog", "estimated"]


class EngineConfig(BaseModel):
    technician_cost_hr: float = 156.25
    target_margin: float = 0.40
    iva_rate: float = 0.16
    overhead_rate: float = 0.15


class ScoringWeights(BaseModel):
    price_weight: float = 0.50
    time_weight: float = 0.30
    tc_weight: float = 0.20

    @model_validator(mode='after')
    def weights_sum_to_one(self) -> 'ScoringWeights':
        total = round(self.price_weight + self.time_weight + self.tc_weight, 10)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Weights must sum to 1.0, got {total}")
        return self


class SupplierOption(BaseModel):
    supplier_id: str
    supplier_name: str
    ref_cost: float
    labor_cost: float
    total_price: float
    lead_time_days: int
    warranty_days: int


class ScoredSupplier(SupplierOption):
    normalized_price: float
    normalized_time: float
    normalized_tc: float
    final_score: float
    score: float = 0.0   # alias exposed to frontend (same value as final_score)
    rank: int
    recommended: bool

    def model_post_init(self, __context: object) -> None:
        # keep score in sync with final_score at construction time
        object.__setattr__(self, "score", self.final_score)
