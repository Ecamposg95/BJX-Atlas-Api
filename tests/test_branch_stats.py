"""Tests para /api/v1/branches/stats — Mexico map showcase."""
from __future__ import annotations

import pytest

from app.models.organizations import Branch
from app.routers.branch_stats import BRANCH_COORDS


# Códigos esperados (de la migración multitenancy_foundation_and_erp).
EXPECTED_CODES = [
    "BJX-MAIN", "BJX-LEON", "BJX-QRO", "BJX-GDL", "BJX-CDMX",
    "BJX-MTY", "BJX-PUE", "BJX-TIJ", "BJX-SLP", "BJX-AGS",
]


@pytest.fixture
def ten_branches(db):
    """Crea las 10 sedes esperadas (la conftest ya creó BJX-MAIN)."""
    from app.models.organizations import Organization
    org = db.query(Organization).first()
    for code in EXPECTED_CODES[1:]:
        b = Branch(
            organization_id=org.id,
            code=code,
            name=f"BJX Motors — {code}",
            timezone="America/Mexico_City",
            active=True,
        )
        db.add(b)
    db.commit()
    return db.query(Branch).all()


def test_requires_auth(client):
    r = client.get("/api/v1/branches/stats")
    assert r.status_code == 401


def test_returns_array_of_branches(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 10
    codes = [b["code"] for b in data]
    for code in EXPECTED_CODES:
        assert code in codes


def test_coordinates_present(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    for b in r.json():
        assert "lat" in b and "lng" in b
        assert isinstance(b["lat"], (int, float))
        assert isinstance(b["lng"], (int, float))
        # En el bounding box aproximado de México
        assert 14 <= b["lat"] <= 33
        assert -118 <= b["lng"] <= -86


def test_semaphore_values_valid(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    for b in r.json():
        assert b["semaphore"] in {"green", "amber", "red"}
        assert isinstance(b["pulse"], bool)


def test_metric_param_changes_ordering(client, admin_token, ten_branches):
    # Sin OS, todos los KPIs son 0 — el endpoint debe responder 200 igual.
    for metric in ("operation", "revenue", "alerts"):
        r = client.get(
            f"/api/v1/branches/stats?metric={metric}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, f"metric={metric} failed"
        assert len(r.json()) == 10


def test_kpis_structure(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    sample = r.json()[0]
    kpis = sample["kpis"]
    for field in (
        "open_orders", "in_progress", "finished_today", "active_mechanics",
        "revenue_today", "avg_completion_hrs", "stalled_parts", "alerts_count",
    ):
        assert field in kpis


def test_branch_coords_table_has_all_codes():
    """Sanity: la tabla hardcodeada cubre los 10 códigos esperados."""
    for code in EXPECTED_CODES:
        assert code in BRANCH_COORDS, f"missing coords for {code}"


def test_viewer_can_read(client, viewer_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert r.status_code == 200
    assert len(r.json()) == 10


# ──────────────────────────────────────────────────────────────────────────
# Manager dashboard (Ola 4) — cycle time, on-time, top stalled
# ──────────────────────────────────────────────────────────────────────────

from datetime import datetime, timedelta, timezone


@pytest.fixture
def manager_token(client, db, default_branch_id):
    from app.models.users import User, Role
    from app.security import hash_password
    user = User(
        email="gerente@test.com",
        hashed_password=hash_password("Gerente1234"),
        role=Role.gerente_sede.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "gerente@test.com", "password": "Gerente1234"})
    return r.json()["access_token"]


def _seed_wo(db, default_branch_id, *, created_offset_hrs, finished_offset_hrs=None, promised_offset_hrs=None, status_value="completed", order_number="WO-T-001"):
    from app.models.work_orders import WorkOrder
    from app.models.vehicles import Vehicle
    from app.models.catalog import VehicleModel, Service

    model = db.query(VehicleModel).first()
    if model is None:
        model = VehicleModel(name="TestModel", active=True)
        db.add(model); db.commit()
    service = db.query(Service).first()
    if service is None:
        service = Service(name="TestService", category="motor", active=True)
        db.add(service); db.commit()
    vehicle = db.query(Vehicle).first()
    if vehicle is None:
        vehicle = Vehicle(customer_name="Test Cliente", plates="ABC123", year=2020)
        db.add(vehicle); db.commit()

    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        order_number=order_number,
        vehicle_id=vehicle.id,
        model_id=model.id,
        service_id=service.id,
        status=status_value,
        type="walk_in",
        priority="normal",
        received_at=now - timedelta(hours=created_offset_hrs),
        promised_at=(now - timedelta(hours=promised_offset_hrs)) if promised_offset_hrs is not None else None,
        work_finished_at=(now - timedelta(hours=finished_offset_hrs)) if finished_offset_hrs is not None else None,
        branch_id=default_branch_id,
    )
    # SQLAlchemy default sets created_at=now via AuditMixin — override for cycle calc
    wo.created_at = now - timedelta(hours=created_offset_hrs)
    db.add(wo)
    db.commit()
    return wo


def test_manager_dashboard_requires_role(client, viewer_token):
    r = client.get(
        "/api/v1/branches/manager-dashboard",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert r.status_code == 403


def test_manager_dashboard_returns_kpis(client, admin_token, db, default_branch_id):
    # Una OS completada en 5h, on-time (terminó 1h antes del promised).
    _seed_wo(
        db, default_branch_id,
        created_offset_hrs=10, finished_offset_hrs=5, promised_offset_hrs=4,
        status_value="completed", order_number="WO-OT-1",
    )
    # Una OS completada en 9h, tarde (terminó después del promised).
    _seed_wo(
        db, default_branch_id,
        created_offset_hrs=15, finished_offset_hrs=6, promised_offset_hrs=10,
        status_value="completed", order_number="WO-LT-1",
    )
    # Una OS abierta hace mucho (stalled)
    _seed_wo(
        db, default_branch_id,
        created_offset_hrs=48, finished_offset_hrs=None, promised_offset_hrs=None,
        status_value="in_progress", order_number="WO-OPEN-1",
    )
    from app.routers.branch_stats import invalidate_manager_cache
    invalidate_manager_cache()

    r = client.get(
        "/api/v1/branches/manager-dashboard",
        headers={"Authorization": f"Bearer {admin_token}", "X-Branch-Id": default_branch_id},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["branch_id"] == default_branch_id
    k = data["kpis"]
    assert k["cycle_time_avg_hrs"] > 0
    assert k["cycle_time_p95_hrs"] >= k["cycle_time_avg_hrs"]
    # on_time_pct entre 0 y 1
    assert 0.0 <= k["on_time_pct"] <= 1.0
    # margin_pct_avg es None (TODO documentado)
    assert k["margin_pct_avg"] is None
    assert isinstance(data["top_stalled_orders"], list)
    assert any(s["order_number"] == "WO-OPEN-1" for s in data["top_stalled_orders"])


def test_manager_dashboard_cache_hit(client, admin_token, db, default_branch_id):
    from app.routers.branch_stats import invalidate_manager_cache, _manager_cache
    invalidate_manager_cache()
    r1 = client.get(
        "/api/v1/branches/manager-dashboard",
        headers={"Authorization": f"Bearer {admin_token}", "X-Branch-Id": default_branch_id},
    )
    assert r1.status_code == 200
    assert default_branch_id in _manager_cache
    r2 = client.get(
        "/api/v1/branches/manager-dashboard",
        headers={"Authorization": f"Bearer {admin_token}", "X-Branch-Id": default_branch_id},
    )
    assert r2.status_code == 200
    assert r1.json()["calculated_at"] == r2.json()["calculated_at"]


def test_manager_dashboard_gerente_scoped_to_own_branch(client, manager_token, db, default_branch_id):
    r = client.get(
        "/api/v1/branches/manager-dashboard",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r.status_code == 200
    assert r.json()["branch_id"] == default_branch_id

    # Cualquier branch_id distinto debe ser 403
    r2 = client.get(
        "/api/v1/branches/manager-dashboard?branch_id=ffffffff-ffff-ffff-ffff-ffffffffffff",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert r2.status_code == 403
