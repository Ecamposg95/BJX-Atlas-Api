"""Idempotency helpers para endpoints de mutación.

Uso típico desde un router:

    cached = lookup_idempotency(db, key=key, endpoint="POST /work-orders",
                                 user_id=user.id, request_body=payload.model_dump())
    if cached:
        return JSONResponse(content=json.loads(cached.response_body),
                            status_code=cached.response_status)
    # ... ejecutar lógica
    save_idempotency(db, key=key, endpoint=..., user_id=...,
                     request_body=..., response_status=201, response_body=...)
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.idempotency import IdempotencyKey


IDEMPOTENCY_TTL_HOURS = 24


class IdempotencyError(Exception):
    def __init__(self, code: str, detail: dict):
        self.code = code
        self.detail = detail
        super().__init__(code)


def compute_request_hash(body: Any) -> str:
    """Hash determinístico del body (insensible al orden de keys)."""
    serialized = json.dumps(body, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def lookup_idempotency(
    db: Session,
    *,
    key: Optional[str],
    endpoint: str,
    user_id: str,
    request_body: Any,
) -> Optional[IdempotencyKey]:
    """Si la key existe y el hash coincide, devuelve el record cacheado.
    Si la key existe con hash distinto, levanta IdempotencyError.
    Si no existe o expiró, devuelve None."""
    if not key:
        return None

    record = db.query(IdempotencyKey).filter(IdempotencyKey.key == key).first()
    if record is None:
        return None

    # Limpiar si expiró
    now = datetime.now(timezone.utc)
    record_expires = record.expires_at
    # SQLite puede devolver naive datetimes — normalizar
    if record_expires.tzinfo is None:
        record_expires = record_expires.replace(tzinfo=timezone.utc)
    if record_expires < now:
        db.delete(record)
        db.flush()
        return None

    new_hash = compute_request_hash(request_body)
    if record.request_hash != new_hash:
        raise IdempotencyError(
            code="IDEMPOTENCY_KEY_REUSE",
            detail={"key": key, "endpoint": endpoint},
        )

    return record


def save_idempotency(
    db: Session,
    *,
    key: Optional[str],
    endpoint: str,
    user_id: str,
    request_body: Any,
    response_status: int,
    response_body: Any,
) -> None:
    """Guarda el response cacheado bajo la key con TTL 24h."""
    if not key:
        return

    db.add(IdempotencyKey(
        key=key,
        endpoint=endpoint,
        user_id=user_id,
        request_hash=compute_request_hash(request_body),
        response_status=response_status,
        response_body=json.dumps(response_body, default=str),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=IDEMPOTENCY_TTL_HOURS),
    ))
    db.flush()
