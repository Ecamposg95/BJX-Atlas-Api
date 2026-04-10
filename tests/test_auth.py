"""
Integration tests for /auth/* endpoints.
"""
import pytest
from app.models.users import User, Role
from app.security import hash_password


# ---------------------------------------------------------------------------
# TestLogin
# ---------------------------------------------------------------------------

class TestLogin:
    def test_login_success(self, client, admin_user):
        r = client.post("/auth/login", json={"email": "admin@test.com", "password": "Admin1234"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    def test_login_wrong_password(self, client, admin_user):
        r = client.post("/auth/login", json={"email": "admin@test.com", "password": "WrongPass1"})
        assert r.status_code == 401

    def test_login_nonexistent_email(self, client):
        r = client.post("/auth/login", json={"email": "noone@test.com", "password": "SomePass1"})
        assert r.status_code == 401

    def test_login_inactive_user(self, client, db):
        user = User(
            email="inactive@test.com",
            hashed_password=hash_password("Active1234"),
            role=Role.viewer,
            active=False,
        )
        db.add(user)
        db.commit()
        r = client.post("/auth/login", json={"email": "inactive@test.com", "password": "Active1234"})
        assert r.status_code == 401

    def test_login_sets_cookie(self, client, admin_user):
        r = client.post("/auth/login", json={"email": "admin@test.com", "password": "Admin1234"})
        assert r.status_code == 200
        # The TestClient follows cookies; verify the cookie was set in the response
        assert "access_token" in r.cookies


# ---------------------------------------------------------------------------
# TestRegister
# ---------------------------------------------------------------------------

class TestRegister:
    def test_register_as_admin(self, client, admin_token):
        payload = {"email": "newuser@test.com", "password": "NewPass1234", "role": "viewer"}
        r = client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["email"] == "newuser@test.com"
        assert data["role"] == "viewer"
        assert "hashed_password" not in data

    def test_register_as_operador_forbidden(self, client, operador_token):
        payload = {"email": "another@test.com", "password": "Another1234", "role": "viewer"}
        r = client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {operador_token}"},
        )
        assert r.status_code == 403

    def test_register_duplicate_email(self, client, admin_token, admin_user):
        payload = {"email": "admin@test.com", "password": "Admin1234", "role": "viewer"}
        r = client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 409

    @pytest.mark.parametrize("password", [
        "short1",       # less than 8 chars
        "nonnumber",    # no digit
        "1234567",      # less than 8 chars (all digits but only 7)
    ])
    def test_register_weak_password(self, client, admin_token, password):
        payload = {"email": "weak@test.com", "password": password, "role": "viewer"}
        r = client.post(
            "/auth/register",
            json=payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# TestMe
# ---------------------------------------------------------------------------

class TestMe:
    def test_get_me(self, client, admin_token):
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "admin@test.com"
        assert data["role"] == "admin"
        assert "hashed_password" not in data

    def test_get_me_no_token(self, client):
        r = client.get("/auth/me")
        assert r.status_code == 401

    def test_get_me_invalid_token(self, client):
        r = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# TestLogout
# ---------------------------------------------------------------------------

class TestLogout:
    def test_logout(self, client, admin_token):
        r = client.post("/auth/logout", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 204

    def test_after_logout_token_invalid(self, client, admin_user):
        # Login to get a fresh token
        login_r = client.post(
            "/auth/login", json={"email": "admin@test.com", "password": "Admin1234"}
        )
        token = login_r.json()["access_token"]

        # Logout
        client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})

        # The JWT itself is still cryptographically valid (stateless), so /me
        # still returns 200 — the server does not blocklist access tokens.
        # What is invalidated is the refresh_token in the DB.
        # We verify that the refresh token no longer works.
        refresh_token = login_r.json()["refresh_token"]
        r = client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# TestRefresh
# ---------------------------------------------------------------------------

class TestRefresh:
    def test_refresh_success(self, client, admin_user):
        login_r = client.post(
            "/auth/login", json={"email": "admin@test.com", "password": "Admin1234"}
        )
        assert login_r.status_code == 200
        refresh_token = login_r.json()["refresh_token"]

        r = client.post("/auth/refresh", json={"refresh_token": refresh_token})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        # The same refresh token is returned back
        assert data["refresh_token"] == refresh_token

    def test_refresh_invalid_token(self, client):
        r = client.post("/auth/refresh", json={"refresh_token": "bad.refresh.token"})
        assert r.status_code == 401
