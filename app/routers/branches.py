"""CRUD y switch de sucursales."""
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.organizations import Branch, Organization
from app.models.users import User
from app.security import get_current_user, require_role


router = APIRouter(prefix="/branches", tags=["branches"])


class BranchRead(BaseModel):
    id: str
    organization_id: str
    code: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    timezone: str
    phone: Optional[str] = None
    active: bool

    model_config = {"from_attributes": True}


class BranchCreate(BaseModel):
    organization_id: Optional[str] = None  # default: org única
    code: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    timezone: str = "America/Mexico_City"
    phone: Optional[str] = None


class BranchUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    timezone: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None


@router.get("", response_model=list[BranchRead])
def list_branches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Lista todas las sucursales activas. Cualquier usuario autenticado puede listarlas
    (lo necesita el branch switcher en el frontend).
    """
    return db.query(Branch).filter(Branch.deleted_at.is_(None)).order_by(Branch.code).all()


@router.post("", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
def create_branch(
    payload: BranchCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "director"])),
):
    org_id = payload.organization_id
    if org_id is None:
        org = db.query(Organization).filter(Organization.deleted_at.is_(None)).first()
        if org is None:
            raise HTTPException(status_code=400, detail="No hay organización configurada")
        org_id = org.id

    if db.query(Branch).filter(Branch.organization_id == org_id, Branch.code == payload.code).first():
        raise HTTPException(status_code=409, detail=f"Ya existe una sucursal con código {payload.code}")

    branch = Branch(
        organization_id=org_id,
        code=payload.code,
        name=payload.name,
        address=payload.address,
        city=payload.city,
        state=payload.state,
        timezone=payload.timezone,
        phone=payload.phone,
        active=True,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.put("/{branch_id}", response_model=BranchRead)
def update_branch(
    branch_id: str,
    payload: BranchUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(["admin", "director"])),
):
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(branch, f, v)
    db.commit()
    db.refresh(branch)
    return branch


class BranchSwitchRequest(BaseModel):
    branch_id: str


class BranchSwitchResponse(BaseModel):
    branch_id: str
    branch_code: str
    branch_name: str


@router.post("/switch", response_model=BranchSwitchResponse)
def switch_branch(
    payload: BranchSwitchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cambia el branch activo del usuario. Roles BRANCH_SCOPED no pueden saltar a otra sede."""
    from app.models.users import GLOBAL_ROLES
    from app.security import _role_value

    branch = db.query(Branch).filter(Branch.id == payload.branch_id, Branch.active.is_(True)).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada o inactiva")

    role_str = _role_value(current_user.role)
    is_global = role_str in {r.value for r in GLOBAL_ROLES}

    if not is_global:
        # Solo puede "cambiar" a su propia sede
        if payload.branch_id != current_user.default_branch_id:
            raise HTTPException(
                status_code=403,
                detail="Tu rol está limitado a tu sede asignada",
            )

    # Para roles globales, actualizar default_branch_id como persistencia simple del switch
    current_user.default_branch_id = branch.id
    db.commit()

    return BranchSwitchResponse(branch_id=branch.id, branch_code=branch.code, branch_name=branch.name)
