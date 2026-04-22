from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.users import User, Role
from app.models.vehicles import Vehicle
from app.security import hash_password


@pytest.fixture
def admin_headers(client, db):
    user = User(
        email="admin-wo@test.com",
        hashed_password=hash_password("Admin1234"),
        role=Role.admin,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "admin-wo@test.com", "password": "Admin1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def operador_headers(client, db):
    user = User(
        email="operador-wo@test.com",
        hashed_password=hash_password("Operador1234"),
        role=Role.operador,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post(
        "/api/auth/login",
        json={"email": "operador-wo@test.com", "password": "Operador1234"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def viewer_headers(client, db):
    user = User(
        email="viewer-wo@test.com",
        hashed_password=hash_password("Viewer1234"),
        role=Role.viewer,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "viewer-wo@test.com", "password": "Viewer1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def work_order_setup(db):
    model = VehicleModel(name="NISSAN MARCH", brand="NISSAN", active=True)
    service = Service(name="SERVICIO DE FRENOS", category="frenos", active=True)
    vehicle = Vehicle(
        customer_name="Juan Perez",
        contact="555-1234",
        brand="NISSAN",
        model="MARCH",
        year=2022,
        plates="ABC-123",
        vin="3N1AB7AP0KY123456",
        mileage=12000,
        color="BLANCO",
        active=True,
    )
    mechanic = User(
        email="mechanic@test.com",
        hashed_password=hash_password("Mechanic1234"),
        role=Role.operador,
        active=True,
    )
    db.add_all([model, service, vehicle, mechanic])
    db.commit()

    catalog = ServiceCatalog(
        model_id=model.id,
        service_id=service.id,
        bjx_labor_cost=300.0,
        bjx_parts_cost=450.0,
        duration_hrs=2.0,
        source="test",
        is_current=True,
    )
    db.add(catalog)
    db.commit()

    return {
        "model": model,
        "service": service,
        "vehicle": vehicle,
        "mechanic": mechanic,
        "catalog": catalog,
    }


def _create_work_order(client, headers, setup, *, assigned_mechanic_id=None):
    payload = {
        "vehicle_id": setup["vehicle"].id,
        "model_id": setup["model"].id,
        "service_id": setup["service"].id,
        "notes": "Ingreso inicial",
        "delay_reason": None,
    }
    if assigned_mechanic_id is not None:
        payload["assigned_mechanic_id"] = assigned_mechanic_id
    return client.post("/api/work-orders", json=payload, headers=headers)


class TestWorkOrdersListDetail:
    def test_list_empty(self, client, admin_headers):
        r = client.get("/api/work-orders", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_get_detail(self, client, admin_headers, work_order_setup):
        created = _create_work_order(
            client,
            admin_headers,
            work_order_setup,
            assigned_mechanic_id=work_order_setup["mechanic"].id,
        )
        assert created.status_code == 201, created.text
        work_order_id = created.json()["id"]

        r = client.get(f"/api/work-orders/{work_order_id}", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == work_order_id
        assert data["vehicle_summary"]["plates"] == "ABC-123"
        assert data["service_name"] == "SERVICIO DE FRENOS"
        assert data["assigned_mechanic_email"] == "mechanic@test.com"
        assert data["standard_duration_hrs"] == 2.0
        assert data["semaphore_status"] == "pending"


class TestWorkOrderLifecycle:
    def test_create_work_order_success(self, client, admin_headers, work_order_setup):
        r = _create_work_order(
            client,
            admin_headers,
            work_order_setup,
            assigned_mechanic_id=work_order_setup["mechanic"].id,
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["order_number"].startswith("WO-")
        assert data["status"] == "received"
        assert data["vehicle_summary"]["customer_name"] == "Juan Perez"
        assert data["assigned_mechanic_email"] == "mechanic@test.com"

    def test_viewer_forbidden_on_write_actions(self, client, viewer_headers, work_order_setup):
        created = _create_work_order(client, viewer_headers, work_order_setup)
        assert created.status_code == 403

        admin_created = _create_work_order(client, {"Authorization": viewer_headers["Authorization"]}, work_order_setup)
        assert admin_created.status_code == 403

    def test_viewer_forbidden_on_update_start_finish_deliver(self, client, admin_headers, viewer_headers, work_order_setup):
        created = _create_work_order(client, admin_headers, work_order_setup)
        assert created.status_code == 201, created.text
        work_order_id = created.json()["id"]

        update_r = client.put(
            f"/api/work-orders/{work_order_id}",
            json={"notes": "viewer"},
            headers=viewer_headers,
        )
        assert update_r.status_code == 403

        for path in ("start", "finish", "deliver"):
            action_r = client.post(f"/api/work-orders/{work_order_id}/{path}", headers=viewer_headers)
            assert action_r.status_code == 403

    def test_start_sets_timestamp_and_status(self, client, admin_headers, work_order_setup):
        created = _create_work_order(client, admin_headers, work_order_setup)
        work_order_id = created.json()["id"]

        r = client.post(f"/api/work-orders/{work_order_id}/start", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "in_progress"
        assert data["work_started_at"] is not None

    def test_finish_sets_timestamp_duration_and_semaphore(self, client, admin_headers, db, work_order_setup):
        created = _create_work_order(client, admin_headers, work_order_setup)
        work_order_id = created.json()["id"]

        start_r = client.post(f"/api/work-orders/{work_order_id}/start", headers=admin_headers)
        assert start_r.status_code == 200, start_r.text

        from app.models.work_orders import WorkOrder

        work_order = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
        work_order.work_started_at = datetime.now(timezone.utc) - timedelta(hours=2)
        db.commit()

        finish_r = client.post(f"/api/work-orders/{work_order_id}/finish", headers=admin_headers)
        assert finish_r.status_code == 200, finish_r.text
        data = finish_r.json()
        assert data["status"] == "completed"
        assert data["work_finished_at"] is not None
        assert data["actual_duration_minutes"] is not None
        assert data["semaphore_status"] == "yellow"

    def test_deliver_closes_order(self, client, admin_headers, work_order_setup):
        created = _create_work_order(client, admin_headers, work_order_setup)
        work_order_id = created.json()["id"]

        r = client.post(f"/api/work-orders/{work_order_id}/deliver", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "delivered"
        assert data["closed_at"] is not None

    def test_missing_standard_returns_pending_semaphore(self, client, admin_headers, db, work_order_setup):
        from app.models.catalog import ServiceCatalog

        db.query(ServiceCatalog).delete()
        db.commit()

        created = _create_work_order(client, admin_headers, work_order_setup)
        work_order_id = created.json()["id"]

        client.post(f"/api/work-orders/{work_order_id}/start", headers=admin_headers)
        finish_r = client.post(f"/api/work-orders/{work_order_id}/finish", headers=admin_headers)
        assert finish_r.status_code == 200, finish_r.text
        data = finish_r.json()
        assert data["semaphore_status"] == "pending"

    def test_invalid_foreign_keys_return_404(self, client, admin_headers, work_order_setup):
        bad_vehicle = client.post(
            "/api/work-orders",
            json={
                "vehicle_id": "00000000-0000-0000-0000-000000000000",
                "model_id": work_order_setup["model"].id,
                "service_id": work_order_setup["service"].id,
            },
            headers=admin_headers,
        )
        assert bad_vehicle.status_code == 404

        created = _create_work_order(client, admin_headers, work_order_setup)
        work_order_id = created.json()["id"]

        bad_update = client.put(
            f"/api/work-orders/{work_order_id}",
            json={"service_id": "00000000-0000-0000-0000-000000000000"},
            headers=admin_headers,
        )
        assert bad_update.status_code == 404

    def test_repeated_lifecycle_updates_do_not_explode(self, client, admin_headers, work_order_setup):
        created = _create_work_order(client, admin_headers, work_order_setup)
        work_order_id = created.json()["id"]

        first_start = client.post(f"/api/work-orders/{work_order_id}/start", headers=admin_headers)
        second_start = client.post(f"/api/work-orders/{work_order_id}/start", headers=admin_headers)
        first_finish = client.post(f"/api/work-orders/{work_order_id}/finish", headers=admin_headers)
        second_finish = client.post(f"/api/work-orders/{work_order_id}/finish", headers=admin_headers)
        first_deliver = client.post(f"/api/work-orders/{work_order_id}/deliver", headers=admin_headers)
        second_deliver = client.post(f"/api/work-orders/{work_order_id}/deliver", headers=admin_headers)

        assert first_start.status_code == 200
        assert second_start.status_code == 200
        assert first_finish.status_code == 200
        assert second_finish.status_code == 200
        assert first_deliver.status_code == 200
        assert second_deliver.status_code == 200
