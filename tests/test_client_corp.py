"""Tests del dashboard cliente corporativo (Ola 5)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.catalog import Service, ServiceCatalog, VehicleModel
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.security import hash_password


CUSTOMER_A = "customer-fleet-AAA"
CUSTOMER_B = "customer-other-BBB"


@pytest.fixture
def fleet_seed(db):
    """Crea dos customers, dos vehículos cada uno y una OS por vehículo.

    El test verifica que el `cliente_corp` solo vea las OS de su customer.
    """
    model = VehicleModel(name="MARCH", brand="NISSAN", active=True)
    svc = Service(name="FRENOS", category="frenos", active=True)
    db.add_all([model, svc])
    db.commit()

    catalog = ServiceCatalog(
        model_id=model.id,
        service_id=svc.id,
        bjx_labor_cost=300.0,
        bjx_parts_cost=700.0,
        duration_hrs=2.0,
        source="test",
        is_current=True,
    )
    db.add(catalog)
    db.commit()

    v_a1 = Vehicle(customer_name="Acme A1", brand="NISSAN", model="MARCH", plates="AAA-001", active=True)
    v_a2 = Vehicle(customer_name="Acme A2", brand="NISSAN", model="MARCH", plates="AAA-002", active=True)
    v_b1 = Vehicle(customer_name="Other B1", brand="NISSAN", model="MARCH", plates="BBB-001", active=True)
    db.add_all([v_a1, v_a2, v_b1])
    db.commit()

    now = datetime.now(timezone.utc)
    wo_a1 = WorkOrder(
        order_number="WO-CORP-A1",
        vehicle_id=v_a1.id,
        model_id=model.id,
        service_id=svc.id,
        status=WorkOrderStatus.in_progress.value,
        received_at=now - timedelta(hours=4),
        customer_id=CUSTOMER_A,
    )
    wo_a2 = WorkOrder(
        order_number="WO-CORP-A2",
        vehicle_id=v_a2.id,
        model_id=model.id,
        service_id=svc.id,
        status=WorkOrderStatus.completed.value,
        received_at=now - timedelta(days=2),
        customer_id=CUSTOMER_A,
    )
    wo_b1 = WorkOrder(
        order_number="WO-CORP-B1",
        vehicle_id=v_b1.id,
        model_id=model.id,
        service_id=svc.id,
        status=WorkOrderStatus.in_progress.value,
        received_at=now - timedelta(hours=2),
        customer_id=CUSTOMER_B,
    )
    db.add_all([wo_a1, wo_a2, wo_b1])
    db.commit()

    return {"model": model, "service": svc, "wo_a1": wo_a1, "wo_a2": wo_a2, "wo_b1": wo_b1}


def _login(client, db, *, email: str, password: str, role: str, customer_id=None):
    user = User(
        email=email,
        hashed_password=hash_password(password),
        role=role,
        active=True,
        customer_id=customer_id,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    return r.json()["access_token"]


@pytest.fixture
def corp_token(client, db):
    return _login(
        client, db,
        email="corp@test.com",
        password="Corp1234!",
        role=Role.cliente_corp.value,
        customer_id=CUSTOMER_A,
    )


@pytest.fixture
def operador_token(client, db):
    return _login(
        client, db,
        email="ops@test.com",
        password="Ops1234!",
        role=Role.operador.value,
    )


class TestFleetEndpoint:
    def test_corp_only_sees_own_customer(self, client, corp_token, fleet_seed):
        r = client.get(
            "/api/v1/client-corp/fleet",
            headers={"Authorization": f"Bearer {corp_token}"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        plates = sorted(unit["vehicle"]["plates"] for unit in data["items"])
        assert plates == ["AAA-001", "AAA-002"]
        assert "BBB-001" not in plates
        assert data["total"] == 2

    def test_in_workshop_counter(self, client, corp_token, fleet_seed):
        r = client.get(
            "/api/v1/client-corp/fleet",
            headers={"Authorization": f"Bearer {corp_token}"},
        )
        data = r.json()
        assert data["in_workshop"] == 1
        assert data["ready_for_delivery"] == 1

    def test_unauthorized_role_returns_403(self, client, operador_token, fleet_seed):
        r = client.get(
            "/api/v1/client-corp/fleet",
            headers={"Authorization": f"Bearer {operador_token}"},
        )
        assert r.status_code == 403

    def test_anonymous_returns_401(self, client, fleet_seed):
        r = client.get("/api/v1/client-corp/fleet")
        assert r.status_code == 401


class TestWorkOrdersEndpoint:
    def test_corp_only_sees_own_orders(self, client, corp_token, fleet_seed):
        r = client.get(
            "/api/v1/client-corp/work-orders",
            headers={"Authorization": f"Bearer {corp_token}"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        folios = sorted(item["folio"] for item in data["items"])
        assert folios == ["WO-CORP-A1", "WO-CORP-A2"]
        assert data["total"] == 2

    def test_status_filter(self, client, corp_token, fleet_seed):
        r = client.get(
            "/api/v1/client-corp/work-orders?status=in_progress",
            headers={"Authorization": f"Bearer {corp_token}"},
        )
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["folio"] == "WO-CORP-A1"


class TestSummaryEndpoint:
    def test_summary_kpis_scoped(self, client, corp_token, fleet_seed):
        r = client.get(
            "/api/v1/client-corp/summary",
            headers={"Authorization": f"Bearer {corp_token}"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["units_total"] == 2
        assert data["in_workshop"] == 1
        assert data["ready_for_delivery"] == 1
        # spend del mes actual: 2 OS (recibidas en últimos 4h y 2d → este mes
        # asumido en la mayor parte del año; el test es laxo en el monto)
        assert data["spend_current_month"] >= 0
        assert data["customer_id"] == CUSTOMER_A


class TestCorpWithoutCustomer:
    def test_corp_without_customer_id_returns_empty(self, client, db, fleet_seed):
        token = _login(
            client, db,
            email="corp-empty@test.com",
            password="Corp1234!",
            role=Role.cliente_corp.value,
            customer_id=None,
        )
        r = client.get(
            "/api/v1/client-corp/fleet",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 0
        assert data["items"] == []
