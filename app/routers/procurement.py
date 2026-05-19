"""Procurement router — Ola 6.

Rutas bajo /api/v1/procurement/purchase-orders.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.inventory import Part
from app.models.procurement import PurchaseOrder, PurchaseOrderItem
from app.models.suppliers import Supplier
from app.models.users import User
from app.schemas.procurement import (
    CancelPayload,
    POStatusFilter,
    PurchaseOrderCreate,
    PurchaseOrderItemRead,
    PurchaseOrderPage,
    PurchaseOrderRead,
    PurchaseOrderUpdate,
    ReceivePayload,
)
from app.security.permissions import Permission, require_permission
from app.security.tenant import (
    TenantContext,
    branch_scoped_query,
    get_tenant_context,
    resolve_branch_for_write,
)
from app.services import procurement_engine


router = APIRouter(prefix="/v1/procurement", tags=["procurement"])


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------

def _enrich_item(db: Session, item: PurchaseOrderItem) -> PurchaseOrderItemRead:
    out = PurchaseOrderItemRead.model_validate(item)
    part = db.query(Part).filter(Part.id == item.part_id).first()
    if part:
        out.part_sku = part.sku
        out.part_name = part.name
    return out


def _enrich_po(db: Session, po: PurchaseOrder) -> PurchaseOrderRead:
    out = PurchaseOrderRead.model_validate(po)
    out.items = [_enrich_item(db, it) for it in po.items]
    if po.supplier_id:
        sup = db.query(Supplier).filter(Supplier.id == po.supplier_id).first()
        if sup:
            out.supplier_name = sup.name
    return out


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/purchase-orders", response_model=PurchaseOrderPage)
def list_purchase_orders(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_READ)),
    po_status: Optional[POStatusFilter] = Query(None, alias="status"),
    supplier_id: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    q = branch_scoped_query(PurchaseOrder, db, ctx).filter(PurchaseOrder.deleted_at.is_(None))
    if po_status:
        q = q.filter(PurchaseOrder.status == po_status)
    if supplier_id:
        q = q.filter(PurchaseOrder.supplier_id == supplier_id)
    if date_from:
        q = q.filter(PurchaseOrder.created_at >= date_from)
    if date_to:
        q = q.filter(PurchaseOrder.created_at <= date_to)

    total = q.count()
    rows = (
        q.order_by(PurchaseOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PurchaseOrderPage(
        total=total, page=page, page_size=page_size,
        items=[_enrich_po(db, po) for po in rows],
    )


@router.post(
    "/purchase-orders",
    response_model=PurchaseOrderRead,
    status_code=status.HTTP_201_CREATED,
)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_CREATE)),
):
    branch_id = resolve_branch_for_write(ctx, payload.branch_id)
    items = [it.model_dump() for it in payload.items]
    po = procurement_engine.create_po(
        db,
        ctx=ctx,
        branch_id=branch_id,
        supplier_id=payload.supplier_id,
        items=items,
        notes=payload.notes,
        expected_at=payload.expected_at,
    )
    db.commit()
    db.refresh(po)
    return _enrich_po(db, po)


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderRead)
def get_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_READ)),
):
    po = procurement_engine._get_po_or_404(db, po_id, ctx)
    return _enrich_po(db, po)


@router.patch("/purchase-orders/{po_id}", response_model=PurchaseOrderRead)
def update_purchase_order(
    po_id: str,
    payload: PurchaseOrderUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_CREATE)),
):
    items = [it.model_dump() for it in payload.items] if payload.items is not None else None
    po = procurement_engine.update_po(
        db,
        ctx=ctx,
        po_id=po_id,
        supplier_id=payload.supplier_id,
        notes=payload.notes,
        expected_at=payload.expected_at,
        items=items,
    )
    db.commit()
    db.refresh(po)
    return _enrich_po(db, po)


@router.post("/purchase-orders/{po_id}/submit", response_model=PurchaseOrderRead)
def submit_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_CREATE)),
):
    po = procurement_engine.submit_po(db, ctx=ctx, po_id=po_id)
    db.commit()
    db.refresh(po)
    return _enrich_po(db, po)


@router.post("/purchase-orders/{po_id}/approve", response_model=PurchaseOrderRead)
def approve_purchase_order(
    po_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_APPROVE)),
):
    po = procurement_engine.approve_po(db, ctx=ctx, po_id=po_id)
    db.commit()
    db.refresh(po)
    return _enrich_po(db, po)


@router.post("/purchase-orders/{po_id}/cancel", response_model=PurchaseOrderRead)
def cancel_purchase_order(
    po_id: str,
    payload: CancelPayload | None = None,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_CANCEL)),
):
    reason = payload.reason if payload else None
    po = procurement_engine.cancel_po(db, ctx=ctx, po_id=po_id, reason=reason)
    db.commit()
    db.refresh(po)
    return _enrich_po(db, po)


@router.post("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderRead)
def receive_purchase_order(
    po_id: str,
    payload: ReceivePayload,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.PROCUREMENT_RECEIVE)),
):
    receipts = [r.model_dump() for r in payload.receipts]
    try:
        po = procurement_engine.receive_po(
            db,
            ctx=ctx,
            po_id=po_id,
            warehouse_id=payload.warehouse_id,
            receipts=receipts,
        )
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    db.refresh(po)
    return _enrich_po(db, po)
