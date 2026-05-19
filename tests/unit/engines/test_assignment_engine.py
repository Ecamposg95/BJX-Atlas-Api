"""Smoke tests para assignment_engine.

Tests funcionales de R8-R12 viven en tests/integration/test_assignments.py
(requieren DB real). Aquí solo verificamos que el módulo importa, las clases de
excepción existen y los nombres son los esperados.
"""
from __future__ import annotations


def test_module_importable():
    from app.services import assignment_engine
    assert assignment_engine is not None


def test_assign_mechanic_callable_exists():
    from app.services.assignment_engine import assign_mechanic
    assert callable(assign_mechanic)


def test_exception_classes_exist():
    from app.services.assignment_engine import (
        AssignmentError,
        AssignmentLevelInsufficient,
        CrossBranchAssignmentBlocked,
        MechanicInactive,
    )
    err = AssignmentLevelInsufficient(
        code="ASSIGNMENT_LEVEL_INSUFFICIENT",
        detail={"required_level": "master", "mechanic_level": "junior"},
    )
    assert err.code == "ASSIGNMENT_LEVEL_INSUFFICIENT"
    assert err.detail["required_level"] == "master"
    assert err.http_status == 409
    assert isinstance(err, AssignmentError)

    err2 = CrossBranchAssignmentBlocked(code="CROSS_BRANCH_NOT_ALLOWED", detail={})
    assert isinstance(err2, AssignmentError)

    err3 = MechanicInactive(code="MECHANIC_INACTIVE", detail={"user_id": "x"})
    assert isinstance(err3, AssignmentError)
