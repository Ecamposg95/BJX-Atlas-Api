"""Procurement — recepciones parciales (Ola 6 gap closing)."""
from __future__ import annotations

import pytest

from app.models.inventory import Part, StockLevel, Warehouse
from app.models.suppliers import Supplier
from app.models.users import Role, User
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
    _make_user(db, default_branch_id, email="alm-partial@test.com", role=Role.almacen, password="Almacen1234")
    return _token(client, "alm-partial@test.com", "Almacen1234")


@pytest.fixture
def director_token(client, db, default_branch_id):
    _make_user(db, default_branch_id, email="dir-partial@test.com", role=Role.director, password="Director1234")
    return _token(client, "dir-partial@test.com", "Director1234")


@pytest.fixture
def supplier_a(db):
    s = Supplier(name="PARTIAL-SUP", lead_time_days=2, warranty_days=30, active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def part_a(db):
    p = Part(sku="PR-PA-001", name="Bujía", unit="pza", min_stock=10, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def part_b(db):
    p = Part(sku="PR-PA-002", name="Filtro", unit="pza", min_stock=5, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def warehouse_main(db, default_branch_id):
    wh = Warehouse(
        branch_id=default_branch_id,
        code="WH-PARTIAL",
        name="Almacén Partial",
        kind="main",
        active=True,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


def _approve_po(client, almacen_token, director_token, supplier_a, part_a, part_b):
    payload = {
        "supplier_id": supplier_a.id,
        "items": [
            {"part_id": part_a.id, "quantity": 10, "unit_cost": 50.0},
            {"part_id": part_b.id, "quantity": 4, "unit_cost": 100.0},
        ],
    }
    r = client.post(
        "/api/v1/procurement/purchase-orders",
        json=payload,
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 201, r.text
    po_id = r.json()["id"]
    item_ids = [it["id"] for it in r.json()["items"]]
    client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/submit",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/approve",
        headers={"Authorization": f"Bearer {director_token}"},
    )
    return po_id, item_ids


def test_partial_receive_then_complete(
    client, db, almacen_token, director_token,
    supplier_a, part_a, part_b, warehouse_main,
):
    po_id, item_ids = _approve_po(
        client, almacen_token, director_token, supplier_a, part_a, part_b,
    )

    # Primera recepción parcial: solo 4 del item A
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/receive",
        json={
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": item_ids[0], "quantity_received": 4},
            ],
        },
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "partially_received"
    items_by_id = {it["id"]: it for it in body["items"]}
    assert float(items_by_id[item_ids[0]]["quantity_received"]) == 4.0
    assert float(items_by_id[item_ids[1]]["quantity_received"]) == 0.0

    # Stock parcial
    db.expire_all()
    sl = (
        db.query(StockLevel)
        .filter(StockLevel.warehouse_id == warehouse_main.id, StockLevel.part_id == part_a.id)
        .first()
    )
    assert sl is not None
    assert sl.quantity == 4.0

    # Segunda recepción: completa A (6 más) y completa B (4)
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/receive",
        json={
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": item_ids[0], "quantity_received": 6},
                {"item_id": item_ids[1], "quantity_received": 4},
            ],
        },
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "received"
    items_by_id = {it["id"]: it for it in body["items"]}
    assert float(items_by_id[item_ids[0]]["quantity_received"]) == 10.0
    assert float(items_by_id[item_ids[1]]["quantity_received"]) == 4.0

    db.expire_all()
    sl = (
        db.query(StockLevel)
        .filter(StockLevel.warehouse_id == warehouse_main.id, StockLevel.part_id == part_a.id)
        .first()
    )
    assert sl.quantity == 10.0


def test_partial_receive_exceeding_balance_rejected(
    client, almacen_token, director_token,
    supplier_a, part_a, part_b, warehouse_main,
):
    po_id, item_ids = _approve_po(
        client, almacen_token, director_token, supplier_a, part_a, part_b,
    )
    # Intentar recibir 12 cuando se ordenaron 10
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/receive",
        json={
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": item_ids[0], "quantity_received": 12},
            ],
        },
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 409, r.text


def test_cancel_blocked_on_partially_received(
    client, almacen_token, director_token,
    supplier_a, part_a, part_b, warehouse_main,
):
    po_id, item_ids = _approve_po(
        client, almacen_token, director_token, supplier_a, part_a, part_b,
    )
    # Recepción parcial
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/receive",
        json={
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": item_ids[0], "quantity_received": 4},
            ],
        },
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200
    # Cancelación bloqueada
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/cancel",
        json={"reason": "se arrepintieron"},
        headers={"Authorization": f"Bearer {director_token}"},
    )
    assert r.status_code == 409, r.text
