"""Tests for WorkOrder/WorkOrderLine pricing recompute (Wave 4 close).

Cubre:
  * Crear OS con 2 líneas y cerrarlas → unit/total price+cost y margin_pct se
    pueblan en las líneas y en el WorkOrder.
  * Manager dashboard expone ``margin_pct_avg`` numérico (no null) tras cerrar
    una OS con pricing real.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models.catalog import Service, ServiceCatalog, VehicleModel
from app.models.config import ConfigParam
from app.models.suppliers import Supplier, SupplierPrice
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.security import hash_password
from app.services.work_order_pricing import (
    recompute_line_pricing,
    recompute_work_order_totals,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def priced_catalog(db, default_branch_id):
    """Catalog combo + supplier price con cifras conocidas.

    PricingEngine:
      labor=200, parts=500 → bjx_cost=700
      brame_total=1400 → margin = (1400-700)/1400 = 0.5
    """
    model = VehicleModel(name="MarchPricing", brand="Nissan", active=True)
    service_a = Service(name="FrenosPricing", category="frenos", active=True)
    service_b = Service(name="AceitePricing", category="motor", active=True)
    db.add_all([model, service_a, service_b])
    db.commit()

    sc_a = ServiceCatalog(
        model_id=model.id,
        service_id=service_a.id,
        bjx_labor_cost=200.0,
        bjx_parts_cost=500.0,
        duration_hrs=1.5,
        is_current=True,
    )
    sc_b = ServiceCatalog(
        model_id=model.id,
        service_id=service_b.id,
        bjx_labor_cost=150.0,
        bjx_parts_cost=350.0,
        duration_hrs=1.0,
        is_current=True,
    )
    db.add_all([sc_a, sc_b])

    supplier = Supplier(
        branch_id=default_branch_id,
        name="DAPESA-pricing",
        lead_time_days=1,
        warranty_days=90,
        active=True,
    )
    db.add(supplier)
    db.commit()

    sp_a = SupplierPrice(
        supplier_id=supplier.id,
        model_id=model.id,
        service_id=service_a.id,
        ref_cost=500.0,
        labor_cost=0.0,
        total_price=1400.0,
        is_current=True,
    )
    sp_b = SupplierPrice(
        supplier_id=supplier.id,
        model_id=model.id,
        service_id=service_b.id,
        ref_cost=350.0,
        labor_cost=0.0,
        total_price=1000.0,
        is_current=True,
    )
    db.add_all([sp_a, sp_b])
    db.commit()

    return {"model": model, "service_a": service_a, "service_b": service_b}


@pytest.fixture
def open_work_order(db, default_branch_id, priced_catalog):
    """OS in_progress lista para cerrarse con QA-pass."""
    vehicle = Vehicle(
        branch_id=default_branch_id,
        customer_name="Pricing Cliente",
        plates="PRC-001",
        active=True,
    )
    db.add(vehicle)
    db.commit()

    wo = WorkOrder(
        branch_id=default_branch_id,
        order_number="WO-PRC-001",
        vehicle_id=vehicle.id,
        model_id=priced_catalog["model"].id,
        service_id=priced_catalog["service_a"].id,
        status=WorkOrderStatus.in_progress.value,
        received_at=datetime.now(timezone.utc),
        work_started_at=datetime.now(timezone.utc),
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo


@pytest.fixture
def jefe_headers(client, db, default_branch_id):
    user = User(
        email="jefe-prc@test.com",
        hashed_password=hash_password("Jefe1234"),
        role=Role.jefe_taller.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "jefe-prc@test.com", "password": "Jefe1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Unit tests for the helper
# ---------------------------------------------------------------------------

def test_recompute_line_pricing_populates_columns(db, default_branch_id, priced_catalog, open_work_order):
    line = WorkOrderLine(
        branch_id=default_branch_id,
        work_order_id=open_work_order.id,
        service_id=priced_catalog["service_a"].id,
        status=WorkOrderLineStatus.pending.value,
    )
    db.add(line)
    db.commit()

    recompute_line_pricing(db, line)
    db.commit()
    db.refresh(line)

    assert line.unit_price_mxn is not None
    assert line.unit_cost_mxn is not None
    assert line.total_price_mxn is not None
    assert line.total_cost_mxn is not None
    assert line.margin_pct is not None
    # brame_total=1400, bjx_cost=700 → margin=0.5
    assert float(line.unit_price_mxn) == pytest.approx(1400.0, rel=1e-3)
    assert float(line.unit_cost_mxn) == pytest.approx(700.0, rel=1e-3)
    assert float(line.margin_pct) == pytest.approx(0.5, abs=1e-3)


def test_recompute_work_order_totals_sums_lines(db, default_branch_id, priced_catalog, open_work_order):
    line_a = WorkOrderLine(
        branch_id=default_branch_id,
        work_order_id=open_work_order.id,
        service_id=priced_catalog["service_a"].id,
        status=WorkOrderLineStatus.completed.value,
    )
    line_b = WorkOrderLine(
        branch_id=default_branch_id,
        work_order_id=open_work_order.id,
        service_id=priced_catalog["service_b"].id,
        status=WorkOrderLineStatus.completed.value,
    )
    db.add_all([line_a, line_b])
    db.commit()

    recompute_line_pricing(db, line_a)
    recompute_line_pricing(db, line_b)
    recompute_work_order_totals(db, open_work_order)
    db.commit()
    db.refresh(open_work_order)

    # A: price=1400 cost=700 ; B: price=1000 cost=500
    assert float(open_work_order.total_amount) == pytest.approx(2400.0, rel=1e-3)
    assert float(open_work_order.cost_total) == pytest.approx(1200.0, rel=1e-3)
    assert float(open_work_order.margin_pct) == pytest.approx(0.5, abs=1e-3)


# ---------------------------------------------------------------------------
# End-to-end: lines + close OS via workshop API
# ---------------------------------------------------------------------------

def test_create_and_finish_lines_via_api_populates_pricing(
    client, jefe_headers, db, default_branch_id, priced_catalog, open_work_order
):
    # Crear 2 líneas vía API
    body_a = {"service_id": priced_catalog["service_a"].id}
    body_b = {"service_id": priced_catalog["service_b"].id}

    r1 = client.post(
        f"/api/workshop/work-orders/{open_work_order.id}/lines",
        json=body_a,
        headers=jefe_headers,
    )
    assert r1.status_code == 201, r1.text
    r2 = client.post(
        f"/api/workshop/work-orders/{open_work_order.id}/lines",
        json=body_b,
        headers=jefe_headers,
    )
    assert r2.status_code == 201, r2.text

    line_a_id = r1.json()["id"]
    line_b_id = r2.json()["id"]

    # Después de crear ya deben tener pricing en líneas
    line_a = db.query(WorkOrderLine).filter(WorkOrderLine.id == line_a_id).first()
    line_b = db.query(WorkOrderLine).filter(WorkOrderLine.id == line_b_id).first()
    assert line_a.unit_price_mxn is not None
    assert line_b.unit_price_mxn is not None

    # WO también debe tener totales (create_line llama recompute_work_order_totals)
    db.expire_all()
    wo = db.query(WorkOrder).filter(WorkOrder.id == open_work_order.id).first()
    assert wo.total_amount is not None
    assert float(wo.total_amount) == pytest.approx(2400.0, rel=1e-3)
    assert wo.margin_pct is not None
    assert float(wo.margin_pct) == pytest.approx(0.5, abs=1e-3)

    # QA-pass cierra la OS y vuelve a disparar recompute_work_order_totals
    r_qa = client.post(
        f"/api/workshop/work-orders/{open_work_order.id}/qa-pass",
        headers=jefe_headers,
    )
    assert r_qa.status_code == 200, r_qa.text
    assert r_qa.json()["status"] == "completed"

    db.expire_all()
    wo = db.query(WorkOrder).filter(WorkOrder.id == open_work_order.id).first()
    assert wo.total_amount is not None
    assert float(wo.total_amount) == pytest.approx(2400.0, rel=1e-3)


# ---------------------------------------------------------------------------
# Manager dashboard: margin_pct_avg deja de ser None tras cierre
# ---------------------------------------------------------------------------

def test_manager_dashboard_margin_pct_avg_numeric_after_close(
    client, admin_token, db, default_branch_id, priced_catalog, open_work_order
):
    # Asignar finished_at dentro de ventana y poblar pricing
    from app.routers.branch_stats import invalidate_manager_cache

    now = datetime.now(timezone.utc)
    line = WorkOrderLine(
        branch_id=default_branch_id,
        work_order_id=open_work_order.id,
        service_id=priced_catalog["service_a"].id,
        status=WorkOrderLineStatus.completed.value,
        finished_at=now,
    )
    db.add(line)
    db.commit()
    recompute_line_pricing(db, line)
    recompute_work_order_totals(db, open_work_order)
    open_work_order.work_finished_at = now
    db.commit()

    invalidate_manager_cache()

    r = client.get(
        "/api/v1/branches/manager-dashboard",
        headers={
            "Authorization": f"Bearer {admin_token}",
            "X-Branch-Id": default_branch_id,
        },
    )
    assert r.status_code == 200, r.text
    kpis = r.json()["kpis"]
    assert kpis["margin_pct_avg"] is not None
    assert kpis["margin_pct_avg"] == pytest.approx(0.5, abs=1e-3)
