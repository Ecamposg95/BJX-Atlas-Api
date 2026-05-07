import enum
from sqlalchemy import Column, String, Float, Integer, Boolean, ForeignKey, Index, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin, BranchScopedMixin


class Warehouse(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "warehouses"

    code = Column(String(32), nullable=False)
    name = Column(String(255), nullable=False)
    kind = Column(String(32), nullable=False, default="main")  # main | satellite | mobile
    active = Column(Boolean, default=True, nullable=False)

    stock_levels = relationship("StockLevel", back_populates="warehouse", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_warehouses_branch_code", "branch_id", "code", unique=True),
    )


class Part(Base, UUIDMixin, AuditMixin):
    """Catálogo global de refacciones. Cada sucursal puede o no tener stock."""
    __tablename__ = "parts"

    sku = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(120), nullable=True, index=True)
    unit = Column(String(32), nullable=False, default="pza")
    image_url = Column(String(500), nullable=True)
    default_supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    min_stock = Column(Float, nullable=False, default=0.0)
    max_stock = Column(Float, nullable=True)
    lead_time_days = Column(Integer, nullable=False, default=1)
    last_unit_cost = Column(Float, nullable=True)
    active = Column(Boolean, default=True, nullable=False)


class StockLevel(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "stock_levels"

    warehouse_id = Column(String(36), ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(String(36), ForeignKey("parts.id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0.0)
    reserved = Column(Float, nullable=False, default=0.0)
    last_movement_at = Column(String(64), nullable=True)
    last_counted_at = Column(String(64), nullable=True)

    warehouse = relationship("Warehouse", back_populates="stock_levels")
    part = relationship("Part")

    __table_args__ = (
        Index("uq_stock_levels_warehouse_part", "warehouse_id", "part_id", unique=True),
    )


class InventoryMovementType(str, enum.Enum):
    inbound = "inbound"        # compra/recepción
    outbound = "outbound"      # consumo (salida)
    adjustment = "adjustment"  # ajuste manual (+/-)
    transfer_in = "transfer_in"
    transfer_out = "transfer_out"
    reservation = "reservation"
    release = "release"


class InventoryMovement(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    """Append-only ledger de movimientos de stock."""
    __tablename__ = "inventory_movements"

    warehouse_id = Column(String(36), ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True)
    part_id = Column(String(36), ForeignKey("parts.id", ondelete="RESTRICT"), nullable=False, index=True)
    movement_type = Column(String(32), nullable=False, index=True)
    quantity = Column(Float, nullable=False)  # signed: + entrada, - salida
    unit_cost = Column(Float, nullable=True)
    work_order_id = Column(String(36), ForeignKey("work_orders.id", ondelete="SET NULL"), nullable=True, index=True)
    inventory_request_id = Column(String(36), ForeignKey("inventory_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    counterpart_warehouse_id = Column(String(36), ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    performed_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text, nullable=True)


class InventoryRequestStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    picked = "picked"
    delivered = "delivered"
    used = "used"
    returned = "returned"


class InventoryRequest(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    """Solicitud de refacción del mecánico hacia almacén."""
    __tablename__ = "inventory_requests"

    work_order_id = Column(String(36), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    part_id = Column(String(36), ForeignKey("parts.id", ondelete="RESTRICT"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    priority = Column(String(16), nullable=False, default="normal")  # low | normal | high | urgent
    status = Column(String(32), nullable=False, default=InventoryRequestStatus.pending.value, index=True)
    approved_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rejected_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
