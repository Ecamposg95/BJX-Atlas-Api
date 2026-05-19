"""Procurement Engine — Ola 6.

State machine:
    draft → submitted → approved → received   (terminal)
                     ↓        ↓
                  cancelled  cancelled         (terminal)

Folio: PO-YYYY-NNNN, único por sucursal.

Recepción MVP: solo total. Cada item recibe quantity y opcional unit_cost
override; se invoca inventory_engine.apply_inbound() por línea, lo que
actualiza part.last_unit_cost y registra InventoryMovement(inbound).
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.inventory import Part
from app.models.procurement import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    TERMINAL_PO_STATUSES,
)
from app.models.suppliers import Supplier
from app.security.tenant import TenantContext, assert_branch_access
from app.services import inventory_engine


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

VALID_TRANSITIONS: dict[str, set[str]] = {
    PurchaseOrderStatus.draft.value: {
        PurchaseOrderStatus.submitted.value,
        PurchaseOrderStatus.cancelled.value,
    },
    PurchaseOrderStatus.submitted.value: {
        PurchaseOrderStatus.approved.value,
        PurchaseOrderStatus.cancelled.value,
    },
    PurchaseOrderStatus.approved.value: {
        PurchaseOrderStatus.received.value,
        PurchaseOrderStatus.cancelled.value,
    },
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _guard_transition(current: str, target: str) -> None:
    if current in TERMINAL_PO_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Orden en estado terminal ({current}); no admite cambios",
        )
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Transición inválida: {current} → {target}",
        )


# ---------------------------------------------------------------------------
# Folio generation
# ---------------------------------------------------------------------------

def _generate_folio(db: Session, branch_id: str) -> str:
    year = _now().year
    prefix = f"PO-{year}-"
    last = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.branch_id == branch_id,
            PurchaseOrder.folio.like(f"{prefix}%"),
        )
        .order_by(PurchaseOrder.folio.desc())
        .first()
    )
    if last is None:
        return f"{prefix}0001"
    try:
        last_n = int(last.folio.split("-")[-1])
    except (ValueError, IndexError):
        last_n = 0
    return f"{prefix}{last_n + 1:04d}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_supplier(db: Session, supplier_id: str) -> Supplier:
    sup = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if sup is None:
        raise HTTPException(404, f"Proveedor {supplier_id} no encontrado")
    if not sup.active:
        raise HTTPException(409, "Proveedor inactivo")
    return sup


def _validate_part(db: Session, part_id: str) -> Part:
    p = db.query(Part).filter(Part.id == part_id).first()
    if p is None:
        raise HTTPException(404, f"Refacción {part_id} no encontrada")
    return p


def _recalc_total(po: PurchaseOrder) -> None:
    total = Decimal("0")
    for it in po.items:
        line_total = (Decimal(it.quantity) * Decimal(it.unit_cost)).quantize(Decimal("0.01"))
        it.line_total = line_total
        total += line_total
    po.total_amount = total


def _get_po_or_404(db: Session, po_id: str, ctx: TenantContext) -> PurchaseOrder:
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if po is None:
        raise HTTPException(404, "Orden de compra no encontrada")
    assert_branch_access(po.branch_id, ctx)
    return po


# ---------------------------------------------------------------------------
# CRUD + transitions
# ---------------------------------------------------------------------------

def create_po(
    db: Session,
    *,
    ctx: TenantContext,
    branch_id: str,
    supplier_id: str,
    items: list[dict],
    notes: Optional[str] = None,
    expected_at: Optional[datetime] = None,
) -> PurchaseOrder:
    _validate_supplier(db, supplier_id)
    if not items:
        raise HTTPException(400, "La orden requiere al menos un item")

    folio = _generate_folio(db, branch_id)
    po = PurchaseOrder(
        branch_id=branch_id,
        folio=folio,
        supplier_id=supplier_id,
        status=PurchaseOrderStatus.draft.value,
        notes=notes,
        expected_at=expected_at,
        created_by_id=ctx.user.id,
    )
    db.add(po)
    db.flush()

    for item_data in items:
        _validate_part(db, item_data["part_id"])
        line = PurchaseOrderItem(
            purchase_order_id=po.id,
            part_id=item_data["part_id"],
            quantity=Decimal(str(item_data["quantity"])),
            unit_cost=Decimal(str(item_data["unit_cost"])),
            notes=item_data.get("notes"),
        )
        db.add(line)
        po.items.append(line)

    _recalc_total(po)
    db.flush()
    return po


def update_po(
    db: Session,
    *,
    ctx: TenantContext,
    po_id: str,
    supplier_id: Optional[str] = None,
    notes: Optional[str] = None,
    expected_at: Optional[datetime] = None,
    items: Optional[list[dict]] = None,
) -> PurchaseOrder:
    po = _get_po_or_404(db, po_id, ctx)
    if po.status != PurchaseOrderStatus.draft.value:
        raise HTTPException(409, "Solo órdenes en draft pueden editarse")

    if supplier_id is not None and supplier_id != po.supplier_id:
        _validate_supplier(db, supplier_id)
        po.supplier_id = supplier_id
    if notes is not None:
        po.notes = notes
    if expected_at is not None:
        po.expected_at = expected_at

    if items is not None:
        # Reemplazo total de items
        for old in list(po.items):
            db.delete(old)
        po.items.clear()
        db.flush()
        for item_data in items:
            _validate_part(db, item_data["part_id"])
            line = PurchaseOrderItem(
                purchase_order_id=po.id,
                part_id=item_data["part_id"],
                quantity=Decimal(str(item_data["quantity"])),
                unit_cost=Decimal(str(item_data["unit_cost"])),
                notes=item_data.get("notes"),
            )
            db.add(line)
            po.items.append(line)

    _recalc_total(po)
    db.flush()
    return po


def submit_po(db: Session, *, ctx: TenantContext, po_id: str) -> PurchaseOrder:
    po = _get_po_or_404(db, po_id, ctx)
    _guard_transition(po.status, PurchaseOrderStatus.submitted.value)
    if not po.items:
        raise HTTPException(409, "La orden no tiene items")
    po.status = PurchaseOrderStatus.submitted.value
    po.submitted_at = _now()
    db.flush()
    return po


def approve_po(db: Session, *, ctx: TenantContext, po_id: str) -> PurchaseOrder:
    po = _get_po_or_404(db, po_id, ctx)
    _guard_transition(po.status, PurchaseOrderStatus.approved.value)
    po.status = PurchaseOrderStatus.approved.value
    po.approved_at = _now()
    po.approved_by_id = ctx.user.id
    db.flush()
    return po


def cancel_po(
    db: Session,
    *,
    ctx: TenantContext,
    po_id: str,
    reason: Optional[str] = None,
) -> PurchaseOrder:
    po = _get_po_or_404(db, po_id, ctx)
    _guard_transition(po.status, PurchaseOrderStatus.cancelled.value)
    po.status = PurchaseOrderStatus.cancelled.value
    po.cancelled_at = _now()
    po.cancel_reason = reason
    db.flush()
    return po


def receive_po(
    db: Session,
    *,
    ctx: TenantContext,
    po_id: str,
    warehouse_id: str,
    receipts: list[dict],
) -> PurchaseOrder:
    """Recibe la orden total. MVP: no soporta parciales — exige que
    `quantity_received` por item sea igual a la cantidad ordenada.

    Por cada item: invoca apply_inbound (que actualiza part.last_unit_cost
    y crea InventoryMovement de tipo inbound).

    TODO: si `unit_cost` final difiere del de SupplierPrice vigente para
    (supplier, part, model/service), considerar crear nueva versión de
    SupplierPrice. Out of scope en este task.
    """
    po = _get_po_or_404(db, po_id, ctx)
    _guard_transition(po.status, PurchaseOrderStatus.received.value)

    items_by_id = {it.id: it for it in po.items}
    received_ids = {r["item_id"] for r in receipts}

    if received_ids != set(items_by_id.keys()):
        raise HTTPException(
            status_code=409,
            detail="MVP: la recepción debe incluir todos los items de la orden",
        )

    for r in receipts:
        item = items_by_id.get(r["item_id"])
        if item is None:
            raise HTTPException(404, f"Item {r['item_id']} no pertenece a la orden")
        qty_received = Decimal(str(r["quantity_received"]))
        if qty_received != Decimal(item.quantity):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"MVP: recepción debe ser total — item {item.id} ordenado "
                    f"{item.quantity}, recibido {qty_received}"
                ),
            )
        final_unit_cost = (
            Decimal(str(r["unit_cost"])) if r.get("unit_cost") is not None
            else Decimal(item.unit_cost)
        )
        # apply_inbound actualiza part.last_unit_cost + crea movement
        inventory_engine.apply_inbound(
            db,
            ctx=ctx,
            warehouse_id=warehouse_id,
            part_id=item.part_id,
            quantity=float(qty_received),
            unit_cost=float(final_unit_cost),
            reason=f"Recepción PO {po.folio}",
        )
        # Si el costo final difiere, persistirlo en el item para auditar
        if final_unit_cost != Decimal(item.unit_cost):
            item.unit_cost = final_unit_cost
            item.line_total = (qty_received * final_unit_cost).quantize(Decimal("0.01"))

    _recalc_total(po)
    po.status = PurchaseOrderStatus.received.value
    po.received_at = _now()
    po.received_by_id = ctx.user.id
    db.flush()
    return po
