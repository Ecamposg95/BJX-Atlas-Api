"""Tests for notification wiring + email transport (Wave 4 close)."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest

from app.models.catalog import Service, VehicleModel
from app.models.inventory import (
    InventoryRequest,
    InventoryRequestStatus,
    Part,
)
from app.models.notifications import Notification
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _mk_user(db, *, email: str, role: str, branch_id: str, password: str = "Pass1234") -> User:
    u = User(
        email=email,
        hashed_password=hash_password(password),
        role=role,
        default_branch_id=branch_id,
        active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _login(client, email: str, password: str = "Pass1234") -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def recepcion_user(db, default_branch_id):
    return _mk_user(db, email="recep-w@test.com", role=Role.recepcion.value, branch_id=default_branch_id)


@pytest.fixture
def jefe_user(db, default_branch_id):
    return _mk_user(db, email="jefe-w@test.com", role=Role.jefe_taller.value, branch_id=default_branch_id)


@pytest.fixture
def mecanico_user(db, default_branch_id):
    return _mk_user(db, email="meca-w@test.com", role=Role.mecanico.value, branch_id=default_branch_id)


@pytest.fixture
def recepcion_headers(client, recepcion_user):
    return _login(client, recepcion_user.email)


@pytest.fixture
def jefe_headers(client, jefe_user):
    return _login(client, jefe_user.email)


@pytest.fixture
def admin_headers(client, admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _count_notifs(db, *, user_id: str, kind: str | None = None) -> int:
    q = db.query(Notification).filter(Notification.user_id == user_id)
    if kind:
        q = q.filter(Notification.kind == kind)
    return q.count()


def _wo_in_progress(db, branch_id, mechanic_id=None, order_number="WO-W-001") -> WorkOrder:
    model = VehicleModel(name="MARCH", brand="NISSAN", active=True)
    service = Service(name="FRENOS", category="frenos", active=True)
    vehicle = Vehicle(branch_id=branch_id, customer_name="Test", plates="W-001", active=True)
    db.add_all([model, service, vehicle])
    db.commit()
    wo = WorkOrder(
        branch_id=branch_id,
        order_number=order_number,
        vehicle_id=vehicle.id,
        model_id=model.id,
        service_id=service.id,
        assigned_mechanic_id=mechanic_id,
        status=WorkOrderStatus.in_progress.value,
        received_at=datetime.now(timezone.utc),
        work_started_at=datetime.now(timezone.utc),
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo


# ---------------------------------------------------------------------------
# Email service — dry-run mode
# ---------------------------------------------------------------------------

class TestEmailDryRun:
    def test_dry_run_when_no_smtp_host(self, monkeypatch):
        from app.services.email import send_email

        monkeypatch.delenv("SMTP_HOST", raising=False)
        res = send_email("user@example.com", "subj", "body")
        assert res == {"sent": False, "dry_run": True, "error": None}

    def test_missing_recipient(self, monkeypatch):
        from app.services.email import send_email

        res = send_email("", "subj", "body")
        assert res["sent"] is False
        assert res["error"]

    def test_create_notification_with_email_dry_run(self, db, recepcion_user, monkeypatch):
        from app.models.notifications import NotificationKind
        from app.services.notifications import create_notification

        monkeypatch.delenv("SMTP_HOST", raising=False)
        n = create_notification(
            db,
            user_id=recepcion_user.id,
            kind=NotificationKind.system,
            title="Hola",
            body="cuerpo",
            send_email=True,
        )
        db.commit()
        assert n.id
        # Si SMTP_HOST está vacío, no crashea y deja la notif en DB
        stored = db.query(Notification).filter(Notification.id == n.id).first()
        assert stored is not None


# ---------------------------------------------------------------------------
# Appointment confirmed → recepción notificada
# ---------------------------------------------------------------------------

class TestAppointmentNotification:
    def test_create_appointment_notifies_recepcion(
        self, client, db, default_branch_id, recepcion_user, recepcion_headers
    ):
        before = _count_notifs(db, user_id=recepcion_user.id, kind="appointment_confirmed")
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        r = client.post(
            "/api/v1/appointments",
            json={
                "customer_name": "Juan",
                "customer_phone": "5215512345678",
                "vehicle_plates": "ABC-1",
                "scheduled_at": future,
                "duration_minutes": 60,
                "service_type": "Frenos",
            },
            headers=recepcion_headers,
        )
        assert r.status_code == 201, r.text
        after = _count_notifs(db, user_id=recepcion_user.id, kind="appointment_confirmed")
        assert after == before + 1
        # Verifica el entity_id apunta a la cita creada
        appt_id = r.json()["id"]
        notif = (
            db.query(Notification)
            .filter(
                Notification.user_id == recepcion_user.id,
                Notification.kind == "appointment_confirmed",
                Notification.entity_id == appt_id,
            )
            .first()
        )
        assert notif is not None
        assert notif.title == "Nueva cita confirmada"


# ---------------------------------------------------------------------------
# WO status changed → mecánico + recepción
# ---------------------------------------------------------------------------

class TestWoStatusChangedNotification:
    def test_status_transition_notifies_mechanic_and_reception(
        self, client, db, default_branch_id, mecanico_user, recepcion_user, admin_headers
    ):
        wo = _wo_in_progress(
            db, default_branch_id, mechanic_id=mecanico_user.id, order_number="WO-W-100"
        )
        # Transition in_progress → quality_check (válida)
        r = client.patch(
            f"/api/v1/work-orders/{wo.id}/status",
            json={"to_status": "quality_check"},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        # Mecánico recibió wo_status_changed
        assert _count_notifs(db, user_id=mecanico_user.id, kind="wo_status_changed") >= 1
        # Recepción recibió wo_status_changed
        assert _count_notifs(db, user_id=recepcion_user.id, kind="wo_status_changed") >= 1


# ---------------------------------------------------------------------------
# QA pending → jefe_taller
# ---------------------------------------------------------------------------

class TestQaPendingNotification:
    def test_qa_pass_notifies_jefe(
        self, client, db, default_branch_id, jefe_user, jefe_headers
    ):
        wo = _wo_in_progress(db, default_branch_id, order_number="WO-W-200")
        # qa-pass desde in_progress: pasa por quality_check → completed
        r = client.post(
            f"/api/workshop/work-orders/{wo.id}/qa-pass",
            headers=jefe_headers,
        )
        assert r.status_code == 200, r.text
        # Jefe se autonotifica de qa_pending (es el único jefe_taller en branch)
        assert _count_notifs(db, user_id=jefe_user.id, kind="qa_pending") >= 1


# ---------------------------------------------------------------------------
# Delivery ready → recepción
# ---------------------------------------------------------------------------

class TestDeliveryReadyNotification:
    def test_qa_pass_to_completed_notifies_reception(
        self, client, db, default_branch_id, jefe_user, recepcion_user, jefe_headers
    ):
        wo = _wo_in_progress(db, default_branch_id, order_number="WO-W-300")
        r = client.post(
            f"/api/workshop/work-orders/{wo.id}/qa-pass",
            headers=jefe_headers,
        )
        assert r.status_code == 200, r.text
        # Recepción debe recibir delivery_ready cuando WO pasa a completed
        assert _count_notifs(db, user_id=recepcion_user.id, kind="delivery_ready") >= 1


# ---------------------------------------------------------------------------
# Parts request approved → mecánico solicitante
# ---------------------------------------------------------------------------

class TestPartsRequestNotification:
    def test_approve_request_notifies_requester(
        self, client, db, default_branch_id, mecanico_user, admin_headers
    ):
        # Setup OS + part
        wo = _wo_in_progress(db, default_branch_id, order_number="WO-W-400")
        part = Part(sku="PT-1", name="Filtro", category="filtros", unit="pza", active=True)
        db.add(part)
        db.commit()

        # Crear request a nombre del mecánico
        req = InventoryRequest(
            branch_id=default_branch_id,
            work_order_id=wo.id,
            part_id=part.id,
            quantity=1.0,
            priority="normal",
            requested_by=mecanico_user.id,
            status=InventoryRequestStatus.pending.value,
        )
        db.add(req)
        db.commit()

        before = _count_notifs(db, user_id=mecanico_user.id, kind="parts_request")
        r = client.post(
            f"/api/inventory/requests/{req.id}/approve",
            json={},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        after = _count_notifs(db, user_id=mecanico_user.id, kind="parts_request")
        assert after == before + 1
