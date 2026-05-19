"""Perfil de mecánico: nivel + skills + capacidad."""
from __future__ import annotations

import enum

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class MechanicLevel(str, enum.Enum):
    junior = "junior"
    intermedio = "intermedio"
    master = "master"


class SkillCategory(str, enum.Enum):
    frenos = "frenos"
    motor = "motor"
    transmision = "transmision"
    suspension = "suspension"
    electrico = "electrico"
    diagnostico = "diagnostico"
    hojalateria = "hojalateria"
    afinacion = "afinacion"
    diesel = "diesel"
    otros = "otros"


# Para comparaciones numéricas en assignment_engine
LEVEL_ORDER: dict[str, int] = {
    MechanicLevel.junior.value: 1,
    MechanicLevel.intermedio.value: 2,
    MechanicLevel.master.value: 3,
}


class MechanicProfile(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    __tablename__ = "mechanic_profiles"

    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    level = Column(String(16), nullable=False, default=MechanicLevel.junior.value, index=True)
    employee_number = Column(String(32), nullable=True, index=True)
    hire_date = Column(DateTime(timezone=True), nullable=True)
    hourly_cost = Column(Float, nullable=True)
    capacity_hrs_day = Column(Float, nullable=False, default=8.0)
    active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)


class MechanicSkill(Base, UUIDMixin, AuditMixin):
    __tablename__ = "mechanic_skills"

    mechanic_profile_id = Column(
        String(36),
        ForeignKey("mechanic_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category = Column(String(32), nullable=False, index=True)
    proficiency = Column(Integer, nullable=False, default=3)
    certified = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        Index("uq_mechanic_skill", "mechanic_profile_id", "category", unique=True),
    )
