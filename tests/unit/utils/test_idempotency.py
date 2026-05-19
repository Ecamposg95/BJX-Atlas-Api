"""Tests para idempotency helpers."""
from __future__ import annotations


def test_compute_request_hash_stable():
    from app.utils.idempotency import compute_request_hash

    h1 = compute_request_hash({"a": 1, "b": 2})
    h2 = compute_request_hash({"b": 2, "a": 1})  # mismo dict, distinto orden de keys
    assert h1 == h2


def test_compute_request_hash_changes_with_payload():
    from app.utils.idempotency import compute_request_hash

    h1 = compute_request_hash({"a": 1})
    h2 = compute_request_hash({"a": 2})
    assert h1 != h2


def test_idempotency_error_class_exists():
    from app.utils.idempotency import IdempotencyError

    err = IdempotencyError(code="IDEMPOTENCY_KEY_REUSE", detail={"key": "abc"})
    assert err.code == "IDEMPOTENCY_KEY_REUSE"
    assert err.detail == {"key": "abc"}
