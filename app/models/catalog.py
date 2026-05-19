"""Catálogo: VehicleModel, Service, ServiceCatalog."""
from __future__ import annotations

import enum

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.mixins import AuditMixin, UUIDMixin


class ServiceRequiredLevel(str, enum.Enum):
    junior = "junior"
    intermedio = "intermedio"
    master = "master"


class ServiceStatus(str, enum.Enum):
    """Workflow de aprobación del catálogo de servicios (US-07)."""
    proposed = "proposed"
    approved = "approved"
    rejected = "rejected"


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

    # Nivel mínimo requerido del mecánico para ejecutar este servicio (Fase 1)
    required_level = Column(String(16), nullable=False, default=ServiceRequiredLevel.junior.value, index=True)

    # Workflow de aprobación de catálogo (US-07)
    # `status` modela el ciclo proposed → approved/rejected; default approved para compat retro.
    status = Column(
        String(16),
        nullable=False,
        default=ServiceStatus.approved.value,
        server_default=ServiceStatus.approved.value,
        index=True,
    )
    approved = Column(Boolean, nullable=False, default=True, index=True)
    approved_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    proposed_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    proposed_by_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    proposal_id = Column(String(36), nullable=True)
    rejection_reason = Column(String(500), nullable=True)

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
