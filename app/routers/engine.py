from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.catalog import ServiceCatalog, VehicleModel, Service
from app.models.suppliers import SupplierPrice
from app.models.users import User
from app.schemas.engine import (
    CalculationInput,
    CalculationResult,
    ScoredSupplier,
    ScoringWeights,
    SupplierOption,
)
from app.security import get_current_user
from app.services.pricing_engine import PricingEngine
from app.services.supplier_engine import SupplierEngine

router = APIRouter(prefix="/engine", tags=["engine"])


# ---------------------------------------------------------------------------
# Config helper
# ---------------------------------------------------------------------------

def get_engine_config(db: Session) -> dict:
    """Lee config_params de DB. Retorna defaults si no existen."""
    from app.models.config import ConfigParam

    defaults = {
        "technician_cost_hr": 156.25,
        "target_margin": 0.40,
        "scoring_weight_price": 0.50,
        "scoring_weight_time": 0.30,
        "scoring_weight_tc": 0.20,
    }
    params = db.query(ConfigParam).filter(ConfigParam.key.in_(defaults.keys())).all()
    result = dict(defaults)
    for p in params:
        result[p.key] = float(p.value)
    return result


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class CalculateRequest(BaseModel):
    model_id: str
    service_id: str
    technician_cost_hr: Optional[float] = None
    target_margin: Optional[float] = None


class CalculateInputSummary(BaseModel):
    model_name: str
    service_name: str
    technician_cost_hr: float
    target_margin: float


class ScoringWeightsResponse(BaseModel):
    price: float
    time: float
    tc: float


class CalculateResponse(BaseModel):
    input: CalculateInputSummary
    result: CalculationResult
    suppliers: list[ScoredSupplier]
    recommended_supplier: Optional[ScoredSupplier]
    scoring_weights: ScoringWeightsResponse


class BatchRequest(BaseModel):
    model_id: str
    service_ids: list[str]
    technician_cost_hr: Optional[float] = None
    target_margin: Optional[float] = None

    @field_validator("service_ids")
    @classmethod
    def max_20_services(cls, v: list[str]) -> list[str]:
        if len(v) > 20:
            raise ValueError("service_ids cannot contain more than 20 items")
        return v


class BatchLine(BaseModel):
    service_id: str
    service_name: str
    result: Optional[CalculationResult]
    recommended_supplier: Optional[ScoredSupplier]
    margin_status: str


class BatchSummary(BaseModel):
    total_bjx_cost: float
    total_brame_price: float
    blended_margin_pct: float
    blended_margin_pesos: float
    ok_count: int
    low_count: int
    critical_count: int
    no_data_count: int


class BatchModelInfo(BaseModel):
    id: str
    name: str


class BatchResponse(BaseModel):
    model: BatchModelInfo
    lines: list[BatchLine]
    summary: BatchSummary


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_supplier_options(supplier_prices: list[SupplierPrice]) -> list[SupplierOption]:
    options: list[SupplierOption] = []
    for sp in supplier_prices:
        options.append(
            SupplierOption(
                supplier_id=sp.supplier_id,
                supplier_name=sp.supplier.name,
                ref_cost=sp.ref_cost,
                labor_cost=sp.labor_cost,
                total_price=sp.total_price,
                lead_time_days=sp.supplier.lead_time_days,
                warranty_days=sp.supplier.warranty_days,
            )
        )
    return options


def _build_calculation_input(
    model_id: str,
    service_id: str,
    catalog: ServiceCatalog,
    technician_cost_hr: float,
    target_margin: float,
) -> CalculationInput:
    return CalculationInput(
        model_id=model_id,
        service_id=service_id,
        technician_cost_hr=technician_cost_hr,
        target_margin=target_margin,
        catalog_labor_cost=catalog.bjx_labor_cost,
        catalog_parts_cost=catalog.bjx_parts_cost,
        catalog_duration_hrs=catalog.duration_hrs,
        # brame_ref_actual and brame_total_actual come from catalog parts cost
        # or fallback to 0.0 when not available — the engine handles None logic
        brame_ref_actual=catalog.bjx_parts_cost if catalog.bjx_parts_cost is not None else 0.0,
        brame_total_actual=(
            (catalog.bjx_labor_cost or 0.0) + (catalog.bjx_parts_cost or 0.0)
        ),
    )


# ---------------------------------------------------------------------------
# POST /engine/calculate
# ---------------------------------------------------------------------------

@router.post("/calculate", response_model=CalculateResponse)
def calculate(
    payload: CalculateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Read config from DB
    cfg = get_engine_config(db)

    # 2. Use request values if provided, otherwise fall back to config
    technician_cost_hr = (
        payload.technician_cost_hr
        if payload.technician_cost_hr is not None
        else cfg["technician_cost_hr"]
    )
    target_margin = (
        payload.target_margin
        if payload.target_margin is not None
        else cfg["target_margin"]
    )

    weights = ScoringWeights(
        price_weight=cfg["scoring_weight_price"],
        time_weight=cfg["scoring_weight_time"],
        tc_weight=cfg["scoring_weight_tc"],
    )

    # 3. Query ServiceCatalog — single query with joined model and service
    catalog = (
        db.query(ServiceCatalog)
        .options(joinedload(ServiceCatalog.model), joinedload(ServiceCatalog.service))
        .filter(
            ServiceCatalog.model_id == payload.model_id,
            ServiceCatalog.service_id == payload.service_id,
            ServiceCatalog.is_current.is_(True),
        )
        .first()
    )

    if catalog is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No catalog data for model_id={payload.model_id} / service_id={payload.service_id}",
        )

    # 4. Query SupplierPrice — single query with JOIN to Supplier
    supplier_prices = (
        db.query(SupplierPrice)
        .options(joinedload(SupplierPrice.supplier))
        .filter(
            SupplierPrice.service_id == payload.service_id,
            SupplierPrice.model_id == payload.model_id,
            SupplierPrice.is_current.is_(True),
        )
        .all()
    )

    # 5. Build CalculationInput
    inp = _build_calculation_input(
        model_id=payload.model_id,
        service_id=payload.service_id,
        catalog=catalog,
        technician_cost_hr=technician_cost_hr,
        target_margin=target_margin,
    )

    # 6. Run PricingEngine
    result = PricingEngine().calculate(inp)

    # 7. Build supplier options list
    options = _build_supplier_options(supplier_prices)

    # 8. Score suppliers
    scored = SupplierEngine().score(options, weights)

    # 9. Build response
    recommended = next((s for s in scored if s.recommended), None)

    model_name = catalog.model.name if catalog.model else payload.model_id
    service_name = catalog.service.name if catalog.service else payload.service_id

    return CalculateResponse(
        input=CalculateInputSummary(
            model_name=model_name,
            service_name=service_name,
            technician_cost_hr=technician_cost_hr,
            target_margin=target_margin,
        ),
        result=result,
        suppliers=scored,
        recommended_supplier=recommended,
        scoring_weights=ScoringWeightsResponse(
            price=weights.price_weight,
            time=weights.time_weight,
            tc=weights.tc_weight,
        ),
    )


# ---------------------------------------------------------------------------
# POST /engine/batch
# ---------------------------------------------------------------------------

@router.post("/batch", response_model=BatchResponse)
def batch(
    payload: BatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Validate len(service_ids) <= 20 — handled by Pydantic validator (422)

    # 2. Verify model_id exists
    vehicle_model = db.query(VehicleModel).filter(VehicleModel.id == payload.model_id).first()
    if vehicle_model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No vehicle model found for model_id={payload.model_id}",
        )

    # Read config from DB
    cfg = get_engine_config(db)

    technician_cost_hr = (
        payload.technician_cost_hr
        if payload.technician_cost_hr is not None
        else cfg["technician_cost_hr"]
    )
    target_margin = (
        payload.target_margin
        if payload.target_margin is not None
        else cfg["target_margin"]
    )

    weights = ScoringWeights(
        price_weight=cfg["scoring_weight_price"],
        time_weight=cfg["scoring_weight_time"],
        tc_weight=cfg["scoring_weight_tc"],
    )

    service_ids = payload.service_ids

    # 3. Query all ServiceCatalog entries — single query
    catalog_rows = (
        db.query(ServiceCatalog)
        .options(joinedload(ServiceCatalog.service))
        .filter(
            ServiceCatalog.model_id == payload.model_id,
            ServiceCatalog.service_id.in_(service_ids),
            ServiceCatalog.is_current.is_(True),
        )
        .all()
    )
    # Index catalogs by service_id for O(1) lookup
    catalog_by_service: dict[str, ServiceCatalog] = {c.service_id: c for c in catalog_rows}

    # Build a map of service_id -> service_name from the catalog entries we have
    service_name_by_id: dict[str, str] = {}
    for c in catalog_rows:
        if c.service and c.service_id not in service_name_by_id:
            service_name_by_id[c.service_id] = c.service.name

    # Fetch names for service_ids not covered by catalog (no_data lines)
    missing_service_ids = [sid for sid in service_ids if sid not in service_name_by_id]
    if missing_service_ids:
        services = (
            db.query(Service)
            .filter(Service.id.in_(missing_service_ids))
            .all()
        )
        for svc in services:
            service_name_by_id[svc.id] = svc.name

    # 4. Query all SupplierPrice entries — single query with JOIN
    supplier_price_rows = (
        db.query(SupplierPrice)
        .options(joinedload(SupplierPrice.supplier))
        .filter(
            SupplierPrice.model_id == payload.model_id,
            SupplierPrice.service_id.in_(service_ids),
            SupplierPrice.is_current.is_(True),
        )
        .all()
    )
    # Group supplier prices by service_id
    supplier_prices_by_service: dict[str, list[SupplierPrice]] = {}
    for sp in supplier_price_rows:
        supplier_prices_by_service.setdefault(sp.service_id, []).append(sp)

    # 5. Process each service_id
    pricing_engine = PricingEngine()
    supplier_engine = SupplierEngine()

    lines: list[BatchLine] = []
    total_bjx_cost = 0.0
    total_brame_price = 0.0
    total_margin_pesos = 0.0
    ok_count = 0
    low_count = 0
    critical_count = 0
    no_data_count = 0

    for sid in service_ids:
        service_name = service_name_by_id.get(sid, sid)
        catalog = catalog_by_service.get(sid)

        if catalog is None:
            # No data line
            no_data_count += 1
            lines.append(
                BatchLine(
                    service_id=sid,
                    service_name=service_name,
                    result=None,
                    recommended_supplier=None,
                    margin_status="no_data",
                )
            )
            continue

        # Build input and calculate
        inp = _build_calculation_input(
            model_id=payload.model_id,
            service_id=sid,
            catalog=catalog,
            technician_cost_hr=technician_cost_hr,
            target_margin=target_margin,
        )
        result = pricing_engine.calculate(inp)

        # Score suppliers for this service
        sp_list = supplier_prices_by_service.get(sid, [])
        options = _build_supplier_options(sp_list)
        scored = supplier_engine.score(options, weights)
        recommended = next((s for s in scored if s.recommended), None)

        # Accumulate summary totals
        total_bjx_cost += result.total_bjx_cost
        total_brame_price += result.brame_price
        total_margin_pesos += result.margin_pesos

        if result.margin_status == "ok":
            ok_count += 1
        elif result.margin_status == "low":
            low_count += 1
        else:
            critical_count += 1

        lines.append(
            BatchLine(
                service_id=sid,
                service_name=service_name,
                result=result,
                recommended_supplier=recommended,
                margin_status=result.margin_status,
            )
        )

    # 6. Calculate blended margin — NOT average of percentages
    blended_margin_pct = (
        total_margin_pesos / total_brame_price if total_brame_price != 0 else 0.0
    )

    model_name = vehicle_model.name

    return BatchResponse(
        model=BatchModelInfo(id=payload.model_id, name=model_name),
        lines=lines,
        summary=BatchSummary(
            total_bjx_cost=total_bjx_cost,
            total_brame_price=total_brame_price,
            blended_margin_pct=blended_margin_pct,
            blended_margin_pesos=total_margin_pesos,
            ok_count=ok_count,
            low_count=low_count,
            critical_count=critical_count,
            no_data_count=no_data_count,
        ),
    )
