from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.catalog import ServiceCatalog, VehicleModel, Service
from app.models.config import ConfigParam
from app.models.suppliers import SupplierPrice
from app.schemas.dashboard import (
    ConfigUsed,
    DashboardSummary,
    MarginDistribution,
    MarginDistributions,
    ModelProfitability,
    ServiceProfitability,
    SimulateDelta,
    SimulateRequest,
    SimulateResponse,
)
from app.schemas.engine import CalculationInput
from app.security import get_current_user
from app.services.pricing_engine import PricingEngine

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------

_dashboard_cache: dict = {"data": None, "calculated_at": None}
CACHE_TTL_SECONDS = 300  # 5 minutes

engine = PricingEngine()

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

_CONFIG_DEFAULTS = {
    "technician_cost_hr": 156.25,
    "target_margin": 0.40,
}


def _read_config(db: Session) -> dict:
    keys = list(_CONFIG_DEFAULTS.keys())
    params = db.query(ConfigParam).filter(ConfigParam.key.in_(keys)).all()
    result = dict(_CONFIG_DEFAULTS)
    for p in params:
        if p.key in result:
            result[p.key] = float(p.value)
    return result


# ---------------------------------------------------------------------------
# Data loading helpers — 2 queries, rest in memory
# ---------------------------------------------------------------------------


def _load_combos(db: Session) -> list[ServiceCatalog]:
    """Load all current ServiceCatalog entries with active model and service."""
    return (
        db.query(ServiceCatalog)
        .join(VehicleModel, VehicleModel.id == ServiceCatalog.model_id)
        .join(Service, Service.id == ServiceCatalog.service_id)
        .filter(
            ServiceCatalog.is_current.is_(True),
            VehicleModel.active.is_(True),
            VehicleModel.deleted_at.is_(None),
            Service.active.is_(True),
            Service.deleted_at.is_(None),
        )
        .options(
            joinedload(ServiceCatalog.model),
            joinedload(ServiceCatalog.service),
        )
        .all()
    )


def _load_brame_prices(db: Session) -> dict[tuple[str, str], SupplierPrice]:
    """Load all current SupplierPrices. Returns dict keyed by (model_id, service_id)."""
    prices = (
        db.query(SupplierPrice)
        .filter(SupplierPrice.is_current.is_(True))
        .all()
    )
    # Last-write-wins if multiple suppliers are current for the same combo
    index: dict[tuple[str, str], SupplierPrice] = {}
    for p in prices:
        index[(p.model_id, p.service_id)] = p
    return index


# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------


def _compute_summary(
    db: Session,
    technician_cost_hr: Optional[float] = None,
    target_margin: Optional[float] = None,
    brame_price_increase_pct: float = 0.0,
) -> DashboardSummary:
    cfg = _read_config(db)
    tech_cost = technician_cost_hr if technician_cost_hr is not None else cfg["technician_cost_hr"]
    t_margin = target_margin if target_margin is not None else cfg["target_margin"]

    combos = _load_combos(db)
    brame_index = _load_brame_prices(db)

    model_ids: set[str] = set()
    service_ids: set[str] = set()

    total_margin_pesos = 0.0
    total_brame_price = 0.0
    ok_count = 0
    low_count = 0
    critical_count = 0

    for sc in combos:
        model_ids.add(sc.model_id)
        service_ids.add(sc.service_id)

        sp = brame_index.get((sc.model_id, sc.service_id))
        if sp is None:
            # No Brame price — skip from stats
            continue

        brame_total = sp.total_price * (1.0 + brame_price_increase_pct)

        inp = CalculationInput(
            model_id=sc.model_id,
            service_id=sc.service_id,
            technician_cost_hr=tech_cost,
            target_margin=t_margin,
            catalog_labor_cost=sc.bjx_labor_cost,
            catalog_parts_cost=sc.bjx_parts_cost,
            catalog_duration_hrs=sc.duration_hrs,
            brame_ref_actual=sp.ref_cost * (1.0 + brame_price_increase_pct),
            brame_total_actual=brame_total,
        )
        result = engine.calculate(inp)

        total_margin_pesos += result.margin_pesos
        total_brame_price += result.brame_price

        if result.margin_status == "ok":
            ok_count += 1
        elif result.margin_status == "low":
            low_count += 1
        else:
            critical_count += 1

    total_combos = ok_count + low_count + critical_count

    avg_margin_pct = (
        total_margin_pesos / total_brame_price if total_brame_price > 0 else 0.0
    )
    critical_pct = critical_count / total_combos if total_combos > 0 else 0.0

    def _dist(count: int) -> MarginDistribution:
        return MarginDistribution(
            count=count,
            pct=round(count / total_combos, 4) if total_combos > 0 else 0.0,
        )

    return DashboardSummary(
        total_services=len(service_ids),
        total_models=len(model_ids),
        total_combos=total_combos,
        avg_margin_pct=round(avg_margin_pct, 4),
        critical_combos=critical_count,
        low_combos=low_count,
        ok_combos=ok_count,
        critical_pct=round(critical_pct, 4),
        margin_distribution=MarginDistributions(
            ok=_dist(ok_count),
            low=_dist(low_count),
            critical=_dist(critical_count),
        ),
        config_used=ConfigUsed(
            technician_cost_hr=tech_cost,
            target_margin=t_margin,
        ),
        last_calculated=datetime.now(timezone.utc),
    )


def get_cached_summary(db: Session) -> DashboardSummary:
    now = datetime.now(timezone.utc)
    if _dashboard_cache["data"] and _dashboard_cache["calculated_at"]:
        age = (now - _dashboard_cache["calculated_at"]).total_seconds()
        if age < CACHE_TTL_SECONDS:
            return _dashboard_cache["data"]
    result = _compute_summary(db)
    _dashboard_cache["data"] = result
    _dashboard_cache["calculated_at"] = now
    return result


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Resumen global de rentabilidad con cache de 5 minutos."""
    return get_cached_summary(db)


@router.get("/by-model", response_model=list[ModelProfitability])
def get_by_model(
    status: Optional[Literal["critical", "low", "ok"]] = Query(None),
    sort: Optional[Literal["margin_pct_asc", "margin_pct_desc", "model_name", "service_count"]] = Query(None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Rentabilidad agrupada por modelo de vehículo."""
    cfg = _read_config(db)
    tech_cost = cfg["technician_cost_hr"]
    t_margin = cfg["target_margin"]

    combos = _load_combos(db)
    brame_index = _load_brame_prices(db)

    # Group combos by model
    from collections import defaultdict
    model_combos: dict[str, list[ServiceCatalog]] = defaultdict(list)
    for sc in combos:
        model_combos[sc.model_id].append(sc)

    result: list[ModelProfitability] = []

    for model_id, scs in model_combos.items():
        model_obj = scs[0].model

        bjx_costs = []
        brame_prices = []
        margin_pesos_list = []
        margin_pct_list = []
        statuses: list[str] = []
        service_details: list[dict] = []

        for sc in scs:
            sp = brame_index.get((sc.model_id, sc.service_id))
            if sp is None:
                continue

            inp = CalculationInput(
                model_id=sc.model_id,
                service_id=sc.service_id,
                technician_cost_hr=tech_cost,
                target_margin=t_margin,
                catalog_labor_cost=sc.bjx_labor_cost,
                catalog_parts_cost=sc.bjx_parts_cost,
                catalog_duration_hrs=sc.duration_hrs,
                brame_ref_actual=sp.ref_cost,
                brame_total_actual=sp.total_price,
            )
            res = engine.calculate(inp)

            bjx_costs.append(res.total_bjx_cost)
            brame_prices.append(res.brame_price)
            margin_pesos_list.append(res.margin_pesos)
            margin_pct_list.append(res.margin_pct)
            statuses.append(res.margin_status)

            service_details.append(
                {
                    "service_id": sc.service_id,
                    "service_name": sc.service.name if sc.service else "",
                    "margin_pct": round(res.margin_pct, 4),
                    "margin_pesos": round(res.margin_pesos, 2),
                    "margin_status": res.margin_status,
                }
            )

        if not bjx_costs:
            continue

        total_brame = sum(brame_prices)
        total_pesos = sum(margin_pesos_list)
        avg_margin_pct = total_pesos / total_brame if total_brame > 0 else 0.0

        ok_c = statuses.count("ok")
        low_c = statuses.count("low")
        crit_c = statuses.count("critical")

        if avg_margin_pct < 0.30 or total_brame == 0:
            model_status = "critical"
        elif avg_margin_pct < t_margin:
            model_status = "low"
        else:
            model_status = "ok"

        if status and model_status != status:
            continue

        worst_services = sorted(service_details, key=lambda x: x["margin_pct"])[:3]

        result.append(
            ModelProfitability(
                model_id=model_id,
                model_name=model_obj.name if model_obj else model_id,
                service_count=len(bjx_costs),
                avg_bjx_cost=round(sum(bjx_costs) / len(bjx_costs), 2),
                avg_brame_price=round(sum(brame_prices) / len(brame_prices), 2),
                avg_margin_pct=round(avg_margin_pct, 4),
                avg_margin_pesos=round(total_pesos / len(margin_pesos_list), 2),
                critical_count=crit_c,
                low_count=low_c,
                ok_count=ok_c,
                margin_status=model_status,
                worst_services=worst_services,
            )
        )

    # Sorting
    if sort == "margin_pct_asc":
        result.sort(key=lambda x: x.avg_margin_pct)
    elif sort == "margin_pct_desc":
        result.sort(key=lambda x: x.avg_margin_pct, reverse=True)
    elif sort == "model_name":
        result.sort(key=lambda x: x.model_name)
    elif sort == "service_count":
        result.sort(key=lambda x: x.service_count, reverse=True)

    return result


@router.get("/by-service", response_model=list[ServiceProfitability])
def get_by_service(
    category: Optional[Literal["frenos", "motor", "suspension", "electrico", "neumaticos", "otros"]] = Query(None),
    sort: Optional[Literal["margin_pct_asc", "margin_pct_desc", "service_name", "model_count"]] = Query(None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Rentabilidad agrupada por servicio."""
    cfg = _read_config(db)
    tech_cost = cfg["technician_cost_hr"]
    t_margin = cfg["target_margin"]

    combos = _load_combos(db)
    brame_index = _load_brame_prices(db)

    from collections import defaultdict
    service_combos: dict[str, list[ServiceCatalog]] = defaultdict(list)
    for sc in combos:
        service_combos[sc.service_id].append(sc)

    result: list[ServiceProfitability] = []

    for service_id, scs in service_combos.items():
        service_obj = scs[0].service

        if category and (service_obj is None or service_obj.category != category):
            continue

        model_details: list[dict] = []
        brame_prices = []
        margin_pesos_list = []
        statuses: list[str] = []

        for sc in scs:
            sp = brame_index.get((sc.model_id, sc.service_id))
            if sp is None:
                continue

            inp = CalculationInput(
                model_id=sc.model_id,
                service_id=sc.service_id,
                technician_cost_hr=tech_cost,
                target_margin=t_margin,
                catalog_labor_cost=sc.bjx_labor_cost,
                catalog_parts_cost=sc.bjx_parts_cost,
                catalog_duration_hrs=sc.duration_hrs,
                brame_ref_actual=sp.ref_cost,
                brame_total_actual=sp.total_price,
            )
            res = engine.calculate(inp)

            brame_prices.append(res.brame_price)
            margin_pesos_list.append(res.margin_pesos)
            statuses.append(res.margin_status)

            model_details.append(
                {
                    "model_id": sc.model_id,
                    "model_name": sc.model.name if sc.model else sc.model_id,
                    "margin_pct": round(res.margin_pct, 4),
                    "margin_pesos": round(res.margin_pesos, 2),
                    "margin_status": res.margin_status,
                }
            )

        if not model_details:
            continue

        total_brame = sum(brame_prices)
        total_pesos = sum(margin_pesos_list)
        avg_margin_pct = total_pesos / total_brame if total_brame > 0 else 0.0

        critical_model_count = statuses.count("critical")

        sorted_models = sorted(model_details, key=lambda x: x["margin_pct"])
        worst_model = sorted_models[0] if sorted_models else None
        best_model = sorted_models[-1] if sorted_models else None

        result.append(
            ServiceProfitability(
                service_id=service_id,
                service_name=service_obj.name if service_obj else service_id,
                category=service_obj.category if service_obj else "otros",
                model_count=len(model_details),
                critical_model_count=critical_model_count,
                avg_margin_pct=round(avg_margin_pct, 4),
                worst_model=worst_model,
                best_model=best_model,
            )
        )

    # Sorting
    if sort == "margin_pct_asc":
        result.sort(key=lambda x: x.avg_margin_pct)
    elif sort == "margin_pct_desc":
        result.sort(key=lambda x: x.avg_margin_pct, reverse=True)
    elif sort == "service_name":
        result.sort(key=lambda x: x.service_name)
    elif sort == "model_count":
        result.sort(key=lambda x: x.model_count, reverse=True)

    return result


@router.post("/simulate", response_model=SimulateResponse)
def simulate(
    payload: SimulateRequest,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    """Simula un escenario alternativo sin modificar la DB."""
    cfg = _read_config(db)

    tech_cost = payload.technician_cost_hr if payload.technician_cost_hr is not None else cfg["technician_cost_hr"]
    t_margin = payload.target_margin if payload.target_margin is not None else cfg["target_margin"]
    brame_increase = payload.brame_price_increase_pct

    # Compute scenario summary (no DB writes, no cache)
    scenario_summary = _compute_summary(
        db,
        technician_cost_hr=tech_cost,
        target_margin=t_margin,
        brame_price_increase_pct=brame_increase,
    )

    # Get current summary from cache (or compute without scenario params)
    current_summary = get_cached_summary(db)

    delta = SimulateDelta(
        avg_margin_pct_delta=round(
            scenario_summary.avg_margin_pct - current_summary.avg_margin_pct, 4
        ),
        critical_combos_delta=scenario_summary.critical_combos - current_summary.critical_combos,
        ok_combos_delta=scenario_summary.ok_combos - current_summary.ok_combos,
    )

    scenario_dict = {
        "technician_cost_hr": tech_cost,
        "target_margin": t_margin,
        "brame_price_increase_pct": brame_increase,
    }

    return SimulateResponse(
        scenario=scenario_dict,
        summary=scenario_summary,
        delta_vs_current=delta,
    )
