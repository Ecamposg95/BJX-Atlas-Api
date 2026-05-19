"""Factories for WorkOrder."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

import factory
from factory.alchemy import SQLAlchemyModelFactory

from app.models.work_orders import WorkOrder


class WorkOrderFactory(SQLAlchemyModelFactory):
    class Meta:
        model = WorkOrder
        sqlalchemy_session_persistence = "flush"

    order_number = factory.Sequence(lambda n: f"WO-2026-{n:04d}")
    type = "walk_in"
    priority = "normal"
    status = "received"
    received_at = factory.LazyFunction(lambda: datetime.now(timezone.utc))


class InProgressWorkOrderFactory(WorkOrderFactory):
    status = "in_progress"
    work_started_at = factory.LazyFunction(
        lambda: datetime.now(timezone.utc) - timedelta(minutes=30)
    )
