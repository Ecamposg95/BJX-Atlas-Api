"""Tests para QA workflow (Wave 4 — Módulo 2)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models.catalog import Service, VehicleModel
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.security import hash_password


@pytest.fixture
def admin_headers(client, admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def jefe_headers(client, db, default_branch_id):
    user = User(
        email="jefe@test.com",
        hashed_password=hash_password("Jefe1234"),
        role=Role.jefe_taller.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "jefe@test.com", "password": "Jefe1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def mecanico_headers(client, db, default_branch_id):
    user = User(
        email="meca@test.com",
        hashed_password=hash_password("Meca1234"),
        role=Role.mecanico.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "meca@test.com", "password": "Meca1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def wo_in_progress(db, default_branch_id):
    model = VehicleModel(name="MARCH", brand="NISSAN", active=True)
    service = Service(name="FRENOS", category="frenos", active=True)
    vehicle = Vehicle(
        branch_id=default_branch_id,
        customer_name="QA Cliente",
        plates="QA-001",
        active=True,
    )
    db.add_all([model, service, vehicle])
    db.commit()
    wo = WorkOrder(
        branch_id=default_branch_id,
        order_number="WO-QA-001",
        vehicle_id=vehicle.id,
        model_id=model.id,
        service_id=service.id,
        status=WorkOrderStatus.in_progress.value,
        received_at=datetime.now(timezone.utc),
        work_started_at=datetime.now(timezone.utc),
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo


class TestQAPass:
    def test_jefe_can_pass(self, client, jefe_headers, wo_in_progress):
        r = client.post(
            f"/api/workshop/work-orders/{wo_in_progress.id}/qa-pass",
            headers=jefe_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["qa"] == "passed"
        assert r.json()["status"] == "completed"

    def test_mecanico_forbidden(self, client, mecanico_headers, wo_in_progress):
        r = client.post(
            f"/api/workshop/work-orders/{wo_in_progress.id}/qa-pass",
            headers=mecanico_headers,
        )
        assert r.status_code == 403


class TestQAFail:
    def test_jefe_can_fail_with_reason(self, client, jefe_headers, wo_in_progress):
        r = client.post(
            f"/api/workshop/work-orders/{wo_in_progress.id}/qa-fail",
            json={"reason": "Falta apretar tornillos del caliper"},
            headers=jefe_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["qa"] == "failed"
        assert r.json()["status"] == "in_progress"
        assert "tornillos" in r.json()["reason"]

    def test_reason_required(self, client, jefe_headers, wo_in_progress):
        r = client.post(
            f"/api/workshop/work-orders/{wo_in_progress.id}/qa-fail",
            json={"reason": ""},
            headers=jefe_headers,
        )
        assert r.status_code in (400, 422)
