"""Stock-board semáforo: ok / warn / critical."""
import pytest

from app.models.inventory import Part, StockLevel, Warehouse
from app.models.users import Role, User
from app.security import hash_password


@pytest.fixture
def almacen_token(client, db, default_branch_id):
    u = User(
        email="alm@test.com",
        hashed_password=hash_password("Almacen1234"),
        role=Role.almacen.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(u)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "alm@test.com", "password": "Almacen1234"})
    return r.json()["access_token"]


@pytest.fixture
def stock_seed(db, default_branch_id):
    wh = Warehouse(branch_id=default_branch_id, code="W1", name="Main", kind="main", active=True)
    p_ok = Part(sku="SB-OK", name="Filtro OK", min_stock=2, active=True)
    p_warn = Part(sku="SB-WARN", name="Bujía Bajo", min_stock=10, active=True)
    p_crit = Part(sku="SB-CRIT", name="Aceite Cero", min_stock=5, active=True)
    db.add_all([wh, p_ok, p_warn, p_crit])
    db.flush()
    db.add_all([
        StockLevel(branch_id=default_branch_id, warehouse_id=wh.id, part_id=p_ok.id, quantity=10, reserved=0),
        StockLevel(branch_id=default_branch_id, warehouse_id=wh.id, part_id=p_warn.id, quantity=4, reserved=0),
        StockLevel(branch_id=default_branch_id, warehouse_id=wh.id, part_id=p_crit.id, quantity=0, reserved=0),
    ])
    db.commit()
    return p_ok, p_warn, p_crit


def test_stock_board_returns_three_statuses(client, almacen_token, stock_seed):
    r = client.get(
        "/api/inventory/stock-board",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    by_sku = {it["sku"]: it for it in data["items"]}
    assert by_sku["SB-OK"]["status"] == "ok"
    assert by_sku["SB-OK"]["available"] == 10
    assert by_sku["SB-WARN"]["status"] == "warn"
    assert by_sku["SB-WARN"]["available"] == 4
    assert by_sku["SB-CRIT"]["status"] == "critical"
    assert by_sku["SB-CRIT"]["available"] == 0
    assert data["counts"]["ok"] >= 1
    assert data["counts"]["warn"] >= 1
    assert data["counts"]["critical"] >= 1


def test_stock_board_filter_by_status(client, almacen_token, stock_seed):
    r = client.get(
        "/api/inventory/stock-board?status=critical",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert all(it["status"] == "critical" for it in data["items"])
    assert any(it["sku"] == "SB-CRIT" for it in data["items"])


def test_stock_board_search(client, almacen_token, stock_seed):
    r = client.get(
        "/api/inventory/stock-board?search=Bujía",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    assert r.status_code == 200
    skus = [it["sku"] for it in r.json()["items"]]
    assert "SB-WARN" in skus
    assert "SB-OK" not in skus


def test_stock_board_reserved_pushes_to_warn(client, almacen_token, db, default_branch_id):
    wh = Warehouse(branch_id=default_branch_id, code="W2", name="Aux", kind="main", active=True)
    p = Part(sku="SB-RES", name="Reservada", min_stock=5, active=True)
    db.add_all([wh, p])
    db.flush()
    db.add(StockLevel(
        branch_id=default_branch_id, warehouse_id=wh.id, part_id=p.id,
        quantity=10, reserved=8,
    ))
    db.commit()
    r = client.get(
        "/api/inventory/stock-board?search=SB-RES",
        headers={"Authorization": f"Bearer {almacen_token}"},
    )
    item = next(it for it in r.json()["items"] if it["sku"] == "SB-RES")
    assert item["available"] == 2
    assert item["status"] == "warn"
