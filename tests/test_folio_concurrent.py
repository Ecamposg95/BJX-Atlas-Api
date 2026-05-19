"""Folio engine — secuencia segura.

SQLite no permite probar concurrencia real con TestClient threadlocal; lo que
verificamos es que las llamadas en serie producen folios únicos consecutivos
y que el counter es persistido entre transacciones.
"""
from __future__ import annotations

import pytest

from app.models.folio_counters import FolioCounter
from app.models.inventory import Part
from app.models.suppliers import Supplier
from app.models.users import Role, User
from app.security import hash_password
from app.services.folio_engine import next_folio


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
    _make_user(db, default_branch_id, email="alm-folio@test.com", role=Role.almacen, password="Almacen1234")
    return _token(client, "alm-folio@test.com", "Almacen1234")


@pytest.fixture
def supplier_a(db):
    s = Supplier(name="FOLIO-SUP", lead_time_days=2, warranty_days=30, active=True)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture
def part_a(db):
    p = Part(sku="PR-FO-001", name="Folio Part", unit="pza", active=True)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def test_next_folio_increments(db):
    assert next_folio(db, "test-counter") == 1
    assert next_folio(db, "test-counter") == 2
    assert next_folio(db, "test-counter") == 3
    db.commit()
    c = db.query(FolioCounter).filter(FolioCounter.name == "test-counter").first()
    assert c.value == 3


def test_next_folio_namespaces_isolated(db):
    assert next_folio(db, "a") == 1
    assert next_folio(db, "b") == 1
    assert next_folio(db, "a") == 2


def test_create_po_serial_folios(
    client, db, almacen_token, supplier_a, part_a, default_branch_id,
):
    folios: list[str] = []
    for _ in range(5):
        r = client.post(
            "/api/v1/procurement/purchase-orders",
            json={
                "supplier_id": supplier_a.id,
                "items": [{"part_id": part_a.id, "quantity": 1, "unit_cost": 10.0}],
            },
            headers={"Authorization": f"Bearer {almacen_token}"},
        )
        assert r.status_code == 201, r.text
        folios.append(r.json()["folio"])
    # Únicos y consecutivos
    assert len(set(folios)) == 5
    suffixes = [int(f.split("-")[-1]) for f in folios]
    assert suffixes == sorted(suffixes)
    assert suffixes[-1] - suffixes[0] == 4
