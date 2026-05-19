"""Tests para /api/v1/evidence — uploads desde clientes mobile."""
from __future__ import annotations

import io

import pytest

from app.models.users import Role, User
from app.security import hash_password
from app.services.storage import reset_storage_for_tests


# 1x1 PNG válido (transparente)
PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01"
    b"_\xc7\xb2\x88\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture(autouse=True)
def _local_storage(monkeypatch, tmp_path):
    """Forzar backend local en tests."""
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("LOCAL_STORAGE_ROOT", str(tmp_path / "storage"))
    reset_storage_for_tests()
    yield
    reset_storage_for_tests()


@pytest.fixture
def recepcion_headers(client, db, default_branch_id):
    u = User(
        email="recep@test.com",
        hashed_password=hash_password("Recep1234"),
        role=Role.recepcion.value,
        default_branch_id=default_branch_id,
        active=True,
    )
    db.add(u)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "recep@test.com", "password": "Recep1234"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


class TestEvidenceUpload:
    def test_upload_happy_path(self, client, recepcion_headers):
        files = {"file": ("dmg.png", io.BytesIO(PNG_BYTES), "image/png")}
        data = {"kind": "damage_photo", "note": "Rayón en puerta derecha"}
        r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["id"]
        assert body["kind"] == "damage_photo"
        assert body["url"].startswith("/api/storage/local/")
        assert body["mime_type"] == "image/png"
        assert body["note"] == "Rayón en puerta derecha"
        assert body["size_bytes"] == len(PNG_BYTES)
        assert body["uploaded_by_id"]
        assert body["work_order_id"] is None
        assert body["created_at"]

    def test_upload_requires_auth(self, client):
        files = {"file": ("a.png", io.BytesIO(PNG_BYTES), "image/png")}
        data = {"kind": "damage_photo"}
        r = client.post("/api/v1/evidence", files=files, data=data)
        assert r.status_code == 401

    def test_upload_rejects_oversized_file(self, client, recepcion_headers):
        oversized = b"\x00" * (5 * 1024 * 1024 + 1)
        files = {"file": ("big.jpg", io.BytesIO(oversized), "image/jpeg")}
        data = {"kind": "damage_photo"}
        r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
        assert r.status_code == 413, r.text

    def test_upload_rejects_bad_mime(self, client, recepcion_headers):
        files = {"file": ("notes.txt", io.BytesIO(b"hola"), "text/plain")}
        data = {"kind": "damage_photo"}
        r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
        assert r.status_code == 415, r.text

    def test_upload_rejects_invalid_kind(self, client, recepcion_headers):
        files = {"file": ("a.png", io.BytesIO(PNG_BYTES), "image/png")}
        data = {"kind": "lolwat"}
        r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
        assert r.status_code == 422, r.text

    def test_upload_rejects_long_note(self, client, recepcion_headers):
        files = {"file": ("a.png", io.BytesIO(PNG_BYTES), "image/png")}
        data = {"kind": "damage_photo", "note": "x" * 201}
        r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
        assert r.status_code == 422, r.text

    def test_upload_rejects_empty_file(self, client, recepcion_headers):
        files = {"file": ("a.png", io.BytesIO(b""), "image/png")}
        data = {"kind": "damage_photo"}
        r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
        assert r.status_code == 400, r.text

    def test_upload_accepts_all_three_kinds(self, client, recepcion_headers):
        for kind in ("damage_photo", "parts_receipt", "finding_photo"):
            files = {"file": (f"{kind}.png", io.BytesIO(PNG_BYTES), "image/png")}
            data = {"kind": kind}
            r = client.post("/api/v1/evidence", files=files, data=data, headers=recepcion_headers)
            assert r.status_code == 201, r.text
            assert r.json()["kind"] == kind
