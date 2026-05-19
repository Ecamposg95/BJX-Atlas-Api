"""Tests for /api/dashboard/branches-comparison — Ola 4 Executive multi-branch KPIs."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.catalog import Service, ServiceCatalog, VehicleModel
from app.models.organizations import Branch, Organization
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder
from app.routers.dashboard import invalidate_branch_comparison_cache
from app.security import hash_password


@pytest.fixture(autouse=True)
def clear_cache():
    invalidate_branch_comparison_cache()
    yield
    invalidate_branch_comparison_cache()


@pytest.fixture
def director_token(client, db, default_branch_id):
    user = User(
        email="director@test.com",
        hashed_password=hash_password("Director1234"),
        role=Role.director.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post(
        "/api/auth/login",
        json={"email": "director@test.com", "password": "Director1234"},
    )
    return r.json()["access_token"]


@pytest.fixture
def two_branches(db):
    """default branch (BJX-MAIN) + nueva sucursal BJX-LEON."""
    org = db.query(Organization).first()
    extra = Branch(
        organization_id=org.id,
        code="BJX-LEON",
        name="BJX Motors — León",
        city="León",
        state="Guanajuato",
        timezone="America/Mexico_City",
        active=True,
    )
    db.add(extra)
    db.commit()
    return db.query(Branch).order_by(Branch.code).all()


def _make_catalog(db, labor: float = 800.0, parts: float = 1200.0):
    model = VehicleModel(name="TestModel", active=True)
    service = Service(name="TestService", category="motor", active=True)
    db.add_all([model, service])
    db.commit()
    sc = ServiceCatalog(
        model_id=model.id,
        service_id=service.id,
        bjx_labor_cost=labor,
        bjx_parts_cost=parts,
        duration_hrs=2.0,
        is_current=True,
    )
    db.add(sc)
    db.commit()
    return model, service


def _seed_wo(
    db,
    branch_id: str,
    model_id: str,
    service_id: str,
    *,
    created_offset_hrs: float,
    finished_offset_hrs: float | None = None,
    promised_offset_hrs: float | None = None,
    status_value: str = "completed",
    order_number: str = "WO-1",
):
    vehicle = Vehicle(customer_name="Cliente", plates=order_number[-6:], year=2020)
    db.add(vehicle)
    db.commit()

    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        order_number=order_number,
        vehicle_id=vehicle.id,
        model_id=model_id,
        service_id=service_id,
        status=status_value,
        type="walk_in",
        priority="normal",
        received_at=now - timedelta(hours=created_offset_hrs),
        promised_at=(now - timedelta(hours=promised_offset_hrs)) if promised_offset_hrs is not None else None,
        work_finished_at=(now - timedelta(hours=finished_offset_hrs)) if finished_offset_hrs is not None else None,
        branch_id=branch_id,
    )
    wo.created_at = now - timedelta(hours=created_offset_hrs)
    db.add(wo)
    db.commit()
    return wo


def test_requires_auth(client):
    r = client.get("/api/dashboard/branches-comparison")
    assert r.status_code == 401


def test_forbidden_for_viewer(client, viewer_token, two_branches):
    r = client.get(
        "/api/dashboard/branches-comparison",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert r.status_code == 403


def test_forbidden_for_operador(client, operador_token, two_branches):
    r = client.get(
        "/api/dashboard/branches-comparison",
        headers={"Authorization": f"Bearer {operador_token}"},
    )
    assert r.status_code == 403


def test_director_can_read(client, director_token, two_branches):
    r = client.get(
        "/api/dashboard/branches-comparison",
        headers={"Authorization": f"Bearer {director_token}"},
    )
    assert r.status_code == 200
    payload = r.json()
    assert payload["period_days"] == 30
    assert isinstance(payload["rows"], list)
    assert len(payload["rows"]) == 2
    codes = {row["branch_code"] for row in payload["rows"]}
    assert codes == {"BJX-MAIN", "BJX-LEON"}


def test_admin_returns_kpis_per_branch(client, admin_token, db, two_branches):
    branches = two_branches
    main = next(b for b in branches if b.code == "BJX-MAIN")
    leon = next(b for b in branches if b.code == "BJX-LEON")

    model, service = _make_catalog(db, labor=500.0, parts=1500.0)

    # MAIN: 2 completadas (cycle 5h y 9h, una on-time, una late) + 1 abierta
    _seed_wo(
        db, main.id, model.id, service.id,
        created_offset_hrs=10, finished_offset_hrs=5, promised_offset_hrs=4,
        status_value="completed", order_number="WO-M-1",
    )
    _seed_wo(
        db, main.id, model.id, service.id,
        created_offset_hrs=15, finished_offset_hrs=6, promised_offset_hrs=10,
        status_value="completed", order_number="WO-M-2",
    )
    _seed_wo(
        db, main.id, model.id, service.id,
        created_offset_hrs=20, finished_offset_hrs=None, promised_offset_hrs=None,
        status_value="in_progress", order_number="WO-M-3",
    )

    # LEON: 1 completada
    _seed_wo(
        db, leon.id, model.id, service.id,
        created_offset_hrs=12, finished_offset_hrs=4, promised_offset_hrs=8,
        status_value="completed", order_number="WO-L-1",
    )

    invalidate_branch_comparison_cache()

    r = client.get(
        "/api/dashboard/branches-comparison",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200, r.text
    rows = {row["branch_code"]: row for row in r.json()["rows"]}

    main_row = rows["BJX-MAIN"]
    assert main_row["completed_count"] == 2
    assert main_row["open_count"] == 1
    assert main_row["cycle_time_avg_hrs"] > 0
    assert main_row["cycle_time_p95_hrs"] >= main_row["cycle_time_avg_hrs"]
    assert 0.0 <= main_row["on_time_pct"] <= 1.0
    # revenue_period = 2 OS * (500 + 1500) = 4000
    assert main_row["revenue_period"] == pytest.approx(4000.0, rel=0.01)
    # margin_pct_avg TODO — sigue siendo None
    assert main_row["margin_pct_avg"] is None

    leon_row = rows["BJX-LEON"]
    assert leon_row["completed_count"] == 1
    assert leon_row["open_count"] == 0
    assert leon_row["revenue_period"] == pytest.approx(2000.0, rel=0.01)


def test_period_days_param(client, admin_token, two_branches):
    r = client.get(
        "/api/dashboard/branches-comparison?days=7",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    assert r.json()["period_days"] == 7


def test_invalid_days_param(client, admin_token, two_branches):
    r = client.get(
        "/api/dashboard/branches-comparison?days=0",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 422
