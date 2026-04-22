from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.catalog import ServiceCatalog
from app.models.work_orders import WorkOrder


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def generate_order_number(db: Session) -> str:
    current_year = utcnow().year
    year_count = (
        db.query(WorkOrder.id)
        .filter(WorkOrder.created_at.isnot(None))
        .filter(WorkOrder.created_at >= datetime(current_year, 1, 1, tzinfo=timezone.utc))
        .filter(WorkOrder.created_at < datetime(current_year + 1, 1, 1, tzinfo=timezone.utc))
        .count()
    )
    return f"WO-{current_year}-{str(year_count + 1).zfill(4)}"


def get_standard_duration_hrs(db: Session, model_id: str, service_id: str) -> Optional[float]:
    catalog = (
        db.query(ServiceCatalog)
        .filter(
            ServiceCatalog.model_id == model_id,
            ServiceCatalog.service_id == service_id,
            ServiceCatalog.is_current.is_(True),
        )
        .first()
    )
    if not catalog:
        return None
    return catalog.duration_hrs


def compute_actual_duration_minutes(work_started_at: Optional[datetime], work_finished_at: Optional[datetime]) -> Optional[int]:
    if not work_started_at or not work_finished_at:
        return None
    delta = work_finished_at - work_started_at
    return int(round(delta.total_seconds() / 60))


def compute_semaphore_status(actual_duration_minutes: Optional[int], standard_duration_hrs: Optional[float]) -> str:
    if actual_duration_minutes is None or standard_duration_hrs is None:
        return "pending"

    standard_minutes = int(round(standard_duration_hrs * 60))
    if actual_duration_minutes <= standard_minutes - 15:
        return "green"
    if actual_duration_minutes <= standard_minutes:
        return "yellow"
    return "red"


def build_work_order_metrics(work_order: WorkOrder, standard_duration_hrs: Optional[float]) -> dict:
    actual_duration_minutes = compute_actual_duration_minutes(work_order.work_started_at, work_order.work_finished_at)
    semaphore_status = compute_semaphore_status(actual_duration_minutes, standard_duration_hrs)
    return {
        "standard_duration_hrs": standard_duration_hrs,
        "actual_duration_minutes": actual_duration_minutes,
        "semaphore_status": semaphore_status,
    }
