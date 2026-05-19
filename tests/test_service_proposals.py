"""Tests Service Proposals (Ola 5 final)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.models.catalog import Service, VehicleModel
from app.models.notifications import Notification
from app.models.service_proposals import ServiceProposal
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine
from app.security import hash_password


@pytest.fixture
def admin_headers(client, admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def jefe_headers(client, db, default_branch_id):
    user = User(
        email="jefe-prop@test.com",
        hashed_password=hash_password("Jefe1234"),
        role=Role.jefe_taller.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post(
        "/api/auth/login",
        json={"email": "jefe-prop@test.com", "password": "Jefe1234"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def gerente_headers(client, db, default_branch_id):
    user = User(
        email="gerente-prop@test.com",
        hashed_password=hash_password("Gerente1234"),
        role=Role.gerente_sede.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post(
        "/api/auth/login",
        json={"email": "gerente-prop@test.com", "password": "Gerente1234"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def mecanico_headers(client, db, default_branch_id):
    user = User(
        email="meca-prop@test.com",
        hashed_password=hash_password("Meca1234"),
        role=Role.mecanico.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post(
        "/api/auth/login",
        json={"email": "meca-prop@test.com", "password": "Meca1234"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def gerente_user(db, default_branch_id):
    user = User(
        email="manager-listen@test.com",
        hashed_password=hash_password("Manager1234"),
        role=Role.gerente_sede.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def wo_in_progress(db, default_branch_id):
    model = VehicleModel(name="MARCH", brand="NISSAN", active=True)
    service = Service(name="FRENOS", category="frenos", active=True)
    vehicle = Vehicle(
        branch_id=default_branch_id,
        customer_name="Prop Cliente",
        plates="PRP-001",
        active=True,
    )
    db.add_all([model, service, vehicle])
    db.commit()
    wo = WorkOrder(
        branch_id=default_branch_id,
        order_number="WO-PROP-001",
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


def _create_payload(wo_id: str, **overrides):
    base = {
        "work_order_id": wo_id,
        "service_name": "Cambio de bujías adicional",
        "quantity": 1,
        "estimated_hours": "1.5",
        "estimated_parts_cost": "450.00",
        "estimated_total": "950.00",
        "reason": "Bujías oxidadas detectadas durante el servicio",
    }
    base.update(overrides)
    return base


class TestCreateProposal:
    def test_jefe_can_create(self, client, jefe_headers, wo_in_progress):
        r = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["service_name"] == "Cambio de bujías adicional"
        assert body["work_order_id"] == wo_in_progress.id
        assert body["proposed_by_id"] is not None

    def test_mecanico_forbidden(self, client, mecanico_headers, wo_in_progress):
        r = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=mecanico_headers,
        )
        assert r.status_code == 403

    def test_create_notifies_manager(
        self, client, jefe_headers, wo_in_progress, db, gerente_user
    ):
        r = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        assert r.status_code == 201, r.text
        notifs = (
            db.query(Notification)
            .filter(Notification.user_id == gerente_user.id)
            .filter(Notification.entity_type == "service_proposal")
            .all()
        )
        assert len(notifs) >= 1
        assert "propuesta" in notifs[0].title.lower()

    def test_wo_not_open_rejected(self, client, jefe_headers, wo_in_progress, db):
        wo_in_progress.status = WorkOrderStatus.delivered.value
        db.commit()
        r = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        assert r.status_code == 409


class TestApproveProposal:
    def test_approve_materializes_line(
        self, client, jefe_headers, gerente_headers, wo_in_progress, db
    ):
        cr = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        proposal_id = cr.json()["id"]

        before = db.query(WorkOrderLine).filter(
            WorkOrderLine.work_order_id == wo_in_progress.id
        ).count()

        r = client.post(
            f"/api/v1/service-proposals/{proposal_id}/approve",
            json={"notes": "Aprobado, proceder."},
            headers=gerente_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "approved"
        assert body["materialized_line_id"] is not None
        assert body["review_notes"] == "Aprobado, proceder."

        after = db.query(WorkOrderLine).filter(
            WorkOrderLine.work_order_id == wo_in_progress.id
        ).count()
        assert after == before + 1

        line = db.query(WorkOrderLine).filter(
            WorkOrderLine.id == body["materialized_line_id"]
        ).first()
        assert line is not None
        assert line.work_order_id == wo_in_progress.id

    def test_approve_twice_fails(
        self, client, jefe_headers, gerente_headers, wo_in_progress
    ):
        cr = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        proposal_id = cr.json()["id"]

        r1 = client.post(
            f"/api/v1/service-proposals/{proposal_id}/approve",
            json={},
            headers=gerente_headers,
        )
        assert r1.status_code == 200

        r2 = client.post(
            f"/api/v1/service-proposals/{proposal_id}/approve",
            json={},
            headers=gerente_headers,
        )
        assert r2.status_code == 409

    def test_jefe_cannot_approve(self, client, jefe_headers, wo_in_progress):
        cr = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        proposal_id = cr.json()["id"]
        r = client.post(
            f"/api/v1/service-proposals/{proposal_id}/approve",
            json={},
            headers=jefe_headers,
        )
        assert r.status_code == 403


class TestRejectProposal:
    def test_reject_does_not_create_line(
        self, client, jefe_headers, gerente_headers, wo_in_progress, db
    ):
        cr = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        proposal_id = cr.json()["id"]

        before = db.query(WorkOrderLine).filter(
            WorkOrderLine.work_order_id == wo_in_progress.id
        ).count()

        r = client.post(
            f"/api/v1/service-proposals/{proposal_id}/reject",
            json={"notes": "No procede en este momento."},
            headers=gerente_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "rejected"
        assert body["materialized_line_id"] is None

        after = db.query(WorkOrderLine).filter(
            WorkOrderLine.work_order_id == wo_in_progress.id
        ).count()
        assert after == before


class TestCancelProposal:
    def test_proposer_can_cancel(self, client, jefe_headers, wo_in_progress):
        cr = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        proposal_id = cr.json()["id"]
        r = client.post(
            f"/api/v1/service-proposals/{proposal_id}/cancel",
            headers=jefe_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "cancelled"


class TestListProposals:
    def test_list_by_work_order(
        self, client, jefe_headers, wo_in_progress
    ):
        client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        client.post(
            "/api/v1/service-proposals",
            json=_create_payload(
                wo_in_progress.id, service_name="Lavado motor"
            ),
            headers=jefe_headers,
        )
        r = client.get(
            f"/api/v1/work-orders/{wo_in_progress.id}/proposals",
            headers=jefe_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 2
        assert len(body["items"]) == 2

    def test_filter_by_status(
        self, client, jefe_headers, gerente_headers, wo_in_progress
    ):
        cr = client.post(
            "/api/v1/service-proposals",
            json=_create_payload(wo_in_progress.id),
            headers=jefe_headers,
        )
        client.post(
            f"/api/v1/service-proposals/{cr.json()['id']}/approve",
            json={},
            headers=gerente_headers,
        )
        client.post(
            "/api/v1/service-proposals",
            json=_create_payload(
                wo_in_progress.id, service_name="Otra propuesta"
            ),
            headers=jefe_headers,
        )

        r = client.get(
            "/api/v1/service-proposals?status=pending",
            headers=gerente_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 1
        assert body["items"][0]["status"] == "pending"
