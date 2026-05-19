"""Endpoint /branches/stats — agregados por sucursal para el mapa de México.

Devuelve KPIs vivos por sede + coordenadas hardcodeadas (futura migración a
columnas lat/lng en `branches`). Cualquier usuario autenticado puede leer; los
roles globales (admin/director/viewer/cliente_corp) ven todas las sedes, los
roles branch-scoped ven todas pero su sede primero (orden estable por code).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.organizations import Branch
from app.models.users import User
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop import WorkOrderLine, WorkOrderLineStatus
from app.schemas.branch_stats import (
    BranchKPIs,
    BranchStat,
    ManagerDashboard,
    Metric,
    StalledOrder,
)
from app.security import get_current_user, _role_value


router = APIRouter(prefix="/branches", tags=["branch-stats"])


# ── Cache in-memory por branch_id (TTL=60s) ────────────────────────────────
_MANAGER_CACHE_TTL = 60
_manager_cache: dict[str, tuple[datetime, ManagerDashboard]] = {}


def invalidate_manager_cache(branch_id: Optional[str] = None) -> None:
    if branch_id is None:
        _manager_cache.clear()
    else:
        _manager_cache.pop(branch_id, None)


# ── Coordenadas geográficas hardcodeadas por código de sede ────────────────
# Más adelante migrar a columnas lat/lng en `branches` + admin form.
BRANCH_COORDS: dict[str, tuple[float, float, str, str]] = {
    "BJX-MAIN": (19.4326, -99.1332, "CDMX", "Ciudad de México"),
    "BJX-LEON": (21.1219, -101.6833, "León", "Guanajuato"),
    "BJX-QRO":  (20.5888, -100.3899, "Querétaro", "Querétaro"),
    "BJX-GDL":  (20.6597, -103.3496, "Guadalajara", "Jalisco"),
    "BJX-CDMX": (19.4326, -99.1332, "CDMX", "Ciudad de México"),
    "BJX-MTY":  (25.6866, -100.3161, "Monterrey", "Nuevo León"),
    "BJX-PUE":  (19.0414, -98.2063, "Puebla", "Puebla"),
    "BJX-TIJ":  (32.5149, -117.0382, "Tijuana", "Baja California"),
    "BJX-SLP":  (22.1565, -100.9855, "San Luis Potosí", "San Luis Potosí"),
    "BJX-AGS":  (21.8853, -102.2916, "Aguascalientes", "Aguascalientes"),
}


def _coords_for(branch: Branch) -> tuple[float, float, str, str]:
    """Devuelve (lat, lng, city, state). Fallback: centro geográfico de MX."""
    fallback = (23.6345, -102.5528, branch.city or "—", branch.state or "—")
    return BRANCH_COORDS.get(branch.code, fallback)


def _open_statuses() -> list[str]:
    return [
        WorkOrderStatus.received.value,
        WorkOrderStatus.assigned.value,
        WorkOrderStatus.in_progress.value,
        WorkOrderStatus.waiting_parts.value,
        WorkOrderStatus.quality_check.value,
    ]


def _ensure_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite devuelve datetimes naive; normalizamos a UTC para evitar TypeError."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _compute_kpis(
    db: Session,
    branch_id: str,
    date_from: datetime,
    date_to: datetime,
) -> BranchKPIs:
    """Agrega KPIs operativos para una sede dentro de un rango."""
    # OS abiertas (no completed/delivered/cancelled)
    open_orders = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.status.in_(_open_statuses()),
        )
        .scalar()
        or 0
    )

    # En proceso
    in_progress = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.status == WorkOrderStatus.in_progress.value,
        )
        .scalar()
        or 0
    )

    # Esperando partes — proxy para stalled_parts
    stalled_parts = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.status == WorkOrderStatus.waiting_parts.value,
        )
        .scalar()
        or 0
    )

    # Finalizadas en el rango
    finished_today = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.work_finished_at.is_not(None),
            WorkOrder.work_finished_at >= date_from,
            WorkOrder.work_finished_at <= date_to,
        )
        .scalar()
        or 0
    )

    # Mecánicos activos = distintos mechanic_id con línea in_progress
    active_mechanics = (
        db.query(func.count(func.distinct(WorkOrderLine.mechanic_id)))
        .filter(
            WorkOrderLine.branch_id == branch_id,
            WorkOrderLine.status == WorkOrderLineStatus.in_progress.value,
            WorkOrderLine.mechanic_id.is_not(None),
        )
        .scalar()
        or 0
    )

    # Avg completion hours (líneas completadas en rango)
    avg_minutes = (
        db.query(func.avg(WorkOrderLine.actual_duration_minutes))
        .filter(
            WorkOrderLine.branch_id == branch_id,
            WorkOrderLine.status == WorkOrderLineStatus.completed.value,
            WorkOrderLine.finished_at.is_not(None),
            WorkOrderLine.finished_at >= date_from,
            WorkOrderLine.finished_at <= date_to,
        )
        .scalar()
    )
    avg_completion_hrs = round(float(avg_minutes) / 60.0, 2) if avg_minutes else 0.0

    # Revenue today — proxy: count(finished_today) * factor placeholder.
    # No tenemos columna de monto en WorkOrder todavía. Usamos un estimado
    # determinista basado en finished + in_progress para que el mapa tenga vida.
    revenue_today = round((finished_today * 4200.0) + (in_progress * 1850.0), 2)

    # Alerts: stalled_parts > 0 cuentan + OS sin mecánico asignado en progreso
    orphan_in_progress = (
        db.query(func.count(WorkOrder.id))
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.status == WorkOrderStatus.in_progress.value,
            WorkOrder.assigned_mechanic_id.is_(None),
        )
        .scalar()
        or 0
    )
    alerts_count = int(stalled_parts) + int(orphan_in_progress)

    # ── Cycle time (avg + p95) sobre OS completadas en últimos 30 días ──
    window_from = datetime.now(timezone.utc) - timedelta(days=30)
    completed_rows = (
        db.query(WorkOrder.created_at, WorkOrder.work_finished_at)
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.work_finished_at.is_not(None),
            WorkOrder.work_finished_at >= window_from,
        )
        .all()
    )
    cycle_hours: list[float] = []
    for created, finished in completed_rows:
        c = _ensure_aware(created)
        f = _ensure_aware(finished)
        if c is None or f is None:
            continue
        cycle_hours.append(max(0.0, (f - c).total_seconds() / 3600.0))
    if cycle_hours:
        cycle_time_avg_hrs = round(sum(cycle_hours) / len(cycle_hours), 2)
        sorted_cycle = sorted(cycle_hours)
        idx = max(0, int(round(0.95 * (len(sorted_cycle) - 1))))
        cycle_time_p95_hrs = round(sorted_cycle[idx], 2)
    else:
        cycle_time_avg_hrs = 0.0
        cycle_time_p95_hrs = 0.0

    # ── On-time delivery % (entregadas antes de promised_at, últimos 30 días) ──
    on_time_rows = (
        db.query(WorkOrder.promised_at, WorkOrder.work_finished_at)
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.work_finished_at.is_not(None),
            WorkOrder.promised_at.is_not(None),
            WorkOrder.work_finished_at >= window_from,
        )
        .all()
    )
    if on_time_rows:
        on_time = sum(
            1
            for promised, finished in on_time_rows
            if _ensure_aware(finished) is not None
            and _ensure_aware(promised) is not None
            and _ensure_aware(finished) <= _ensure_aware(promised)
        )
        on_time_pct = round(on_time / len(on_time_rows), 4)
    else:
        on_time_pct = 0.0

    # ── Margin avg: TODO — WorkOrder/WorkOrderLine no almacena precio/costo
    # final por OS hoy. Existe `quotes.brame_price` y `supplier_prices.total_price`
    # pero no hay link directo OS↔quote. Devolvemos None hasta que se modele.
    margin_pct_avg: Optional[float] = None

    return BranchKPIs(
        open_orders=int(open_orders),
        in_progress=int(in_progress),
        finished_today=int(finished_today),
        active_mechanics=int(active_mechanics),
        revenue_today=revenue_today,
        avg_completion_hrs=avg_completion_hrs,
        stalled_parts=int(stalled_parts),
        alerts_count=int(alerts_count),
        cycle_time_avg_hrs=cycle_time_avg_hrs,
        cycle_time_p95_hrs=cycle_time_p95_hrs,
        margin_pct_avg=margin_pct_avg,
        on_time_pct=on_time_pct,
    )


def _top_stalled_orders(db: Session, branch_id: str, limit: int = 5) -> list[StalledOrder]:
    """Top N OS abiertas con más horas desde su última transición (proxy: updated_at)."""
    rows = (
        db.query(WorkOrder)
        .filter(
            WorkOrder.branch_id == branch_id,
            WorkOrder.status.in_(_open_statuses()),
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    out: list[StalledOrder] = []
    for wo in rows:
        ref = _ensure_aware(getattr(wo, "updated_at", None)) or _ensure_aware(wo.received_at)
        if ref is None:
            continue
        hrs = max(0.0, (now - ref).total_seconds() / 3600.0)
        out.append(
            StalledOrder(
                id=wo.id,
                order_number=wo.order_number,
                status=wo.status,
                hours_in_status=round(hrs, 2),
            )
        )
    out.sort(key=lambda x: x.hours_in_status, reverse=True)
    return out[:limit]


def _semaphore_for(kpis: BranchKPIs) -> str:
    """Threshold lógico — hardcoded por ahora, config-driven después."""
    if kpis.alerts_count > 3:
        return "red"
    if kpis.in_progress == 0 and kpis.open_orders > 0 and kpis.active_mechanics == 0:
        return "red"
    if kpis.alerts_count >= 1 or kpis.stalled_parts > 0:
        return "amber"
    if kpis.in_progress >= 1 and kpis.alerts_count == 0:
        return "green"
    # Sin actividad y sin alertas: ámbar suave (sucursal idle)
    return "amber" if kpis.open_orders > 0 else "green"


@router.get("/stats", response_model=list[BranchStat])
def get_branch_stats(
    metric: Metric = Query("operation"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """KPIs por sucursal para el mapa de México.

    El parámetro `metric` no cambia los datos devueltos: solo es un hint para
    que el frontend sepa qué KPI debe destacar (tamaño del pin, ranking, etc).
    """
    now = datetime.now(timezone.utc)
    if date_to is None:
        date_to = now
    if date_from is None:
        date_from = date_to - timedelta(hours=24)

    branches = (
        db.query(Branch)
        .filter(Branch.deleted_at.is_(None), Branch.active.is_(True))
        .order_by(Branch.code)
        .all()
    )

    result: list[BranchStat] = []
    for b in branches:
        lat, lng, city, state = _coords_for(b)
        kpis = _compute_kpis(db, b.id, date_from, date_to)
        semaphore = _semaphore_for(kpis)
        result.append(
            BranchStat(
                branch_id=b.id,
                code=b.code,
                name=b.name,
                city=b.city or city,
                state=b.state or state,
                lat=lat,
                lng=lng,
                kpis=kpis,
                semaphore=semaphore,  # type: ignore[arg-type]
                pulse=kpis.in_progress > 0,
            )
        )

    # `metric` cambia el orden devuelto para que el ranking del frontend
    # pueda usar el primer N tal cual.
    if metric == "revenue":
        result.sort(key=lambda b: b.kpis.revenue_today, reverse=True)
    elif metric == "alerts":
        result.sort(key=lambda b: b.kpis.alerts_count, reverse=True)
    else:  # operation
        result.sort(
            key=lambda b: (b.kpis.in_progress + b.kpis.open_orders),
            reverse=True,
        )

    return result


_MANAGER_ALLOWED_ROLES = {"admin", "director", "gerente_sede"}


def _resolve_manager_branch(
    user: User,
    requested: Optional[str],
    db: Session,
) -> Branch:
    role = _role_value(user.role)
    if role not in _MANAGER_ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para ver el panel de gerente",
        )

    target_id = requested or user.default_branch_id
    if not target_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes indicar una sucursal (branch_id o header X-Branch-Id)",
        )

    if role == "gerente_sede" and target_id != user.default_branch_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes consultar tu sucursal asignada",
        )

    branch = (
        db.query(Branch)
        .filter(
            Branch.id == target_id,
            Branch.deleted_at.is_(None),
            Branch.active.is_(True),
        )
        .first()
    )
    if branch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sucursal no encontrada o inactiva",
        )
    return branch


@router.get("/manager-dashboard", response_model=ManagerDashboard)
def get_manager_dashboard(
    branch_id: Optional[str] = Query(None),
    refresh: bool = Query(False, description="Forzar recálculo ignorando cache"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    x_branch_id: Optional[str] = Header(default=None, alias="X-Branch-Id"),
):
    """Dashboard de sucursal para el gerente (Ola 4).

    Cache in-memory por branch_id (TTL=60s). Roles permitidos: admin, director,
    gerente_sede. El gerente solo puede ver su sucursal asignada.
    """
    requested = branch_id or x_branch_id
    branch = _resolve_manager_branch(user, requested, db)
    now = datetime.now(timezone.utc)

    if not refresh:
        cached = _manager_cache.get(branch.id)
        if cached is not None:
            ts, payload = cached
            if (now - ts).total_seconds() < _MANAGER_CACHE_TTL:
                return payload

    date_to = now
    date_from = date_to - timedelta(hours=24)
    kpis = _compute_kpis(db, branch.id, date_from, date_to)
    semaphore = _semaphore_for(kpis)
    stalled = _top_stalled_orders(db, branch.id, limit=5)
    lat, lng, city, state = _coords_for(branch)

    payload = ManagerDashboard(
        branch_id=branch.id,
        code=branch.code,
        name=branch.name,
        city=branch.city or city,
        state=branch.state or state,
        kpis=kpis,
        semaphore=semaphore,  # type: ignore[arg-type]
        top_stalled_orders=stalled,
        calculated_at=now.isoformat(),
    )
    _manager_cache[branch.id] = (now, payload)
    return payload
