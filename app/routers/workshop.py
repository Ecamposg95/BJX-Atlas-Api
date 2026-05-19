"""Extensiones de taller: bays, líneas de OS, evidencias.

NOTA: el CRUD básico de WorkOrder vive en `app/routers/work_orders.py`. Acá agregamos
las capacidades adicionales: bays por sucursal, líneas (multi-servicio por OS),
gestión de timer (start/pause/resume/finish) por línea, y captura de evidencias
con upload a R2.
"""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.catalog import Service
from app.models.documents import Document
from app.models.organizations import Branch
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.models.workshop import Evidence, EvidenceKind, ServiceBay, WorkOrderLine, WorkOrderLineStatus
from app.schemas.workshop import (
    BayCreate,
    BayRead,
    BayUpdate,
    EvidenceCreate,
    EvidenceRead,
    LineCreate,
    LineRead,
    LineUpdate,
)
from app.security import require_role
from app.security.tenant import (
    TenantContext,
    assert_branch_access,
    branch_scoped_query,
    get_tenant_context,
    resolve_branch_for_write,
)
from app.services.storage import get_storage


router = APIRouter(prefix="/workshop", tags=["workshop"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Service Bays
# ---------------------------------------------------------------------------

@router.get("/bays", response_model=list[BayRead])
def list_bays(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    only_active: bool = True,
):
    q = branch_scoped_query(ServiceBay, db, ctx).filter(ServiceBay.deleted_at.is_(None))
    if only_active:
        q = q.filter(ServiceBay.active.is_(True))
    return q.order_by(ServiceBay.code).all()


@router.post("/bays", response_model=BayRead, status_code=status.HTTP_201_CREATED)
def create_bay(
    payload: BayCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller"])),
):
    branch_id = resolve_branch_for_write(ctx, payload.branch_id)
    if db.query(ServiceBay).filter(ServiceBay.branch_id == branch_id, ServiceBay.code == payload.code).first():
        raise HTTPException(409, f"Bay {payload.code} ya existe en esta sucursal")
    bay = ServiceBay(branch_id=branch_id, code=payload.code, name=payload.name, active=True)
    db.add(bay)
    db.commit()
    db.refresh(bay)
    return bay


@router.put("/bays/{bay_id}", response_model=BayRead)
def update_bay(
    bay_id: str,
    payload: BayUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller"])),
):
    bay = db.query(ServiceBay).filter(ServiceBay.id == bay_id).first()
    if not bay:
        raise HTTPException(404, "Bay no encontrado")
    assert_branch_access(bay.branch_id, ctx)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(bay, f, v)
    db.commit()
    db.refresh(bay)
    return bay


# ---------------------------------------------------------------------------
# Work Order Lines
# ---------------------------------------------------------------------------

def _enrich_line(db: Session, line: WorkOrderLine) -> LineRead:
    out = LineRead.model_validate(line)
    svc = db.query(Service).filter(Service.id == line.service_id).first()
    if svc:
        out.service_name = svc.name
    if line.bay_id:
        b = db.query(ServiceBay).filter(ServiceBay.id == line.bay_id).first()
        if b:
            out.bay_name = b.name
    if line.mechanic_id:
        u = db.query(User).filter(User.id == line.mechanic_id).first()
        if u:
            out.mechanic_email = u.email
    return out


def _get_wo_or_404(db: Session, wo_id: str, ctx: TenantContext) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if not wo:
        raise HTTPException(404, "OS no encontrada")
    assert_branch_access(wo.branch_id, ctx)
    return wo


def _get_line_or_404(db: Session, line_id: str, ctx: TenantContext) -> WorkOrderLine:
    line = db.query(WorkOrderLine).filter(WorkOrderLine.id == line_id).first()
    if not line:
        raise HTTPException(404, "Línea de OS no encontrada")
    assert_branch_access(line.branch_id, ctx)
    return line


@router.get("/work-orders/{work_order_id}/lines", response_model=list[LineRead])
def list_lines(
    work_order_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)
    items = (
        db.query(WorkOrderLine)
        .filter(WorkOrderLine.work_order_id == wo.id, WorkOrderLine.deleted_at.is_(None))
        .order_by(WorkOrderLine.created_at)
        .all()
    )
    return [_enrich_line(db, line) for line in items]


@router.post("/work-orders/{work_order_id}/lines", response_model=LineRead, status_code=status.HTTP_201_CREATED)
def create_line(
    work_order_id: str,
    payload: LineCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller", "operador"])),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)
    if not db.query(Service).filter(Service.id == payload.service_id).first():
        raise HTTPException(404, "Servicio no encontrado")

    line = WorkOrderLine(
        branch_id=wo.branch_id,
        work_order_id=wo.id,
        service_id=payload.service_id,
        bay_id=payload.bay_id,
        mechanic_id=payload.mechanic_id,
        standard_duration_hrs=payload.standard_duration_hrs,
        notes=payload.notes,
        status=WorkOrderLineStatus.pending.value,
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return _enrich_line(db, line)


@router.put("/lines/{line_id}", response_model=LineRead)
def update_line(
    line_id: str,
    payload: LineUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller", "operador"])),
):
    line = _get_line_or_404(db, line_id, ctx)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(line, f, v)
    db.commit()
    db.refresh(line)
    return _enrich_line(db, line)


def _transition(line: WorkOrderLine, target: WorkOrderLineStatus) -> None:
    valid = {
        WorkOrderLineStatus.pending.value: {WorkOrderLineStatus.in_progress.value, WorkOrderLineStatus.cancelled.value},
        WorkOrderLineStatus.in_progress.value: {
            WorkOrderLineStatus.paused.value,
            WorkOrderLineStatus.waiting_parts.value,
            WorkOrderLineStatus.completed.value,
            WorkOrderLineStatus.cancelled.value,
        },
        WorkOrderLineStatus.paused.value: {WorkOrderLineStatus.in_progress.value, WorkOrderLineStatus.cancelled.value},
        WorkOrderLineStatus.waiting_parts.value: {
            WorkOrderLineStatus.in_progress.value,
            WorkOrderLineStatus.cancelled.value,
        },
    }
    if target.value not in valid.get(line.status, set()):
        raise HTTPException(409, f"Transición inválida: {line.status} → {target.value}")
    line.status = target.value


@router.post("/lines/{line_id}/start", response_model=LineRead)
def start_line(
    line_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "operador"])),
):
    line = _get_line_or_404(db, line_id, ctx)
    _transition(line, WorkOrderLineStatus.in_progress)
    if line.started_at is None:
        line.started_at = _now()
    line.paused_at = None
    db.commit()
    db.refresh(line)
    return _enrich_line(db, line)


@router.post("/lines/{line_id}/pause", response_model=LineRead)
def pause_line(
    line_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "operador"])),
):
    line = _get_line_or_404(db, line_id, ctx)
    _transition(line, WorkOrderLineStatus.paused)
    line.paused_at = _now()
    db.commit()
    db.refresh(line)
    return _enrich_line(db, line)


@router.post("/lines/{line_id}/resume", response_model=LineRead)
def resume_line(
    line_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "operador"])),
):
    line = _get_line_or_404(db, line_id, ctx)
    _transition(line, WorkOrderLineStatus.in_progress)
    line.paused_at = None
    db.commit()
    db.refresh(line)
    return _enrich_line(db, line)


@router.post("/lines/{line_id}/finish", response_model=LineRead)
def finish_line(
    line_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "operador"])),
):
    line = _get_line_or_404(db, line_id, ctx)
    _transition(line, WorkOrderLineStatus.completed)
    line.finished_at = _now()
    if line.started_at is not None:
        delta = (line.finished_at - line.started_at).total_seconds() / 60.0
        line.actual_duration_minutes = max(0, int(delta))
    db.commit()
    db.refresh(line)
    return _enrich_line(db, line)


# ---------------------------------------------------------------------------
# Evidence (upload de fotos/videos a R2)
# ---------------------------------------------------------------------------

@router.get("/work-orders/{work_order_id}/evidence", response_model=list[EvidenceRead])
def list_evidence(
    work_order_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)
    items = (
        db.query(Evidence)
        .filter(Evidence.work_order_id == wo.id, Evidence.deleted_at.is_(None))
        .order_by(Evidence.created_at.desc())
        .all()
    )
    storage = get_storage()
    out: list[EvidenceRead] = []
    for ev in items:
        ev_read = EvidenceRead.model_validate(ev)
        if ev.document_id:
            doc = db.query(Document).filter(Document.id == ev.document_id).first()
            if doc:
                ev_read.download_url = storage.signed_url(doc.storage_key, ttl_seconds=3600)
        out.append(ev_read)
    return out


@router.post("/work-orders/{work_order_id}/evidence", response_model=EvidenceRead, status_code=status.HTTP_201_CREATED)
async def upload_evidence(
    work_order_id: str,
    file: UploadFile = File(...),
    work_order_line_id: Optional[str] = Form(None),
    kind: str = Form("photo"),
    stage: Optional[str] = Form(None),
    note: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "operador", "recepcion"])),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)

    if work_order_line_id:
        line = _get_line_or_404(db, work_order_line_id, ctx)
        if line.work_order_id != wo.id:
            raise HTTPException(400, "La línea no pertenece a esta OS")

    # Validar kind
    try:
        EvidenceKind(kind)
    except ValueError:
        raise HTTPException(400, f"kind inválido: {kind}")

    # Build storage key: branch/work_orders/<wo_id>/<uuid>_<filename>
    safe_name = (file.filename or "evidence").replace("/", "_")
    key = f"branches/{wo.branch_id}/work-orders/{wo.id}/{uuid.uuid4().hex}_{safe_name}"

    storage = get_storage()
    contents = await file.read()
    storage.upload(key, io.BytesIO(contents), content_type=file.content_type, size_bytes=len(contents))

    doc = Document(
        branch_id=wo.branch_id,
        storage_key=key,
        storage_backend=storage.name,
        content_type=file.content_type,
        filename=file.filename,
        size_bytes=len(contents),
        owner_type="evidence",
        uploaded_by=ctx.user.id,
    )
    db.add(doc)
    db.flush()

    ev = Evidence(
        branch_id=wo.branch_id,
        work_order_id=wo.id,
        work_order_line_id=work_order_line_id,
        document_id=doc.id,
        kind=kind,
        stage=stage,
        note=note,
        captured_by=ctx.user.id,
    )
    db.add(ev)
    doc.owner_id = ev.id  # actualizamos relación reverse
    db.commit()
    db.refresh(ev)

    out = EvidenceRead.model_validate(ev)
    out.download_url = storage.signed_url(key, ttl_seconds=3600)
    return out


# ---------------------------------------------------------------------------
# QA Workflow (Módulo 2 — Wave 4)
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field

from app.models.work_orders import WorkOrderStatus
from app.security.permissions import Permission, has_permission
from app.services.state_machines import Forbidden as SMForbidden
from app.services.state_machines import InvalidTransition
from app.services.state_machines.work_order_sm import transition as wo_transition


class _QAPassRequest(BaseModel):
    note: str | None = Field(None, max_length=500)


class _QAFailRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


def _ensure_quality_check_status(wo: WorkOrder) -> None:
    """Si la OS está en in_progress, la avanza primero a quality_check.

    QA-pass/fail aplican sobre `quality_check`. Para tolerar OS que finalizaron
    sin pasar por QA explícito, hacemos el step intermedio aquí.
    """
    if wo.status == WorkOrderStatus.in_progress.value:
        wo.status = WorkOrderStatus.quality_check.value


@router.post("/work-orders/{work_order_id}/qa-pass")
def qa_pass(
    work_order_id: str,
    background_tasks: BackgroundTasks,
    payload: _QAPassRequest | None = None,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)
    if not has_permission(ctx.user, Permission.WORK_ORDER_QA_PASS):
        raise HTTPException(403, "No tienes permiso para aprobar QA")

    previous_status = wo.status
    _ensure_quality_check_status(wo)
    # Si _ensure subió a quality_check desde in_progress → emit qa_pending antes
    if previous_status == WorkOrderStatus.in_progress.value:
        from app.services.notification_wiring import notify_qa_pending
        notify_qa_pending(db, wo=wo, background_tasks=background_tasks)

    try:
        wo_transition(
            db,
            work_order=wo,
            to_status=WorkOrderStatus.completed,
            actor=ctx.user,
            reason=(payload.note if payload else None),
        )
    except InvalidTransition as e:
        raise HTTPException(409, detail={"error": {"code": e.code, "detail": e.detail}})
    except SMForbidden as e:
        raise HTTPException(403, detail={"error": {"code": e.code, "detail": e.detail}})

    # Notificar delivery_ready a recepción al pasar a completed
    from app.services.notification_wiring import notify_delivery_ready
    notify_delivery_ready(db, wo=wo, background_tasks=background_tasks)

    db.commit()
    db.refresh(wo)
    return {"id": wo.id, "status": wo.status, "qa": "passed"}


@router.post("/work-orders/{work_order_id}/qa-fail")
def qa_fail(
    work_order_id: str,
    payload: _QAFailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)
    if not has_permission(ctx.user, Permission.WORK_ORDER_QA_FAIL):
        raise HTTPException(403, "No tienes permiso para rechazar QA")

    previous_status = wo.status
    _ensure_quality_check_status(wo)
    if previous_status == WorkOrderStatus.in_progress.value:
        from app.services.notification_wiring import notify_qa_pending
        notify_qa_pending(db, wo=wo, background_tasks=background_tasks)

    try:
        wo_transition(
            db,
            work_order=wo,
            to_status=WorkOrderStatus.in_progress,
            actor=ctx.user,
            reason=payload.reason,
        )
    except InvalidTransition as e:
        raise HTTPException(409, detail={"error": {"code": e.code, "detail": e.detail}})
    except SMForbidden as e:
        raise HTTPException(403, detail={"error": {"code": e.code, "detail": e.detail}})

    db.commit()
    db.refresh(wo)
    return {"id": wo.id, "status": wo.status, "qa": "failed", "reason": payload.reason}
