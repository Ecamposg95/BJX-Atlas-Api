"""Tests for in-app notification center (Wave 4)."""
from __future__ import annotations

import pytest

from app.models.notifications import Notification, NotificationKind
from app.models.users import Role, User
from app.security import hash_password
from app.services.notifications import create_notification


@pytest.fixture
def operador_user(db, default_branch_id):
    user = User(
        email="op-notif@test.com",
        hashed_password=hash_password("Op1234567"),
        role=Role.operador.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def operador_headers(client, operador_user):
    r = client.post(
        "/api/auth/login",
        json={"email": "op-notif@test.com", "password": "Op1234567"},
    )
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def other_user(db, default_branch_id):
    user = User(
        email="other-notif@test.com",
        hashed_password=hash_password("Other1234"),
        role=Role.operador.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestCreateNotification:
    def test_create_via_service(self, db, operador_user):
        n = create_notification(
            db,
            user_id=operador_user.id,
            kind=NotificationKind.system,
            title="Bienvenido",
            body="Sistema actualizado",
        )
        db.commit()
        assert n.id
        assert n.kind == "system"
        assert n.read_at is None
        stored = db.query(Notification).filter(Notification.id == n.id).first()
        assert stored is not None
        assert stored.title == "Bienvenido"

    def test_create_with_link_and_entity(self, db, operador_user, default_branch_id):
        n = create_notification(
            db,
            user_id=operador_user.id,
            kind=NotificationKind.wo_status_changed,
            title="OS actualizada",
            body="Tu OS pasó a 'en taller'",
            link_url="/work-orders/abc-123",
            branch_id=default_branch_id,
            entity_type="work_order",
            entity_id="abc-123",
        )
        db.commit()
        assert n.link_url == "/work-orders/abc-123"
        assert n.entity_type == "work_order"
        assert n.entity_id == "abc-123"
        assert n.branch_id == default_branch_id


class TestListAndCount:
    def test_list_returns_only_my_notifications(
        self, client, db, operador_user, other_user, operador_headers
    ):
        create_notification(db, user_id=operador_user.id, kind=NotificationKind.system, title="Mía 1", body="")
        create_notification(db, user_id=operador_user.id, kind=NotificationKind.system, title="Mía 2", body="")
        create_notification(db, user_id=other_user.id, kind=NotificationKind.system, title="Ajena", body="")
        db.commit()

        r = client.get("/api/v1/notifications", headers=operador_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 2
        assert data["unread"] == 2
        titles = {item["title"] for item in data["items"]}
        assert titles == {"Mía 1", "Mía 2"}

    def test_unread_only_filter(self, client, db, operador_user, operador_headers):
        create_notification(db, user_id=operador_user.id, kind=NotificationKind.system, title="A", body="")
        n2 = create_notification(db, user_id=operador_user.id, kind=NotificationKind.system, title="B", body="")
        db.commit()

        client.post(f"/api/v1/notifications/{n2.id}/read", headers=operador_headers)

        r = client.get("/api/v1/notifications?unread_only=true", headers=operador_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["title"] == "A"
        assert data["unread"] == 1
        assert data["total"] == 2

    def test_unread_count_endpoint(self, client, db, operador_user, operador_headers):
        create_notification(db, user_id=operador_user.id, kind=NotificationKind.system, title="X", body="")
        create_notification(db, user_id=operador_user.id, kind=NotificationKind.system, title="Y", body="")
        db.commit()

        r = client.get("/api/v1/notifications/unread-count", headers=operador_headers)
        assert r.status_code == 200
        assert r.json() == {"count": 2}

    def test_pagination_limit_skip(self, client, db, operador_user, operador_headers):
        for i in range(5):
            create_notification(
                db, user_id=operador_user.id, kind=NotificationKind.system, title=f"N{i}", body=""
            )
        db.commit()

        r = client.get("/api/v1/notifications?limit=2&skip=0", headers=operador_headers)
        assert r.status_code == 200
        assert len(r.json()["items"]) == 2


class TestMarkRead:
    def test_mark_one_read_is_idempotent(self, client, db, operador_user, operador_headers):
        n = create_notification(
            db, user_id=operador_user.id, kind=NotificationKind.system, title="X", body=""
        )
        db.commit()

        r1 = client.post(f"/api/v1/notifications/{n.id}/read", headers=operador_headers)
        assert r1.status_code == 200
        first_read_at = r1.json()["read_at"]
        assert first_read_at is not None

        r2 = client.post(f"/api/v1/notifications/{n.id}/read", headers=operador_headers)
        assert r2.status_code == 200
        assert r2.json()["read_at"] == first_read_at

    def test_cannot_mark_someone_elses(
        self, client, db, other_user, operador_headers
    ):
        n = create_notification(
            db, user_id=other_user.id, kind=NotificationKind.system, title="X", body=""
        )
        db.commit()

        r = client.post(f"/api/v1/notifications/{n.id}/read", headers=operador_headers)
        assert r.status_code == 404

    def test_mark_all_read(self, client, db, operador_user, operador_headers):
        for i in range(3):
            create_notification(
                db, user_id=operador_user.id, kind=NotificationKind.system, title=f"N{i}", body=""
            )
        db.commit()

        r = client.post("/api/v1/notifications/mark-all-read", headers=operador_headers)
        assert r.status_code == 200
        assert r.json()["updated"] == 3

        rc = client.get("/api/v1/notifications/unread-count", headers=operador_headers)
        assert rc.json() == {"count": 0}


class TestAuth:
    def test_requires_auth(self, client):
        r = client.get("/api/v1/notifications")
        assert r.status_code == 401
        r2 = client.get("/api/v1/notifications/unread-count")
        assert r2.status_code == 401
