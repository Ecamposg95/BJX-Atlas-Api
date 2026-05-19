import enum
from sqlalchemy import Column, String, Float, Integer, Boolean, ForeignKey, Index, Numeric, Text, DateTime
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin, BranchScopedMixin


class ServiceBay(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "service_bays"

    code = Column(String(32), nullable=False)
    name = Column(String(120), nullable=False)
    active = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        Index("uq_service_bays_branch_code", "branch_id", "code", unique=True),
    )


class WorkOrderLineStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    paused = "paused"
    waiting_parts = "waiting_parts"
    completed = "completed"
    cancelled = "cancelled"


class WorkOrderLine(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    """Una OS puede tener N líneas de servicio, cada una con su propio mecánico/timer."""
    __tablename__ = "work_order_lines"

    work_order_id = Column(String(36), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    bay_id = Column(String(36), ForeignKey("service_bays.id", ondelete="SET NULL"), nullable=True, index=True)
    mechanic_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(32), nullable=False, default=WorkOrderLineStatus.pending.value, index=True)
    standard_duration_hrs = Column(Float, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    paused_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    actual_duration_minutes = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    # Pricing (cierre de Ola 4). Todos NULL hasta que se cierre / recalcule la línea.
    unit_price_mxn = Column(Numeric(12, 2), nullable=True)
    unit_cost_mxn = Column(Numeric(12, 2), nullable=True)
    total_price_mxn = Column(Numeric(12, 2), nullable=True)
    total_cost_mxn = Column(Numeric(12, 2), nullable=True)
    margin_pct = Column(Numeric(6, 4), nullable=True)


class EvidenceKind(str, enum.Enum):
    photo = "photo"
    video = "video"
    document = "document"
    note = "note"


class Evidence(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    """Fotos/videos/notas asociadas a una OS o a una línea específica."""
    __tablename__ = "evidence"

    work_order_id = Column(String(36), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    work_order_line_id = Column(String(36), ForeignKey("work_order_lines.id", ondelete="SET NULL"), nullable=True, index=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    kind = Column(String(16), nullable=False, default=EvidenceKind.photo.value)
    stage = Column(String(32), nullable=True)  # before | during | after | quality_check
    note = Column(Text, nullable=True)
    captured_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
