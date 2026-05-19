"""Procurement (Ola 6) — flujo PO completo + guards + permisos."""
from __future__ import annotations

import pytest

from app.models.inventory import (
    InventoryMovement,
    InventoryMovementType,
    Part,
    StockLevel,
    Warehouse,
)
from app.models.suppliers import Supplier
from app.models.users import Role, User
from app.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

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
    _make_user(db, default_branch_id, email="alm-proc@test.com", role=Role.almacen, password="Almacen1234")
    return _token(client, "alm-proc@test.com", "Almacen1234")


@pytest.fixture
def director_token(client, db, default_branch_id):
    _make_user(db, default_branch_id, email="dir-proc@test.com", role=Role.director, password="Director1234")
    return _token(client, "dir-proc@test.com", "Director1234")


@pytest.fixture
def mecanico_token(client, db, default_branch_id):
    _make_user(db, default_branch_id, email="mec-proc@test.com", role=Role.mecanico, password="Mecanico1234")
    return _token(client, "mec-proc@test.com", "Mecanico1234")


@pytest.fixture
def supplier_a(db):
    s = Supplier(name="REFAMEX", lead_time_days=2, warranty_days=30, active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def part_a(db):
    p = Part(sku="PR-001", name="Aceite 5W30", unit="lt", min_stock=10, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def part_b(db):
    p = Part(sku="PR-002", name="Filtro aire", unit="pza", min_stock=5, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def warehouse_main(db, default_branch_id):
    wh = Warehouse(
        branch_id=default_branch_id,
        code="MAIN-PROC",
        name="Principal Procurement",
        kind="main",
        active=True,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


def _create_po_payload(supplier_a, part_a, part_b):
    return {
        "supplier_id": supplier_a.id,
        "notes": "Compra de prueba",
        "items": [
            {"part_id": part_a.id, "quantity": 4, "unit_cost": 250.0},
            {"part_id": part_b.id, "quantity": 2, "unit_cost": 180.0},
        ],
    }


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestProcurementFlow:

    def test_create_draft(self, client, almacen_token, supplier_a, part_a, part_b):
        payload = _create_po_payload(supplier_a, part_a, part_b)
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=payload,
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["status"] == "draft"
        assert data["folio"].startswith("PO-")
        assert len(data["items"]) == 2
        # 4*250 + 2*180 = 1360
        assert float(data["total_amount"]) == 1360.0

    def test_full_flow_create_submit_approve_receive(
        self, client, db, almacen_token, director_token,
        supplier_a, part_a, part_b, warehouse_main, default_branch_id,
    ):
        # Create
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 201
        po_id = r.json()["id"]

        # Submit
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/submit",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "submitted"

        # Approve (director)
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/approve",
            headers={"Authorization": f"Bearer {director_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        items = r.json()["items"]
        item_ids = [it["id"] for it in items]

        # Receive (almacen) — total
        receipts_payload = {
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": item_ids[0], "quantity_received": 4, "unit_cost": 260.0},
                {"item_id": item_ids[1], "quantity_received": 2},
            ],
        }
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/receive",
            json=receipts_payload,
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "received"

        # Inventory side-effects
        db.expire_all()
        # part_a debe tener last_unit_cost = 260 (override)
        p_a = db.query(Part).filter(Part.id == part_a.id).first()
        assert p_a.last_unit_cost == 260.0
        # part_b mantiene unit_cost original 180 (no override)
        p_b = db.query(Part).filter(Part.id == part_b.id).first()
        assert p_b.last_unit_cost == 180.0

        # StockLevel se incrementó
        sl_a = (
            db.query(StockLevel)
            .filter(StockLevel.warehouse_id == warehouse_main.id, StockLevel.part_id == part_a.id)
            .first()
        )
        assert sl_a is not None
        assert sl_a.quantity == 4
        sl_b = (
            db.query(StockLevel)
            .filter(StockLevel.warehouse_id == warehouse_main.id, StockLevel.part_id == part_b.id)
            .first()
        )
        assert sl_b.quantity == 2

        # InventoryMovement inbound creado
        movs = (
            db.query(InventoryMovement)
            .filter(
                InventoryMovement.warehouse_id == warehouse_main.id,
                InventoryMovement.movement_type == InventoryMovementType.inbound.value,
            )
            .all()
        )
        assert len(movs) == 2

    def test_list_purchase_orders_and_filter(
        self, client, almacen_token, supplier_a, part_a, part_b,
    ):
        client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        r = client.get(
            "/api/v1/procurement/purchase-orders",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        # filtro por status
        r = client.get(
            "/api/v1/procurement/purchase-orders?status=draft",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 200
        for po in r.json()["items"]:
            assert po["status"] == "draft"


# ---------------------------------------------------------------------------
# Guards / state machine
# ---------------------------------------------------------------------------

class TestProcurementGuards:

    def test_cannot_approve_without_submit(
        self, client, almacen_token, director_token, supplier_a, part_a, part_b,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        po_id = r.json()["id"]
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/approve",
            headers={"Authorization": f"Bearer {director_token}"},
        )
        assert r.status_code == 409

    def test_cannot_receive_without_approve(
        self, client, almacen_token, supplier_a, part_a, part_b, warehouse_main,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        po_id = r.json()["id"]
        items = r.json()["items"]
        # submit only, not approve
        client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/submit",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        receipts_payload = {
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": items[0]["id"], "quantity_received": 4},
                {"item_id": items[1]["id"], "quantity_received": 2},
            ],
        }
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/receive",
            json=receipts_payload,
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 409

    def test_cannot_edit_after_submit(
        self, client, almacen_token, supplier_a, part_a, part_b,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        po_id = r.json()["id"]
        client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/submit",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        r = client.patch(
            f"/api/v1/procurement/purchase-orders/{po_id}",
            json={"notes": "ya no se debe poder"},
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 409

    def test_cancel_terminal_blocks_further_changes(
        self, client, almacen_token, director_token, supplier_a, part_a, part_b,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        po_id = r.json()["id"]
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/cancel",
            json={"reason": "test"},
            headers={"Authorization": f"Bearer {director_token}"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"
        # ya no se puede submit
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/submit",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 409

    def test_partial_receipt_rejected(
        self, client, almacen_token, director_token,
        supplier_a, part_a, part_b, warehouse_main,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        po_id = r.json()["id"]
        items = r.json()["items"]
        client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/submit",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/approve",
            headers={"Authorization": f"Bearer {director_token}"},
        )
        # quantity_received < ordenado
        receipts_payload = {
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": items[0]["id"], "quantity_received": 1},
                {"item_id": items[1]["id"], "quantity_received": 2},
            ],
        }
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/receive",
            json=receipts_payload,
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

class TestProcurementPermissions:

    def test_mecanico_cannot_create(
        self, client, mecanico_token, supplier_a, part_a, part_b,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {mecanico_token}"},
        )
        assert r.status_code == 403

    def test_almacen_cannot_approve(
        self, client, almacen_token, supplier_a, part_a, part_b,
    ):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json=_create_po_payload(supplier_a, part_a, part_b),
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        po_id = r.json()["id"]
        client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/submit",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        r = client.post(
            f"/api/v1/procurement/purchase-orders/{po_id}/approve",
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 403
