"""Schemas para /api/v1/mechanics."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


LevelLiteral = Literal["junior", "intermedio", "master"]
SkillCategoryLiteral = Literal[
    "frenos", "motor", "transmision", "suspension", "electrico",
    "diagnostico", "hojalateria", "afinacion", "diesel", "otros",
]


class SkillRead(BaseModel):
    category: str
    proficiency: int = Field(..., ge=1, le=5)
    certified: bool

    model_config = ConfigDict(from_attributes=True)


class MechanicRead(BaseModel):
    id: str
    user_id: str
    email: str
    branch_id: Optional[str] = None
    level: LevelLiteral
    capacity_hrs_day: float
    current_load_hrs: float
    available_hrs: float
    load_status: Literal["green", "yellow", "red"]
    active_assignments_count: int
    active: bool
    skills: list[SkillRead]


class MechanicProfileCreate(BaseModel):
    user_id: str
    level: LevelLiteral = "junior"
    employee_number: Optional[str] = None
    capacity_hrs_day: float = 8.0
    hourly_cost: Optional[float] = None


class MechanicProfileUpdate(BaseModel):
    level: Optional[LevelLiteral] = None
    capacity_hrs_day: Optional[float] = None
    hourly_cost: Optional[float] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


class SkillUpsert(BaseModel):
    category: SkillCategoryLiteral
    proficiency: int = Field(3, ge=1, le=5)
    certified: bool = False
