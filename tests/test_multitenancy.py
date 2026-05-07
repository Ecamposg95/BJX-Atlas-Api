"""Anti-leak tests: usuarios de sede A NUNCA pueden ver/escribir datos de sede B.

Crítico: el modelo es shared-DB con `branch_id` row-level. Un bug en el filtro
significaría leak de datos entre sucursales. Estos tests blindan ese contrato.
"""
import pytest
from app.models.organizations import Branch, Organization
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.catalog import VehicleModel, Service
from app.models.inventory import Part, Warehouse, StockLevel, InventoryRequest, InventoryRequestStatus
from app.security import hash_password


@pytest.fixture
def two_branches(db):
    """Dos sedes adicionales (A=León, B=QRO) para pruebas anti-leak."""
    org_id = "00000000-0000-0000-0000-000000000001"  # ya existe del conftest
    branch_a = Branch(
        id="b-leon",
        organization_id=org_id,
        code="BJX-LEON-T",
        name="León Test",
        timezone="America/Mexico_City",
        active=True,
    )
    branch_b = Branch(
        id="b-qro",
        organization_id=org_id,
        code="BJX-QRO-T",
        name="QRO Test",
        timezone="America/Mexico_City",
        active=True,
    )
    db.add_all([branch_a, branch_b])
    db.commit()
    return branch_a, branch_b


@pytest.fixture
def gerente_a(client, db, two_branches):
    """gerente_sede limitado a sede A."""
    branch_a, _ = two_branches
    u = User(
        email="gerente_a@test.com",
        hashed_password=hash_password("Gerente1234"),
        role=Role.gerente_sede.value,
        default_branch_id=branch_a.id,
        active=True,
    )
    db.add(u)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "gerente_a@test.com", "password": "Gerente1234"})
    token = r.json()["access_token"]
    return {"user": u, "token": token, "branch_id": branch_a.id}


@pytest.fixture
def gerente_b(client, db, two_branches):
    _, branch_b = two_branches
    u = User(
        email="gerente_b@test.com",
        hashed_password=hash_password("Gerente1234"),
        role=Role.gerente_sede.value,
        default_branch_id=branch_b.id,
        active=True,
    )
    db.add(u)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "gerente_b@test.com", "password": "Gerente1234"})
    token = r.json()["access_token"]
    return {"user": u, "token": token, "branch_id": branch_b.id}


@pytest.fixture
def director_global(client, db):
    u = User(
        email="director@test.com",
        hashed_password=hash_password("Director1234"),
        role=Role.director.value,
        default_branch_id=None,  # global
        active=True,
    )
    db.add(u)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "director@test.com", "password": "Director1234"})
    return {"user": u, "token": r.json()["access_token"]}


@pytest.fixture
def parts(db):
    p1 = Part(sku="REF-001", name="Filtro de aceite", min_stock=2, active=True)
    p2 = Part(sku="REF-002", name="Bujías", min_stock=4, active=True)
    db.add_all([p1, p2])
    db.commit()
    return p1, p2


@pytest.fixture
def warehouses_per_branch(db, two_branches, parts):
    """Un almacén por cada sede, con stock inicial."""
    branch_a, branch_b = two_branches
    p1, _ = parts
    wh_a = Warehouse(branch_id=branch_a.id, code="A1", name="Main A", kind="main", active=True)
    wh_b = Warehouse(branch_id=branch_b.id, code="B1", name="Main B", kind="main", active=True)
    db.add_all([wh_a, wh_b])
    db.flush()
    sl_a = StockLevel(branch_id=branch_a.id, warehouse_id=wh_a.id, part_id=p1.id, quantity=10, reserved=0)
    sl_b = StockLevel(branch_id=branch_b.id, warehouse_id=wh_b.id, part_id=p1.id, quantity=20, reserved=0)
    db.add_all([sl_a, sl_b])
    db.commit()
    return wh_a, wh_b


def _hdr(token: str, branch_id: str | None = None) -> dict:
    h = {"Authorization": f"Bearer {token}"}
    if branch_id:
        h["X-Branch-Id"] = branch_id
    return h


# ---------------------------------------------------------------------------
# 1. Listings filtran por branch
# ---------------------------------------------------------------------------

class TestListingIsolation:
    def test_warehouses_listing_isolated(self, client, gerente_a, gerente_b, warehouses_per_branch):
        wh_a, wh_b = warehouses_per_branch

        r_a = client.get("/api/inventory/warehouses", headers=_hdr(gerente_a["token"]))
        assert r_a.status_code == 200
        ids_a = [w["id"] for w in r_a.json()]
        assert wh_a.id in ids_a
        assert wh_b.id not in ids_a, "LEAK: gerente_a ve warehouse de sede B"

        r_b = client.get("/api/inventory/warehouses", headers=_hdr(gerente_b["token"]))
        assert r_b.status_code == 200
        ids_b = [w["id"] for w in r_b.json()]
        assert wh_b.id in ids_b
        assert wh_a.id not in ids_b, "LEAK: gerente_b ve warehouse de sede A"

    def test_stock_listing_isolated(self, client, gerente_a, gerente_b, warehouses_per_branch):
        r_a = client.get("/api/inventory/stock", headers=_hdr(gerente_a["token"]))
        r_b = client.get("/api/inventory/stock", headers=_hdr(gerente_b["token"]))
        assert r_a.status_code == 200 and r_b.status_code == 200
        branch_ids_a = {s["branch_id"] for s in r_a.json()}
        branch_ids_b = {s["branch_id"] for s in r_b.json()}
        assert branch_ids_a == {gerente_a["branch_id"]}
        assert branch_ids_b == {gerente_b["branch_id"]}


# ---------------------------------------------------------------------------
# 2. Acceso directo cross-branch retorna 403
# ---------------------------------------------------------------------------

class TestDirectAccessForbidden:
    def test_warehouse_update_cross_branch_blocked(
        self, client, gerente_a, gerente_b, warehouses_per_branch,
    ):
        _, wh_b = warehouses_per_branch
        # gerente_a intenta editar warehouse de sede B
        r = client.put(
            f"/api/inventory/warehouses/{wh_b.id}",
            json={"name": "Hackeado"},
            headers=_hdr(gerente_a["token"]),
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 3. X-Branch-Id no permite saltar a otra sede si rol es BRANCH_SCOPED
# ---------------------------------------------------------------------------

class TestBranchHeaderEscalation:
    def test_gerente_cannot_override_branch_via_header(
        self, client, gerente_a, gerente_b,
    ):
        # gerente_a intenta forzar X-Branch-Id de sede B
        r = client.get(
            "/api/inventory/warehouses",
            headers=_hdr(gerente_a["token"], branch_id=gerente_b["branch_id"]),
        )
        # Debe rechazar con 403
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 4. Rol GLOBAL (director/admin) sí puede cambiar contexto via header
# ---------------------------------------------------------------------------

class TestGlobalRoleSwitch:
    def test_director_can_view_branch_a_via_header(
        self, client, director_global, two_branches, warehouses_per_branch,
    ):
        branch_a, branch_b = two_branches
        wh_a, wh_b = warehouses_per_branch

        r_a = client.get(
            "/api/inventory/warehouses",
            headers=_hdr(director_global["token"], branch_id=branch_a.id),
        )
        assert r_a.status_code == 200
        ids = [w["id"] for w in r_a.json()]
        assert wh_a.id in ids
        assert wh_b.id not in ids


# ---------------------------------------------------------------------------
# 5. Inventory requests respetan branch
# ---------------------------------------------------------------------------

class TestInventoryRequestsIsolation:
    def test_create_request_uses_work_order_branch(
        self,
        client,
        db,
        gerente_a,
        gerente_b,
        two_branches,
        warehouses_per_branch,
        parts,
    ):
        branch_a, branch_b = two_branches
        # Crear vehículo + modelo + servicio + OS en sede A
        model = VehicleModel(name="Modelo X", brand="MX", active=True)
        service = Service(name="Cambio aceite", category="lub", active=True)
        db.add_all([model, service])
        db.flush()
        veh = Vehicle(branch_id=branch_a.id, customer_name="Cliente A", plates="A1", active=True)
        db.add(veh)
        db.flush()
        wo_a = WorkOrder(
            branch_id=branch_a.id,
            order_number="WO-2026-A001",
            vehicle_id=veh.id,
            model_id=model.id,
            service_id=service.id,
            status=WorkOrderStatus.received,
        )
        db.add(wo_a)
        db.commit()

        p1, _ = parts
        # gerente_a crea solicitud en su OS
        r = client.post(
            "/api/inventory/requests",
            json={"work_order_id": wo_a.id, "part_id": p1.id, "quantity": 1},
            headers=_hdr(gerente_a["token"]),
        )
        assert r.status_code == 201
        assert r.json()["branch_id"] == branch_a.id

        # gerente_b NO debe ver esa solicitud
        r_b = client.get("/api/inventory/requests", headers=_hdr(gerente_b["token"]))
        assert r_b.status_code == 200
        ids_b = [item["id"] for item in r_b.json()["items"]]
        assert r.json()["id"] not in ids_b

        # gerente_b NO debe poder aprobarla (404 o 403)
        r_approve = client.post(
            f"/api/inventory/requests/{r.json()['id']}/approve",
            json={},
            headers=_hdr(gerente_b["token"]),
        )
        assert r_approve.status_code in (403, 404)

    def test_request_in_other_branch_wo_blocked(
        self, client, db, gerente_a, two_branches, parts,
    ):
        """Crear solicitud apuntando a una OS de otra sede debe fallar."""
        _, branch_b = two_branches
        model = VehicleModel(name="Modelo Y", brand="MY", active=True)
        service = Service(name="Frenos", category="frenos", active=True)
        db.add_all([model, service])
        db.flush()
        veh = Vehicle(branch_id=branch_b.id, customer_name="Cliente B", plates="B1", active=True)
        db.add(veh)
        db.flush()
        wo_b = WorkOrder(
            branch_id=branch_b.id,
            order_number="WO-2026-B001",
            vehicle_id=veh.id,
            model_id=model.id,
            service_id=service.id,
            status=WorkOrderStatus.received,
        )
        db.add(wo_b)
        db.commit()

        p1, _ = parts
        # gerente_a (sede A) intenta crear request en OS de sede B → 403
        r = client.post(
            "/api/inventory/requests",
            json={"work_order_id": wo_b.id, "part_id": p1.id, "quantity": 1},
            headers=_hdr(gerente_a["token"]),
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 6. Branch switch endpoint respeta scope
# ---------------------------------------------------------------------------

class TestBranchSwitch:
    def test_gerente_cannot_switch_to_other_branch(
        self, client, gerente_a, gerente_b,
    ):
        r = client.post(
            "/api/branches/switch",
            json={"branch_id": gerente_b["branch_id"]},
            headers=_hdr(gerente_a["token"]),
        )
        assert r.status_code == 403

    def test_director_can_switch(
        self, client, director_global, two_branches,
    ):
        branch_a, _ = two_branches
        r = client.post(
            "/api/branches/switch",
            json={"branch_id": branch_a.id},
            headers=_hdr(director_global["token"]),
        )
        assert r.status_code == 200
        assert r.json()["branch_id"] == branch_a.id


# ---------------------------------------------------------------------------
# 7. Audit log captura cambios
# ---------------------------------------------------------------------------

class TestAuditLogging:
    def test_create_warehouse_writes_audit_log(
        self, client, db, gerente_a,
    ):
        r = client.post(
            "/api/inventory/warehouses",
            json={"code": "AUDIT-1", "name": "Audit Test"},
            headers=_hdr(gerente_a["token"]),
        )
        assert r.status_code == 201

        from app.models.audit import AuditLog
        logs = (
            db.query(AuditLog)
            .filter(AuditLog.table_name == "warehouses", AuditLog.action == "insert")
            .all()
        )
        assert len(logs) >= 1
        latest = logs[-1]
        assert latest.user_email == gerente_a["user"].email
        assert latest.branch_id == gerente_a["branch_id"]

    def test_audit_endpoint_admin_only(self, client, gerente_a):
        r = client.get("/api/audit/logs", headers=_hdr(gerente_a["token"]))
        assert r.status_code == 403  # gerente_sede no es admin/director
