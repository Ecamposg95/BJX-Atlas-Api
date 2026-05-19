"""Router de citas/agenda (Módulo 1 — Wave 4)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.appointments import Appointment, AppointmentStatus
from app.models.catalog import Service, VehicleModel
from app.models.users import User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus, WorkOrderType
from app.schemas.appointments import (
    AppointmentCancelRequest,
    AppointmentConvertRequest,
    AppointmentConvertResponse,
    AppointmentCreate,
    AppointmentRead,
    AppointmentUpdate,
)
from app.security import require_role
from app.security.tenant import (
    TenantContext,
    assert_branch_access,
    branch_scoped_query,
    get_tenant_context,
    resolve_branch_for_write,
)
from app.services.notifications import (
    build_appointment_confirmation_message,
    build_whatsapp_link,
    create_notification,
)
from app.services.work_order_engine import generate_order_number, utcnow


router = APIRouter(prefix="/v1/appointments", tags=["appointments-v1"])


def _to_read(a: Appointment) -> AppointmentRead:
    return AppointmentRead(
        id=a.id,
        branch_id=a.branch_id,
        customer_name=a.customer_name,
        customer_phone=a.customer_phone,
        vehicle_plates=a.vehicle_plates,
        vehicle_model_id=a.vehicle_model_id,
        scheduled_at=a.scheduled_at,
        duration_minutes=a.duration_minutes,
        service_type=a.service_type,
        notes=a.notes,
        status=AppointmentStatus(a.status),
        work_order_id=a.work_order_id,
        cancel_reason=a.cancel_reason,
        created_by_id=a.created_by_id,
        arrived_at=a.arrived_at,
        converted_at=a.converted_at,
        cancelled_at=a.cancelled_at,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _get_appointment_or_404(db: Session, appt_id: str, ctx: TenantContext) -> Appointment:
    a = (
        db.query(Appointment)
        .filter(Appointment.id == appt_id, Appointment.deleted_at.is_(None))
        .first()
    )
    if a is None:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    assert_branch_access(a.branch_id, ctx)
    return a


@router.get("", response_model=list[AppointmentRead])
def list_appointments(
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    branch_id: Optional[str] = Query(None),
    status_filter: Optional[AppointmentStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    q = branch_scoped_query(Appointment, db, ctx).filter(Appointment.deleted_at.is_(None))

    if branch_id and ctx.is_global:
        q = q.filter(Appointment.branch_id == branch_id)
    if date_from is not None:
        q = q.filter(Appointment.scheduled_at >= date_from)
    if date_to is not None:
        q = q.filter(Appointment.scheduled_at <= date_to)
    if status_filter is not None:
        q = q.filter(Appointment.status == status_filter.value)

    items = q.order_by(Appointment.scheduled_at.asc()).all()
    return [_to_read(a) for a in items]


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(
    payload: AppointmentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(
        require_role(["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"])
    ),
):
    branch = resolve_branch_for_write(ctx, payload.branch_id)

    if payload.vehicle_model_id:
        exists = db.query(VehicleModel).filter(VehicleModel.id == payload.vehicle_model_id).first()
        if not exists:
            raise HTTPException(404, "Modelo de vehículo no encontrado")

    appt = Appointment(
        branch_id=branch,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        vehicle_plates=(payload.vehicle_plates or None),
        vehicle_model_id=payload.vehicle_model_id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        service_type=payload.service_type,
        notes=payload.notes,
        status=AppointmentStatus.scheduled.value,
        created_by_id=user.id,
    )
    db.add(appt)
    db.flush()

    # Notificar a recepción de la sucursal (Ola 4 — appointment_confirmed)
    _notify_appointment_confirmed(db, appt, background_tasks=background_tasks)

    db.commit()
    db.refresh(appt)
    return _to_read(appt)


def _notify_appointment_confirmed(
    db: Session, appt: Appointment, *, background_tasks=None
) -> None:
    """Crea notificaciones in-app a recepción y cliente_corp tras crear cita."""
    title = "Nueva cita confirmada"
    body = (
        f"{appt.customer_name} — {appt.service_type or 'servicio'} "
        f"({appt.vehicle_plates or 's/placas'})"
    )
    link_url = "/citas"

    # Recepción de la sucursal
    recipients = (
        db.query(User)
        .filter(
            User.default_branch_id == appt.branch_id,
            User.role.in_(["recepcion", "jefe_taller", "gerente_sede"]),
            User.active.is_(True),
        )
        .all()
    )
    # Cliente corporativo (cross-branch) — solo si la cita tiene flota asociada
    # En el modelo actual Appointment no liga customer_id; notificamos a todos
    # los cliente_corp activos como fallback de ola.
    corp = (
        db.query(User)
        .filter(User.role == "cliente_corp", User.active.is_(True))
        .all()
    )

    seen: set[str] = set()
    for u in [*recipients, *corp]:
        if u.id in seen:
            continue
        seen.add(u.id)
        create_notification(
            db,
            user_id=u.id,
            kind="appointment_confirmed",
            title=title,
            body=body,
            link_url=link_url,
            branch_id=appt.branch_id,
            entity_type="appointment",
            entity_id=appt.id,
            send_email=bool(u.email),
            background_tasks=background_tasks,
        )


@router.patch("/{appointment_id}", response_model=AppointmentRead)
def update_appointment(
    appointment_id: str,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(
        require_role(["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"])
    ),
):
    a = _get_appointment_or_404(db, appointment_id, ctx)
    if a.status in {AppointmentStatus.converted_to_wo.value, AppointmentStatus.cancelled.value}:
        raise HTTPException(409, f"Cita {a.status} no editable")

    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, f, v)
    db.commit()
    db.refresh(a)
    return _to_read(a)


@router.delete("/{appointment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_appointment(
    appointment_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(require_role(["admin"])),
):
    a = _get_appointment_or_404(db, appointment_id, ctx)
    a.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return None


@router.post("/{appointment_id}/arrived", response_model=AppointmentRead)
def mark_arrived(
    appointment_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(
        require_role(["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"])
    ),
):
    a = _get_appointment_or_404(db, appointment_id, ctx)
    if a.status != AppointmentStatus.scheduled.value:
        raise HTTPException(409, f"Solo citas 'scheduled' pueden marcarse como llegadas (actual: {a.status})")
    a.status = AppointmentStatus.arrived.value
    a.arrived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _to_read(a)


@router.post("/{appointment_id}/cancel", response_model=AppointmentRead)
def cancel_appointment(
    appointment_id: str,
    payload: AppointmentCancelRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    _: User = Depends(
        require_role(["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"])
    ),
):
    a = _get_appointment_or_404(db, appointment_id, ctx)
    if a.status in {AppointmentStatus.cancelled.value, AppointmentStatus.converted_to_wo.value}:
        raise HTTPException(409, f"Cita ya está en estado {a.status}")
    a.status = AppointmentStatus.cancelled.value
    a.cancel_reason = payload.reason
    a.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _to_read(a)


@router.post("/{appointment_id}/convert", response_model=AppointmentConvertResponse)
def convert_to_work_order(
    appointment_id: str,
    payload: AppointmentConvertRequest,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
    user: User = Depends(
        require_role(["admin", "director", "gerente_sede", "jefe_taller", "recepcion", "operador"])
    ),
):
    a = _get_appointment_or_404(db, appointment_id, ctx)
    if a.status in {AppointmentStatus.cancelled.value, AppointmentStatus.converted_to_wo.value}:
        raise HTTPException(409, f"Cita en estado {a.status} no puede convertirse")

    # Validar service
    service = db.query(Service).filter(Service.id == payload.service_id).first()
    if service is None:
        raise HTTPException(404, "Servicio no encontrado")

    # Resolver model (preferir el de la cita, sino el del catálogo del primer modelo activo)
    model_id = a.vehicle_model_id
    if model_id is None:
        first_model = db.query(VehicleModel).filter(VehicleModel.deleted_at.is_(None)).first()
        if first_model is None:
            raise HTTPException(400, "No hay un VehicleModel disponible para asignar a la OS")
        model_id = first_model.id

    # Resolver vehicle: existe?
    vehicle: Optional[Vehicle] = None
    if payload.vehicle_id:
        vehicle = db.query(Vehicle).filter(Vehicle.id == payload.vehicle_id).first()
        if vehicle is None:
            raise HTTPException(404, "Vehículo no encontrado")
    elif a.vehicle_plates:
        plates_norm = a.vehicle_plates.strip().upper()
        vehicle = (
            db.query(Vehicle)
            .filter(Vehicle.deleted_at.is_(None))
            .filter(Vehicle.plates.isnot(None))
            .all()
        )
        vehicle = next(
            (v for v in vehicle if (v.plates or "").strip().upper() == plates_norm),
            None,
        )

    # Crear vehículo si no existe
    if vehicle is None:
        vehicle = Vehicle(
            branch_id=a.branch_id,
            customer_name=a.customer_name,
            contact=a.customer_phone,
            plates=(a.vehicle_plates or None),
            active=True,
        )
        db.add(vehicle)
        db.flush()

    # Crear OS
    notes_parts = [f"Cita {a.id} — {a.service_type}"]
    if a.notes:
        notes_parts.append(a.notes)
    if payload.notes:
        notes_parts.append(payload.notes)

    wo = WorkOrder(
        branch_id=a.branch_id,
        order_number=generate_order_number(db),
        vehicle_id=vehicle.id,
        model_id=model_id,
        service_id=service.id,
        assigned_mechanic_id=payload.assigned_mechanic_id,
        status=WorkOrderStatus.received.value,
        type=WorkOrderType.appointment.value,
        received_at=utcnow(),
        notes="\n".join(notes_parts),
    )
    db.add(wo)
    db.flush()

    a.status = AppointmentStatus.converted_to_wo.value
    a.work_order_id = wo.id
    a.converted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    db.refresh(wo)

    # WhatsApp link
    wa_link = None
    if a.customer_phone:
        wa_link = build_whatsapp_link(
            a.customer_phone,
            build_appointment_confirmation_message(
                customer_name=a.customer_name,
                order_number=wo.order_number,
                plates=vehicle.plates,
                service_type=a.service_type,
            ),
        )

    wo_dict = {
        "id": wo.id,
        "order_number": wo.order_number,
        "status": wo.status,
        "branch_id": wo.branch_id,
        "vehicle_id": wo.vehicle_id,
        "model_id": wo.model_id,
        "service_id": wo.service_id,
        "received_at": wo.received_at.isoformat() if wo.received_at else None,
    }

    return AppointmentConvertResponse(
        appointment=_to_read(a),
        work_order=wo_dict,
        whatsapp_link=wa_link,
    )
