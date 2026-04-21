import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.models.vehicles import Vehicle
import app.routers.vehicles as vehicle_router


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def operador_headers(operador_token):
    return {"Authorization": f"Bearer {operador_token}"}


@pytest.fixture
def viewer_headers(viewer_token):
    return {"Authorization": f"Bearer {viewer_token}"}


@pytest.fixture
def sample_vehicle(db):
    vehicle = Vehicle(
        customer_name="Juan Perez",
        contact="555-0101",
        brand="Toyota",
        model="Corolla",
        year=2022,
        plates="ABC-123",
        vin="1HGBH41JXMN109186",
        mileage=15000,
        color="Blanco",
        active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


class TestVehicles:
    def test_list_vehicles_empty(self, client, admin_headers):
        r = client.get("/api/vehicles", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_create_vehicle_as_operador_allowed(self, client, operador_headers):
        payload = {
            "customer_name": "Maria Lopez",
            "contact": "555-0202",
            "brand": "Nissan",
            "model": "Versa",
            "plates": "XYZ-789",
            "vin": "3N1AB7AP7EY123456",
        }
        r = client.post("/api/vehicles", json=payload, headers=operador_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["customer_name"] == "Maria Lopez"
        assert data["plates"] == "XYZ-789"

    def test_create_vehicle_as_viewer_forbidden(self, client, viewer_headers):
        payload = {"customer_name": "Maria Lopez", "plates": "XYZ-789"}
        r = client.post("/api/vehicles", json=payload, headers=viewer_headers)
        assert r.status_code == 403

    def test_duplicate_plates(self, client, admin_headers):
        payload = {"customer_name": "Juan Perez", "plates": "ABC-123"}
        r1 = client.post("/api/vehicles", json=payload, headers=admin_headers)
        assert r1.status_code == 201

        r2 = client.post("/api/vehicles", json=payload, headers=admin_headers)
        assert r2.status_code == 409
        assert "plates" in r2.json()["detail"].lower()

    def test_duplicate_plates_with_whitespace(self, client, admin_headers):
        payload_1 = {"customer_name": "Juan Perez", "plates": " ABC-123 "}
        payload_2 = {"customer_name": "Ana Ruiz", "plates": "ABC-123"}
        r1 = client.post("/api/vehicles", json=payload_1, headers=admin_headers)
        assert r1.status_code == 201
        assert r1.json()["plates"] == "ABC-123"

        r2 = client.post("/api/vehicles", json=payload_2, headers=admin_headers)
        assert r2.status_code == 409

    def test_dirty_db_row_with_spaced_plates_blocks_normalized_duplicate(self, client, admin_headers, db):
        db.execute(
            text(
                """
                INSERT INTO vehicles (
                    id, customer_name, contact, brand, model, year, plates, vin, mileage, color, active, created_at, updated_at, deleted_at
                ) VALUES (
                    'dirty-plates-1', 'Juan Perez', NULL, NULL, NULL, NULL, ' ABC-123 ', NULL, NULL, NULL, 1, CURRENT_TIMESTAMP, NULL, NULL
                )
                """
            )
        )
        db.commit()

        r = client.post(
            "/api/vehicles",
            json={"customer_name": "Ana Ruiz", "plates": "ABC-123"},
            headers=admin_headers,
        )
        assert r.status_code == 409

    def test_dirty_db_row_with_spaced_vin_blocks_normalized_duplicate(self, client, admin_headers, db):
        db.execute(
            text(
                """
                INSERT INTO vehicles (
                    id, customer_name, contact, brand, model, year, plates, vin, mileage, color, active, created_at, updated_at, deleted_at
                ) VALUES (
                    'dirty-vin-1', 'Juan Perez', NULL, NULL, NULL, NULL, NULL, ' 1HGBH41JXMN109186 ', NULL, NULL, 1, CURRENT_TIMESTAMP, NULL, NULL
                )
                """
            )
        )
        db.commit()

        r = client.post(
            "/api/vehicles",
            json={"customer_name": "Ana Ruiz", "vin": "1HGBH41JXMN109186"},
            headers=admin_headers,
        )
        assert r.status_code == 409

    def test_db_uniqueness_blocks_normalized_duplicate_plates_direct_insert(self, db):
        first = Vehicle(customer_name="Juan Perez", plates=" ABC-123 ", active=True)
        db.add(first)
        db.commit()

        second = Vehicle(customer_name="Ana Ruiz", plates="ABC-123", active=True)
        db.add(second)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_db_uniqueness_blocks_normalized_duplicate_vin_direct_insert(self, db):
        first = Vehicle(customer_name="Juan Perez", vin=" 1HGBH41JXMN109186 ", active=True)
        db.add(first)
        db.commit()

        second = Vehicle(customer_name="Ana Ruiz", vin="1HGBH41JXMN109186", active=True)
        db.add(second)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_soft_deleted_vehicle_can_be_recreated_with_same_plates(self, db):
        first = Vehicle(customer_name="Juan Perez", plates="ABC-123", active=True)
        db.add(first)
        db.commit()

        first.deleted_at = first.created_at
        first.active = False
        db.commit()

        second = Vehicle(customer_name="Ana Ruiz", plates="ABC-123", active=True)
        db.add(second)
        db.commit()
        assert second.id is not None

    def test_soft_deleted_vehicle_can_be_recreated_with_same_vin(self, db):
        first = Vehicle(customer_name="Juan Perez", vin="1HGBH41JXMN109186", active=True)
        db.add(first)
        db.commit()

        first.deleted_at = first.created_at
        first.active = False
        db.commit()

        second = Vehicle(customer_name="Ana Ruiz", vin="1HGBH41JXMN109186", active=True)
        db.add(second)
        db.commit()
        assert second.id is not None

    def test_api_integrity_error_maps_to_409(self, client, admin_headers, db, monkeypatch):
        db.add(Vehicle(customer_name="Juan Perez", plates="ABC-123", active=True))
        db.commit()

        monkeypatch.setattr(vehicle_router, "_find_duplicate_vehicle", lambda *args, **kwargs: (None, None))

        r = client.post(
            "/api/vehicles",
            json={"customer_name": "Ana Ruiz", "plates": "ABC-123"},
            headers=admin_headers,
        )
        assert r.status_code == 409
        assert "duplicado" in r.json()["detail"].lower()

    def test_duplicate_vin(self, client, admin_headers):
        payload1 = {"customer_name": "Juan Perez", "vin": "1HGBH41JXMN109186"}
        payload2 = {"customer_name": "Ana Ruiz", "vin": "1HGBH41JXMN109186"}
        r1 = client.post("/api/vehicles", json=payload1, headers=admin_headers)
        assert r1.status_code == 201

        r2 = client.post("/api/vehicles", json=payload2, headers=admin_headers)
        assert r2.status_code == 409
        assert "vin" in r2.json()["detail"].lower()

    def test_db_unique_index_blocks_normalized_duplicate_plates(self, db):
        first = Vehicle(customer_name="Juan Perez", plates=" ABC-123 ")
        db.add(first)
        db.commit()

        duplicate = Vehicle(customer_name="Ana Ruiz", plates="ABC-123")
        db.add(duplicate)

        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_soft_deleted_vehicle_allows_recreate_same_plates(self, client, admin_headers, sample_vehicle):
        r_delete = client.delete(f"/api/vehicles/{sample_vehicle.id}", headers=admin_headers)
        assert r_delete.status_code == 204

        r_create = client.post(
            "/api/vehicles",
            json={"customer_name": "Ana Ruiz", "plates": sample_vehicle.plates},
            headers=admin_headers,
        )
        assert r_create.status_code == 201
        assert r_create.json()["plates"] == sample_vehicle.plates

    def test_create_vehicle_returns_409_when_db_constraint_catches_duplicate(
        self,
        client,
        admin_headers,
        sample_vehicle,
        monkeypatch,
    ):
        monkeypatch.setattr(
            vehicle_router,
            "_find_duplicate_vehicle",
            lambda db, payload, vehicle_id=None: (None, None),
        )

        r = client.post(
            "/api/vehicles",
            json={"customer_name": "Ana Ruiz", "plates": sample_vehicle.plates},
            headers=admin_headers,
        )
        assert r.status_code == 409
        assert "plates" in r.json()["detail"].lower()

    def test_blank_customer_name_rejected(self, client, admin_headers):
        payload = {"customer_name": "   ", "plates": "ABC-123"}
        r = client.post("/api/vehicles", json=payload, headers=admin_headers)
        assert r.status_code == 422

    def test_negative_year_rejected(self, client, admin_headers):
        payload = {"customer_name": "Juan Perez", "year": -1}
        r = client.post("/api/vehicles", json=payload, headers=admin_headers)
        assert r.status_code == 422

    def test_negative_mileage_rejected(self, client, admin_headers):
        payload = {"customer_name": "Juan Perez", "mileage": -10}
        r = client.post("/api/vehicles", json=payload, headers=admin_headers)
        assert r.status_code == 422

    def test_search_by_plates(self, client, admin_headers, sample_vehicle):
        r = client.get("/api/vehicles?search=abc-123", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == sample_vehicle.id

    def test_search_by_vin(self, client, admin_headers, sample_vehicle):
        r = client.get("/api/vehicles?search=1hgbh41jxmn109186", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["vin"] == sample_vehicle.vin

    def test_get_vehicle_detail(self, client, admin_headers, sample_vehicle):
        r = client.get(f"/api/vehicles/{sample_vehicle.id}", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == sample_vehicle.id
        assert data["customer_name"] == sample_vehicle.customer_name

    def test_update_vehicle(self, client, admin_headers, sample_vehicle):
        payload = {"contact": "555-9999", "color": "Rojo", "active": False}
        r = client.put(f"/api/vehicles/{sample_vehicle.id}", json=payload, headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["contact"] == "555-9999"
        assert data["color"] == "Rojo"
        assert data["active"] is False

    def test_update_vehicle_rejects_null_customer_name(self, client, admin_headers, sample_vehicle):
        r = client.put(
            f"/api/vehicles/{sample_vehicle.id}",
            json={"customer_name": None},
            headers=admin_headers,
        )
        assert r.status_code == 422

    def test_update_vehicle_rejects_null_active(self, client, admin_headers, sample_vehicle):
        r = client.put(
            f"/api/vehicles/{sample_vehicle.id}",
            json={"active": None},
            headers=admin_headers,
        )
        assert r.status_code == 422

    def test_soft_delete_vehicle(self, client, admin_headers, sample_vehicle):
        r = client.delete(f"/api/vehicles/{sample_vehicle.id}", headers=admin_headers)
        assert r.status_code == 204

        r_list = client.get("/api/vehicles", headers=admin_headers)
        assert r_list.status_code == 200
        ids = [item["id"] for item in r_list.json()["items"]]
        assert sample_vehicle.id not in ids

    def test_get_vehicle_not_found(self, client, admin_headers):
        r = client.get("/api/vehicles/nonexistent-id-9999", headers=admin_headers)
        assert r.status_code == 404
