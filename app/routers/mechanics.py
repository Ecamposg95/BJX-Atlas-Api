"""CRUD de perfiles de mecánico + skills."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.assignments import Assignment, AssignmentStatus
from app.models.mechanic_profiles import LEVEL_ORDER, MechanicProfile, MechanicSkill
from app.models.users import User
from app.schemas.mechanics import (
    MechanicProfileCreate,
    MechanicProfileUpdate,
    MechanicRead,
    SkillRead,
    SkillUpsert,
)
from app.security.permissions import Permission, has_permission, require_permission
from app.security.tenant import TenantContext, branch_scoped_query, get_tenant_context

router = APIRouter(prefix="/v1/mechanics", tags=["mechanics-v1"])


def _build_mechanic_read(db: Session, profile: MechanicProfile) -> MechanicRead:
    user = db.query(User).filter(User.id == profile.user_id).first()
    skills = (
        db.query(MechanicSkill)
        .filter(MechanicSkill.mechanic_profile_id == profile.id)
        .all()
    )
    active_assigns = (
        db.query(Assignment)
        .filter(
            Assignment.mechanic_id == profile.user_id,
            Assignment.status == AssignmentStatus.active.value,
        )
        .count()
    )
    # Carga simplificada: 1 hora por asignación activa (Fase 1)
    total_load = float(active_assigns)
    available = max(0.0, profile.capacity_hrs_day - total_load)
    pct = total_load / profile.capacity_hrs_day if profile.capacity_hrs_day > 0 else 1.0
    if pct < 0.60:
        load_status = "green"
    elif pct < 0.90:
        load_status = "yellow"
    else:
        load_status = "red"

    return MechanicRead(
        id=profile.id,
        user_id=profile.user_id,
        email=user.email if user else "",
        branch_id=profile.branch_id,
        level=profile.level,
        capacity_hrs_day=profile.capacity_hrs_day,
        current_load_hrs=total_load,
        available_hrs=available,
        load_status=load_status,
        active_assignments_count=active_assigns,
        active=profile.active,
        skills=[SkillRead.model_validate(s, from_attributes=True) for s in skills],
    )


@router.get("", response_model=list[MechanicRead])
def list_mechanics(
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.MECHANIC_PROFILE_READ)),
    only_active: bool = True,
    min_level: Optional[str] = None,
):
    q = branch_scoped_query(MechanicProfile, db, ctx).filter(MechanicProfile.deleted_at.is_(None))
    if only_active:
        q = q.filter(MechanicProfile.active.is_(True))
    profiles = q.all()

    if min_level:
        min_num = LEVEL_ORDER.get(min_level, 1)
        profiles = [p for p in profiles if LEVEL_ORDER.get(p.level, 1) >= min_num]

    return [_build_mechanic_read(db, p) for p in profiles]


@router.post("", response_model=MechanicRead, status_code=status.HTTP_201_CREATED)
def create_mechanic_profile(
    payload: MechanicProfileCreate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_permission(Permission.MECHANIC_PROFILE_WRITE)),
):
    user = db.query(User).filter(User.id == payload.user_id).first()
    if user is None:
        raise HTTPException(404, detail={"error": {"code": "USER_NOT_FOUND"}})

    if db.query(MechanicProfile).filter(MechanicProfile.user_id == user.id).first():
        raise HTTPException(409, detail={"error": {"code": "MECHANIC_PROFILE_ALREADY_EXISTS"}})

    profile = MechanicProfile(
        branch_id=ctx.branch_id or user.default_branch_id,
        user_id=user.id,
        level=payload.level,
        employee_number=payload.employee_number,
        capacity_hrs_day=payload.capacity_hrs_day,
        hourly_cost=payload.hourly_cost,
        active=True,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _build_mechanic_read(db, profile)


@router.patch("/{user_id}", response_model=MechanicRead)
def update_mechanic_profile(
    user_id: str,
    payload: MechanicProfileUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    current_user: User = Depends(require_permission(Permission.MECHANIC_PROFILE_WRITE)),
):
    profile = db.query(MechanicProfile).filter(MechanicProfile.user_id == user_id).first()
    if profile is None:
        raise HTTPException(404, detail={"error": {"code": "MECHANIC_PROFILE_NOT_FOUND"}})

    data = payload.model_dump(exclude_unset=True)
    # Solo gerente/admin pueden cambiar level
    if "level" in data and not has_permission(current_user, Permission.MECHANIC_LEVEL_WRITE):
        raise HTTPException(403, detail={"error": {"code": "FORBIDDEN_LEVEL_WRITE"}})

    for k, v in data.items():
        setattr(profile, k, v)
    db.commit()
    db.refresh(profile)
    return _build_mechanic_read(db, profile)


@router.post("/{user_id}/skills", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def add_skill(
    user_id: str,
    payload: SkillUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_permission(Permission.MECHANIC_SKILLS_WRITE)),
):
    profile = db.query(MechanicProfile).filter(MechanicProfile.user_id == user_id).first()
    if profile is None:
        raise HTTPException(404, detail={"error": {"code": "MECHANIC_PROFILE_NOT_FOUND"}})

    existing = (
        db.query(MechanicSkill)
        .filter(
            MechanicSkill.mechanic_profile_id == profile.id,
            MechanicSkill.category == payload.category,
        )
        .first()
    )
    if existing:
        existing.proficiency = payload.proficiency
        existing.certified = payload.certified
        skill = existing
    else:
        skill = MechanicSkill(
            mechanic_profile_id=profile.id,
            category=payload.category,
            proficiency=payload.proficiency,
            certified=payload.certified,
        )
        db.add(skill)

    db.commit()
    db.refresh(skill)
    return SkillRead.model_validate(skill, from_attributes=True)
