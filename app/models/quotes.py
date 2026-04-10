import enum
from sqlalchemy import Column, String, Boolean, Float, ForeignKey, Text, Integer, Enum
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class QuoteStatus(str, enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    invoiced = "invoiced"
    cancelled = "cancelled"


class Quote(Base, UUIDMixin, AuditMixin):
    __tablename__ = "quotes"

    quote_number = Column(String(20), unique=True, nullable=False, index=True)
    model_id = Column(String(36), ForeignKey("models.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_by = Column(String(255), nullable=False)
    status = Column(Enum(QuoteStatus), nullable=False, default=QuoteStatus.draft, index=True)
    technician_cost_hr = Column(Float, nullable=False, default=156.25)
    target_margin = Column(Float, nullable=False, default=0.40)
    notes = Column(Text, nullable=True)

    model = relationship("VehicleModel", back_populates="quotes")
    lines = relationship("QuoteLine", back_populates="quote", cascade="all, delete-orphan")


class QuoteLine(Base, UUIDMixin, AuditMixin):
    """Valores congelados del engine al momento de confirmar la cotización."""
    __tablename__ = "quote_lines"

    quote_id = Column(String(36), ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False)
    supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=True)

    # Valores congelados del engine
    duration_hrs = Column(Float, nullable=False)
    labor_cost = Column(Float, nullable=False)
    parts_cost = Column(Float, nullable=False)
    total_bjx_cost = Column(Float, nullable=False)
    brame_price = Column(Float, nullable=False)
    margin_pesos = Column(Float, nullable=False)
    margin_pct = Column(Float, nullable=False)
    suggested_price = Column(Float, nullable=False)
    gap_vs_target = Column(Float, nullable=False)
    margin_status = Column(String(20), nullable=False)
    data_source = Column(String(20), nullable=False, default="catalog")

    quote = relationship("Quote", back_populates="lines")
    service = relationship("Service")
    supplier = relationship("Supplier")
