"""Integration tests for /dashboard endpoints."""
from __future__ import annotations

import pytest

from app.models.users import User, Role
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.suppliers import Supplier, SupplierPrice
from app.models.config import ConfigParam
from app.routers.dashboard import invalidate_cache
from app.security import hash_password


@pytest.fixture(autouse=True)
def clear_dashboard_cache():
    """Clear the module-level dashboard cache before every test."""
    invalidate_cache()
    yield
    invalidate_cache()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_user(db):
    user = User(
        email="admin@test.com",
        hashed_password=hash_password("Admin1234"),
        role=Role.admin,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "Admin1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def full_setup(db):
    """Crea modelo, servicio, catálogo, proveedor y precio para tests completos."""
    model = VehicleModel(name="NISSAN MARCH", brand="NISSAN", active=True)
    service = Service(name="CAMBIO DE ACEITE", category="motor", active=True)
    db.add_all([model, service])
    db.commit()

    catalog = ServiceCatalog(
        model_id=model.id,
        service_id=service.id,
        bjx_labor_cost=200.0,
        bjx_parts_cost=300.0,
        duration_hrs=1.5,
        source="test",
        is_current=True,
    )
    supplier = Supplier(name="BRAME", lead_time_days=2, warranty_days=30, active=True)
    db.add_all([catalog, supplier])
    db.commit()

    price = SupplierPrice(
        supplier_id=supplier.id,
        model_id=model.id,
        service_id=service.id,
        ref_cost=300.0,
        labor_cost=0.0,
        total_price=650.0,
        is_current=True,
    )
    config1 = ConfigParam(key="technician_cost_hr", value="156.25", description="test")
    config2 = ConfigParam(key="target_margin", value="0.40", description="test")
    config3 = ConfigParam(key="scoring_weight_price", value="0.50", description="test")
    config4 = ConfigParam(key="scoring_weight_time", value="0.30", description="test")
    config5 = ConfigParam(key="scoring_weight_tc", value="0.20", description="test")
    db.add_all([price, config1, config2, config3, config4, config5])
    db.commit()

    return {
        "model": model,
        "service": service,
        "catalog": catalog,
        "supplier": supplier,
        "price": price,
    }


# ---------------------------------------------------------------------------
# TestDashboardSummary
# ---------------------------------------------------------------------------


class TestDashboardSummary:
    def test_summary_empty_db(self, client, admin_headers):
        r = client.get("/api/dashboard/summary", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_combos"] == 0

    def test_summary_with_data(self, client, admin_headers, full_setup):
        r = client.get("/api/dashboard/summary", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()

        assert data["total_combos"] == 1
        assert data["avg_margin_pct"] != 0.0

        # margin_distribution has ok / low / critical keys
        dist = data["margin_distribution"]
        assert "ok" in dist
        assert "low" in dist
        assert "critical" in dist

        # config_used has the expected keys
        cfg = data["config_used"]
        assert "technician_cost_hr" in cfg
        assert "target_margin" in cfg

    def test_summary_no_auth(self, client):
        r = client.get("/api/dashboard/summary")
        assert r.status_code == 401

    def test_summary_weighted_margin(self, client, admin_headers, full_setup):
        """
        With 1 combo: bjx_total=500, brame_price=650.
        margin_pesos = 650 - 500 = 150  (approximately, depending on engine calc)
        avg_margin_pct = 150 / 650 ≈ 0.23
        The API uses weighted average (sum margin_pesos / sum brame_price), not simple avg.
        """
        r = client.get("/api/dashboard/summary", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        # With 1 combo the weighted and simple averages are the same.
        # margin = (brame - bjx) / brame = (650 - 500) / 650 ≈ 0.2308
        avg = data["avg_margin_pct"]
        assert 0.20 <= avg <= 0.30, f"Expected avg_margin_pct ~0.23, got {avg}"


# ---------------------------------------------------------------------------
# TestDashboardByModel
# ---------------------------------------------------------------------------


class TestDashboardByModel:
    def test_by_model_with_data(self, client, admin_headers, full_setup):
        r = client.get("/api/dashboard/by-model", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data) >= 1

        item = data[0]
        assert "model_id" in item
        assert "avg_margin_pct" in item
        assert "worst_services" in item

    def test_by_model_filter_critical(self, client, admin_headers, full_setup):
        """With ~23% margin the model should be 'low', not 'critical' (threshold=30%)."""
        r = client.get("/api/dashboard/by-model?status=critical", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for item in data:
            assert item["margin_status"] == "critical"


# ---------------------------------------------------------------------------
# TestDashboardByService
# ---------------------------------------------------------------------------


class TestDashboardByService:
    def test_by_service_with_data(self, client, admin_headers, full_setup):
        r = client.get("/api/dashboard/by-service", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data) >= 1

        item = data[0]
        assert "service_id" in item
        assert "avg_margin_pct" in item

    def test_by_service_filter_category(self, client, admin_headers, full_setup):
        r = client.get("/api/dashboard/by-service?category=motor", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # We created one service with category=motor; it must appear
        assert len(data) >= 1
        for item in data:
            assert item["category"] == "motor"


# ---------------------------------------------------------------------------
# TestDashboardSimulate
# ---------------------------------------------------------------------------


class TestDashboardSimulate:
    def test_simulate_higher_brame_price(self, client, admin_headers, full_setup):
        r = client.post(
            "/api/dashboard/simulate",
            json={"brame_price_increase_pct": 0.10},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()

        # Higher brame price → bigger numerator → better margin
        assert data["delta_vs_current"]["avg_margin_pct_delta"] > 0

    def test_simulate_lower_tech_cost(self, client, admin_headers, full_setup):
        r = client.post(
            "/api/dashboard/simulate",
            json={"technician_cost_hr": 100.0},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()

        # Lower tech cost → lower bjx_cost → better margin
        scenario_margin = data["summary"]["avg_margin_pct"]
        current_margin = data["summary"]["avg_margin_pct"] - data["delta_vs_current"]["avg_margin_pct_delta"]
        assert scenario_margin >= current_margin

    def test_simulate_no_db_changes(self, client, admin_headers, full_setup, db):
        # Fetch config before simulate
        before = {p.key: p.value for p in db.query(ConfigParam).all()}

        client.post(
            "/api/dashboard/simulate",
            json={"technician_cost_hr": 999.0, "target_margin": 0.99},
            headers=admin_headers,
        )

        # Fetch config after simulate — must be unchanged
        after = {p.key: p.value for p in db.query(ConfigParam).all()}
        assert before == after, "simulate should not modify config_params in DB"
