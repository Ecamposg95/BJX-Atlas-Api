"""Multi-tenant context resolution.

Cada request operativa cae en una sucursal (`branch_id`). El contexto se resuelve
en orden de prioridad:
1. Header `X-Branch-Id` (admin/director multi-sede pueden cambiar contexto)
2. JWT claim `branch_id` (firmado al login)
3. `user.default_branch_id`

Roles GLOBAL (admin/director/viewer/cliente_corp) pueden ver todas las sedes —
para ellos el contexto puede ser None y las queries deben aceptar opcional.
Roles BRANCH_SCOPED deben SIEMPRE tener un branch_id resuelto o se rechaza la request.
"""
from typing import Optional, Type, TypeVar
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, Query

from app.database import get_db
from app.models.users import User, Role, BRANCH_SCOPED_ROLES, GLOBAL_ROLES
from app.models.organizations import Branch
from app.security import get_current_user, _role_value


T = TypeVar("T")


class TenantContext:
    """Información de scoping resuelta para esta request."""

    def __init__(self, user: User, branch_id: Optional[str], is_global: bool):
        self.user = user
        self.branch_id = branch_id
        self.is_global = is_global

    @property
    def role(self) -> str:
        return _role_value(self.user.role)

    def __repr__(self) -> str:
        return f"<TenantContext user={self.user.email} branch={self.branch_id} global={self.is_global}>"


def _user_role_str(user: User) -> str:
    return _role_value(user.role)


def get_tenant_context(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    role_str = _user_role_str(current_user)
    is_global = role_str in {r.value for r in GLOBAL_ROLES}

    branch_id: Optional[str] = None

    # 1. Header explícito (solo admin/director pueden override)
    header_branch = request.headers.get("X-Branch-Id")
    if header_branch:
        if not is_global and header_branch != current_user.default_branch_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No puedes cambiar de sucursal: tu rol está limitado a tu sede asignada",
            )
        branch_id = header_branch
    else:
        # 2. JWT claim → 3. default_branch_id del usuario
        # (el JWT claim solo lo usamos en login en el futuro; por ahora default_branch_id)
        branch_id = current_user.default_branch_id

    # Validar existencia de branch
    if branch_id is not None:
        branch = db.query(Branch).filter(Branch.id == branch_id, Branch.active.is_(True)).first()
        if branch is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sucursal '{branch_id}' no existe o está inactiva",
            )

    # Roles BRANCH_SCOPED requieren branch_id obligatorio
    if not is_global and branch_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu usuario no tiene una sucursal asignada. Contacta al administrador.",
        )

    return TenantContext(user=current_user, branch_id=branch_id, is_global=is_global)


def branch_scoped_query(model: Type[T], db: Session, ctx: TenantContext) -> "Query[T]":
    """Aplica filtro automático por branch_id si el modelo lo soporta y el usuario NO es global.

    Usar en routers para evitar olvidar el filtro:
        items = branch_scoped_query(WorkOrder, db, ctx).all()
    """
    q = db.query(model)
    if hasattr(model, "branch_id") and not ctx.is_global:
        q = q.filter(model.branch_id == ctx.branch_id)
    elif hasattr(model, "branch_id") and ctx.branch_id is not None:
        # Usuario global con header explícito: respetar el filtro
        q = q.filter(model.branch_id == ctx.branch_id)
    return q


def assert_branch_access(record_branch_id: Optional[str], ctx: TenantContext) -> None:
    """Verifica que el contexto puede acceder al registro indicado. Levanta 403."""
    if ctx.is_global:
        return
    if record_branch_id != ctx.branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este recurso pertenece a otra sucursal",
        )


def resolve_branch_for_write(ctx: TenantContext, requested: Optional[str] = None) -> str:
    """Determina el branch_id para una operación de escritura.

    - Si el usuario es BRANCH_SCOPED: usar su branch_id (ignora `requested`)
    - Si es GLOBAL y manda `requested`: usarlo
    - Si es GLOBAL y manda header X-Branch-Id (ya resuelto en ctx.branch_id): usarlo
    - Si es GLOBAL sin nada: error 400
    """
    if not ctx.is_global:
        return ctx.branch_id  # garantizado por get_tenant_context
    chosen = requested or ctx.branch_id
    if chosen is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes especificar branch_id (header X-Branch-Id o body) al crear este recurso",
        )
    return chosen
