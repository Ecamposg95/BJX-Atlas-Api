"""Tests del EventBus."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_event_bus():
    """Limpia subscribers entre tests para evitar cross-contamination."""
    from app.events import EventBus
    EventBus._subs.clear()
    yield
    EventBus._subs.clear()


def test_subscribe_and_publish():
    from app.events import EventBus
    from app.events.workshop_events import WorkOrderStatusChanged

    captured = []
    EventBus.subscribe(WorkOrderStatusChanged, lambda e: captured.append(e))

    event = WorkOrderStatusChanged(
        work_order_id="wo-1",
        from_status="received",
        to_status="assigned",
        reason=None,
        branch_id="br-1",
        actor_id="u-1",
    )
    EventBus.publish(event)

    assert len(captured) == 1
    assert captured[0].work_order_id == "wo-1"
    assert captured[0].to_status == "assigned"


def test_handler_error_does_not_propagate():
    from app.events import EventBus
    from app.events.workshop_events import WorkOrderStatusChanged

    def broken(event):
        raise RuntimeError("boom")

    EventBus.subscribe(WorkOrderStatusChanged, broken)

    # No debe lanzar — el bus atrapa
    EventBus.publish(
        WorkOrderStatusChanged(
            work_order_id="wo-1",
            from_status="received",
            to_status="assigned",
            reason=None,
            branch_id="br-1",
            actor_id="u-1",
        )
    )


def test_multiple_subscribers_same_event():
    from app.events import EventBus
    from app.events.workshop_events import WorkOrderStatusChanged

    count = {"n": 0}
    EventBus.subscribe(WorkOrderStatusChanged, lambda e: count.__setitem__("n", count["n"] + 1))
    EventBus.subscribe(WorkOrderStatusChanged, lambda e: count.__setitem__("n", count["n"] + 1))

    EventBus.publish(
        WorkOrderStatusChanged(
            work_order_id="wo-1",
            from_status="received",
            to_status="assigned",
            reason=None,
            branch_id="br-1",
            actor_id="u-1",
        )
    )

    assert count["n"] == 2


def test_no_subscribers_publishes_silently():
    from app.events import EventBus
    from app.events.workshop_events import WorkOrderCreated

    # No subscribers — debe terminar sin error
    EventBus.publish(
        WorkOrderCreated(
            work_order_id="wo-1",
            order_number="WO-2026-0001",
            type="walk_in",
            priority="normal",
            branch_id="br-1",
            actor_id="u-1",
        )
    )
