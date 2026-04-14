"""Integration tests for /quotes endpoints."""
from __future__ import annotations

import re
import pytest

from app.models.users import User, Role
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.suppliers import Supplier, SupplierPrice
from app.models.config import ConfigParam
from app.security import hash_password


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
def operador_headers(client, db):
    user = User(
        email="op@test.com",
        hashed_password=hash_password("Operador1234"),
        role=Role.operador,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "op@test.com", "password": "Operador1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def viewer_headers(client, db):
    user = User(
        email="viewer@test.com",
        hashed_password=hash_password("Viewer1234"),
        role=Role.viewer,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "viewer@test.com", "password": "Viewer1234"})
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
# Helpers
# ---------------------------------------------------------------------------

def _create_quote(client, headers, full_setup):
    model_id = full_setup["model"].id
    service_id = full_setup["service"].id
    r = client.post(
        "/api/quotes",
        json={"model_id": model_id, "service_ids": [service_id]},
        headers=headers,
    )
    return r


def _confirm_quote(client, headers, quote_id):
    return client.put(
        f"/api/quotes/{quote_id}",
        json={"status": "confirmed"},
        headers=headers,
    )


# ---------------------------------------------------------------------------
# TestCreateQuote
# ---------------------------------------------------------------------------


class TestCreateQuote:
    def test_create_quote_success(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        assert r.status_code == 201, r.text
        data = r.json()

        # quote_number format BJX-YYYY-NNNN
        assert re.match(r"BJX-\d{4}-\d{4}", data["quote_number"]), (
            f"Formato inesperado: {data['quote_number']}"
        )
        assert data["status"] == "draft"
        assert len(data["lines"]) == 1
        assert data["summary"]["total_bjx_cost"] > 0

    def test_create_quote_as_viewer_forbidden(self, client, viewer_headers, full_setup):
        r = _create_quote(client, viewer_headers, full_setup)
        assert r.status_code == 403

    def test_create_quote_invalid_model(self, client, admin_headers):
        r = client.post(
            "/api/quotes",
            json={"model_id": "00000000-0000-0000-0000-000000000000", "service_ids": ["svc1"]},
            headers=admin_headers,
        )
        assert r.status_code == 404

    def test_create_quote_too_many_services(self, client, admin_headers, full_setup):
        model_id = full_setup["model"].id
        service_ids = [f"svc-{i}" for i in range(21)]
        r = client.post(
            "/api/quotes",
            json={"model_id": model_id, "service_ids": service_ids},
            headers=admin_headers,
        )
        assert r.status_code == 422

    def test_quote_number_autoincrement(self, client, admin_headers, full_setup):
        r1 = _create_quote(client, admin_headers, full_setup)
        r2 = _create_quote(client, admin_headers, full_setup)
        assert r1.status_code == 201
        assert r2.status_code == 201

        num1 = r1.json()["quote_number"]
        num2 = r2.json()["quote_number"]

        # Extract the sequential part (last 4 digits)
        seq1 = int(num1.split("-")[-1])
        seq2 = int(num2.split("-")[-1])
        assert seq2 == seq1 + 1, f"Expected consecutive numbers, got {num1} and {num2}"

        # First quote should be BJX-YYYY-0001
        assert num1.endswith("0001"), f"First quote should end in 0001, got {num1}"
        assert num2.endswith("0002"), f"Second quote should end in 0002, got {num2}"


# ---------------------------------------------------------------------------
# TestQuoteLifecycle
# ---------------------------------------------------------------------------


class TestQuoteLifecycle:
    def test_confirm_quote(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        assert r.status_code == 201
        quote_id = r.json()["id"]

        r2 = _confirm_quote(client, admin_headers, quote_id)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "confirmed"

    def test_cannot_go_back_to_draft(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]
        _confirm_quote(client, admin_headers, quote_id)

        # Try reverting to draft
        r_back = client.put(
            f"/api/quotes/{quote_id}",
            json={"status": "draft"},
            headers=admin_headers,
        )
        assert r_back.status_code == 400

    def test_confirmed_to_invoiced(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]
        _confirm_quote(client, admin_headers, quote_id)

        r_inv = client.put(
            f"/api/quotes/{quote_id}",
            json={"status": "invoiced"},
            headers=admin_headers,
        )
        assert r_inv.status_code == 200, r_inv.text
        assert r_inv.json()["status"] == "invoiced"

    def test_viewer_cannot_update_quote(self, client, viewer_headers, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]

        r_upd = client.put(
            f"/api/quotes/{quote_id}",
            json={"status": "confirmed"},
            headers=viewer_headers,
        )
        assert r_upd.status_code == 403

    def test_operador_can_cancel_confirmed(self, client, operador_headers, admin_headers, full_setup):
        # Create and confirm as admin
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]
        _confirm_quote(client, admin_headers, quote_id)

        # Cancel as operador
        r_cancel = client.put(
            f"/api/quotes/{quote_id}",
            json={"status": "cancelled"},
            headers=operador_headers,
        )
        assert r_cancel.status_code == 200, r_cancel.text
        assert r_cancel.json()["status"] == "cancelled"


# ---------------------------------------------------------------------------
# TestQuoteExport
# ---------------------------------------------------------------------------


class TestQuoteExport:
    def test_export_pdf_confirmed(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]
        _confirm_quote(client, admin_headers, quote_id)

        r_exp = client.get(f"/api/quotes/{quote_id}/export?format=pdf", headers=admin_headers)
        assert r_exp.status_code == 200, r_exp.text
        assert "application/pdf" in r_exp.headers["content-type"]

    def test_export_xlsx_confirmed(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]
        _confirm_quote(client, admin_headers, quote_id)

        r_exp = client.get(f"/api/quotes/{quote_id}/export?format=xlsx", headers=admin_headers)
        assert r_exp.status_code == 200, r_exp.text
        assert "openxmlformats" in r_exp.headers["content-type"]

    def test_export_draft_rejected(self, client, admin_headers, full_setup):
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]

        r_exp = client.get(f"/api/quotes/{quote_id}/export?format=pdf", headers=admin_headers)
        assert r_exp.status_code == 400


# ---------------------------------------------------------------------------
# TestQuoteList
# ---------------------------------------------------------------------------


class TestQuoteList:
    def test_list_quotes_empty(self, client, admin_headers):
        r = client.get("/api/quotes", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["items"] == []

    def test_list_quotes_filter_status(self, client, admin_headers, full_setup):
        # Create a quote (draft)
        _create_quote(client, admin_headers, full_setup)

        r = client.get("/api/quotes?status=draft", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        for item in data["items"]:
            assert item["status"] == "draft"

    def test_quote_stats(self, client, admin_headers, full_setup):
        # Create and confirm a quote
        r = _create_quote(client, admin_headers, full_setup)
        quote_id = r.json()["id"]
        _confirm_quote(client, admin_headers, quote_id)

        r_stats = client.get("/api/quotes/stats", headers=admin_headers)
        assert r_stats.status_code == 200, r_stats.text
        stats = r_stats.json()
        assert stats["total_quotes"] > 0
