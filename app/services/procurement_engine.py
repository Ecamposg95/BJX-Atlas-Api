"""Procurement Engine — Ola 6.

State machine:
    draft → submitted → approved ─┬─ received                       (terminal)
                     ↓        ↓   └─ partially_received → received  (terminal)
                  cancelled  cancelled                              (terminal)

Folio: PO-YYYY-NNNN, único por sucursal — generado con `folio_engine.next_folio`
(SELECT FOR UPDATE en Postgres, lock implícito de tx en SQLite).

Recepciones parciales: cada llamada a `receive_po` puede recibir cualquier
sub-cantidad por línea, hasta completar la cantidad ordenada. Side-effects:
- apply_inbound() por el delta recibido (no la cantidad total acumulada).
- rotate_supplier_price() si el unit_cost difiere > 0.5% del vigente.
- Si el item tenía inventory_request_id, la IR se marca `purchased` cuando
  termina de recibirse esa línea.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.inventory import (
    InventoryRequest,
    InventoryRequestStatus,
    Part,
)
from app.models.procurement import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    TERMINAL_PO_STATUSES,
)
from app.models.suppliers import Supplier
from app.security.tenant import TenantContext, assert_branch_access
from app.services import inventory_engine
from app.services.folio_engine import next_folio
from app.services.supplier_pricing import rotate_supplier_price


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
        PurchaseOrderStatus.partially_received.value,
        PurchaseOrderStatus.received.value,
        PurchaseOrderStatus.cancelled.value,
    },
    PurchaseOrderStatus.partially_received.value: {
        PurchaseOrderStatus.partially_received.value,  # más recepciones parciales
        PurchaseOrderStatus.received.value,
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
# Folio generation (race-safe)
# ---------------------------------------------------------------------------

def _generate_folio(db: Session, branch_id: str) -> str:
    """Genera `PO-YYYY-NNNN` único por sucursal usando FolioCounter."""
    year = _now().year
    counter_name = f"purchase_order_{branch_id}_{year}"
    n = next_folio(db, counter_name)
    return f"PO-{year}-{n:04d}"


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


def _validate_inventory_request(
    db: Session, ir_id: str, branch_id: str
) -> InventoryRequest:
    ir = db.query(InventoryRequest).filter(InventoryRequest.id == ir_id).first()
    if ir is None:
        raise HTTPException(404, f"Solicitud de inventario {ir_id} no encontrada")
    if ir.branch_id != branch_id:
        raise HTTPException(400, "Solicitud de inventario fuera de la sucursal")
    if ir.status not in {
        InventoryRequestStatus.pending.value,
        InventoryRequestStatus.approved.value,
    }:
        raise HTTPException(
            409,
            f"Solicitud {ir_id} en estado {ir.status} no se puede vincular a PO",
        )
    return ir


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
        ir_id = item_data.get("inventory_request_id")
        if ir_id:
            _validate_inventory_request(db, ir_id, branch_id)
        line = PurchaseOrderItem(
            purchase_order_id=po.id,
            part_id=item_data["part_id"],
            quantity=Decimal(str(item_data["quantity"])),
            quantity_received=Decimal("0"),
            unit_cost=Decimal(str(item_data["unit_cost"])),
            notes=item_data.get("notes"),
            inventory_request_id=ir_id,
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
        for old in list(po.items):
            db.delete(old)
        po.items.clear()
        db.flush()
        for item_data in items:
            _validate_part(db, item_data["part_id"])
            ir_id = item_data.get("inventory_request_id")
            if ir_id:
                _validate_inventory_request(db, ir_id, po.branch_id)
            line = PurchaseOrderItem(
                purchase_order_id=po.id,
                part_id=item_data["part_id"],
                quantity=Decimal(str(item_data["quantity"])),
                quantity_received=Decimal("0"),
                unit_cost=Decimal(str(item_data["unit_cost"])),
                notes=item_data.get("notes"),
                inventory_request_id=ir_id,
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
    # No se permite cancelar si ya hay recepciones parciales: debe completarse
    # o se debe crear un PO nuevo para lo faltante.
    if po.status == PurchaseOrderStatus.partially_received.value:
        raise HTTPException(
            409,
            "PO con recepciones parciales no se puede cancelar; completa la "
            "recepción o crea un nuevo PO para el remanente.",
        )
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
    """Aplica recibos (totales o parciales).

    Reglas:
    - Solo desde `approved` o `partially_received`.
    - Para cada item, `quantity_received` en el payload es la cantidad NUEVA
      que llega ahora (delta), no el acumulado.
    - `quantity` del item es el techo: no se puede recibir más de lo ordenado.
    - Por cada item se invoca `apply_inbound` con el delta y el unit_cost.
    - Si el unit_cost difiere > 0.5% del SupplierPrice vigente, se rota.
    - El status queda `received` si TODOS los items alcanzan su cantidad, sino
      `partially_received`.
    - Si el item tiene inventory_request_id y termina de recibirse, la IR
      pasa a `purchased`.
    """
    po = _get_po_or_404(db, po_id, ctx)

    if po.status not in {
        PurchaseOrderStatus.approved.value,
        PurchaseOrderStatus.partially_received.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Orden en estado {po.status}; solo se reciben mercancías "
                "en approved o partially_received."
            ),
        )

    items_by_id = {it.id: it for it in po.items}
    for r in receipts:
        if r["item_id"] not in items_by_id:
            raise HTTPException(404, f"Item {r['item_id']} no pertenece a la orden")

    for r in receipts:
        item = items_by_id[r["item_id"]]
        delta = Decimal(str(r["quantity_received"]))
        if delta <= 0:
            raise HTTPException(
                400, f"quantity_received debe ser > 0 (item {item.id})"
            )
        already = Decimal(item.quantity_received or 0)
        ordered = Decimal(item.quantity)
        if already + delta > ordered:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Item {item.id}: ordenado {ordered}, ya recibido {already}, "
                    f"intento de recibir {delta} excede el saldo"
                ),
            )

        final_unit_cost = (
            Decimal(str(r["unit_cost"])) if r.get("unit_cost") is not None
            else Decimal(item.unit_cost)
        )

        inventory_engine.apply_inbound(
            db,
            ctx=ctx,
            warehouse_id=warehouse_id,
            part_id=item.part_id,
            quantity=float(delta),
            unit_cost=float(final_unit_cost),
            reason=f"Recepción PO {po.folio}",
        )

        # Rotar SupplierPrice si difiere > tolerancia
        rotate_supplier_price(
            db,
            supplier_id=po.supplier_id,
            part_id=item.part_id,
            new_unit_cost=float(final_unit_cost),
            source="procurement_receive",
        )

        # Actualizar acumulado
        item.quantity_received = already + delta
        item.received_at = _now()
        if final_unit_cost != Decimal(item.unit_cost):
            item.unit_cost = final_unit_cost
            item.line_total = (ordered * final_unit_cost).quantize(Decimal("0.01"))

        # Si el item se completó y tenía link a IR, marcarla purchased
        if (
            item.quantity_received >= ordered
            and item.inventory_request_id
        ):
            ir = (
                db.query(InventoryRequest)
                .filter(InventoryRequest.id == item.inventory_request_id)
                .first()
            )
            if ir is not None and ir.status in {
                InventoryRequestStatus.pending.value,
                InventoryRequestStatus.approved.value,
            }:
                ir.status = InventoryRequestStatus.purchased.value

    _recalc_total(po)

    all_received = all(
        Decimal(it.quantity_received or 0) >= Decimal(it.quantity) for it in po.items
    )
    if all_received:
        po.status = PurchaseOrderStatus.received.value
        po.received_at = _now()
        po.received_by_id = ctx.user.id
    else:
        po.status = PurchaseOrderStatus.partially_received.value
        if po.received_by_id is None:
            po.received_by_id = ctx.user.id
    db.flush()
    return po
