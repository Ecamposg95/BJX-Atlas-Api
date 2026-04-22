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
def viewer_headers(client, db):
    user = User(email="viewer@test.com", hashed_password=hash_password("Viewer1234"), role=Role.viewer, active=True)
    db.add(user); db.commit()
    r = client.post("/api/auth/login", json={"email": "viewer@test.com", "password": "Viewer1234"})
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
# TestModels
# ---------------------------------------------------------------------------

class TestModels:

    def test_list_models_empty(self, client, admin_headers):
        """GET /catalog/models sin datos → 200, items vacío."""
        r = client.get("/api/catalog/models", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_models_with_data(self, client, admin_headers, sample_model):
        """GET /catalog/models con un modelo existente → items=[sample_model]."""
        r = client.get("/api/catalog/models", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == sample_model.name

    def test_create_model_as_admin(self, client, admin_headers):
        """POST /catalog/models como admin → 201."""
        payload = {"name": "NISSAN - VERSA", "brand": "NISSAN"}
        r = client.post("/api/catalog/models", json=payload, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "NISSAN - VERSA"
        assert data["brand"] == "NISSAN"
        assert "id" in data

    def test_create_model_as_viewer_forbidden(self, client, viewer_headers):
        """POST /catalog/models como viewer → 403."""
        payload = {"name": "FORD - FUSION", "brand": "FORD"}
        r = client.post("/api/catalog/models", json=payload, headers=viewer_headers)
        assert r.status_code == 403

    def test_create_duplicate_model(self, client, admin_headers):
        """Crear dos modelos con el mismo nombre → segundo da 409."""
        payload = {"name": "TOYOTA - COROLLA"}
        r1 = client.post("/api/catalog/models", json=payload, headers=admin_headers)
        assert r1.status_code == 201

        r2 = client.post("/api/catalog/models", json=payload, headers=admin_headers)
        assert r2.status_code == 409
        assert "nombre" in r2.json()["detail"].lower() or "existe" in r2.json()["detail"].lower()

    def test_get_model_detail(self, client, admin_headers, sample_model):
        """GET /catalog/models/{id} → 200, service_count=0."""
        r = client.get(f"/api/catalog/models/{sample_model.id}", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == sample_model.id
        assert data["name"] == sample_model.name
        assert data["service_count"] == 0

    def test_get_model_not_found(self, client, admin_headers):
        """GET /catalog/models/nonexistent → 404."""
        r = client.get("/api/catalog/models/nonexistent-id-9999", headers=admin_headers)
        assert r.status_code == 404

    def test_update_model(self, client, admin_headers, sample_model):
        """PUT /catalog/models/{id} → 200 con datos actualizados."""
        payload = {"brand": "CHEVROLET_UPDATED", "active": True}
        r = client.put(f"/api/catalog/models/{sample_model.id}", json=payload, headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["brand"] == "CHEVROLET_UPDATED"

    def test_soft_delete_model(self, client, admin_headers, sample_model):
        """DELETE /catalog/models/{id} → 204, modelo ya no aparece en listado."""
        r = client.delete(f"/api/catalog/models/{sample_model.id}", headers=admin_headers)
        assert r.status_code == 204

        # Verificar que el modelo ya no aparece en el listado (soft-delete via deleted_at)
        r_list = client.get("/api/catalog/models", headers=admin_headers)
        assert r_list.status_code == 200
        ids = [item["id"] for item in r_list.json()["items"]]
        assert sample_model.id not in ids


# ---------------------------------------------------------------------------
# TestServices
# ---------------------------------------------------------------------------

class TestServices:

    def test_list_services(self, client, admin_headers, sample_service):
        """GET /catalog/services → 200, contiene el servicio creado."""
        r = client.get("/api/catalog/services", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        names = [item["name"] for item in data["items"]]
        assert sample_service.name in names

    def test_search_services(self, client, admin_headers, sample_service):
        """GET /catalog/services?search=balatas → solo retorna servicios coincidentes."""
        r = client.get("/api/catalog/services?search=balatas", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert all("BALATAS" in item["name"].upper() for item in data["items"])

    def test_create_service_as_admin(self, client, admin_headers):
        """POST /catalog/services como admin → 201."""
        payload = {"name": "AFINACION MAYOR", "category": "motor"}
        r = client.post("/api/catalog/services", json=payload, headers=admin_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "AFINACION MAYOR"
        assert data["category"] == "motor"

    def test_create_duplicate_service(self, client, admin_headers):
        """Crear dos servicios con el mismo nombre → segundo da 409."""
        payload = {"name": "CAMBIO DE ACEITE", "category": "motor"}
        r1 = client.post("/api/catalog/services", json=payload, headers=admin_headers)
        assert r1.status_code == 201

        r2 = client.post("/api/catalog/services", json=payload, headers=admin_headers)
        assert r2.status_code == 409


# ---------------------------------------------------------------------------
# TestCosts
# ---------------------------------------------------------------------------

class TestCosts:

    def test_list_costs(self, client, admin_headers, sample_catalog):
        """GET /catalog/costs → 200, solo entradas is_current=True."""
        r = client.get("/api/catalog/costs", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        # Todas las entradas retornadas deben ser is_current=True
        for item in data["items"]:
            assert item["is_current"] is True

    def test_costs_missing_combo(self, client, admin_headers, sample_catalog, sample_price):
        """
        Combo con precio de proveedor (sample_price) pero SIN bjx_labor_cost completo no aparece
        en /catalog/costs/missing cuando el catalog ya tiene ambos costos.
        Verificar que el endpoint responde correctamente.
        """
        # sample_catalog tiene bjx_labor_cost=350 y bjx_parts_cost=800 → completo, no debe salir en /missing
        r = client.get("/api/catalog/costs/missing", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        # La combinacion del sample_catalog+price tiene datos completos, no debe aparecer en missing
        missing_combos = [(item["model_id"], item["service_id"]) for item in data]
        assert (sample_catalog.model_id, sample_catalog.service_id) not in missing_combos

    def test_costs_missing_shows_incomplete_combo(self, client, admin_headers, db, sample_model, sample_service, sample_supplier):
        """
        Combo con SupplierPrice pero ServiceCatalog sin bjx_labor_cost → aparece en /missing.
        """
        # Catalog sin costos BJX
        incomplete_catalog = ServiceCatalog(
            model_id=sample_model.id, service_id=sample_service.id,
            bjx_labor_cost=None, bjx_parts_cost=None, duration_hrs=1.5,
            source="test", is_current=True
        )
        db.add(incomplete_catalog); db.commit(); db.refresh(incomplete_catalog)

        # Precio de proveedor para esa combinacion
        price = SupplierPrice(
            supplier_id=sample_supplier.id, model_id=sample_model.id,
            service_id=sample_service.id, ref_cost=500.0, labor_cost=0.0,
            total_price=800.0, is_current=True
        )
        db.add(price); db.commit()

        r = client.get("/api/catalog/costs/missing", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        missing_combos = [(item["model_id"], item["service_id"]) for item in data]
        assert (sample_model.id, sample_service.id) in missing_combos

    def test_update_cost_immutable(self, client, admin_headers, sample_catalog, db):
        """PUT /catalog/costs → crea nuevo is_current=True, anterior is_current=False."""
        payload = {"bjx_labor_cost": 400.0, "bjx_parts_cost": 900.0}
        r = client.put(
            f"/api/catalog/costs/{sample_catalog.model_id}/{sample_catalog.service_id}",
            json=payload,
            headers=admin_headers,
        )
        assert r.status_code == 200
        new_entry = r.json()
        assert new_entry["is_current"] is True
        assert new_entry["bjx_labor_cost"] == 400.0

        # El registro original ya no debe ser is_current
        db.expire_all()
        from app.models.catalog import ServiceCatalog as SC
        old = db.query(SC).filter(SC.id == sample_catalog.id).first()
        assert old.is_current is False

        # Solo debe haber un registro is_current=True para esa combinacion
        current_count = (
            db.query(SC)
            .filter(
                SC.model_id == sample_catalog.model_id,
                SC.service_id == sample_catalog.service_id,
                SC.is_current.is_(True),
            )
            .count()
        )
        assert current_count == 1


# ---------------------------------------------------------------------------
# TestTimeStandards
# ---------------------------------------------------------------------------

class TestTimeStandards:

    def test_list_time_standards(self, client, admin_headers, sample_catalog):
        """GET /catalog/time-standards → 200, contiene el registro current."""
        r = client.get("/api/catalog/time-standards", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert any(
            item["model_id"] == sample_catalog.model_id and item["service_id"] == sample_catalog.service_id
            for item in data["items"]
        )

    def test_list_time_standards_filter_by_model(self, client, admin_headers, sample_catalog):
        """GET /catalog/time-standards?model_id=... → solo devuelve esa combinación."""
        r = client.get(
            f"/api/catalog/time-standards?model_id={sample_catalog.model_id}",
            headers=admin_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        assert all(item["model_id"] == sample_catalog.model_id for item in data["items"])

    def test_get_time_standard_detail(self, client, admin_headers, sample_catalog, sample_model, sample_service):
        """GET /catalog/time-standards/{model_id}/{service_id} → 200 con nombres enriquecidos."""
        r = client.get(
            f"/api/catalog/time-standards/{sample_model.id}/{sample_service.id}",
            headers=admin_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["model_id"] == sample_catalog.model_id
        assert data["service_id"] == sample_catalog.service_id
        assert data["model_name"] == sample_model.name
        assert data["service_name"] == sample_service.name

    def test_get_time_standard_missing_combo(self, client, admin_headers, sample_model):
        """GET /catalog/time-standards/{model_id}/{service_id} inexistente → 404."""
        r = client.get(
            f"/api/catalog/time-standards/{sample_model.id}/missing-service-id",
            headers=admin_headers,
        )
        assert r.status_code == 404

    def test_update_time_standard_immutable(self, client, admin_headers, sample_catalog, db):
        """PUT /catalog/time-standards → nuevo current row, anterior deja de ser current."""
        payload = {"duration_hrs": 3.5}
        r = client.put(
            f"/api/catalog/time-standards/{sample_catalog.model_id}/{sample_catalog.service_id}",
            json=payload,
            headers=admin_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["duration_hrs"] == 3.5
        assert data["bjx_labor_cost"] == sample_catalog.bjx_labor_cost
        assert data["bjx_parts_cost"] == sample_catalog.bjx_parts_cost
        assert data["source"] == sample_catalog.source

        db.expire_all()
        from app.models.catalog import ServiceCatalog as SC

        old = db.query(SC).filter(SC.id == sample_catalog.id).first()
        assert old.is_current is False

        current_count = (
            db.query(SC)
            .filter(
                SC.model_id == sample_catalog.model_id,
                SC.service_id == sample_catalog.service_id,
                SC.is_current.is_(True),
            )
            .count()
        )
        assert current_count == 1

    def test_update_time_standard_twice_keeps_single_current_row(self, client, admin_headers, sample_catalog, db):
        first = client.put(
            f"/api/catalog/time-standards/{sample_catalog.model_id}/{sample_catalog.service_id}",
            json={"duration_hrs": 3.5},
            headers=admin_headers,
        )
        assert first.status_code == 200

        second = client.put(
            f"/api/catalog/time-standards/{sample_catalog.model_id}/{sample_catalog.service_id}",
            json={"duration_hrs": 4.0},
            headers=admin_headers,
        )
        assert second.status_code == 200
        assert second.json()["duration_hrs"] == 4.0

        db.expire_all()
        from app.models.catalog import ServiceCatalog as SC

        current_rows = (
            db.query(SC)
            .filter(
                SC.model_id == sample_catalog.model_id,
                SC.service_id == sample_catalog.service_id,
                SC.is_current.is_(True),
            )
            .all()
        )
        historical_rows = (
            db.query(SC)
            .filter(
                SC.model_id == sample_catalog.model_id,
                SC.service_id == sample_catalog.service_id,
                SC.is_current.is_(False),
            )
            .all()
        )
        assert len(current_rows) == 1
        assert current_rows[0].duration_hrs == 4.0
        assert len(historical_rows) == 2

    def test_update_time_standard_forbidden_for_viewer(self, client, viewer_headers, sample_catalog):
        """PUT /catalog/time-standards como viewer → 403."""
        payload = {"duration_hrs": 2.5}
        r = client.put(
            f"/api/catalog/time-standards/{sample_catalog.model_id}/{sample_catalog.service_id}",
            json=payload,
            headers=viewer_headers,
        )
        assert r.status_code == 403

    def test_update_time_standard_invalid_duration(self, client, admin_headers, sample_catalog):
        """PUT /catalog/time-standards con duration_hrs <= 0 → 422."""
        payload = {"duration_hrs": 0}
        r = client.put(
            f"/api/catalog/time-standards/{sample_catalog.model_id}/{sample_catalog.service_id}",
            json=payload,
            headers=admin_headers,
        )
        assert r.status_code == 422
