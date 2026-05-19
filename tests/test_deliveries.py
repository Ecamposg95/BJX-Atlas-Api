"""Tests para Entregas con firma + acuse PDF (Wave 4 — Módulos 3 y 4)."""
from __future__ import annotations

import base64
from datetime import datetime, timezone

import pytest

from app.models.catalog import Service, VehicleModel
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.security import hash_password


# Pixel PNG transparente 1x1
_TRANSPARENT_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture
def admin_headers(client, admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def completed_wo(db, default_branch_id):
    """Crea OS en estado completed, lista para entregar."""
    model = VehicleModel(name="MARCH", brand="NISSAN", active=True)
    service = Service(name="FRENOS", category="frenos", active=True)
    vehicle = Vehicle(
        branch_id=default_branch_id,
        customer_name="Cliente Test",
        contact="5215512345678",
        plates="DEL-111",
        active=True,
    )
    db.add_all([model, service, vehicle])
    db.commit()

    wo = WorkOrder(
        branch_id=default_branch_id,
        order_number="WO-2026-TEST-001",
        vehicle_id=vehicle.id,
        model_id=model.id,
        service_id=service.id,
        status=WorkOrderStatus.completed.value,
        received_at=datetime.now(timezone.utc),
        work_finished_at=datetime.now(timezone.utc),
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo


class TestDeliverWithSignature:
    def test_happy_path(self, client, admin_headers, completed_wo):
        r = client.post(
            f"/api/v1/work-orders/{completed_wo.id}/deliver-with-signature",
            json={
                "customer_name": "Cliente Test",
                "signature_base64": f"data:image/png;base64,{_TRANSPARENT_PNG_B64}",
                "exit_mileage": 50000,
            },
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["delivery"]["customer_name"] == "Cliente Test"
        assert body["delivery"]["signature_url"]
        assert body["work_order"]["status"] == "delivered"
        # whatsapp link presente por contact en vehicle
        assert body["whatsapp_link"] and "wa.me" in body["whatsapp_link"]
        # pdf_url puede ser None si la generación falla en CI, pero el endpoint
        # /acuse.pdf siempre debe regenerar.

    def test_already_delivered_blocks(self, client, admin_headers, completed_wo):
        client.post(
            f"/api/v1/work-orders/{completed_wo.id}/deliver-with-signature",
            json={
                "customer_name": "x",
                "signature_base64": _TRANSPARENT_PNG_B64,
            },
            headers=admin_headers,
        )
        again = client.post(
            f"/api/v1/work-orders/{completed_wo.id}/deliver-with-signature",
            json={
                "customer_name": "x",
                "signature_base64": _TRANSPARENT_PNG_B64,
            },
            headers=admin_headers,
        )
        assert again.status_code == 409

    def test_invalid_signature_rejected(self, client, admin_headers, completed_wo):
        r = client.post(
            f"/api/v1/work-orders/{completed_wo.id}/deliver-with-signature",
            json={
                "customer_name": "x",
                "signature_base64": "no-es-base64-valido!!!",
            },
            headers=admin_headers,
        )
        assert r.status_code == 422


class TestAcusePDF:
    def test_returns_pdf_after_delivery(self, client, admin_headers, completed_wo):
        del_r = client.post(
            f"/api/v1/work-orders/{completed_wo.id}/deliver-with-signature",
            json={
                "customer_name": "Cliente Test",
                "signature_base64": _TRANSPARENT_PNG_B64,
            },
            headers=admin_headers,
        )
        assert del_r.status_code == 200, del_r.text

        pdf_r = client.get(
            f"/api/v1/work-orders/{completed_wo.id}/acuse.pdf",
            headers=admin_headers,
        )
        assert pdf_r.status_code == 200, pdf_r.text
        assert pdf_r.headers["content-type"] == "application/pdf"
        assert pdf_r.content.startswith(b"%PDF")

    def test_404_when_no_delivery(self, client, admin_headers, completed_wo):
        r = client.get(
            f"/api/v1/work-orders/{completed_wo.id}/acuse.pdf",
            headers=admin_headers,
        )
        assert r.status_code == 404
