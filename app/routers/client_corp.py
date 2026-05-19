"""Router del dashboard cliente corporativo (Ola 5).

Endpoints:
- GET /v1/client-corp/fleet      — lista de unidades con su última OS
- GET /v1/client-corp/work-orders — listado paginado de OS del cliente
- GET /v1/client-corp/summary    — KPIs agregados

Roles permitidos: cliente_corp, admin, director. Para roles superiores se
puede pasar `?customer_id=…` (override). Para cliente_corp siempre se aplica
`user.customer_id`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.catalog import Service, ServiceCatalog
from app.models.deliveries import Delivery
from app.models.organizations import Branch
from app.models.users import Role, User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.schemas.client_corp import (
    CorpKPIs,
    CorpWorkOrderItem,
    CorpWorkOrdersResponse,
    FleetResponse,
    FleetUnit,
    FleetVehicleInfo,
)
from app.security import _role_value, get_current_user


router = APIRouter(prefix="/v1/client-corp", tags=["client-corp"])


_ALLOWED_ROLES = {
    Role.admin.value,
    Role.director.value,
    Role.cliente_corp.value,
}

_OPEN_STATUSES = [
    WorkOrderStatus.received.value,
    WorkOrderStatus.assigned.value,
    WorkOrderStatus.in_progress.value,
    WorkOrderStatus.waiting_parts.value,
    WorkOrderStatus.quality_check.value,
]

_READY_STATUSES = [WorkOrderStatus.completed.value]


def _ensure_role(user: User) -> str:
    role = _role_value(user.role)
    if role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para acceder al panel cliente corporativo",
        )
    return role


def _resolve_customer_id(user: User, requested: Optional[str]) -> str:
    role = _ensure_role(user)
    if role == Role.cliente_corp.value:
        if not user.customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tu usuario no tiene un cliente corporativo asociado. Contacta al administrador.",
            )
        return user.customer_id
    target = requested or user.customer_id
    if not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes indicar `customer_id` para consultar el panel.",
        )
    return target


def _base_query(db: Session, customer_id: str):
    return (
        db.query(WorkOrder)
        .filter(WorkOrder.customer_id == customer_id)
    )


def _vehicle_info(v: Optional[Vehicle]) -> FleetVehicleInfo:
    if v is None:
        return FleetVehicleInfo()
    return FleetVehicleInfo(
        id=v.id,
        plates=v.plates,
        brand=v.brand,
        model=v.model,
        year=v.year,
    )


def _branch_name(db: Session, branch_id: Optional[str], cache: dict[str, str]) -> Optional[str]:
    if not branch_id:
        return None
    if branch_id in cache:
        return cache[branch_id]
    b = db.query(Branch).filter(Branch.id == branch_id).first()
    cache[branch_id] = b.name if b else None
    return cache[branch_id]


@router.get("/fleet", response_model=FleetResponse)
def get_fleet(
    customer_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista de unidades (vehículos) con su última OS por cliente.

    Una unidad aparece si tiene al menos una OS con `customer_id` coincidente.
    Se devuelve la OS más reciente por `received_at`.
    """
    target_customer = _resolve_customer_id(user, customer_id)

    rows = (
        _base_query(db, target_customer)
        .options(joinedload(WorkOrder.vehicle), joinedload(WorkOrder.service))
        .order_by(WorkOrder.vehicle_id, WorkOrder.received_at.desc())
        .all()
    )

    branch_cache: dict[str, str] = {}
    last_by_vehicle: dict[str, FleetUnit] = {}
    in_workshop = 0
    ready = 0

    for wo in rows:
        if wo.vehicle_id in last_by_vehicle:
            continue
        if wo.status in _OPEN_STATUSES:
            in_workshop += 1
        if wo.status in _READY_STATUSES:
            ready += 1
        last_by_vehicle[wo.vehicle_id] = FleetUnit(
            vehicle=_vehicle_info(wo.vehicle),
            last_order_id=wo.id,
            last_folio=wo.order_number,
            last_status=wo.status,
            last_received_at=wo.received_at,
            estimated_ready_at=wo.promised_at,
            delivered_at=wo.closed_at,
            service_name=wo.service.name if wo.service else None,
            branch_name=_branch_name(db, wo.branch_id, branch_cache),
        )

    items = list(last_by_vehicle.values())
    items.sort(
        key=lambda x: (
            0 if x.last_status in _OPEN_STATUSES else 1,
            x.last_received_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=False,
    )

    return FleetResponse(
        total=len(items),
        in_workshop=in_workshop,
        ready_for_delivery=ready,
        items=items,
    )


@router.get("/work-orders", response_model=CorpWorkOrdersResponse)
def list_work_orders(
    customer_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Listado paginado de OS del cliente con filtros."""
    target_customer = _resolve_customer_id(user, customer_id)

    q = _base_query(db, target_customer)
    if status_filter:
        q = q.filter(WorkOrder.status == status_filter)
    if date_from is not None:
        q = q.filter(WorkOrder.received_at >= date_from)
    if date_to is not None:
        q = q.filter(WorkOrder.received_at <= date_to)

    total = q.with_entities(func.count(WorkOrder.id)).scalar() or 0

    rows = (
        q.options(joinedload(WorkOrder.vehicle), joinedload(WorkOrder.service))
        .order_by(WorkOrder.received_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    branch_cache: dict[str, str] = {}
    items: list[CorpWorkOrderItem] = []
    for wo in rows:
        items.append(
            CorpWorkOrderItem(
                id=wo.id,
                folio=wo.order_number,
                status=wo.status,
                received_at=wo.received_at,
                estimated_ready_at=wo.promised_at,
                delivered_at=wo.closed_at,
                service_name=wo.service.name if wo.service else None,
                vehicle=_vehicle_info(wo.vehicle),
                branch_name=_branch_name(db, wo.branch_id, branch_cache),
            )
        )

    return CorpWorkOrdersResponse(
        total=int(total),
        page=page,
        page_size=page_size,
        items=items,
    )


def _month_range(now: datetime, offset_months: int = 0) -> tuple[datetime, datetime]:
    year = now.year
    month = now.month + offset_months
    while month <= 0:
        month += 12
        year -= 1
    while month > 12:
        month -= 12
        year += 1
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    return start, end


def _spend_for_period(
    db: Session,
    customer_id: str,
    start: datetime,
    end: datetime,
) -> float:
    """Proxy de gasto: suma `bjx_labor_cost + bjx_parts_cost` del catálogo
    vigente por (model_id, service_id) para OS del cliente recibidas en el
    rango. No es el precio facturado real (no hay link OS↔Quote) — sirve
    como estimación operativa hasta que se modele facturación.
    """
    rows = (
        db.query(
            func.coalesce(func.sum(ServiceCatalog.bjx_labor_cost), 0.0)
            + func.coalesce(func.sum(ServiceCatalog.bjx_parts_cost), 0.0)
        )
        .select_from(WorkOrder)
        .join(
            ServiceCatalog,
            (ServiceCatalog.model_id == WorkOrder.model_id)
            & (ServiceCatalog.service_id == WorkOrder.service_id)
            & (ServiceCatalog.is_current.is_(True)),
        )
        .filter(
            WorkOrder.customer_id == customer_id,
            WorkOrder.received_at >= start,
            WorkOrder.received_at < end,
        )
        .scalar()
    )
    return float(rows or 0.0)


@router.get("/summary", response_model=CorpKPIs)
def get_summary(
    customer_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """KPIs agregados de la flota corporativa."""
    target_customer = _resolve_customer_id(user, customer_id)
    now = datetime.now(timezone.utc)

    base = _base_query(db, target_customer)

    units_total = (
        base.with_entities(func.count(func.distinct(WorkOrder.vehicle_id))).scalar() or 0
    )
    in_workshop = (
        base.with_entities(func.count(WorkOrder.id))
        .filter(WorkOrder.status.in_(_OPEN_STATUSES))
        .scalar()
        or 0
    )
    ready = (
        base.with_entities(func.count(WorkOrder.id))
        .filter(WorkOrder.status.in_(_READY_STATUSES))
        .scalar()
        or 0
    )
    delivered_30 = (
        base.with_entities(func.count(WorkOrder.id))
        .filter(
            WorkOrder.status == WorkOrderStatus.delivered.value,
            WorkOrder.closed_at.is_not(None),
            WorkOrder.closed_at >= now - timedelta(days=30),
        )
        .scalar()
        or 0
    )

    curr_start, curr_end = _month_range(now, 0)
    prev_start, prev_end = _month_range(now, -1)
    spend_curr = _spend_for_period(db, target_customer, curr_start, curr_end)
    spend_prev = _spend_for_period(db, target_customer, prev_start, prev_end)

    return CorpKPIs(
        units_total=int(units_total),
        in_workshop=int(in_workshop),
        ready_for_delivery=int(ready),
        delivered_last_30d=int(delivered_30),
        spend_current_month=round(spend_curr, 2),
        spend_previous_month=round(spend_prev, 2),
        customer_id=target_customer,
        customer_label=target_customer,
    )
