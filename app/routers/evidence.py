"""Endpoint /api/v1/evidence — uploads desde clientes mobile.

Reutilizable por:
- Recepción (US-09): fotos de daño durante check-in
- Almacén (Sprint 1.1): recibos de refacciones / facturas
- Mecánico (Sprint 1.3): fotos asociadas a hallazgos
"""
from __future__ import annotations

import io
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.evidence import MobileEvidence
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.schemas.evidence import EvidenceKind, EvidenceLinkRequest, EvidenceRead
from app.security import get_current_user
from app.security.tenant import (
    TenantContext,
    assert_branch_access,
    get_tenant_context,
    resolve_branch_for_write,
)
from app.services.storage import get_storage

router = APIRouter(prefix="/v1/evidence", tags=["evidence-v1"])

MAX_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}


def _build_read(ev: MobileEvidence) -> EvidenceRead:
    storage = get_storage()
    url = ev.public_url or storage.signed_url(ev.storage_key, ttl_seconds=3600)
    return EvidenceRead(
        id=ev.id,
        kind=EvidenceKind(ev.kind),
        url=url,
        work_order_id=ev.work_order_id,
        uploaded_by_id=ev.uploaded_by_id,
        note=ev.note,
        mime_type=ev.mime_type,
        size_bytes=ev.size_bytes,
        created_at=ev.created_at,
    )


@router.post("", response_model=EvidenceRead, status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    file: UploadFile = File(...),
    kind: str = Form(...),
    work_order_id: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(get_current_user),
):
    """Sube imagen al storage configurado y guarda metadata.

    - file: image/jpeg|png|webp, ≤5 MB
    - kind: damage_photo | parts_receipt | finding_photo
    - work_order_id: opcional (puede vincularse después)
    - note: opcional, ≤200 chars
    """
    # Validar kind
    try:
        kind_enum = EvidenceKind(kind)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"kind inválido: '{kind}'. Use damage_photo | parts_receipt | finding_photo",
        ) from exc

    # Validar note longitud
    if note is not None and len(note) > 200:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="note no debe exceder 200 caracteres",
        )

    # Validar mime
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"mime no soportado: '{mime}'. Use image/jpeg, image/png o image/webp",
        )

    # Leer y validar tamaño
    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío")
    if len(contents) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Archivo excede 5 MB (recibido {len(contents)} bytes)",
        )

    # Resolver branch y validar work_order (si viene)
    branch_id = resolve_branch_for_write(ctx)

    if work_order_id:
        wo = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
        if wo is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OS no encontrada")
        assert_branch_access(wo.branch_id, ctx)
        branch_id = wo.branch_id  # alinear branch al de la OS

    # Build storage key
    safe_name = (file.filename or "evidence.jpg").replace("/", "_")
    key = f"branches/{branch_id}/mobile-evidence/{kind_enum.value}/{uuid.uuid4().hex}_{safe_name}"

    storage = get_storage()
    storage.upload(key, io.BytesIO(contents), content_type=mime, size_bytes=len(contents))
    public = storage.public_url(key)

    ev = MobileEvidence(
        branch_id=branch_id,
        kind=kind_enum.value,
        storage_key=key,
        public_url=public,
        work_order_id=work_order_id,
        uploaded_by_id=current_user.id,
        note=note,
        mime_type=mime,
        size_bytes=len(contents),
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return _build_read(ev)


@router.patch("/{evidence_id}/link", response_model=EvidenceRead)
def link_evidence_to_work_order(
    evidence_id: str,
    payload: EvidenceLinkRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    """Vincula una evidencia ya subida a una OS (ej. tras crear la OS post-fotos)."""
    ev = db.query(MobileEvidence).filter(MobileEvidence.id == evidence_id).first()
    if ev is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidencia no encontrada")
    assert_branch_access(ev.branch_id, ctx)

    wo = db.query(WorkOrder).filter(WorkOrder.id == payload.work_order_id).first()
    if wo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OS no encontrada")
    assert_branch_access(wo.branch_id, ctx)

    ev.work_order_id = wo.id
    db.commit()
    db.refresh(ev)
    return _build_read(ev)
