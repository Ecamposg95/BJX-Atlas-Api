"""Factories for Assignment."""
from __future__ import annotations

from datetime import datetime, timezone

import factory
from factory.alchemy import SQLAlchemyModelFactory


def make_assignment_factory():
    from app.models.assignments import Assignment

    class AssignmentFactory(SQLAlchemyModelFactory):
        class Meta:
            model = Assignment
            sqlalchemy_session_persistence = "flush"

        status = "active"
        override_level_check = False
        assigned_at = factory.LazyFunction(lambda: datetime.now(timezone.utc))

    return AssignmentFactory
