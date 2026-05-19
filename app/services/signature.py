"""Guardado de firmas base64 PNG/JPEG en el storage configurado."""
from __future__ import annotations

import base64
import io
import re
import uuid
from typing import Tuple

from app.services.storage import get_storage


_DATA_URI_RE = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<b64>.*)$", re.DOTALL)


def _decode_signature(signature_base64: str) -> Tuple[bytes, str, str]:
    """Decodifica base64 (con o sin prefijo data URI). Retorna (bytes, mime, ext)."""
    if not signature_base64 or not isinstance(signature_base64, str):
        raise ValueError("Firma vacía")

    raw = signature_base64.strip()
    mime = "image/png"
    payload = raw
    m = _DATA_URI_RE.match(raw)
    if m:
        mime = m.group("mime").lower()
        payload = m.group("b64")

    # Limpieza de whitespace y newlines
    payload = re.sub(r"\s+", "", payload)
    try:
        data = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise ValueError(f"Base64 inválido: {exc}") from exc

    if len(data) == 0:
        raise ValueError("Firma vacía")
    if len(data) > 2 * 1024 * 1024:
        raise ValueError("Firma excede 2 MB")

    ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }.get(mime, "png")
    return data, mime, ext


def save_signature(
    *,
    branch_id: str,
    work_order_id: str,
    signature_base64: str,
) -> dict:
    """Sube la firma al storage. Retorna {storage_key, url, mime, size_bytes}."""
    data, mime, ext = _decode_signature(signature_base64)

    storage = get_storage()
    key = (
        f"branches/{branch_id}/deliveries/{work_order_id}/"
        f"signature_{uuid.uuid4().hex}.{ext}"
    )
    storage.upload(key, io.BytesIO(data), content_type=mime, size_bytes=len(data))
    url = storage.public_url(key) or storage.signed_url(key, ttl_seconds=86400 * 30)

    return {
        "storage_key": key,
        "url": url,
        "mime": mime,
        "size_bytes": len(data),
    }


def save_pdf(
    *,
    branch_id: str,
    work_order_id: str,
    pdf_bytes: bytes,
) -> dict:
    """Sube acuse PDF al storage. Retorna {storage_key, url}."""
    if not pdf_bytes:
        raise ValueError("PDF vacío")
    storage = get_storage()
    key = (
        f"branches/{branch_id}/deliveries/{work_order_id}/"
        f"acuse_{uuid.uuid4().hex}.pdf"
    )
    storage.upload(key, io.BytesIO(pdf_bytes), content_type="application/pdf", size_bytes=len(pdf_bytes))
    url = storage.public_url(key) or storage.signed_url(key, ttl_seconds=86400 * 30)
    return {"storage_key": key, "url": url}
