from sqlalchemy import Boolean, Column, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin


class VehicleModel(Base, UUIDMixin, AuditMixin):
    __tablename__ = "models"

    name = Column(String(255), nullable=False, index=True)
    brand = Column(String(100), nullable=True, index=True)
    active = Column(Boolean, default=True, nullable=False)

    catalog_entries = relationship("ServiceCatalog", back_populates="model", lazy="dynamic")
    quotes = relationship("Quote", back_populates="model")


class ServiceCategory(str):
    FRENOS = "frenos"
    MOTOR = "motor"
    SUSPENSION = "suspension"
    ELECTRICO = "electrico"
    NEUMATICOS = "neumaticos"
    OTROS = "otros"


class Service(Base, UUIDMixin, AuditMixin):
    __tablename__ = "services"

    name = Column(String(500), nullable=False, index=True)
    category = Column(String(50), nullable=True, default="otros", index=True)
    active = Column(Boolean, default=True, nullable=False)

    catalog_entries = relationship("ServiceCatalog", back_populates="service", lazy="dynamic")


class ServiceCatalog(Base, UUIDMixin, AuditMixin):
    """Costos BJX por combinación modelo+servicio. Versiones históricas (inmutable)."""
    __tablename__ = "service_catalog"

    model_id = Column(String(36), ForeignKey("models.id", ondelete="RESTRICT"), nullable=False, index=True)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="RESTRICT"), nullable=False, index=True)

    bjx_labor_cost = Column(Float, nullable=True)
    bjx_parts_cost = Column(Float, nullable=True)
    duration_hrs = Column(Float, nullable=False)
    source = Column(String(50), nullable=True, default="xlsx")
    updated_by = Column(String(255), nullable=True)
    is_current = Column(Boolean, default=True, nullable=False, index=True)

    model = relationship("VehicleModel", back_populates="catalog_entries")
    service = relationship("Service", back_populates="catalog_entries")

    __table_args__ = (
        Index(
            "uq_catalog_model_service_current",
            "model_id",
            "service_id",
            unique=True,
            sqlite_where=(is_current.is_(True)),
            postgresql_where=(is_current.is_(True)),
        ),
    )
