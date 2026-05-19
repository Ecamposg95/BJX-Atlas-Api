"""Tests para Citas/Agenda (Wave 4 — Módulo 1)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.catalog import Service, VehicleModel
from app.models.users import Role, User
from app.security import hash_password


@pytest.fixture
def recepcion_headers(client, db, default_branch_id):
    user = User(
        email="recep@test.com",
        hashed_password=hash_password("Recep1234"),
        role=Role.recepcion.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "recep@test.com", "password": "Recep1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_headers(client, admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def catalog_setup(db):
    model = VehicleModel(name="MARCH", brand="NISSAN", active=True)
    service = Service(name="DIAGNOSTICO", category="diagnostico", active=True)
    db.add_all([model, service])
    db.commit()
    return {"model": model, "service": service}


def _future(minutes: int = 60) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _create(client, headers, *, scheduled_at=None, **overrides):
    payload = {
        "customer_name": "Juan Perez",
        "customer_phone": "5215512345678",
        "vehicle_plates": "ABC-9999",
        "scheduled_at": scheduled_at or _future(120),
        "duration_minutes": 60,
        "service_type": "Revisión general",
    }
    payload.update(overrides)
    return client.post("/api/v1/appointments", json=payload, headers=headers)


class TestAppointmentsCRUD:
    def test_create_and_list(self, client, recepcion_headers):
        r = _create(client, recepcion_headers)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["status"] == "scheduled"
        assert data["customer_name"] == "Juan Perez"

        ls = client.get("/api/v1/appointments", headers=recepcion_headers)
        assert ls.status_code == 200
        items = ls.json()
        assert len(items) == 1
        assert items[0]["id"] == data["id"]

    def test_update_fields(self, client, recepcion_headers):
        r = _create(client, recepcion_headers)
        appt_id = r.json()["id"]
        up = client.patch(
            f"/api/v1/appointments/{appt_id}",
            json={"customer_name": "Pedro", "service_type": "Frenos"},
            headers=recepcion_headers,
        )
        assert up.status_code == 200
        assert up.json()["customer_name"] == "Pedro"
        assert up.json()["service_type"] == "Frenos"

    def test_arrived_transition(self, client, recepcion_headers):
        r = _create(client, recepcion_headers)
        appt_id = r.json()["id"]
        arr = client.post(f"/api/v1/appointments/{appt_id}/arrived", headers=recepcion_headers)
        assert arr.status_code == 200, arr.text
        assert arr.json()["status"] == "arrived"
        # cannot arrive twice
        second = client.post(f"/api/v1/appointments/{appt_id}/arrived", headers=recepcion_headers)
        assert second.status_code == 409

    def test_cancel_requires_reason(self, client, recepcion_headers):
        r = _create(client, recepcion_headers)
        appt_id = r.json()["id"]
        bad = client.post(
            f"/api/v1/appointments/{appt_id}/cancel",
            json={"reason": ""},
            headers=recepcion_headers,
        )
        assert bad.status_code in (400, 422)
        ok = client.post(
            f"/api/v1/appointments/{appt_id}/cancel",
            json={"reason": "cliente reprogramó"},
            headers=recepcion_headers,
        )
        assert ok.status_code == 200
        assert ok.json()["status"] == "cancelled"

    def test_admin_can_soft_delete(self, client, recepcion_headers, admin_headers):
        r = _create(client, recepcion_headers)
        appt_id = r.json()["id"]
        # recepción no puede borrar
        bad = client.delete(f"/api/v1/appointments/{appt_id}", headers=recepcion_headers)
        assert bad.status_code == 403
        ok = client.delete(f"/api/v1/appointments/{appt_id}", headers=admin_headers)
        assert ok.status_code == 204
        # ya no aparece en list
        ls = client.get("/api/v1/appointments", headers=recepcion_headers)
        assert all(item["id"] != appt_id for item in ls.json())


class TestAppointmentConvert:
    def test_convert_creates_wo(self, client, recepcion_headers, catalog_setup):
        r = _create(client, recepcion_headers)
        appt_id = r.json()["id"]
        conv = client.post(
            f"/api/v1/appointments/{appt_id}/convert",
            json={
                "service_id": catalog_setup["service"].id,
            },
            headers=recepcion_headers,
        )
        assert conv.status_code == 200, conv.text
        body = conv.json()
        assert body["appointment"]["status"] == "converted_to_wo"
        assert body["work_order"]["id"]
        assert body["work_order"]["order_number"].startswith("WO-")
        # whatsapp_link presente porque telefono fue dado
        assert body["whatsapp_link"] and "wa.me" in body["whatsapp_link"]

    def test_convert_cancelled_fails(self, client, recepcion_headers, catalog_setup):
        r = _create(client, recepcion_headers)
        appt_id = r.json()["id"]
        client.post(
            f"/api/v1/appointments/{appt_id}/cancel",
            json={"reason": "no_show"},
            headers=recepcion_headers,
        )
        conv = client.post(
            f"/api/v1/appointments/{appt_id}/convert",
            json={"service_id": catalog_setup["service"].id},
            headers=recepcion_headers,
        )
        assert conv.status_code == 409


class TestAppointmentBranchScoping:
    def test_filters_by_date_range(self, client, recepcion_headers):
        far = _create(client, recepcion_headers, scheduled_at=_future(60 * 24 * 30))
        near = _create(client, recepcion_headers, scheduled_at=_future(30))
        assert far.status_code == 201
        assert near.status_code == 201

        now_iso = datetime.now(timezone.utc).isoformat()
        soon_iso = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        ls = client.get(
            "/api/v1/appointments",
            params={"date_from": now_iso, "date_to": soon_iso},
            headers=recepcion_headers,
        )
        assert ls.status_code == 200
        items = ls.json()
        ids = [i["id"] for i in items]
        assert near.json()["id"] in ids
        assert far.json()["id"] not in ids
