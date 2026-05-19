"""Pydantic schemas para Procurement (Ola 6)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional, Literal

from pydantic import BaseModel, ConfigDict, Field


# ---- Items ----

class PurchaseOrderItemCreate(BaseModel):
    part_id: str
    quantity: Decimal = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)
    notes: Optional[str] = None
    inventory_request_id: Optional[str] = None


class PurchaseOrderItemRead(BaseModel):
    id: str
    purchase_order_id: str
    part_id: str
    quantity: Decimal
    quantity_received: Decimal = Decimal("0")
    received_at: Optional[datetime] = None
    unit_cost: Decimal
    line_total: Decimal
    notes: Optional[str] = None
    inventory_request_id: Optional[str] = None
    # Enrichment
    part_sku: Optional[str] = None
    part_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---- Purchase Order ----

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    notes: Optional[str] = None
    expected_at: Optional[datetime] = None
    items: list[PurchaseOrderItemCreate] = Field(..., min_length=1)
    branch_id: Optional[str] = None  # solo global users pueden setear


class PurchaseOrderUpdate(BaseModel):
    """Solo permitido mientras status=draft. Reemplaza items si se mandan."""
    supplier_id: Optional[str] = None
    notes: Optional[str] = None
    expected_at: Optional[datetime] = None
    items: Optional[list[PurchaseOrderItemCreate]] = None


class PurchaseOrderRead(BaseModel):
    id: str
    branch_id: str
    folio: str
    supplier_id: str
    status: str
    notes: Optional[str] = None
    total_amount: Decimal
    expected_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    received_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    approved_by_id: Optional[str] = None
    received_by_id: Optional[str] = None
    created_by_id: Optional[str] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    items: list[PurchaseOrderItemRead] = []
    # Enrichment
    supplier_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---- Receive ----

class ReceiveItemPayload(BaseModel):
    item_id: str
    quantity_received: Decimal = Field(..., gt=0)
    unit_cost: Optional[Decimal] = Field(default=None, ge=0)


class ReceivePayload(BaseModel):
    warehouse_id: str
    receipts: list[ReceiveItemPayload] = Field(..., min_length=1)


# ---- Cancel ----

class CancelPayload(BaseModel):
    reason: Optional[str] = None


# ---- Pagination ----

class PurchaseOrderPage(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[PurchaseOrderRead]


# ---- Filters ----

POStatusFilter = Literal[
    "draft", "submitted", "approved", "partially_received", "received", "cancelled"
]


# ---- Pending inventory requests (compras pendientes) ----

class PendingInventoryRequestItem(BaseModel):
    id: str
    branch_id: str
    work_order_id: str
    part_id: str
    quantity: float
    priority: str
    status: str
    notes: Optional[str] = None
    created_at: datetime
    # Enrichment
    part_sku: Optional[str] = None
    part_name: Optional[str] = None
    last_unit_cost: Optional[float] = None
    default_supplier_id: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class PendingInventoryRequestPage(BaseModel):
    total: int
    items: list[PendingInventoryRequestItem]
