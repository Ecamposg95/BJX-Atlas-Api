from sqlalchemy import Boolean, Column, Index, Integer, String, func

from app.database import Base
from app.models.mixins import AuditMixin, UUIDMixin


class Vehicle(Base, UUIDMixin, AuditMixin):
    __tablename__ = "vehicles"

    customer_name = Column(String(255), nullable=False, index=True)
    contact = Column(String(255), nullable=True, index=True)
    brand = Column(String(100), nullable=True, index=True)
    model = Column(String(255), nullable=True, index=True)
    year = Column(Integer, nullable=True, index=True)
    plates = Column(String(50), nullable=True, index=True)
    vin = Column(String(100), nullable=True, index=True)
    mileage = Column(Integer, nullable=True)
    color = Column(String(100), nullable=True, index=True)
    active = Column(Boolean, default=True, nullable=False, index=True)


Index(
    "uq_vehicles_plates_active_clean",
    func.lower(func.trim(Vehicle.plates)),
    unique=True,
    sqlite_where=Vehicle.deleted_at.is_(None),
    postgresql_where=Vehicle.deleted_at.is_(None),
)

Index(
    "uq_vehicles_vin_active_clean",
    func.lower(func.trim(Vehicle.vin)),
    unique=True,
    sqlite_where=Vehicle.deleted_at.is_(None),
    postgresql_where=Vehicle.deleted_at.is_(None),
)
