"""Declarative permission matrix for BJX-Atlas-Api.

Usage as FastAPI dependency:
    @router.post("/work-orders")
    def create_wo(user = Depends(require_permission(Permission.WORK_ORDER_CREATE))):
        ...
"""
from __future__ import annotations

import enum
from typing import Any

from fastapi import Depends, HTTPException, status

from app.models.users import Role


class Permission(str, enum.Enum):
    # Work order
    WORK_ORDER_CREATE      = "work_order:create"
    WORK_ORDER_UPDATE      = "work_order:update"
    WORK_ORDER_TRANSITION  = "work_order:transition"
    WORK_ORDER_CANCEL      = "work_order:cancel"
    WORK_ORDER_DELETE      = "work_order:delete"
    WORK_ORDER_QA_PASS     = "work_order:qa_pass"
    WORK_ORDER_QA_FAIL     = "work_order:qa_fail"
    WORK_ORDER_DELIVER     = "work_order:deliver"
    # Assignment
    ASSIGNMENT_CREATE          = "assignment:create"
    ASSIGNMENT_OVERRIDE        = "assignment:override_level"
    ASSIGNMENT_RELEASE         = "assignment:release"
    ASSIGNMENT_READ            = "assignment:read"
    # Mechanic
    MECHANIC_PROFILE_READ   = "mechanic:profile:read"
    MECHANIC_PROFILE_WRITE  = "mechanic:profile:write"
    MECHANIC_LEVEL_WRITE    = "mechanic:level:write"
    MECHANIC_SKILLS_WRITE   = "mechanic:skills:write"
    # Findings
    FINDING_REPORT  = "finding:report"
    FINDING_APPROVE = "finding:approve"
    FINDING_REJECT  = "finding:reject"
    FINDING_LIST    = "finding:list"
    # Me
    ME_TASKS_READ   = "me:tasks:read"
    # Service catalog approval workflow (US-07)
    SERVICE_PROPOSE = "service:propose"
    SERVICE_APPROVE = "service:approve"
    SERVICE_REJECT  = "service:reject"
    # Procurement (Ola 6)
    PROCUREMENT_CREATE  = "procurement:create"
    PROCUREMENT_APPROVE = "procurement:approve"
    PROCUREMENT_RECEIVE = "procurement:receive"
    PROCUREMENT_CANCEL  = "procurement:cancel"
    PROCUREMENT_READ    = "procurement:read"


PERMISSION_MATRIX: dict[Permission, set[Role]] = {
    Permission.WORK_ORDER_CREATE: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller, Role.recepcion, Role.operador,
    },
    Permission.WORK_ORDER_UPDATE: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller, Role.recepcion, Role.operador,
    },
    Permission.WORK_ORDER_TRANSITION: {
        Role.admin, Role.gerente_sede, Role.jefe_taller, Role.recepcion, Role.mecanico, Role.almacen, Role.operador,
    },
    Permission.WORK_ORDER_CANCEL: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.WORK_ORDER_DELETE: {Role.admin},
    Permission.WORK_ORDER_QA_PASS: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.WORK_ORDER_QA_FAIL: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.WORK_ORDER_DELIVER: {
        Role.admin, Role.gerente_sede, Role.recepcion,
    },
    Permission.ASSIGNMENT_CREATE: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.ASSIGNMENT_OVERRIDE: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.ASSIGNMENT_RELEASE: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.ASSIGNMENT_READ: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller, Role.recepcion, Role.viewer,
    },
    Permission.MECHANIC_PROFILE_READ: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller, Role.recepcion, Role.mecanico,
    },
    Permission.MECHANIC_PROFILE_WRITE: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.MECHANIC_LEVEL_WRITE: {
        Role.admin, Role.gerente_sede,
    },
    Permission.MECHANIC_SKILLS_WRITE: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.FINDING_REPORT: {Role.admin, Role.mecanico},
    Permission.FINDING_APPROVE: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.FINDING_REJECT: {
        Role.admin, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.FINDING_LIST: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller, Role.viewer,
    },
    Permission.ME_TASKS_READ: {Role.admin, Role.mecanico},
    Permission.SERVICE_PROPOSE: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller,
    },
    Permission.SERVICE_APPROVE: {
        Role.admin, Role.director, Role.gerente_sede,
    },
    Permission.SERVICE_REJECT: {
        Role.admin, Role.director, Role.gerente_sede,
    },
    # Procurement (Ola 6)
    Permission.PROCUREMENT_CREATE: {
        Role.admin, Role.director, Role.gerente_sede, Role.almacen,
    },
    Permission.PROCUREMENT_APPROVE: {
        Role.admin, Role.director, Role.gerente_sede,
    },
    Permission.PROCUREMENT_RECEIVE: {
        Role.admin, Role.gerente_sede, Role.almacen,
    },
    Permission.PROCUREMENT_CANCEL: {
        Role.admin, Role.director, Role.gerente_sede,
    },
    Permission.PROCUREMENT_READ: {
        Role.admin, Role.director, Role.gerente_sede, Role.jefe_taller,
        Role.almacen, Role.recepcion, Role.viewer,
    },
}


def _role_of(user: Any) -> Role | None:
    raw = getattr(user, "role", None)
    if raw is None:
        return None
    if hasattr(raw, "value"):
        raw = raw.value
    try:
        return Role(raw)
    except ValueError:
        return None


def has_permission(user: Any, permission: Permission) -> bool:
    role = _role_of(user)
    if role is None:
        return False
    return role in PERMISSION_MATRIX.get(permission, set())


def require_permission(permission: Permission):
    """FastAPI dependency factory: 403 si el rol no tiene el permiso."""
    from app.security import get_current_user  # avoid circular import

    def _check(current_user: Any = Depends(get_current_user)) -> Any:
        if not has_permission(current_user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN_PERMISSION",
                    "message": f"Tu rol no tiene el permiso: {permission.value}",
                    "detail": {
                        "required_permission": permission.value,
                        "your_role": getattr(current_user, "role", None),
                    },
                },
            )
        return current_user

    return _check
