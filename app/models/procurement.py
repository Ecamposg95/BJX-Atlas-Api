"""Procurement domain (Ola 6): Purchase Orders y line items.

State machine:
    draft → submitted → approved ─┬─ received                (terminal)
                     ↓        ↓   └─ partially_received → received (terminal)
                  cancelled  cancelled                       (terminal)

Reglas:
- Folio autogenerado tipo PO-YYYY-NNNN, único por sucursal (via FolioCounter).
- Recepciones parciales soportadas: PurchaseOrderItem.quantity_received se
  acumula con cada recepción; cuando todos los items alcanzan su cantidad
  ordenada, la PO pasa a `received`. Mientras tanto, `partially_received`.
- Al recibir, se invoca inventory_engine.apply_inbound() por cada item,
  lo que actualiza last_unit_cost en parts + crea InventoryMovement(inbound).
- Link a InventoryRequest via PurchaseOrderItem.inventory_request_id: cuando
  almacén convierte una solicitud aprobada en línea de PO, se mantiene la
  trazabilidad y al recibir la IR pasa a status `purchased`.
"""
from __future__ import annotations

import enum
from sqlalchemy import (
    Column, String, Float, ForeignKey, Index, Text, DateTime, Numeric,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin, BranchScopedMixin


class PurchaseOrderStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    partially_received = "partially_received"
    received = "received"
    cancelled = "cancelled"


TERMINAL_PO_STATUSES = {PurchaseOrderStatus.received.value, PurchaseOrderStatus.cancelled.value}


class PurchaseOrder(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "purchase_orders"

    folio = Column(String(32), nullable=False, index=True)
    supplier_id = Column(
        String(36),
        ForeignKey("suppliers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status = Column(
        String(32),
        nullable=False,
        default=PurchaseOrderStatus.draft.value,
        index=True,
    )
    notes = Column(Text, nullable=True)
    total_amount = Column(Numeric(14, 2), nullable=False, default=0)
    expected_at = Column(DateTime(timezone=True), nullable=True)

    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    received_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)

    approved_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    received_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    cancel_reason = Column(Text, nullable=True)

    supplier = relationship("Supplier", lazy="joined")
    items = relationship(
        "PurchaseOrderItem",
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (
        Index("uq_purchase_orders_branch_folio", "branch_id", "folio", unique=True),
        Index("ix_purchase_orders_branch_status", "branch_id", "status"),
    )


class PurchaseOrderItem(Base, UUIDMixin, AuditMixin):
    __tablename__ = "purchase_order_items"

    purchase_order_id = Column(
        String(36),
        ForeignKey("purchase_orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    part_id = Column(
        String(36),
        ForeignKey("parts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity = Column(Numeric(14, 3), nullable=False)
    quantity_received = Column(Numeric(14, 3), nullable=False, default=0)
    received_at = Column(DateTime(timezone=True), nullable=True)
    unit_cost = Column(Numeric(14, 2), nullable=False)
    line_total = Column(Numeric(14, 2), nullable=False, default=0)
    notes = Column(Text, nullable=True)
    inventory_request_id = Column(
        String(36),
        ForeignKey("inventory_requests.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    part = relationship("Part", lazy="joined")
