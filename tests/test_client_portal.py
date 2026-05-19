"""Tests del Portal Cliente público (US-12)."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from app.models.catalog import Service, ServiceCatalog, VehicleModel
from app.models.evidence import MobileEvidence, MobileEvidenceKind
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.models.workshop_history import WorkOrderStatusHistory
from app.security import hash_password


def _create_admin_headers(client, db):
    user = User(
        email="admin-portal@test.com",
        hashed_password=hash_password("Admin1234"),
        role=Role.admin,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post(
        "/api/auth/login",
        json={"email": "admin-portal@test.com", "password": "Admin1234"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def seeded_work_order(db):
    """Crea una OS con vehículo, líneas y timeline para los tests del portal."""
    model = VehicleModel(name="NISSAN MARCH", brand="NISSAN", active=True)
    service = Service(name="SERVICIO DE FRENOS", category="frenos", active=True)
    vehicle = Vehicle(
        customer_name="Cliente Secreto",
        contact="555-9999",
        brand="NISSAN",
        model="MARCH",
        year=2022,
        plates="XYZ-987",
        vin="3N1AB7AP0KY999999",
        active=True,
    )
    db.add_all([model, service, vehicle])
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

    now = datetime.now(timezone.utc)
    wo = WorkOrder(
        order_number="WO-TEST-001",
        vehicle_id=vehicle.id,
        model_id=model.id,
        service_id=service.id,
        status=WorkOrderStatus.in_progress.value,
        received_at=now - timedelta(hours=3),
        promised_at=now + timedelta(hours=2),
        notes="Notas internas confidenciales",
    )
    db.add(wo)
    db.commit()

    # Timeline desordenado a propósito — la API debe ordenarlo cronológicamente
    history = [
        WorkOrderStatusHistory(
            work_order_id=wo.id,
            from_status=None,
            to_status="received",
            occurred_at=now - timedelta(hours=3),
            reason="Ingreso inicial",
        ),
        WorkOrderStatusHistory(
            work_order_id=wo.id,
            from_status="assigned",
            to_status="in_progress",
            occurred_at=now - timedelta(hours=1),
            reason=None,
        ),
        WorkOrderStatusHistory(
            work_order_id=wo.id,
            from_status="received",
            to_status="assigned",
            occurred_at=now - timedelta(hours=2),
            reason=None,
        ),
    ]
    db.add_all(history)
    db.commit()

    return wo


def _add_lines(db, wo, statuses):
    model = db.query(VehicleModel).first()
    service = db.query(Service).first()
    for st in statuses:
        line = WorkOrderLine(
            work_order_id=wo.id,
            service_id=service.id,
            status=st,
        )
        db.add(line)
    db.commit()


class TestClientPortalLookup:
    def test_get_existing_folio_returns_200(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["folio"] == "WO-TEST-001"
        assert data["status"] == "in_progress"
        assert data["vehicle"]["plates"] == "XYZ-987"
        assert data["vehicle"]["brand"] == "NISSAN"
        assert data["vehicle"]["model"] == "MARCH"
        assert data["vehicle"]["year"] == 2022
        assert data["received_at"] is not None
        assert data["estimated_ready_at"] is not None
        assert data["branch_name"] is not None
        assert "timeline" in data

    def test_unknown_folio_returns_404(self, client, seeded_work_order):
        r = client.get("/api/v1/client/units/folio-falso")
        assert r.status_code == 404

    def test_works_without_authorization_header(self, client, seeded_work_order):
        """El endpoint es público — no debe requerir Authorization."""
        r = client.get(
            f"/api/v1/client/units/{seeded_work_order.order_number}",
        )
        assert r.status_code == 200

    def test_works_with_invalid_authorization_header(self, client, seeded_work_order):
        """Tampoco debe romperse si llega un Bearer inválido residual."""
        r = client.get(
            f"/api/v1/client/units/{seeded_work_order.order_number}",
            headers={"Authorization": "Bearer invalid-token-xyz"},
        )
        assert r.status_code == 200


class TestClientPortalSafety:
    def test_response_does_not_leak_sensitive_keys(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        body = json.dumps(r.json()).lower()
        forbidden_substrings = [
            "costo",
            "cost",
            "precio",
            "price",
            "supplier",
            "proveedor",
            "mechanic",
            "mecanico",
            "mecánico",
            "contact",
            "customer_name",
            "notes",
            "notas internas",
            "vin",
            "cliente secreto",
        ]
        for token in forbidden_substrings:
            assert token not in body, (
                f"Campo sensible '{token}' filtrado en respuesta pública: {body}"
            )


class TestClientPortalTimeline:
    def test_timeline_ordered_chronologically(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        data = r.json()
        timeline = data["timeline"]
        assert len(timeline) == 3
        timestamps = [entry["timestamp"] for entry in timeline]
        assert timestamps == sorted(timestamps)
        statuses = [entry["status"] for entry in timeline]
        assert statuses == ["received", "assigned", "in_progress"]


class TestClientPortalProgress:
    def test_progress_zero_with_no_lines(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        assert r.json()["progress_pct"] == 0

    def test_progress_mixed_finished_and_pending(self, client, db, seeded_work_order):
        _add_lines(
            db,
            seeded_work_order,
            [
                WorkOrderLineStatus.completed.value,
                WorkOrderLineStatus.completed.value,
                WorkOrderLineStatus.in_progress.value,
                WorkOrderLineStatus.pending.value,
            ],
        )
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        # 2 de 4 completadas = 50%
        assert r.json()["progress_pct"] == 50

    def test_progress_all_finished(self, client, db, seeded_work_order):
        _add_lines(
            db,
            seeded_work_order,
            [
                WorkOrderLineStatus.completed.value,
                WorkOrderLineStatus.completed.value,
            ],
        )
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        assert r.json()["progress_pct"] == 100


class TestClientPortalLines:
    def test_lines_returns_label_and_status(self, client, db, seeded_work_order):
        _add_lines(
            db,
            seeded_work_order,
            [
                WorkOrderLineStatus.completed.value,
                WorkOrderLineStatus.in_progress.value,
            ],
        )
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        data = r.json()
        assert "lines" in data
        assert len(data["lines"]) == 2
        line = data["lines"][0]
        assert "label" in line
        assert "status" in line
        assert line["label"] == "SERVICIO DE FRENOS"

    def test_lines_empty_when_no_workorder_lines(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        assert r.json()["lines"] == []


class TestClientPortalStages:
    def test_stages_six_etapas_with_keys(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        stages = r.json()["stages"]
        assert len(stages) == 6
        keys = [s["key"] for s in stages]
        assert keys == [
            "recepcion",
            "diagnostico",
            "refacciones",
            "trabajo",
            "qa",
            "entrega",
        ]
        for st in stages:
            assert "label" in st
            assert "pct" in st
            assert 0 <= st["pct"] <= 100

    def test_stages_recepcion_complete_when_received(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        stages = {s["key"]: s for s in r.json()["stages"]}
        assert stages["recepcion"]["pct"] == 100
        # OS está in_progress por seed → diagnostico debe estar al 100%
        assert stages["diagnostico"]["pct"] == 100
        # entrega y qa aún no
        assert stages["entrega"]["pct"] == 0


class TestClientPortalPhotos:
    def test_photos_empty_when_none(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        assert r.json()["photos"] == []

    def test_photos_returns_urls(self, client, db, seeded_work_order):
        ev = MobileEvidence(
            kind=MobileEvidenceKind.damage_photo.value,
            storage_key=f"branches/x/mobile-evidence/damage_photo/foo.jpg",
            public_url="https://cdn.example.com/foo.jpg",
            work_order_id=seeded_work_order.id,
            mime_type="image/jpeg",
            size_bytes=12345,
        )
        db.add(ev)
        db.commit()
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        photos = r.json()["photos"]
        assert "https://cdn.example.com/foo.jpg" in photos


class TestClientPortalEta:
    def test_eta_text_present_with_promised_at(self, client, seeded_work_order):
        r = client.get(f"/api/v1/client/units/{seeded_work_order.order_number}")
        eta = r.json()["eta_text"]
        assert eta is not None
        assert isinstance(eta, str)
        assert len(eta) > 0
