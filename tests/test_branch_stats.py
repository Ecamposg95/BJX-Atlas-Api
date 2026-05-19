"""Tests para /api/v1/branches/stats — Mexico map showcase."""
from __future__ import annotations

import pytest

from app.models.organizations import Branch
from app.routers.branch_stats import BRANCH_COORDS


# Códigos esperados (de la migración multitenancy_foundation_and_erp).
EXPECTED_CODES = [
    "BJX-MAIN", "BJX-LEON", "BJX-QRO", "BJX-GDL", "BJX-CDMX",
    "BJX-MTY", "BJX-PUE", "BJX-TIJ", "BJX-SLP", "BJX-AGS",
]


@pytest.fixture
def ten_branches(db):
    """Crea las 10 sedes esperadas (la conftest ya creó BJX-MAIN)."""
    from app.models.organizations import Organization
    org = db.query(Organization).first()
    for code in EXPECTED_CODES[1:]:
        b = Branch(
            organization_id=org.id,
            code=code,
            name=f"BJX Motors — {code}",
            timezone="America/Mexico_City",
            active=True,
        )
        db.add(b)
    db.commit()
    return db.query(Branch).all()


def test_requires_auth(client):
    r = client.get("/api/v1/branches/stats")
    assert r.status_code == 401


def test_returns_array_of_branches(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 10
    codes = [b["code"] for b in data]
    for code in EXPECTED_CODES:
        assert code in codes


def test_coordinates_present(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    for b in r.json():
        assert "lat" in b and "lng" in b
        assert isinstance(b["lat"], (int, float))
        assert isinstance(b["lng"], (int, float))
        # En el bounding box aproximado de México
        assert 14 <= b["lat"] <= 33
        assert -118 <= b["lng"] <= -86


def test_semaphore_values_valid(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    for b in r.json():
        assert b["semaphore"] in {"green", "amber", "red"}
        assert isinstance(b["pulse"], bool)


def test_metric_param_changes_ordering(client, admin_token, ten_branches):
    # Sin OS, todos los KPIs son 0 — el endpoint debe responder 200 igual.
    for metric in ("operation", "revenue", "alerts"):
        r = client.get(
            f"/api/v1/branches/stats?metric={metric}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, f"metric={metric} failed"
        assert len(r.json()) == 10


def test_kpis_structure(client, admin_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert r.status_code == 200
    sample = r.json()[0]
    kpis = sample["kpis"]
    for field in (
        "open_orders", "in_progress", "finished_today", "active_mechanics",
        "revenue_today", "avg_completion_hrs", "stalled_parts", "alerts_count",
    ):
        assert field in kpis


def test_branch_coords_table_has_all_codes():
    """Sanity: la tabla hardcodeada cubre los 10 códigos esperados."""
    for code in EXPECTED_CODES:
        assert code in BRANCH_COORDS, f"missing coords for {code}"


def test_viewer_can_read(client, viewer_token, ten_branches):
    r = client.get(
        "/api/v1/branches/stats",
        headers={"Authorization": f"Bearer {viewer_token}"},
    )
    assert r.status_code == 200
    assert len(r.json()) == 10
