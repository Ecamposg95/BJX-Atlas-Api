from sqlalchemy import Column, String, Boolean, Float, Integer, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class Supplier(Base, UUIDMixin, AuditMixin):
    __tablename__ = "suppliers"

    name = Column(String(255), nullable=False, unique=True, index=True)
    lead_time_days = Column(Integer, nullable=False, default=1)
    warranty_days = Column(Integer, nullable=False, default=0)
    return_policy = Column(Text, nullable=True)
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    active = Column(Boolean, default=True, nullable=False)

    prices = relationship("SupplierPrice", back_populates="supplier", lazy="dynamic")


class SupplierPrice(Base, UUIDMixin, AuditMixin):
    """Precios de proveedor — INMUTABLES. Nunca editar, siempre crear nueva versión."""
    __tablename__ = "supplier_prices"

    supplier_id = Column(String(36), ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)
    model_id = Column(String(36), ForeignKey("models.id", ondelete="RESTRICT"), nullable=False, index=True)

    ref_cost = Column(Float, nullable=False)
    labor_cost = Column(Float, nullable=False, default=0.0)
    total_price = Column(Float, nullable=False)
    price_date = Column(Date, nullable=True)
    is_current = Column(Boolean, default=True, nullable=False, index=True)

    supplier = relationship("Supplier", back_populates="prices")
    service = relationship("Service")
    model = relationship("VehicleModel")
