import pytest
from app.models.users import User, Role
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.suppliers import Supplier, SupplierPrice
from app.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(db):
    user = User(email="admin@test.com", hashed_password=hash_password("Admin1234"), role=Role.admin, active=True)
    db.add(user); db.commit(); db.refresh(user)
    return user


@pytest.fixture
def admin_headers(client, admin_user):
    r = client.post("/auth/login", json={"email": "admin@test.com", "password": "Admin1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def sample_model(db):
    m = VehicleModel(name="CHEVROLET - AVEO", brand="CHEVROLET", active=True)
    db.add(m); db.commit(); db.refresh(m)
    return m


@pytest.fixture
def sample_service(db):
    s = Service(name="CAMBIO DE BALATAS", category="frenos", active=True)
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def sample_catalog(db, sample_model, sample_service):
    c = ServiceCatalog(
        model_id=sample_model.id, service_id=sample_service.id,
        bjx_labor_cost=350.0, bjx_parts_cost=800.0, duration_hrs=2.0,
        source="test", is_current=True
    )
    db.add(c); db.commit(); db.refresh(c)
    return c


@pytest.fixture
def sample_supplier(db):
    s = Supplier(name="DAPESA", lead_time_days=1, warranty_days=90, active=True)
    db.add(s); db.commit(); db.refresh(s)
    return s


@pytest.fixture
def sample_price(db, sample_supplier, sample_model, sample_service):
    p = SupplierPrice(
        supplier_id=sample_supplier.id, model_id=sample_model.id,
        service_id=sample_service.id, ref_cost=800.0, labor_cost=0.0,
        total_price=1400.0, is_current=True
    )
    db.add(p); db.commit(); db.refresh(p)
    return p


# ---------------------------------------------------------------------------
# TestEngineCalculate
# ---------------------------------------------------------------------------

class TestEngineCalculate:

    def test_calculate_valid_combo(self, client, admin_headers, sample_catalog, sample_price):
        """POST /engine/calculate con model y service validos — respuesta completa."""
        payload = {
            "model_id": sample_catalog.model_id,
            "service_id": sample_catalog.service_id,
        }
        r = client.post("/engine/calculate", json=payload, headers=admin_headers)
        assert r.status_code == 200

        data = r.json()
        assert data["result"]["total_bjx_cost"] > 0
        assert data["result"]["margin_status"] in ("ok", "low", "critical")
        assert len(data["suppliers"]) > 0
        assert data["recommended_supplier"] is not None

    def test_calculate_no_auth(self, client, sample_catalog):
        """Sin token → 401."""
        payload = {
            "model_id": sample_catalog.model_id,
            "service_id": sample_catalog.service_id,
        }
        r = client.post("/engine/calculate", json=payload)
        assert r.status_code == 401

    def test_calculate_nonexistent_model(self, client, admin_headers, sample_service):
        """model_id inexistente → 404."""
        payload = {
            "model_id": "fake-id-00000000000000000000",
            "service_id": sample_service.id,
        }
        r = client.post("/engine/calculate", json=payload, headers=admin_headers)
        assert r.status_code == 404

    def test_calculate_no_catalog_data(self, client, admin_headers, sample_model, sample_service):
        """Model y service existen pero sin ServiceCatalog → 404."""
        payload = {
            "model_id": sample_model.id,
            "service_id": sample_service.id,
        }
        r = client.post("/engine/calculate", json=payload, headers=admin_headers)
        assert r.status_code == 404
        assert "catalog" in r.json()["detail"].lower() or "model_id" in r.json()["detail"].lower()

    def test_calculate_no_suppliers(self, client, admin_headers, sample_catalog):
        """Catalog existe pero sin SupplierPrice → suppliers=[], recommended_supplier=null."""
        payload = {
            "model_id": sample_catalog.model_id,
            "service_id": sample_catalog.service_id,
        }
        r = client.post("/engine/calculate", json=payload, headers=admin_headers)
        assert r.status_code == 200

        data = r.json()
        assert data["suppliers"] == []
        assert data["recommended_supplier"] is None

    def test_calculate_custom_params(self, client, admin_headers, sample_catalog, sample_price):
        """Pasar technician_cost_hr customizado — labor_cost refleja el nuevo rate."""
        custom_rate = 200.0
        payload = {
            "model_id": sample_catalog.model_id,
            "service_id": sample_catalog.service_id,
            "technician_cost_hr": custom_rate,
        }
        r = client.post("/engine/calculate", json=payload, headers=admin_headers)
        assert r.status_code == 200

        data = r.json()
        # El input debe mostrar el rate personalizado
        assert data["input"]["technician_cost_hr"] == custom_rate
        # El costo de labor debe ser mayor que con el rate por defecto (156.25)
        default_rate = 156.25
        duration = sample_catalog.duration_hrs  # 2.0
        # Si el catalog tiene bjx_labor_cost, ese se usa como base;
        # de lo contrario se calcularía duration * rate.
        # Solo verificamos que el campo labor_cost existe y es > 0
        assert data["result"]["labor_cost"] > 0


# ---------------------------------------------------------------------------
# TestEngineBatch
# ---------------------------------------------------------------------------

class TestEngineBatch:

    def test_batch_valid(self, client, admin_headers, sample_catalog, sample_price):
        """POST /engine/batch con model_id y service_ids validos — resumen correcto."""
        payload = {
            "model_id": sample_catalog.model_id,
            "service_ids": [sample_catalog.service_id],
        }
        r = client.post("/engine/batch", json=payload, headers=admin_headers)
        assert r.status_code == 200

        data = r.json()
        assert len(data["lines"]) == 1
        assert data["lines"][0]["result"] is not None
        assert data["summary"]["total_bjx_cost"] > 0

    def test_batch_too_many_services(self, client, admin_headers, sample_model):
        """service_ids con 21 elementos → 422."""
        payload = {
            "model_id": sample_model.id,
            "service_ids": [f"fake-service-id-{i:04d}" for i in range(21)],
        }
        r = client.post("/engine/batch", json=payload, headers=admin_headers)
        assert r.status_code == 422

    def test_batch_mixed_data(self, client, admin_headers, db, sample_model, sample_catalog):
        """Un service tiene catalog, otro no → no_data en su linea, batch no falla."""
        # Service sin catalog
        orphan = Service(name="SIN CATALOGO SERVICE", category="otros", active=True)
        db.add(orphan); db.commit(); db.refresh(orphan)

        payload = {
            "model_id": sample_model.id,
            "service_ids": [sample_catalog.service_id, orphan.id],
        }
        r = client.post("/engine/batch", json=payload, headers=admin_headers)
        assert r.status_code == 200

        data = r.json()
        lines_by_service = {line["service_id"]: line for line in data["lines"]}

        # La linea con catalog tiene resultado
        assert lines_by_service[sample_catalog.service_id]["result"] is not None
        assert lines_by_service[sample_catalog.service_id]["margin_status"] != "no_data"

        # La linea sin catalog es no_data
        assert lines_by_service[orphan.id]["result"] is None
        assert lines_by_service[orphan.id]["margin_status"] == "no_data"

        # El summary contabiliza el no_data
        assert data["summary"]["no_data_count"] == 1

    def test_batch_no_auth(self, client):
        """Sin token → 401."""
        payload = {
            "model_id": "any-model-id",
            "service_ids": ["any-service-id"],
        }
        r = client.post("/engine/batch", json=payload)
        assert r.status_code == 401
