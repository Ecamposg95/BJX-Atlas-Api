"""Motor de inventario: aplica movimientos y mantiene stock_levels consistentes.

Reglas clave:
- Movimientos son APPEND-ONLY (nunca se editan ni borran).
- StockLevel.quantity y reserved se actualizan transactionalmente con cada movimiento.
- transfer = par atómico (transfer_out en origen + transfer_in en destino).
- reservation aumenta `reserved` sin tocar `quantity`; release lo revierte.
- outbound disminuye `quantity` (consumo real).
- inbound aumenta `quantity` (recepción).
- adjustment puede ser positivo o negativo (ajuste manual con motivo obligatorio).

Todas las operaciones requieren el `TenantContext` y validan que warehouse y part
sean accesibles desde la sucursal del usuario.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.inventory import (
    InventoryMovement,
    InventoryMovementType,
    InventoryRequest,
    InventoryRequestStatus,
    Part,
    StockLevel,
    Warehouse,
)
from app.security.tenant import TenantContext, assert_branch_access


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_or_create_stock_level(
    db: Session,
    *,
    branch_id: str,
    warehouse_id: str,
    part_id: str,
) -> StockLevel:
    sl = (
        db.query(StockLevel)
        .filter(StockLevel.warehouse_id == warehouse_id, StockLevel.part_id == part_id)
        .first()
    )
    if sl is None:
        sl = StockLevel(
            branch_id=branch_id,
            warehouse_id=warehouse_id,
            part_id=part_id,
            quantity=0.0,
            reserved=0.0,
        )
        db.add(sl)
        db.flush()
    return sl


def _validate_warehouse_access(db: Session, warehouse_id: str, ctx: TenantContext) -> Warehouse:
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if wh is None:
        raise HTTPException(status_code=404, detail=f"Almacén {warehouse_id} no encontrado")
    assert_branch_access(wh.branch_id, ctx)
    return wh


def _validate_part(db: Session, part_id: str) -> Part:
    p = db.query(Part).filter(Part.id == part_id).first()
    if p is None:
        raise HTTPException(status_code=404, detail=f"Refacción {part_id} no encontrada")
    return p


def apply_inbound(
    db: Session,
    *,
    ctx: TenantContext,
    warehouse_id: str,
    part_id: str,
    quantity: float,
    unit_cost: Optional[float] = None,
    reason: Optional[str] = None,
    work_order_id: Optional[str] = None,
) -> InventoryMovement:
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity debe ser > 0 para inbound")

    wh = _validate_warehouse_access(db, warehouse_id, ctx)
    _validate_part(db, part_id)

    sl = _get_or_create_stock_level(db, branch_id=wh.branch_id, warehouse_id=warehouse_id, part_id=part_id)
    sl.quantity = (sl.quantity or 0.0) + quantity
    sl.last_movement_at = _now_iso()

    mov = InventoryMovement(
        branch_id=wh.branch_id,
        warehouse_id=warehouse_id,
        part_id=part_id,
        movement_type=InventoryMovementType.inbound.value,
        quantity=quantity,
        unit_cost=unit_cost,
        work_order_id=work_order_id,
        performed_by=ctx.user.id,
        reason=reason,
    )
    db.add(mov)

    # Actualizar last_unit_cost en parts si recibimos costo
    if unit_cost is not None:
        part = db.query(Part).filter(Part.id == part_id).first()
        if part:
            part.last_unit_cost = unit_cost

    db.flush()
    return mov


def apply_outbound(
    db: Session,
    *,
    ctx: TenantContext,
    warehouse_id: str,
    part_id: str,
    quantity: float,
    work_order_id: Optional[str] = None,
    inventory_request_id: Optional[str] = None,
    reason: Optional[str] = None,
    consume_from_reserved: bool = False,
) -> InventoryMovement:
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity debe ser > 0 para outbound")

    wh = _validate_warehouse_access(db, warehouse_id, ctx)
    _validate_part(db, part_id)

    sl = _get_or_create_stock_level(db, branch_id=wh.branch_id, warehouse_id=warehouse_id, part_id=part_id)
    available = (sl.quantity or 0.0) - (sl.reserved or 0.0)
    if not consume_from_reserved and available < quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Stock insuficiente: disponible {available}, solicitado {quantity}",
        )

    sl.quantity = (sl.quantity or 0.0) - quantity
    if consume_from_reserved:
        sl.reserved = max(0.0, (sl.reserved or 0.0) - quantity)
    sl.last_movement_at = _now_iso()

    mov = InventoryMovement(
        branch_id=wh.branch_id,
        warehouse_id=warehouse_id,
        part_id=part_id,
        movement_type=InventoryMovementType.outbound.value,
        quantity=-quantity,
        work_order_id=work_order_id,
        inventory_request_id=inventory_request_id,
        performed_by=ctx.user.id,
        reason=reason,
    )
    db.add(mov)
    db.flush()
    return mov


def apply_adjustment(
    db: Session,
    *,
    ctx: TenantContext,
    warehouse_id: str,
    part_id: str,
    delta: float,
    reason: str,
) -> InventoryMovement:
    if delta == 0:
        raise HTTPException(status_code=400, detail="delta no puede ser 0")
    if not reason or len(reason.strip()) < 3:
        raise HTTPException(status_code=400, detail="Motivo del ajuste obligatorio (mín 3 chars)")

    wh = _validate_warehouse_access(db, warehouse_id, ctx)
    _validate_part(db, part_id)

    sl = _get_or_create_stock_level(db, branch_id=wh.branch_id, warehouse_id=warehouse_id, part_id=part_id)
    new_qty = (sl.quantity or 0.0) + delta
    if new_qty < 0:
        raise HTTPException(
            status_code=409,
            detail=f"El ajuste dejaría stock negativo (actual {sl.quantity}, delta {delta})",
        )
    sl.quantity = new_qty
    sl.last_counted_at = _now_iso()
    sl.last_movement_at = _now_iso()

    mov = InventoryMovement(
        branch_id=wh.branch_id,
        warehouse_id=warehouse_id,
        part_id=part_id,
        movement_type=InventoryMovementType.adjustment.value,
        quantity=delta,
        performed_by=ctx.user.id,
        reason=reason,
    )
    db.add(mov)
    db.flush()
    return mov


def apply_reservation(
    db: Session,
    *,
    ctx: TenantContext,
    warehouse_id: str,
    part_id: str,
    quantity: float,
    inventory_request_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> InventoryMovement:
    """Reserva stock para una solicitud aprobada (no descuenta quantity, solo aumenta reserved)."""
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity debe ser > 0 para reservation")

    wh = _validate_warehouse_access(db, warehouse_id, ctx)
    _validate_part(db, part_id)

    sl = _get_or_create_stock_level(db, branch_id=wh.branch_id, warehouse_id=warehouse_id, part_id=part_id)
    available = (sl.quantity or 0.0) - (sl.reserved or 0.0)
    if available < quantity:
        raise HTTPException(
            status_code=409,
            detail=f"No hay suficiente stock libre para reservar: libre {available}, solicitado {quantity}",
        )
    sl.reserved = (sl.reserved or 0.0) + quantity
    sl.last_movement_at = _now_iso()

    mov = InventoryMovement(
        branch_id=wh.branch_id,
        warehouse_id=warehouse_id,
        part_id=part_id,
        movement_type=InventoryMovementType.reservation.value,
        quantity=quantity,
        inventory_request_id=inventory_request_id,
        performed_by=ctx.user.id,
        reason=reason,
    )
    db.add(mov)
    db.flush()
    return mov


def apply_release(
    db: Session,
    *,
    ctx: TenantContext,
    warehouse_id: str,
    part_id: str,
    quantity: float,
    inventory_request_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> InventoryMovement:
    """Libera una reserva sin consumir (cancelación, devolución sin uso)."""
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity debe ser > 0 para release")

    wh = _validate_warehouse_access(db, warehouse_id, ctx)
    _validate_part(db, part_id)

    sl = _get_or_create_stock_level(db, branch_id=wh.branch_id, warehouse_id=warehouse_id, part_id=part_id)
    sl.reserved = max(0.0, (sl.reserved or 0.0) - quantity)
    sl.last_movement_at = _now_iso()

    mov = InventoryMovement(
        branch_id=wh.branch_id,
        warehouse_id=warehouse_id,
        part_id=part_id,
        movement_type=InventoryMovementType.release.value,
        quantity=-quantity,
        inventory_request_id=inventory_request_id,
        performed_by=ctx.user.id,
        reason=reason,
    )
    db.add(mov)
    db.flush()
    return mov


def apply_transfer(
    db: Session,
    *,
    ctx: TenantContext,
    source_warehouse_id: str,
    destination_warehouse_id: str,
    part_id: str,
    quantity: float,
    reason: Optional[str] = None,
) -> tuple[InventoryMovement, InventoryMovement]:
    """Atómico: descuenta del origen y suma al destino. Mismo branch_id obligatorio."""
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity debe ser > 0 para transfer")
    if source_warehouse_id == destination_warehouse_id:
        raise HTTPException(status_code=400, detail="origen y destino no pueden ser el mismo almacén")

    src = _validate_warehouse_access(db, source_warehouse_id, ctx)
    dst = _validate_warehouse_access(db, destination_warehouse_id, ctx)
    if src.branch_id != dst.branch_id:
        raise HTTPException(status_code=400, detail="Transferencias entre sucursales no soportadas en MVP")
    _validate_part(db, part_id)

    src_sl = _get_or_create_stock_level(db, branch_id=src.branch_id, warehouse_id=src.id, part_id=part_id)
    dst_sl = _get_or_create_stock_level(db, branch_id=dst.branch_id, warehouse_id=dst.id, part_id=part_id)
    available = (src_sl.quantity or 0.0) - (src_sl.reserved or 0.0)
    if available < quantity:
        raise HTTPException(status_code=409, detail=f"Stock insuficiente en origen: {available}")

    src_sl.quantity -= quantity
    src_sl.last_movement_at = _now_iso()
    dst_sl.quantity = (dst_sl.quantity or 0.0) + quantity
    dst_sl.last_movement_at = _now_iso()

    out = InventoryMovement(
        branch_id=src.branch_id,
        warehouse_id=src.id,
        part_id=part_id,
        movement_type=InventoryMovementType.transfer_out.value,
        quantity=-quantity,
        counterpart_warehouse_id=dst.id,
        performed_by=ctx.user.id,
        reason=reason,
    )
    inn = InventoryMovement(
        branch_id=dst.branch_id,
        warehouse_id=dst.id,
        part_id=part_id,
        movement_type=InventoryMovementType.transfer_in.value,
        quantity=quantity,
        counterpart_warehouse_id=src.id,
        performed_by=ctx.user.id,
        reason=reason,
    )
    db.add_all([out, inn])
    db.flush()
    return out, inn


# ---------------------------------------------------------------------------
# Inventory Request workflow (mecánico → jefe → almacén)
# ---------------------------------------------------------------------------

def transition_request(
    db: Session,
    *,
    request: InventoryRequest,
    new_status: str,
    ctx: TenantContext,
    warehouse_id: Optional[str] = None,
    rejected_reason: Optional[str] = None,
) -> InventoryRequest:
    """Aplica la transición de estado y, cuando corresponde, los efectos de stock."""
    current = request.status
    valid_transitions = {
        InventoryRequestStatus.pending.value: {
            InventoryRequestStatus.approved.value,
            InventoryRequestStatus.rejected.value,
        },
        InventoryRequestStatus.approved.value: {
            InventoryRequestStatus.picked.value,
            InventoryRequestStatus.rejected.value,
        },
        InventoryRequestStatus.picked.value: {
            InventoryRequestStatus.delivered.value,
        },
        InventoryRequestStatus.delivered.value: {
            InventoryRequestStatus.used.value,
            InventoryRequestStatus.returned.value,
        },
    }
    if new_status not in valid_transitions.get(current, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Transición inválida: {current} → {new_status}",
        )

    if new_status == InventoryRequestStatus.approved.value:
        request.status = new_status
        request.approved_by = ctx.user.id

    elif new_status == InventoryRequestStatus.rejected.value:
        if not rejected_reason:
            raise HTTPException(status_code=400, detail="rejected_reason es obligatorio")
        request.status = new_status
        request.rejected_reason = rejected_reason
        # Si se rechaza después de aprobada, liberar reservas si las hubiera
        if current == InventoryRequestStatus.approved.value:
            pass  # sin reservas en este punto

    elif new_status == InventoryRequestStatus.picked.value:
        if not warehouse_id:
            raise HTTPException(status_code=400, detail="warehouse_id obligatorio al hacer picking")
        apply_reservation(
            db,
            ctx=ctx,
            warehouse_id=warehouse_id,
            part_id=request.part_id,
            quantity=request.quantity,
            inventory_request_id=request.id,
            reason=f"Picking solicitud {request.id}",
        )
        request.status = new_status

    elif new_status == InventoryRequestStatus.delivered.value:
        request.status = new_status
        # No descuenta stock todavía (espera a USED). Reservation persiste.

    elif new_status == InventoryRequestStatus.used.value:
        # Consume el stock reservado.
        last_pick = (
            db.query(InventoryMovement)
            .filter(
                InventoryMovement.inventory_request_id == request.id,
                InventoryMovement.movement_type == InventoryMovementType.reservation.value,
            )
            .order_by(InventoryMovement.created_at.desc())
            .first()
        )
        if last_pick is None:
            raise HTTPException(status_code=409, detail="No se encontró el picking previo de la solicitud")
        apply_outbound(
            db,
            ctx=ctx,
            warehouse_id=last_pick.warehouse_id,
            part_id=request.part_id,
            quantity=request.quantity,
            work_order_id=request.work_order_id,
            inventory_request_id=request.id,
            reason=f"Consumo solicitud {request.id}",
            consume_from_reserved=True,
        )
        request.status = new_status

    elif new_status == InventoryRequestStatus.returned.value:
        # Liberar reserva (no se usó después de todo)
        last_pick = (
            db.query(InventoryMovement)
            .filter(
                InventoryMovement.inventory_request_id == request.id,
                InventoryMovement.movement_type == InventoryMovementType.reservation.value,
            )
            .order_by(InventoryMovement.created_at.desc())
            .first()
        )
        if last_pick is not None:
            apply_release(
                db,
                ctx=ctx,
                warehouse_id=last_pick.warehouse_id,
                part_id=request.part_id,
                quantity=request.quantity,
                inventory_request_id=request.id,
                reason=f"Devolución solicitud {request.id}",
            )
        request.status = new_status

    db.flush()
    return request
