"""Pydantic schemas para el dominio de inventario."""
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


# ---- Warehouse ----

class WarehouseCreate(BaseModel):
    code: str = Field(..., max_length=32)
    name: str = Field(..., max_length=255)
    kind: Literal["main", "satellite", "mobile"] = "main"
    branch_id: Optional[str] = None  # solo admin/director puede setear; mecánicos heredan ctx


class WarehouseUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[Literal["main", "satellite", "mobile"]] = None
    active: Optional[bool] = None


class WarehouseRead(BaseModel):
    id: str
    branch_id: str
    code: str
    name: str
    kind: str
    active: bool
    model_config = ConfigDict(from_attributes=True)


# ---- Part ----

class PartCreate(BaseModel):
    sku: str = Field(..., max_length=64)
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str = "pza"
    image_url: Optional[str] = None
    default_supplier_id: Optional[str] = None
    min_stock: float = 0.0
    max_stock: Optional[float] = None
    lead_time_days: int = 1
    last_unit_cost: Optional[float] = None


class PartUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None
    default_supplier_id: Optional[str] = None
    min_stock: Optional[float] = None
    max_stock: Optional[float] = None
    lead_time_days: Optional[int] = None
    last_unit_cost: Optional[float] = None
    active: Optional[bool] = None


class PartRead(BaseModel):
    id: str
    sku: str
    name: str
    description: Optional[str]
    category: Optional[str]
    unit: str
    image_url: Optional[str]
    default_supplier_id: Optional[str]
    min_stock: float
    max_stock: Optional[float]
    lead_time_days: int
    last_unit_cost: Optional[float]
    active: bool
    model_config = ConfigDict(from_attributes=True)


class PartReadWithStock(PartRead):
    total_quantity: float = 0.0
    total_reserved: float = 0.0
    total_available: float = 0.0
    is_low_stock: bool = False


# ---- Stock ----

class StockLevelRead(BaseModel):
    id: str
    branch_id: str
    warehouse_id: str
    part_id: str
    quantity: float
    reserved: float
    available: float
    model_config = ConfigDict(from_attributes=True)


# ---- Movements ----

class MovementCreate(BaseModel):
    warehouse_id: str
    part_id: str
    movement_type: Literal["inbound", "outbound", "adjustment", "transfer_out"]
    quantity: float = Field(..., gt=0)  # siempre positivo, el signo lo maneja el engine
    unit_cost: Optional[float] = None
    work_order_id: Optional[str] = None
    counterpart_warehouse_id: Optional[str] = None  # solo para transfer
    reason: Optional[str] = None


class MovementRead(BaseModel):
    id: str
    branch_id: str
    warehouse_id: str
    part_id: str
    movement_type: str
    quantity: float
    unit_cost: Optional[float]
    work_order_id: Optional[str]
    inventory_request_id: Optional[str]
    counterpart_warehouse_id: Optional[str]
    performed_by: Optional[str]
    reason: Optional[str]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---- Inventory Requests ----

class InventoryRequestCreate(BaseModel):
    work_order_id: str
    part_id: str
    quantity: float = Field(..., gt=0)
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    notes: Optional[str] = None


class InventoryRequestApprove(BaseModel):
    notes: Optional[str] = None


class InventoryRequestReject(BaseModel):
    reason: str = Field(..., min_length=3)


class InventoryRequestPick(BaseModel):
    """Indica qué warehouse surtirá la solicitud (genera reservation)."""
    warehouse_id: str


class InventoryRequestRead(BaseModel):
    id: str
    branch_id: str
    work_order_id: str
    requested_by: Optional[str]
    part_id: str
    quantity: float
    priority: str
    status: str
    approved_by: Optional[str]
    rejected_reason: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]
    # Enrichment
    part_name: Optional[str] = None
    part_sku: Optional[str] = None
    requested_by_email: Optional[str] = None
    work_order_number: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# ---- Pagination ----

class Paginated(BaseModel):
    total: int
    page: int
    page_size: int


class PartPage(Paginated):
    items: list[PartReadWithStock]


class InventoryRequestPage(Paginated):
    items: list[InventoryRequestRead]


class MovementPage(Paginated):
    items: list[MovementRead]
