"""Procurement — link PurchaseOrderItem ↔ InventoryRequest."""
from __future__ import annotations

import pytest

from app.models.inventory import (
    InventoryRequest,
    InventoryRequestStatus,
    Part,
    Warehouse,
)
from app.models.catalog import Service, VehicleModel
from app.models.suppliers import Supplier
from app.models.users import Role, User
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.vehicles import Vehicle
from app.security import hash_password


def _make_user(db, default_branch_id, *, email: str, role: Role, password: str) -> User:
    u = User(
        email=email,
        hashed_password=hash_password(password),
        role=role.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(u)
    db.commit()
    return u


def _token(client, email: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    return r.json()["access_token"]


@pytest.fixture
def almacen_token(client, db, default_branch_id):
    _make_user(db, default_branch_id, email="alm-ir@test.com", role=Role.almacen, password="Almacen1234")
    return _token(client, "alm-ir@test.com", "Almacen1234")


@pytest.fixture
def director_token(client, db, default_branch_id):
    _make_user(db, default_branch_id, email="dir-ir@test.com", role=Role.director, password="Director1234")
    return _token(client, "dir-ir@test.com", "Director1234")


@pytest.fixture
def supplier_a(db):
    s = Supplier(name="IR-LINK-SUP", lead_time_days=2, warranty_days=30, active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def part_a(db):
    p = Part(sku="PR-IR-001", name="Cable", unit="pza", min_stock=2, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def warehouse_main(db, default_branch_id):
    wh = Warehouse(
        branch_id=default_branch_id,
        code="WH-IR",
        name="Almacén IR",
        kind="main",
        active=True,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@pytest.fixture
def work_order(db, default_branch_id):
    model = VehicleModel(brand="Toyota", name="Hilux")
    service = Service(name="Diagnóstico IR")
    veh = Vehicle(
        customer_name="Cliente IR",
        brand="Toyota",
        model="Hilux",
        plates="IR-001",
        year=2020,
    )
    db.add_all([model, service, veh])
    db.commit()
    wo = WorkOrder(
        branch_id=default_branch_id,
        order_number="WO-IR-001",
        vehicle_id=veh.id,
        model_id=model.id,
        service_id=service.id,
        status=WorkOrderStatus.received.value,
    )
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo


@pytest.fixture
def inventory_request(db, default_branch_id, work_order, part_a):
    ir = InventoryRequest(
        branch_id=default_branch_id,
        work_order_id=work_order.id,
        part_id=part_a.id,
        quantity=5,
        priority="normal",
        status=InventoryRequestStatus.approved.value,
    )
    db.add(ir)
    db.commit()
    db.refresh(ir)
    return ir


def test_pending_endpoint_lists_unlinked_irs(
    client, almacen_token, inventory_request,
):
    r = client.get(
        "/api/v1/procurement/inventory-requests/pending",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    ids = [it["id"] for it in body["items"]]
    assert inventory_request.id in ids


def test_create_po_with_ir_link_and_receive_marks_purchased(
    client, db, almacen_token, director_token,
    supplier_a, part_a, warehouse_main, inventory_request,
):
    payload = {
        "supplier_id": supplier_a.id,
        "items": [
            {
                "part_id": part_a.id,
                "quantity": 5,
                "unit_cost": 70.0,
                "inventory_request_id": inventory_request.id,
            }
        ],
    }
    r = client.post(
        "/api/v1/procurement/purchase-orders",
        json=payload,
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 201, r.text
    po_id = r.json()["id"]
    item = r.json()["items"][0]
    assert item["inventory_request_id"] == inventory_request.id

    # Después de crear, la IR debe seguir aprobada (purchased solo al recibir).
    db.expire_all()
    ir = db.query(InventoryRequest).filter(InventoryRequest.id == inventory_request.id).first()
    assert ir.status == InventoryRequestStatus.approved.value

    # Y NO debe aparecer en pending (ya tiene PO line vinculada).
    r = client.get(
        "/api/v1/procurement/inventory-requests/pending",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    pending_ids = [it["id"] for it in r.json()["items"]]
    assert inventory_request.id not in pending_ids

    # Submit → Approve → Receive
    client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/submit",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/approve",
        headers={"Authorization": f"Bearer {director_token}"},
    )
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/receive",
        json={
            "warehouse_id": warehouse_main.id,
            "receipts": [{"item_id": item["id"], "quantity_received": 5}],
        },
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "received"

    # IR debe quedar marcada purchased
    db.expire_all()
    ir = db.query(InventoryRequest).filter(InventoryRequest.id == inventory_request.id).first()
    assert ir.status == InventoryRequestStatus.purchased.value
