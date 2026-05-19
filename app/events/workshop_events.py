"""Eventos de dominio del taller."""
from __future__ import annotations

from dataclasses import dataclass

from app.events import BaseEvent


@dataclass
class WorkOrderCreated(BaseEvent):
    work_order_id: str = ""
    order_number: str = ""
    type: str = ""
    priority: str = ""


@dataclass
class WorkOrderStatusChanged(BaseEvent):
    work_order_id: str = ""
    from_status: str = ""
    to_status: str = ""
    reason: str | None = None


@dataclass
class MechanicAssigned(BaseEvent):
    work_order_id: str = ""
    work_order_line_id: str | None = None
    mechanic_id: str = ""
    level_check_result: str = "pass"  # pass | override


@dataclass
class WorkOrderFindingReported(BaseEvent):
    work_order_id: str = ""
    finding_id: str = ""
    mechanic_id: str = ""


@dataclass
class WorkOrderFindingApproved(BaseEvent):
    work_order_id: str = ""
    finding_id: str = ""
    new_line_id: str | None = None
