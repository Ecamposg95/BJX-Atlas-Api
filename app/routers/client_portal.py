"""Portal Cliente público (US-12).

Endpoint de solo-lectura, sin autenticación. El folio (order_number) actúa
como secret — un cliente con el folio puede ver el estado de su unidad.

Nunca expone: costos, precios, datos de proveedor, contacto del cliente,
mecánico asignado, notas internas, ni líneas con pricing.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.catalog import Service
from app.models.evidence import MobileEvidence, MobileEvidenceKind
from app.models.organizations import Branch
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.models.workshop_history import WorkOrderStatusHistory
from app.schemas.client_portal import (
    ClientServiceLine,
    ClientStage,
    ClientTimelineEntry,
    ClientUnitView,
    ClientVehicleInfo,
)
from app.services.storage import get_storage

router = APIRouter(prefix="/v1/client", tags=["client-portal"])


_STAGE_DEFS: list[tuple[str, str]] = [
    ("recepcion", "Recepción"),
    ("diagnostico", "Diagnóstico"),
    ("refacciones", "Refacciones"),
    ("trabajo", "Trabajo"),
    ("qa", "Control de calidad"),
    ("entrega", "Entrega"),
]

# Rank de status para comparar avance en pipeline.
_STATUS_RANK: dict[str, int] = {
    WorkOrderStatus.received.value: 0,
    WorkOrderStatus.assigned.value: 1,
    WorkOrderStatus.in_progress.value: 2,
    WorkOrderStatus.waiting_parts.value: 2,
    WorkOrderStatus.quality_check.value: 3,
    WorkOrderStatus.completed.value: 4,
    WorkOrderStatus.delivered.value: 5,
    WorkOrderStatus.cancelled.value: -1,
}


def _compute_progress_pct(lines: list[WorkOrderLine]) -> int:
    """Calcula porcentaje de avance: líneas completadas / total. 0 si no hay líneas."""
    if not lines:
        return 0
    finished = sum(
        1 for line in lines if line.status == WorkOrderLineStatus.completed.value
    )
    return int(round((finished / len(lines)) * 100))


def _build_lines(
    db: Session, work_order_lines: list[WorkOrderLine]
) -> list[ClientServiceLine]:
    if not work_order_lines:
        return []
    service_ids = {line.service_id for line in work_order_lines if line.service_id}
    services_by_id: dict[str, Service] = {}
    if service_ids:
        rows = db.query(Service).filter(Service.id.in_(service_ids)).all()
        services_by_id = {s.id: s for s in rows}
    out: list[ClientServiceLine] = []
    for line in work_order_lines:
        svc = services_by_id.get(line.service_id) if line.service_id else None
        label = svc.name if svc and svc.name else "Servicio"
        out.append(
            ClientServiceLine(
                label=label,
                status=line.status,
                completed_at=line.finished_at,
            )
        )
    return out


def _build_photos(db: Session, work_order_id: str) -> list[str]:
    """Fotos del check-in del cliente. Devuelve URLs públicas o firmadas."""
    rows = (
        db.query(MobileEvidence)
        .filter(
            MobileEvidence.work_order_id == work_order_id,
            MobileEvidence.kind == MobileEvidenceKind.damage_photo.value,
        )
        .order_by(MobileEvidence.created_at.asc())
        .all()
    )
    if not rows:
        return []
    try:
        storage = get_storage()
    except Exception:
        storage = None
    urls: list[str] = []
    for ev in rows:
        if ev.public_url:
            urls.append(ev.public_url)
            continue
        if storage is not None:
            try:
                urls.append(storage.signed_url(ev.storage_key, ttl_seconds=3600))
            except Exception:
                continue
    return urls


def _completed_at_for_status(
    history: list[WorkOrderStatusHistory], target_statuses: set[str]
) -> Optional[datetime]:
    """Primer momento en que la OS entró a alguno de los `target_statuses`."""
    for row in history:
        if row.to_status in target_statuses:
            return row.occurred_at
    return None


def _build_stages(
    work_order: WorkOrder,
    lines: list[WorkOrderLine],
    history: list[WorkOrderStatusHistory],
) -> list[ClientStage]:
    """Heurística para mapear estado actual + líneas → 6 etapas con %.

    No es exacto en todos los casos — es una vista cliente "feel-good"
    progresiva: cada etapa hereda 100% si el flujo ya la superó.
    """
    current_rank = _STATUS_RANK.get(work_order.status, 0)
    status_set = {row.to_status for row in history}
    status_set.add(work_order.status)

    n_lines = len(lines)
    lines_started = sum(
        1
        for line in lines
        if line.status
        in {
            WorkOrderLineStatus.in_progress.value,
            WorkOrderLineStatus.paused.value,
            WorkOrderLineStatus.waiting_parts.value,
            WorkOrderLineStatus.completed.value,
        }
    )
    lines_done = sum(
        1 for line in lines if line.status == WorkOrderLineStatus.completed.value
    )
    lines_waiting = sum(
        1
        for line in lines
        if line.status == WorkOrderLineStatus.waiting_parts.value
    )

    work_pct = (
        int(round((lines_done / n_lines) * 100)) if n_lines else 0
    )

    # recepcion
    recepcion_pct = 100 if work_order.received_at else 0
    recepcion_done = work_order.received_at

    # diagnostico: cuando OS pasó a assigned o más
    if current_rank >= 1:
        diag_pct = 100
    else:
        diag_pct = 50 if work_order.received_at else 0
    diag_done = _completed_at_for_status(
        history,
        {
            WorkOrderStatus.assigned.value,
            WorkOrderStatus.in_progress.value,
        },
    )

    # refacciones: 100 si superamos in_progress (ya no falta surtir),
    # 50 si actualmente waiting_parts, 0 si aún no llegamos.
    if current_rank >= 3:
        refac_pct = 100
    elif (
        work_order.status == WorkOrderStatus.waiting_parts.value
        or lines_waiting > 0
    ):
        refac_pct = 50
    elif current_rank >= 2:
        refac_pct = 100 if lines_waiting == 0 else 50
    else:
        refac_pct = 0
    refac_done: Optional[datetime] = None
    if refac_pct == 100 and current_rank >= 3:
        refac_done = _completed_at_for_status(
            history,
            {WorkOrderStatus.quality_check.value, WorkOrderStatus.completed.value},
        )

    # trabajo: progreso de líneas
    if current_rank >= 3:
        trabajo_pct = 100
    elif n_lines:
        trabajo_pct = work_pct
    elif current_rank >= 2:
        trabajo_pct = 50
    else:
        trabajo_pct = 0
    trabajo_done = _completed_at_for_status(
        history,
        {WorkOrderStatus.quality_check.value, WorkOrderStatus.completed.value},
    )

    # qa
    if current_rank >= 4:
        qa_pct = 100
    elif current_rank == 3:
        qa_pct = 50
    else:
        qa_pct = 0
    qa_done = _completed_at_for_status(
        history,
        {WorkOrderStatus.completed.value, WorkOrderStatus.delivered.value},
    )

    # entrega
    if current_rank >= 5:
        entrega_pct = 100
    elif current_rank == 4:
        entrega_pct = 50
    else:
        entrega_pct = 0
    entrega_done = work_order.closed_at or _completed_at_for_status(
        history, {WorkOrderStatus.delivered.value}
    )

    raw = [
        ("recepcion", recepcion_pct, recepcion_done),
        ("diagnostico", diag_pct, diag_done),
        ("refacciones", refac_pct, refac_done),
        ("trabajo", trabajo_pct, trabajo_done),
        ("qa", qa_pct, qa_done),
        ("entrega", entrega_pct, entrega_done),
    ]
    label_by_key = {k: lbl for k, lbl in _STAGE_DEFS}
    return [
        ClientStage(
            key=k,
            label=label_by_key.get(k, k.capitalize()),
            pct=int(max(0, min(100, pct))),
            completed_at=done if pct >= 100 else None,
        )
        for (k, pct, done) in raw
    ]


def _humanize_eta(
    eta: Optional[datetime],
    delivered_at: Optional[datetime],
    status_value: str,
) -> Optional[str]:
    """Texto amigable: 'Listo hoy a las 14:00', 'Mañana ~3 horas', etc."""
    if status_value == WorkOrderStatus.delivered.value:
        return "Entregado"
    if status_value == WorkOrderStatus.completed.value:
        return "Listo para recoger"
    if eta is None:
        return None
    now = datetime.now(timezone.utc)
    eta_aware = eta if eta.tzinfo else eta.replace(tzinfo=timezone.utc)
    delta = eta_aware - now
    total_minutes = int(delta.total_seconds() // 60)
    if total_minutes <= 0:
        return "Próximo a entregar"
    if total_minutes < 60:
        return f"Listo en aprox. {total_minutes} min"
    hours = total_minutes // 60
    if hours < 6:
        return f"Listo en aprox. {hours} h"
    # Comparación por fecha local UTC (suficiente para el portal).
    now_date = now.date()
    eta_date = eta_aware.date()
    days = (eta_date - now_date).days
    hh_mm = eta_aware.strftime("%H:%M")
    if days <= 0:
        return f"Listo hoy a las {hh_mm}"
    if days == 1:
        return f"Listo mañana a las {hh_mm}"
    if days < 7:
        return f"Listo en {days} días"
    return f"Listo el {eta_aware.strftime('%d %b')} a las {hh_mm}"


@router.get("/units/{folio}", response_model=ClientUnitView)
def get_unit_by_folio(folio: str, db: Session = Depends(get_db)) -> ClientUnitView:
    """Consulta pública del estatus de una unidad por folio (order_number).

    404 si el folio no existe — no se filtra información sobre folios válidos.
    """
    work_order = (
        db.query(WorkOrder)
        .options(joinedload(WorkOrder.vehicle))
        .filter(WorkOrder.order_number == folio)
        .first()
    )
    if work_order is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folio no encontrado",
        )

    branch = (
        db.query(Branch).filter(Branch.id == work_order.branch_id).first()
        if work_order.branch_id
        else None
    )

    history_rows = (
        db.query(WorkOrderStatusHistory)
        .filter(WorkOrderStatusHistory.work_order_id == work_order.id)
        .order_by(WorkOrderStatusHistory.occurred_at.asc())
        .all()
    )
    timeline = [
        ClientTimelineEntry(
            status=row.to_status,
            timestamp=row.occurred_at,
            note=row.reason,
        )
        for row in history_rows
    ]

    work_order_lines = (
        db.query(WorkOrderLine)
        .filter(WorkOrderLine.work_order_id == work_order.id)
        .all()
    )

    vehicle = work_order.vehicle
    vehicle_info = ClientVehicleInfo(
        plates=vehicle.plates if vehicle else None,
        brand=vehicle.brand if vehicle else None,
        model=vehicle.model if vehicle else None,
        year=vehicle.year if vehicle else None,
    )

    return ClientUnitView(
        folio=work_order.order_number,
        status=work_order.status,
        vehicle=vehicle_info,
        received_at=work_order.received_at,
        estimated_ready_at=work_order.promised_at,
        delivered_at=work_order.closed_at,
        progress_pct=_compute_progress_pct(work_order_lines),
        branch_name=branch.name if branch else None,
        timeline=timeline,
        lines=_build_lines(db, work_order_lines),
        photos=_build_photos(db, work_order.id),
        stages=_build_stages(work_order, work_order_lines, history_rows),
        eta_text=_humanize_eta(
            work_order.promised_at, work_order.closed_at, work_order.status
        ),
    )
