"""Procurement — rotación automática de SupplierPrice al recibir."""
from __future__ import annotations

import pytest

from app.models.inventory import Part, Warehouse
from app.models.suppliers import Supplier, SupplierPrice
from app.models.users import Role, User
from app.security import hash_password
from app.services.supplier_pricing import rotate_supplier_price


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
    _make_user(db, default_branch_id, email="alm-rot@test.com", role=Role.almacen, password="Almacen1234")
    return _token(client, "alm-rot@test.com", "Almacen1234")


@pytest.fixture
def director_token(client, db, default_branch_id):
    _make_user(db, default_branch_id, email="dir-rot@test.com", role=Role.director, password="Director1234")
    return _token(client, "dir-rot@test.com", "Director1234")


@pytest.fixture
def supplier_a(db):
    s = Supplier(name="ROT-SUP", lead_time_days=2, warranty_days=30, active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def part_a(db):
    p = Part(sku="PR-ROT-001", name="Aceite", unit="lt", min_stock=10, active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@pytest.fixture
def warehouse_main(db, default_branch_id):
    wh = Warehouse(
        branch_id=default_branch_id,
        code="WH-ROT",
        name="Almacén Rot",
        kind="main",
        active=True,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


def test_rotate_supplier_price_creates_new_version(db, supplier_a, part_a):
    # Versión inicial
    sp1 = rotate_supplier_price(
        db, supplier_id=supplier_a.id, part_id=part_a.id, new_unit_cost=100.0,
        source="seed",
    )
    db.commit()
    assert sp1 is not None
    assert sp1.is_current is True
    assert sp1.total_price == 100.0

    # Cambio significativo (> 0.5 %)
    sp2 = rotate_supplier_price(
        db, supplier_id=supplier_a.id, part_id=part_a.id, new_unit_cost=110.0,
        source="procurement_receive",
    )
    db.commit()
    assert sp2 is not None
    assert sp2.id != sp1.id
    assert sp2.is_current is True
    assert sp2.source == "procurement_receive"

    db.expire_all()
    prev = db.query(SupplierPrice).filter(SupplierPrice.id == sp1.id).first()
    assert prev.is_current is False

    rows = (
        db.query(SupplierPrice)
        .filter(SupplierPrice.supplier_id == supplier_a.id, SupplierPrice.part_id == part_a.id)
        .filter(SupplierPrice.is_current.is_(True))
        .all()
    )
    assert len(rows) == 1
    assert rows[0].total_price == 110.0


def test_rotate_within_tolerance_noop(db, supplier_a, part_a):
    sp1 = rotate_supplier_price(
        db, supplier_id=supplier_a.id, part_id=part_a.id, new_unit_cost=200.0,
    )
    db.commit()
    # Cambio dentro del 0.5 % -> no rota
    sp2 = rotate_supplier_price(
        db, supplier_id=supplier_a.id, part_id=part_a.id, new_unit_cost=200.5,
    )
    assert sp2 is None
    # sp1 sigue current
    assert sp1.is_current is True


def test_receive_po_rotates_supplier_price(
    client, db, almacen_token, director_token,
    supplier_a, part_a, warehouse_main,
):
    # Precio inicial
    rotate_supplier_price(
        db, supplier_id=supplier_a.id, part_id=part_a.id, new_unit_cost=80.0,
        source="seed",
    )
    db.commit()

    payload = {
        "supplier_id": supplier_a.id,
        "items": [{"part_id": part_a.id, "quantity": 3, "unit_cost": 80.0}],
    }
    r = client.post(
        "/api/v1/procurement/purchase-orders",
        json=payload,
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 201, r.text
    po_id = r.json()["id"]
    item_id = r.json()["items"][0]["id"]
    client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/submit",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/approve",
        headers={"Authorization": f"Bearer {director_token}"},
    )

    # Recepción con costo 95 (>0.5%)
    r = client.post(
        f"/api/v1/procurement/purchase-orders/{po_id}/receive",
        json={
            "warehouse_id": warehouse_main.id,
            "receipts": [
                {"item_id": item_id, "quantity_received": 3, "unit_cost": 95.0},
            ],
        },
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200, r.text

    db.expire_all()
    rows = (
        db.query(SupplierPrice)
        .filter(SupplierPrice.supplier_id == supplier_a.id, SupplierPrice.part_id == part_a.id)
        .order_by(SupplierPrice.created_at.asc())
        .all()
    )
    assert len(rows) == 2
    assert rows[0].is_current is False
    assert rows[0].total_price == 80.0
    assert rows[1].is_current is True
    assert rows[1].total_price == 95.0
    assert rows[1].source == "procurement_receive"
