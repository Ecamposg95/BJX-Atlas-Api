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
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "Admin1234"})
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
# TestSuppliersCRUD
# ---------------------------------------------------------------------------

class TestSuppliersCRUD:

    def test_list_suppliers_empty(self, client, admin_headers):
        """GET /suppliers sin proveedores → lista vacía."""
        r = client.get("/api/suppliers", headers=admin_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_create_supplier(self, client, admin_headers):
        """POST /suppliers → 201, proveedor creado correctamente."""
        payload = {
            "name": "NUEVO PROVEEDOR",
            "lead_time_days": 3,
            "warranty_days": 30,
        }
        r = client.post("/api/suppliers", json=payload, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "NUEVO PROVEEDOR"
        assert data["lead_time_days"] == 3
        assert data["warranty_days"] == 30
        assert "id" in data

    def test_create_supplier_invalid_lead_time(self, client, admin_headers):
        """lead_time_days=0 → 422 (validacion Pydantic ge=1)."""
        payload = {
            "name": "PROVEEDOR INVALIDO",
            "lead_time_days": 0,
            "warranty_days": 30,
        }
        r = client.post("/api/suppliers", json=payload, headers=admin_headers)
        assert r.status_code == 422
        # El detalle debe ser descriptivo
        detail = r.json()["detail"]
        assert isinstance(detail, list) or isinstance(detail, str)

    def test_create_duplicate_supplier(self, client, admin_headers):
        """Crear dos proveedores con el mismo nombre → segundo da 409."""
        payload = {"name": "PROVEEDOR DUPLICADO", "lead_time_days": 2, "warranty_days": 60}
        r1 = client.post("/api/suppliers", json=payload, headers=admin_headers)
        assert r1.status_code == 201

        r2 = client.post("/api/suppliers", json=payload, headers=admin_headers)
        assert r2.status_code == 409

    def test_soft_delete_supplier_only_one(self, client, admin_headers, sample_supplier, sample_price):
        """Intentar eliminar el unico proveedor activo con precios vigentes → 409."""
        r = client.delete(f"/api/suppliers/{sample_supplier.id}", headers=admin_headers)
        assert r.status_code == 409
        assert "único" in r.json()["detail"] or "proveedor" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# TestSupplierPrices
# ---------------------------------------------------------------------------

class TestSupplierPrices:

    def test_add_price(self, client, admin_headers, sample_supplier, sample_model, sample_service):
        """POST /suppliers/{id}/prices → 201, precio creado correctamente."""
        payload = {
            "service_id": sample_service.id,
            "model_id": sample_model.id,
            "ref_cost": 750.0,
            "labor_cost": 0.0,
            "total_price": 1300.0,
        }
        r = client.post(f"/api/suppliers/{sample_supplier.id}/prices", json=payload, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["ref_cost"] == 750.0
        assert data["total_price"] == 1300.0
        assert data["is_current"] is True
        assert data["supplier_id"] == sample_supplier.id

    def test_update_price_immutable(self, client, admin_headers, sample_price, db):
        """PUT /suppliers/{id}/prices/{price_id} → nuevo is_current=True, anterior is_current=False."""
        payload = {"total_price": 1600.0, "ref_cost": 900.0}
        r = client.put(
            f"/api/suppliers/{sample_price.supplier_id}/prices/{sample_price.id}",
            json=payload,
            headers=admin_headers,
        )
        assert r.status_code == 200
        new_data = r.json()
        assert new_data["is_current"] is True
        assert new_data["total_price"] == 1600.0
        assert new_data["id"] != sample_price.id

        # El registro anterior ya no debe ser is_current
        db.expire_all()
        from app.models.suppliers import SupplierPrice as SP
        old = db.query(SP).filter(SP.id == sample_price.id).first()
        assert old.is_current is False

    def test_price_history(self, client, admin_headers, sample_supplier, sample_model, sample_service):
        """Crear 2 precios → history tiene 2 registros para esa combinacion."""
        # Primer precio
        payload1 = {
            "service_id": sample_service.id,
            "model_id": sample_model.id,
            "ref_cost": 700.0,
            "labor_cost": 0.0,
            "total_price": 1200.0,
        }
        r1 = client.post(f"/api/suppliers/{sample_supplier.id}/prices", json=payload1, headers=admin_headers)
        assert r1.status_code == 201
        price1_id = r1.json()["id"]

        # Segundo precio (actualiza el primero, creando nueva version)
        payload2 = {"total_price": 1350.0}
        r_update = client.put(
            f"/api/suppliers/{sample_supplier.id}/prices/{price1_id}",
            json=payload2,
            headers=admin_headers,
        )
        assert r_update.status_code == 200

        # Verificar history
        r_history = client.get(
            f"/api/suppliers/{sample_supplier.id}/prices/history/{sample_model.id}/{sample_service.id}",
            headers=admin_headers,
        )
        assert r_history.status_code == 200
        history = r_history.json()
        assert len(history) == 2


# ---------------------------------------------------------------------------
# TestCompare
# ---------------------------------------------------------------------------

class TestCompare:

    def test_compare_single_supplier(self, client, admin_headers, sample_catalog, sample_price):
        """GET /suppliers/compare → 200, 1 proveedor, recommended=True, bjx_calculation presente."""
        r = client.get(
            f"/api/suppliers/compare?model_id={sample_catalog.model_id}&service_id={sample_catalog.service_id}",
            headers=admin_headers,
        )
        assert r.status_code == 200
        data = r.json()

        assert len(data["suppliers"]) == 1
        assert data["suppliers"][0]["recommended"] is True
        assert data["bjx_calculation"] is not None
        assert data["bjx_calculation"]["total_bjx_cost"] > 0

    def test_compare_no_suppliers(self, client, admin_headers, sample_catalog):
        """Sin precios de proveedor → 404."""
        r = client.get(
            f"/api/suppliers/compare?model_id={sample_catalog.model_id}&service_id={sample_catalog.service_id}",
            headers=admin_headers,
        )
        assert r.status_code == 404
