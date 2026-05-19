from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.catalog import Service, VehicleModel
from app.models.users import User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.schemas.catalog import PaginatedResponse
from app.schemas.work_orders import WorkOrderCreate, WorkOrderRead, WorkOrderUpdate, WorkOrderVehicleSummary
from app.security import get_current_user, require_role
from app.services.work_order_engine import (
    build_work_order_metrics,
    generate_order_number,
    get_standard_duration_hrs,
    utcnow,
)

router = APIRouter(prefix="/work-orders", tags=["work-orders"])


def _get_vehicle_summary(vehicle: Vehicle) -> WorkOrderVehicleSummary:
    return WorkOrderVehicleSummary.model_validate(vehicle)


def _get_work_order_or_404(db: Session, work_order_id: str) -> WorkOrder:
    work_order = (
        db.query(WorkOrder)
        .options(
            joinedload(WorkOrder.vehicle),
            joinedload(WorkOrder.model),
            joinedload(WorkOrder.service),
            joinedload(WorkOrder.assigned_mechanic),
        )
        .filter(WorkOrder.id == work_order_id)
        .first()
    )
    if not work_order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden de trabajo no encontrada")
    return work_order


def _get_active_vehicle_or_404(db: Session, vehicle_id: str) -> Vehicle:
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.deleted_at.is_(None)).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")
    return vehicle


def _get_active_model_or_404(db: Session, model_id: str) -> VehicleModel:
    model = db.query(VehicleModel).filter(VehicleModel.id == model_id, VehicleModel.deleted_at.is_(None)).first()
    if not model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Modelo no encontrado")
    return model


def _get_active_service_or_404(db: Session, service_id: str) -> Service:
    service = db.query(Service).filter(Service.id == service_id, Service.deleted_at.is_(None)).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servicio no encontrado")
    return service


def _get_user_or_404(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.id == user_id, User.active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return user


def _build_work_order_read(db: Session, work_order: WorkOrder) -> WorkOrderRead:
    standard_duration_hrs = get_standard_duration_hrs(db, work_order.model_id, work_order.service_id)
    metrics = build_work_order_metrics(work_order, standard_duration_hrs)
    vehicle_summary = _get_vehicle_summary(work_order.vehicle)
    service_name = work_order.service.name if work_order.service else work_order.service_id
    assigned_mechanic_email = work_order.assigned_mechanic.email if work_order.assigned_mechanic else None
    return WorkOrderRead(
        id=work_order.id,
        order_number=work_order.order_number,
        vehicle_id=work_order.vehicle_id,
        model_id=work_order.model_id,
        service_id=work_order.service_id,
        assigned_mechanic_id=work_order.assigned_mechanic_id,
        status=work_order.status,
        received_at=work_order.received_at,
        work_started_at=work_order.work_started_at,
        work_finished_at=work_order.work_finished_at,
        closed_at=work_order.closed_at,
        delay_reason=work_order.delay_reason,
        notes=work_order.notes,
        created_at=work_order.created_at,
        updated_at=work_order.updated_at,
        vehicle_summary=vehicle_summary,
        service_name=service_name,
        assigned_mechanic_email=assigned_mechanic_email,
        standard_duration_hrs=metrics["standard_duration_hrs"],
        actual_duration_minutes=metrics["actual_duration_minutes"],
        semaphore_status=metrics["semaphore_status"],
    )


@router.get("", response_model=PaginatedResponse[WorkOrderRead])
def list_work_orders(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    status_filter: Optional[WorkOrderStatus] = Query(None, alias="status"),
    assigned_mechanic_id: Optional[str] = Query(None),
    vehicle_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    query = (
        db.query(WorkOrder)
        .options(
            joinedload(WorkOrder.vehicle),
            joinedload(WorkOrder.model),
            joinedload(WorkOrder.service),
            joinedload(WorkOrder.assigned_mechanic),
        )
        .order_by(WorkOrder.received_at.desc())
    )

    if status_filter is not None:
        query = query.filter(WorkOrder.status == status_filter)
    if assigned_mechanic_id is not None:
        query = query.filter(WorkOrder.assigned_mechanic_id == assigned_mechanic_id)
    if vehicle_id is not None:
        query = query.filter(WorkOrder.vehicle_id == vehicle_id)

    total = query.count()
    records = query.offset((page - 1) * size).limit(size).all()
    items = [_build_work_order_read(db, record) for record in records]
    return PaginatedResponse(items=items, total=total, page=page, size=size)


@router.get("/{work_order_id}", response_model=WorkOrderRead)
def get_work_order(
    work_order_id: str,
    db: Session = Depends(get_db),
    _: object = Depends(get_current_user),
):
    return _build_work_order_read(db, _get_work_order_or_404(db, work_order_id))


@router.post("", response_model=WorkOrderRead, status_code=status.HTTP_201_CREATED)
def create_work_order(
    payload: WorkOrderCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "operador"])),
):
    _get_active_vehicle_or_404(db, payload.vehicle_id)
    _get_active_model_or_404(db, payload.model_id)
    _get_active_service_or_404(db, payload.service_id)
    if payload.assigned_mechanic_id is not None:
        _get_user_or_404(db, payload.assigned_mechanic_id)

    work_order = WorkOrder(
        order_number=generate_order_number(db),
        vehicle_id=payload.vehicle_id,
        model_id=payload.model_id,
        service_id=payload.service_id,
        assigned_mechanic_id=payload.assigned_mechanic_id,
        status=WorkOrderStatus.received,
        received_at=utcnow(),
        delay_reason=payload.delay_reason,
        notes=payload.notes,
    )
    db.add(work_order)
    db.commit()
    db.refresh(work_order)
    work_order = _get_work_order_or_404(db, work_order.id)
    return _build_work_order_read(db, work_order)


@router.put("/{work_order_id}", response_model=WorkOrderRead)
def update_work_order(
    work_order_id: str,
    payload: WorkOrderUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "operador"])),
):
    work_order = _get_work_order_or_404(db, work_order_id)
    update_data = payload.model_dump(exclude_unset=True)

    if "vehicle_id" in update_data and update_data["vehicle_id"] is not None:
        _get_active_vehicle_or_404(db, update_data["vehicle_id"])
    if "model_id" in update_data and update_data["model_id"] is not None:
        _get_active_model_or_404(db, update_data["model_id"])
    if "service_id" in update_data and update_data["service_id"] is not None:
        _get_active_service_or_404(db, update_data["service_id"])
    if "assigned_mechanic_id" in update_data and update_data["assigned_mechanic_id"] is not None:
        _get_user_or_404(db, update_data["assigned_mechanic_id"])

    for field, value in update_data.items():
        setattr(work_order, field, value)

    db.commit()
    db.refresh(work_order)
    work_order = _get_work_order_or_404(db, work_order.id)
    return _build_work_order_read(db, work_order)


@router.post("/{work_order_id}/start", response_model=WorkOrderRead)
def start_work_order(
    work_order_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "operador"])),
):
    work_order = _get_work_order_or_404(db, work_order_id)
    if work_order.work_started_at is None:
        work_order.work_started_at = utcnow()
    work_order.status = WorkOrderStatus.in_progress
    db.commit()
    db.refresh(work_order)
    work_order = _get_work_order_or_404(db, work_order.id)
    return _build_work_order_read(db, work_order)


@router.post("/{work_order_id}/finish", response_model=WorkOrderRead)
def finish_work_order(
    work_order_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "operador"])),
):
    work_order = _get_work_order_or_404(db, work_order_id)
    if work_order.work_started_at is None:
        work_order.work_started_at = utcnow()
    if work_order.work_finished_at is None:
        work_order.work_finished_at = utcnow()
    work_order.status = WorkOrderStatus.completed
    from app.services.work_order_pricing import recompute_work_order_totals
    recompute_work_order_totals(db, work_order)
    db.commit()
    db.refresh(work_order)
    work_order = _get_work_order_or_404(db, work_order.id)
    return _build_work_order_read(db, work_order)


@router.post("/{work_order_id}/deliver", response_model=WorkOrderRead)
def deliver_work_order(
    work_order_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "operador"])),
):
    work_order = _get_work_order_or_404(db, work_order_id)
    if work_order.closed_at is None:
        work_order.closed_at = utcnow()
    work_order.status = WorkOrderStatus.delivered
    db.commit()
    db.refresh(work_order)
    work_order = _get_work_order_or_404(db, work_order.id)
    return _build_work_order_read(db, work_order)


# ===========================================================================
# /api/v1/work-orders — Fase 1: state machine + history + cancel
# ===========================================================================

from fastapi import status as http_status

from app.models.workshop_history import WorkOrderStatusHistory
from app.schemas.work_orders import (
    WorkOrderCancelRequest,
    WorkOrderStatusHistoryEntry,
    WorkOrderStatusHistoryResponse,
    WorkOrderStatusTransitionRequest,
    WorkOrderStatusTransitionResponse,
)
from app.security.tenant import TenantContext, assert_branch_access, get_tenant_context
from app.services.state_machines import Forbidden as SMForbidden
from app.services.state_machines import InvalidTransition
from app.services.state_machines.work_order_sm import transition as wo_transition

router_v1 = APIRouter(prefix="/v1/work-orders", tags=["work-orders-v1"])


@router_v1.patch("/{work_order_id}/status", response_model=WorkOrderStatusTransitionResponse)
def patch_work_order_status(
    work_order_id: str,
    payload: WorkOrderStatusTransitionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_work_order_or_404(db, work_order_id)
    assert_branch_access(wo.branch_id, ctx)

    previous_status = wo.status

    try:
        history = wo_transition(
            db,
            work_order=wo,
            to_status=WorkOrderStatus(payload.to_status),
            actor=ctx.user,
            reason=payload.reason,
            metadata=payload.metadata,
        )
    except InvalidTransition as e:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail={"error": {"code": e.code, "detail": e.detail}},
        )
    except SMForbidden as e:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": e.code, "detail": e.detail}},
        )

    # Notificaciones de cambio de estado (Ola 4)
    from app.services.notification_wiring import notify_wo_status_changed
    notify_wo_status_changed(
        db, wo=wo, previous_status=previous_status, background_tasks=background_tasks,
    )

    # Recalcular totales al cerrar la OS.
    if wo.status in (WorkOrderStatus.completed.value, WorkOrderStatus.delivered.value):
        from app.services.work_order_pricing import recompute_work_order_totals
        recompute_work_order_totals(db, wo)

    db.commit()
    db.refresh(wo)

    return WorkOrderStatusTransitionResponse(
        id=wo.id,
        status=wo.status,
        previous_status=previous_status,
        history_entry_id=history.id,
        transitioned_at=history.occurred_at,
        transitioned_by={"id": ctx.user.id, "email": ctx.user.email},
    )


@router_v1.get("/{work_order_id}/status-history", response_model=WorkOrderStatusHistoryResponse)
def get_work_order_status_history(
    work_order_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_work_order_or_404(db, work_order_id)
    assert_branch_access(wo.branch_id, ctx)

    entries_raw = (
        db.query(WorkOrderStatusHistory)
        .filter(WorkOrderStatusHistory.work_order_id == wo.id)
        .order_by(WorkOrderStatusHistory.occurred_at.asc())
        .all()
    )

    entries: list[WorkOrderStatusHistoryEntry] = []
    prev_time = None
    for h in entries_raw:
        duration = None
        if prev_time is not None:
            duration = int((h.occurred_at - prev_time).total_seconds())

        changed_by = None
        if h.changed_by:
            user_obj = db.query(User).filter(User.id == h.changed_by).first()
            if user_obj:
                changed_by = {"id": user_obj.id, "email": user_obj.email, "role": user_obj.role}

        entries.append(WorkOrderStatusHistoryEntry(
            id=h.id,
            from_status=h.from_status,
            to_status=h.to_status,
            changed_by=changed_by,
            reason=h.reason,
            occurred_at=h.occurred_at,
            duration_in_previous_status_seconds=duration,
        ))
        prev_time = h.occurred_at

    return WorkOrderStatusHistoryResponse(
        work_order_id=wo.id,
        current_status=wo.status,
        entries=entries,
    )


@router_v1.post("/{work_order_id}/cancel", response_model=WorkOrderStatusTransitionResponse)
def cancel_work_order_v1(
    work_order_id: str,
    payload: WorkOrderCancelRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_work_order_or_404(db, work_order_id)
    assert_branch_access(wo.branch_id, ctx)

    previous_status = wo.status
    try:
        history = wo_transition(
            db,
            work_order=wo,
            to_status=WorkOrderStatus.cancelled,
            actor=ctx.user,
            reason=payload.reason,
        )
    except InvalidTransition as e:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail={"error": {"code": e.code, "detail": e.detail}},
        )
    except SMForbidden as e:
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": e.code, "detail": e.detail}},
        )

    db.commit()
    db.refresh(wo)
    return WorkOrderStatusTransitionResponse(
        id=wo.id,
        status=wo.status,
        previous_status=previous_status,
        history_entry_id=history.id,
        transitioned_at=history.occurred_at,
        transitioned_by={"id": ctx.user.id, "email": ctx.user.email},
    )
