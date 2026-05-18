"""Unit tests for the declarative permission matrix."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.models.users import Role
from app.security.permissions import (
    PERMISSION_MATRIX,
    Permission,
    has_permission,
    require_permission,
)


def _user(role: Role) -> MagicMock:
    u = MagicMock()
    u.role = role.value
    return u


def test_permission_enum_has_work_order_permissions():
    assert Permission.WORK_ORDER_CREATE.value == "work_order:create"
    assert Permission.WORK_ORDER_TRANSITION.value == "work_order:transition"
    assert Permission.WORK_ORDER_CANCEL.value == "work_order:cancel"
    assert Permission.WORK_ORDER_DELETE.value == "work_order:delete"
    assert Permission.WORK_ORDER_QA_PASS.value == "work_order:qa_pass"
    assert Permission.WORK_ORDER_QA_FAIL.value == "work_order:qa_fail"
    assert Permission.WORK_ORDER_DELIVER.value == "work_order:deliver"


def test_permission_enum_has_assignment_permissions():
    assert Permission.ASSIGNMENT_CREATE.value == "assignment:create"
    assert Permission.ASSIGNMENT_OVERRIDE.value == "assignment:override_level"
    assert Permission.ASSIGNMENT_RELEASE.value == "assignment:release"


def test_permission_enum_has_mechanic_permissions():
    assert Permission.MECHANIC_PROFILE_READ is not None
    assert Permission.MECHANIC_PROFILE_WRITE is not None
    assert Permission.MECHANIC_LEVEL_WRITE is not None


def test_permission_matrix_has_entry_for_every_permission():
    for permission in Permission:
        assert permission in PERMISSION_MATRIX, f"Permission {permission} sin entrada"
        assert len(PERMISSION_MATRIX[permission]) >= 1


def test_admin_has_all_permissions():
    for permission in Permission:
        assert Role.admin in PERMISSION_MATRIX[permission], f"admin debe tener {permission}"


def test_viewer_has_no_write_permissions():
    write_perms = [
        Permission.WORK_ORDER_CREATE,
        Permission.ASSIGNMENT_CREATE,
        Permission.WORK_ORDER_DELETE,
        Permission.MECHANIC_LEVEL_WRITE,
        Permission.FINDING_APPROVE,
    ]
    for p in write_perms:
        assert Role.viewer not in PERMISSION_MATRIX[p], f"viewer no debe tener {p}"


def test_recepcion_can_create_work_order_but_not_assign():
    assert Role.recepcion in PERMISSION_MATRIX[Permission.WORK_ORDER_CREATE]
    assert Role.recepcion not in PERMISSION_MATRIX[Permission.ASSIGNMENT_CREATE]


def test_has_permission_helper():
    admin_user = _user(Role.admin)
    assert has_permission(admin_user, Permission.WORK_ORDER_CREATE) is True

    viewer_user = _user(Role.viewer)
    assert has_permission(viewer_user, Permission.WORK_ORDER_CREATE) is False


def test_has_permission_with_unknown_role():
    user = MagicMock()
    user.role = "ghost_role"
    assert has_permission(user, Permission.WORK_ORDER_CREATE) is False


def test_require_permission_returns_callable():
    dep = require_permission(Permission.WORK_ORDER_CREATE)
    assert callable(dep)
