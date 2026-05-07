"""Inventario: warehouses, parts, stock, movimientos, solicitudes."""
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.inventory import (
    InventoryMovement,
    InventoryRequest,
    InventoryRequestStatus,
    Part,
    StockLevel,
    Warehouse,
)
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.schemas.inventory import (
    InventoryRequestApprove,
    InventoryRequestCreate,
    InventoryRequestPage,
    InventoryRequestPick,
    InventoryRequestRead,
    InventoryRequestReject,
    MovementCreate,
    MovementPage,
    MovementRead,
    PartCreate,
    PartPage,
    PartRead,
    PartReadWithStock,
    PartUpdate,
    StockLevelRead,
    WarehouseCreate,
    WarehouseRead,
    WarehouseUpdate,
)
from app.security import require_role
from app.security.tenant import (
    TenantContext,
    assert_branch_access,
    branch_scoped_query,
    get_tenant_context,
    resolve_branch_for_write,
)
from app.services import inventory_engine


router = APIRouter(prefix="/inventory", tags=["inventory"])


# ---------------------------------------------------------------------------
# Warehouses
# ---------------------------------------------------------------------------

@router.get("/warehouses", response_model=list[WarehouseRead])
def list_warehouses(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    q = branch_scoped_query(Warehouse, db, ctx).filter(Warehouse.deleted_at.is_(None))
    return q.order_by(Warehouse.code).all()


@router.post("/warehouses", response_model=WarehouseRead, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede"])),
):
    branch_id = resolve_branch_for_write(ctx, payload.branch_id)
    if db.query(Warehouse).filter(Warehouse.branch_id == branch_id, Warehouse.code == payload.code).first():
        raise HTTPException(409, f"Almacén {payload.code} ya existe en la sucursal")
    wh = Warehouse(
        branch_id=branch_id,
        code=payload.code,
        name=payload.name,
        kind=payload.kind,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.put("/warehouses/{warehouse_id}", response_model=WarehouseRead)
def update_warehouse(
    warehouse_id: str,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede"])),
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(404, "Almacén no encontrado")
    assert_branch_access(wh.branch_id, ctx)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(wh, f, v)
    db.commit()
    db.refresh(wh)
    return wh


# ---------------------------------------------------------------------------
# Parts (catálogo global)
# ---------------------------------------------------------------------------

@router.get("/parts", response_model=PartPage)
def list_parts(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    q: Optional[str] = Query(None, description="Búsqueda por SKU/nombre"),
    category: Optional[str] = None,
    only_active: bool = True,
    only_low_stock: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    base = db.query(Part).filter(Part.deleted_at.is_(None))
    if only_active:
        base = base.filter(Part.active.is_(True))
    if q:
        like = f"%{q}%"
        base = base.filter((Part.sku.ilike(like)) | (Part.name.ilike(like)))
    if category:
        base = base.filter(Part.category == category)

    total = base.count()
    items = base.order_by(Part.name).offset((page - 1) * page_size).limit(page_size).all()

    # Enriquecer con stock total para la sucursal del contexto (si aplica)
    enriched: list[PartReadWithStock] = []
    for part in items:
        sl_query = db.query(
            func.coalesce(func.sum(StockLevel.quantity), 0.0),
            func.coalesce(func.sum(StockLevel.reserved), 0.0),
        ).filter(StockLevel.part_id == part.id, StockLevel.deleted_at.is_(None))
        if not ctx.is_global and ctx.branch_id:
            sl_query = sl_query.filter(StockLevel.branch_id == ctx.branch_id)
        elif ctx.is_global and ctx.branch_id:
            sl_query = sl_query.filter(StockLevel.branch_id == ctx.branch_id)
        total_qty, total_res = sl_query.one()
        available = (total_qty or 0.0) - (total_res or 0.0)
        is_low = available < (part.min_stock or 0.0)
        if only_low_stock and not is_low:
            continue
        enriched.append(
            PartReadWithStock(
                **PartRead.model_validate(part).model_dump(),
                total_quantity=total_qty or 0.0,
                total_reserved=total_res or 0.0,
                total_available=available,
                is_low_stock=is_low,
            )
        )
    return PartPage(total=total, page=page, page_size=page_size, items=enriched)


@router.post("/parts", response_model=PartRead, status_code=status.HTTP_201_CREATED)
def create_part(
    payload: PartCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "director", "almacen"])),
):
    if db.query(Part).filter(Part.sku == payload.sku).first():
        raise HTTPException(409, f"SKU {payload.sku} ya existe")
    part = Part(**payload.model_dump())
    db.add(part)
    db.commit()
    db.refresh(part)
    return part


@router.put("/parts/{part_id}", response_model=PartRead)
def update_part(
    part_id: str,
    payload: PartUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "director", "almacen"])),
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(404, "Refacción no encontrada")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(part, f, v)
    db.commit()
    db.refresh(part)
    return part


# ---------------------------------------------------------------------------
# Stock levels (read-only directo; las modificaciones van por movements)
# ---------------------------------------------------------------------------

@router.get("/stock", response_model=list[StockLevelRead])
def list_stock(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    warehouse_id: Optional[str] = None,
    part_id: Optional[str] = None,
):
    q = branch_scoped_query(StockLevel, db, ctx).filter(StockLevel.deleted_at.is_(None))
    if warehouse_id:
        q = q.filter(StockLevel.warehouse_id == warehouse_id)
    if part_id:
        q = q.filter(StockLevel.part_id == part_id)
    items = q.all()
    return [
        StockLevelRead(
            id=sl.id,
            branch_id=sl.branch_id,
            warehouse_id=sl.warehouse_id,
            part_id=sl.part_id,
            quantity=sl.quantity,
            reserved=sl.reserved,
            available=(sl.quantity or 0.0) - (sl.reserved or 0.0),
        )
        for sl in items
    ]


# ---------------------------------------------------------------------------
# Movements
# ---------------------------------------------------------------------------

@router.get("/movements", response_model=MovementPage)
def list_movements(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    warehouse_id: Optional[str] = None,
    part_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    q = branch_scoped_query(InventoryMovement, db, ctx)
    if warehouse_id:
        q = q.filter(InventoryMovement.warehouse_id == warehouse_id)
    if part_id:
        q = q.filter(InventoryMovement.part_id == part_id)
    if movement_type:
        q = q.filter(InventoryMovement.movement_type == movement_type)
    total = q.count()
    items = q.order_by(InventoryMovement.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return MovementPage(total=total, page=page, page_size=page_size, items=items)


@router.post("/movements", response_model=MovementRead, status_code=status.HTTP_201_CREATED)
def create_movement(
    payload: MovementCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "almacen", "jefe_taller"])),
):
    """Movimiento manual: inbound/outbound/adjustment/transfer.

    Para reservation/release usa el flujo de inventory_requests (no manual).
    """
    if payload.movement_type == "inbound":
        mov = inventory_engine.apply_inbound(
            db, ctx=ctx,
            warehouse_id=payload.warehouse_id,
            part_id=payload.part_id,
            quantity=payload.quantity,
            unit_cost=payload.unit_cost,
            work_order_id=payload.work_order_id,
            reason=payload.reason,
        )
    elif payload.movement_type == "outbound":
        mov = inventory_engine.apply_outbound(
            db, ctx=ctx,
            warehouse_id=payload.warehouse_id,
            part_id=payload.part_id,
            quantity=payload.quantity,
            work_order_id=payload.work_order_id,
            reason=payload.reason,
        )
    elif payload.movement_type == "adjustment":
        if not payload.reason:
            raise HTTPException(400, "Ajustes requieren motivo")
        # En adjustment, payload.quantity puede ser positivo o negativo según signo del unit_cost… cambio:
        # Convención: para el endpoint, el cliente manda quantity > 0 y un sign en reason. Mejor:
        # añadir un signed_delta. Para MVP usamos quantity como magnitud y NEW reason inicia con "+ "/"- ".
        sign = 1 if not payload.reason.lower().startswith("-") else -1
        delta = sign * payload.quantity
        mov = inventory_engine.apply_adjustment(
            db, ctx=ctx,
            warehouse_id=payload.warehouse_id,
            part_id=payload.part_id,
            delta=delta,
            reason=payload.reason,
        )
    elif payload.movement_type == "transfer_out":
        if not payload.counterpart_warehouse_id:
            raise HTTPException(400, "transfer_out requiere counterpart_warehouse_id")
        mov, _twin = inventory_engine.apply_transfer(
            db, ctx=ctx,
            source_warehouse_id=payload.warehouse_id,
            destination_warehouse_id=payload.counterpart_warehouse_id,
            part_id=payload.part_id,
            quantity=payload.quantity,
            reason=payload.reason,
        )
    else:
        raise HTTPException(400, f"movement_type {payload.movement_type} no soportado en endpoint manual")

    db.commit()
    db.refresh(mov)
    return mov


# ---------------------------------------------------------------------------
# Inventory Requests (mecánico → jefe → almacén → mecánico)
# ---------------------------------------------------------------------------

def _enrich_request(db: Session, req: InventoryRequest) -> InventoryRequestRead:
    out = InventoryRequestRead.model_validate(req)
    part = db.query(Part).filter(Part.id == req.part_id).first()
    if part:
        out.part_name = part.name
        out.part_sku = part.sku
    if req.requested_by:
        u = db.query(User).filter(User.id == req.requested_by).first()
        if u:
            out.requested_by_email = u.email
    wo = db.query(WorkOrder).filter(WorkOrder.id == req.work_order_id).first()
    if wo:
        out.work_order_number = wo.order_number
    return out


@router.get("/requests", response_model=InventoryRequestPage)
def list_requests(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    work_order_id: Optional[str] = None,
    request_status: Optional[str] = Query(None, alias="status"),
    requested_by: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    q = branch_scoped_query(InventoryRequest, db, ctx).filter(InventoryRequest.deleted_at.is_(None))
    if work_order_id:
        q = q.filter(InventoryRequest.work_order_id == work_order_id)
    if request_status:
        q = q.filter(InventoryRequest.status == request_status)
    if requested_by:
        q = q.filter(InventoryRequest.requested_by == requested_by)
    total = q.count()
    items = q.order_by(InventoryRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return InventoryRequestPage(
        total=total, page=page, page_size=page_size,
        items=[_enrich_request(db, r) for r in items],
    )


@router.post("/requests", response_model=InventoryRequestRead, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: InventoryRequestCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller", "mecanico", "operador"])),
):
    wo = db.query(WorkOrder).filter(WorkOrder.id == payload.work_order_id).first()
    if not wo:
        raise HTTPException(404, "OS no encontrada")
    assert_branch_access(wo.branch_id, ctx)
    if not db.query(Part).filter(Part.id == payload.part_id).first():
        raise HTTPException(404, "Refacción no encontrada")

    req = InventoryRequest(
        branch_id=wo.branch_id,
        work_order_id=payload.work_order_id,
        part_id=payload.part_id,
        quantity=payload.quantity,
        priority=payload.priority,
        notes=payload.notes,
        requested_by=ctx.user.id,
        status=InventoryRequestStatus.pending.value,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)


def _get_request_or_404(db: Session, request_id: str, ctx: TenantContext) -> InventoryRequest:
    req = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Solicitud no encontrada")
    assert_branch_access(req.branch_id, ctx)
    return req


@router.post("/requests/{request_id}/approve", response_model=InventoryRequestRead)
def approve_request(
    request_id: str,
    _payload: InventoryRequestApprove,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller", "almacen"])),
):
    req = _get_request_or_404(db, request_id, ctx)
    inventory_engine.transition_request(
        db, request=req, new_status=InventoryRequestStatus.approved.value, ctx=ctx,
    )
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)


@router.post("/requests/{request_id}/reject", response_model=InventoryRequestRead)
def reject_request(
    request_id: str,
    payload: InventoryRequestReject,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "gerente_sede", "jefe_taller", "almacen"])),
):
    req = _get_request_or_404(db, request_id, ctx)
    inventory_engine.transition_request(
        db, request=req, new_status=InventoryRequestStatus.rejected.value, ctx=ctx,
        rejected_reason=payload.reason,
    )
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)


@router.post("/requests/{request_id}/pick", response_model=InventoryRequestRead)
def pick_request(
    request_id: str,
    payload: InventoryRequestPick,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "almacen", "jefe_taller"])),
):
    req = _get_request_or_404(db, request_id, ctx)
    inventory_engine.transition_request(
        db, request=req, new_status=InventoryRequestStatus.picked.value, ctx=ctx,
        warehouse_id=payload.warehouse_id,
    )
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)


@router.post("/requests/{request_id}/deliver", response_model=InventoryRequestRead)
def deliver_request(
    request_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "almacen", "jefe_taller"])),
):
    req = _get_request_or_404(db, request_id, ctx)
    inventory_engine.transition_request(
        db, request=req, new_status=InventoryRequestStatus.delivered.value, ctx=ctx,
    )
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)


@router.post("/requests/{request_id}/use", response_model=InventoryRequestRead)
def use_request(
    request_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "operador"])),
):
    req = _get_request_or_404(db, request_id, ctx)
    inventory_engine.transition_request(
        db, request=req, new_status=InventoryRequestStatus.used.value, ctx=ctx,
    )
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)


@router.post("/requests/{request_id}/return", response_model=InventoryRequestRead)
def return_request(
    request_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin", "director", "jefe_taller", "mecanico", "almacen"])),
):
    req = _get_request_or_404(db, request_id, ctx)
    inventory_engine.transition_request(
        db, request=req, new_status=InventoryRequestStatus.returned.value, ctx=ctx,
    )
    db.commit()
    db.refresh(req)
    return _enrich_request(db, req)
