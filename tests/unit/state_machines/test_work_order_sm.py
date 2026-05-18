"""Tests para work_order_sm.transition()."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest


@pytest.fixture(autouse=True)
def _reset_event_bus():
    from app.events import EventBus
    EventBus._subs.clear()
    yield
    EventBus._subs.clear()


@pytest.fixture
def fake_actor_admin():
    user = MagicMock()
    user.id = "u-admin"
    user.role = "admin"
    return user


@pytest.fixture
def fake_actor_mecanico():
    user = MagicMock()
    user.id = "u-mech"
    user.role = "mecanico"
    return user


@pytest.fixture
def fake_db():
    db = MagicMock()
    db.query().filter().first.return_value = None
    return db


def _make_wo(status="received", id_="wo-1", branch_id="br-1"):
    wo = MagicMock()
    wo.id = id_
    wo.branch_id = branch_id
    wo.status = status
    wo.work_started_at = None
    wo.work_finished_at = None
    wo.closed_at = None
    return wo


def test_valid_transition_received_to_assigned(fake_db, fake_actor_admin):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="received")
    history = transition(fake_db, wo, WorkOrderStatus.assigned, fake_actor_admin, reason=None)

    assert wo.status == "assigned"
    assert history.from_status == "received"
    assert history.to_status == "assigned"
    assert history.changed_by == "u-admin"


def test_invalid_transition_returns_allowed_targets(fake_db, fake_actor_admin):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines import InvalidTransition
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="received")
    with pytest.raises(InvalidTransition) as exc_info:
        transition(fake_db, wo, WorkOrderStatus.in_progress, fake_actor_admin, reason=None)
    assert exc_info.value.code == "WORK_ORDER_INVALID_TRANSITION"
    assert "assigned" in exc_info.value.detail["allowed_targets"]


def test_terminal_state_blocks_all(fake_db, fake_actor_admin):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines import InvalidTransition
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="delivered")
    with pytest.raises(InvalidTransition) as exc_info:
        transition(fake_db, wo, WorkOrderStatus.in_progress, fake_actor_admin, reason="reopen")
    assert exc_info.value.code == "WORK_ORDER_TERMINAL"


def test_cancel_requires_reason(fake_db, fake_actor_admin):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines import InvalidTransition
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="received")
    with pytest.raises(InvalidTransition) as exc_info:
        transition(fake_db, wo, WorkOrderStatus.cancelled, fake_actor_admin, reason=None)
    assert exc_info.value.code == "REASON_REQUIRED"


def test_assigned_to_in_progress_requires_active_assignment(fake_db, fake_actor_mecanico):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines import Forbidden
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="assigned")
    fake_db.query().filter().first.return_value = None  # no assignment

    with pytest.raises(Forbidden) as exc_info:
        transition(fake_db, wo, WorkOrderStatus.in_progress, fake_actor_mecanico, reason=None)
    assert exc_info.value.code == "NOT_ASSIGNED_MECHANIC"


def test_timestamps_set_on_first_in_progress(fake_db, fake_actor_mecanico):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="assigned")
    fake_db.query().filter().first.return_value = MagicMock(id="a-1")  # active assignment

    transition(fake_db, wo, WorkOrderStatus.in_progress, fake_actor_mecanico, reason=None)
    assert wo.work_started_at is not None
    assert wo.work_finished_at is None


def test_timestamps_set_on_completed(fake_db, fake_actor_admin):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="in_progress")
    wo.work_started_at = datetime.now(timezone.utc)

    transition(fake_db, wo, WorkOrderStatus.completed, fake_actor_admin, reason=None)
    assert wo.work_finished_at is not None


def test_timestamps_set_on_delivered(fake_db, fake_actor_admin):
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="completed")
    transition(fake_db, wo, WorkOrderStatus.delivered, fake_actor_admin, reason=None)
    assert wo.closed_at is not None


def test_event_published_on_transition(fake_db, fake_actor_admin):
    from app.events import EventBus
    from app.events.workshop_events import WorkOrderStatusChanged
    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines.work_order_sm import transition

    captured = []
    EventBus.subscribe(WorkOrderStatusChanged, lambda e: captured.append(e))

    wo = _make_wo(status="received")
    transition(fake_db, wo, WorkOrderStatus.assigned, fake_actor_admin, reason=None)

    assert len(captured) == 1
    assert captured[0].from_status == "received"
    assert captured[0].to_status == "assigned"


def test_metadata_serialized_as_json(fake_db, fake_actor_admin):
    import json as _json

    from app.models.work_orders import WorkOrderStatus
    from app.services.state_machines.work_order_sm import transition

    wo = _make_wo(status="received")
    history = transition(
        fake_db, wo, WorkOrderStatus.assigned, fake_actor_admin,
        reason=None, metadata={"foo": "bar"},
    )

    parsed = _json.loads(history.metadata_json)
    assert parsed == {"foo": "bar"}
