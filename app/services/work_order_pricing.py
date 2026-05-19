"""Pricing recompute for ``WorkOrderLine`` / ``WorkOrder``.

The pure :class:`~app.services.pricing_engine.PricingEngine` calculates a price
from catalog + supplier inputs. This module is the *write* side: persists those
computed values back onto the workshop tables so downstream dashboards
(``/branches/manager-dashboard``, ``/dashboard/branches-comparison``) can report
real margin without recomputing from scratch.

Invocation points (see ``app/routers/workshop.py``):

* ``finish_line`` → ``recompute_line_pricing`` + ``recompute_work_order_totals``.
* ``update_line``, ``create_line`` → ``recompute_line_pricing`` (mecánico,
  service, bay may have changed) + work order totals.
* QA pass (transition ``in_progress``/``quality_check`` → ``completed``) → work
  order totals only; lines should already be priced by then.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog import Service, ServiceCatalog
from app.models.config import ConfigParam
from app.models.suppliers import SupplierPrice
from app.models.work_orders import WorkOrder
from app.models.workshop import WorkOrderLine
from app.schemas.engine import CalculationInput
from app.services.pricing_engine import PricingEngine


_DEFAULT_TECHNICIAN_COST_HR = 156.25
_DEFAULT_TARGET_MARGIN = 0.40
_DEFAULT_LINE_DURATION_HRS = 1.0

_engine = PricingEngine()


def _q2(value: float) -> Decimal:
    """Quantize to 2 decimals — currency."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _q4(value: float) -> Decimal:
    """Quantize to 4 decimals — percentage."""
    return Decimal(str(value)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _read_config_float(db: Session, key: str, default: float) -> float:
    row = db.query(ConfigParam).filter(ConfigParam.key == key).first()
    if row is None:
        return default
    try:
        return float(row.value)
    except (TypeError, ValueError):
        return default


def _resolve_catalog(
    db: Session, model_id: str, service_id: str
) -> Optional[ServiceCatalog]:
    return (
        db.query(ServiceCatalog)
        .filter(
            ServiceCatalog.model_id == model_id,
            ServiceCatalog.service_id == service_id,
            ServiceCatalog.is_current.is_(True),
        )
        .first()
    )


def _resolve_supplier_price(
    db: Session, model_id: str, service_id: str
) -> Optional[SupplierPrice]:
    return (
        db.query(SupplierPrice)
        .filter(
            SupplierPrice.model_id == model_id,
            SupplierPrice.service_id == service_id,
            SupplierPrice.is_current.is_(True),
        )
        .first()
    )


def recompute_line_pricing(db: Session, line: WorkOrderLine) -> WorkOrderLine:
    """Compute and persist unit/total price + cost + margin on a line.

    Lookup chain:

    1. Resolve the parent ``WorkOrder`` to get ``model_id``.
    2. Read current ``ServiceCatalog`` row (labor cost, parts cost, duration).
    3. Read current ``SupplierPrice`` row (Brame price for the combo).
    4. Read ``technician_cost_hr`` + ``target_margin`` from ``config_params``.
    5. Delegate calculation to :class:`PricingEngine` (pure).
    6. Persist results (uses ``quantity = 1`` per line — multi-quantity is not
       modeled on ``WorkOrderLine`` today).

    If no Brame price exists we still emit a best-effort estimate using the
    suggested price as the customer price (``data_source = "estimated"``).
    """
    wo = (
        db.query(WorkOrder)
        .filter(WorkOrder.id == line.work_order_id)
        .first()
    )
    if wo is None:
        return line

    catalog = _resolve_catalog(db, wo.model_id, line.service_id)
    supplier = _resolve_supplier_price(db, wo.model_id, line.service_id)

    duration_hrs = (
        line.standard_duration_hrs
        if line.standard_duration_hrs is not None
        else (catalog.duration_hrs if catalog is not None else _DEFAULT_LINE_DURATION_HRS)
    )

    technician_cost_hr = _read_config_float(
        db, "technician_cost_hr", _DEFAULT_TECHNICIAN_COST_HR
    )
    target_margin = _read_config_float(db, "target_margin", _DEFAULT_TARGET_MARGIN)

    catalog_labor = catalog.bjx_labor_cost if catalog is not None else None
    catalog_parts = catalog.bjx_parts_cost if catalog is not None else None
    brame_ref = float(supplier.ref_cost) if supplier is not None else 0.0
    brame_total = float(supplier.total_price) if supplier is not None else 0.0

    inp = CalculationInput(
        model_id=wo.model_id,
        service_id=line.service_id,
        technician_cost_hr=technician_cost_hr,
        target_margin=target_margin,
        catalog_labor_cost=catalog_labor,
        catalog_parts_cost=catalog_parts,
        catalog_duration_hrs=duration_hrs,
        brame_ref_actual=brame_ref,
        brame_total_actual=brame_total,
    )
    result = _engine.calculate(inp)

    # Fallback: si no hay precio Brame, usamos el sugerido (cost / (1 - target))
    if result.brame_price <= 0:
        unit_price = (
            result.suggested_price
            if result.suggested_price != float("inf")
            else result.total_bjx_cost
        )
        margin_pesos = unit_price - result.total_bjx_cost
        margin_pct = (margin_pesos / unit_price) if unit_price > 0 else 0.0
    else:
        unit_price = result.brame_price
        margin_pct = result.margin_pct

    unit_cost = result.total_bjx_cost
    # Lines are 1:1 (no qty column today). Total = unit.
    total_price = unit_price
    total_cost = unit_cost

    line.unit_price_mxn = _q2(unit_price)
    line.unit_cost_mxn = _q2(unit_cost)
    line.total_price_mxn = _q2(total_price)
    line.total_cost_mxn = _q2(total_cost)
    line.margin_pct = _q4(margin_pct)

    return line


def recompute_work_order_totals(db: Session, wo: WorkOrder) -> WorkOrder:
    """Aggregate priced lines into the parent OS totals.

    Sums every non-cancelled line with both ``total_price_mxn`` and
    ``total_cost_mxn`` populated and persists ``total_amount`` / ``cost_total``
    / ``margin_pct`` on the ``WorkOrder``. If no line has pricing the OS keeps
    its previous values (or NULL).
    """
    from app.models.workshop import WorkOrderLineStatus

    lines = (
        db.query(WorkOrderLine)
        .filter(
            WorkOrderLine.work_order_id == wo.id,
            WorkOrderLine.deleted_at.is_(None),
            WorkOrderLine.status != WorkOrderLineStatus.cancelled.value,
        )
        .all()
    )

    total_price_sum = Decimal("0")
    total_cost_sum = Decimal("0")
    counted = 0
    for ln in lines:
        if ln.total_price_mxn is None or ln.total_cost_mxn is None:
            continue
        total_price_sum += Decimal(str(ln.total_price_mxn))
        total_cost_sum += Decimal(str(ln.total_cost_mxn))
        counted += 1

    if counted == 0:
        return wo

    wo.total_amount = total_price_sum.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    wo.cost_total = total_cost_sum.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if total_price_sum > 0:
        margin_pct = (total_price_sum - total_cost_sum) / total_price_sum
        wo.margin_pct = margin_pct.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    else:
        wo.margin_pct = Decimal("0.0000")

    return wo
