"""Portal Cliente público (US-12).

Endpoint de solo-lectura, sin autenticación. El folio (order_number) actúa
como secret — un cliente con el folio puede ver el estado de su unidad.

Nunca expone: costos, precios, datos de proveedor, contacto del cliente,
mecánico asignado, notas internas, ni líneas con pricing.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.organizations import Branch
from app.models.work_orders import WorkOrder
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.models.workshop_history import WorkOrderStatusHistory
from app.schemas.client_portal import (
    ClientTimelineEntry,
    ClientUnitView,
    ClientVehicleInfo,
)

router = APIRouter(prefix="/v1/client", tags=["client-portal"])


def _compute_progress_pct(db: Session, work_order_id: str) -> int:
    """Calcula porcentaje de avance: líneas completadas / total. 0 si no hay líneas."""
    lines = (
        db.query(WorkOrderLine)
        .filter(WorkOrderLine.work_order_id == work_order_id)
        .all()
    )
    if not lines:
        return 0
    finished = sum(
        1 for line in lines if line.status == WorkOrderLineStatus.completed.value
    )
    return int(round((finished / len(lines)) * 100))


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
        progress_pct=_compute_progress_pct(db, work_order.id),
        branch_name=branch.name if branch else None,
        timeline=timeline,
    )
