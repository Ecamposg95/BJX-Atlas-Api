"""Entrega final con firma + acuse PDF (Módulos 3 y 4 — Wave 4)."""
from __future__ import annotations

import io
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.deliveries import Delivery
from app.models.evidence import MobileEvidence
from app.models.users import User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.schemas.deliveries import (
    DeliverResponse,
    DeliverWithSignatureRequest,
    DeliveryRead,
)
from app.security.permissions import Permission, has_permission
from app.security.tenant import TenantContext, assert_branch_access, get_tenant_context
from app.services.notifications import build_delivery_message, build_whatsapp_link
from app.services.pdf_export import render_delivery_acuse
from app.services.signature import save_pdf, save_signature
from app.services.state_machines import Forbidden as SMForbidden
from app.services.state_machines import InvalidTransition
from app.services.state_machines.work_order_sm import transition as wo_transition


router = APIRouter(prefix="/v1/work-orders", tags=["deliveries"])


def _get_wo_or_404(db: Session, wo_id: str, ctx: TenantContext) -> WorkOrder:
    wo = db.query(WorkOrder).filter(WorkOrder.id == wo_id).first()
    if wo is None:
        raise HTTPException(404, "OS no encontrada")
    assert_branch_access(wo.branch_id, ctx)
    return wo


@router.post("/{work_order_id}/deliver-with-signature", response_model=DeliverResponse)
def deliver_with_signature(
    work_order_id: str,
    payload: DeliverWithSignatureRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    wo = _get_wo_or_404(db, work_order_id, ctx)
    if not has_permission(ctx.user, Permission.WORK_ORDER_DELIVER):
        raise HTTPException(403, "No tienes permiso para entregar la OS")

    if wo.status == WorkOrderStatus.delivered.value:
        raise HTTPException(409, "OS ya entregada")

    # Si está en quality_check, avanzar a completed antes de delivered
    if wo.status == WorkOrderStatus.quality_check.value:
        try:
            wo_transition(
                db,
                work_order=wo,
                to_status=WorkOrderStatus.completed,
                actor=ctx.user,
                reason="QA implícita al entregar",
            )
        except (InvalidTransition, SMForbidden):
            pass

    # Si aún no está completed, forzar transición vía SM
    if wo.status != WorkOrderStatus.completed.value:
        raise HTTPException(
            409,
            f"OS debe estar 'completed' antes de entregar (actual: {wo.status})",
        )

    if payload.exit_mileage is not None:
        wo.exit_mileage = payload.exit_mileage

    # 1. Guardar firma en storage
    try:
        sig = save_signature(
            branch_id=wo.branch_id,
            work_order_id=wo.id,
            signature_base64=payload.signature_base64,
        )
    except ValueError as e:
        raise HTTPException(422, f"Firma inválida: {e}") from e

    # 2. Crear Delivery record (sin pdf_url aún)
    delivery = Delivery(
        branch_id=wo.branch_id,
        work_order_id=wo.id,
        customer_name=payload.customer_name,
        customer_id_type=payload.customer_id_type,
        customer_id_number=payload.customer_id_number,
        signature_url=sig["url"],
        signature_storage_key=sig["storage_key"],
        notes=payload.notes,
        delivered_at=datetime.now(timezone.utc),
        delivered_by_id=ctx.user.id,
    )
    db.add(delivery)
    db.flush()

    # 3. Vincular evidencias adicionales si vienen
    if payload.evidence_ids:
        for ev_id in payload.evidence_ids:
            ev = db.query(MobileEvidence).filter(MobileEvidence.id == ev_id).first()
            if ev is not None:
                assert_branch_access(ev.branch_id, ctx)
                ev.work_order_id = wo.id

    # 4. Transition WO a delivered via SM
    try:
        wo_transition(
            db,
            work_order=wo,
            to_status=WorkOrderStatus.delivered,
            actor=ctx.user,
            reason=None,
        )
    except InvalidTransition as e:
        raise HTTPException(409, detail={"error": {"code": e.code, "detail": e.detail}})
    except SMForbidden as e:
        raise HTTPException(403, detail={"error": {"code": e.code, "detail": e.detail}})

    # Notificar a recepción que la OS quedó delivered (delivery_ready cierre)
    try:
        from app.services.notification_wiring import notify_delivery_ready
        notify_delivery_ready(db, wo=wo, background_tasks=background_tasks)
    except Exception:  # noqa: BLE001
        pass

    db.commit()
    db.refresh(delivery)
    db.refresh(wo)

    # 5. Generar PDF y guardarlo
    pdf_url = None
    try:
        pdf_bytes = render_delivery_acuse(db, delivery.id)
        saved = save_pdf(
            branch_id=wo.branch_id,
            work_order_id=wo.id,
            pdf_bytes=pdf_bytes,
        )
        delivery.pdf_url = saved["url"]
        delivery.pdf_storage_key = saved["storage_key"]
        db.commit()
        db.refresh(delivery)
        pdf_url = delivery.pdf_url
    except Exception:
        # Si falla la generación, el endpoint /acuse.pdf siempre puede regenerar.
        pdf_url = None

    # 6. WhatsApp link
    wa_link = None
    vehicle = db.query(Vehicle).filter(Vehicle.id == wo.vehicle_id).first()
    plates = vehicle.plates if vehicle else None
    contact = (vehicle.contact if vehicle else None) or ""
    if contact:
        wa_link = build_whatsapp_link(
            contact,
            build_delivery_message(
                customer_name=payload.customer_name,
                order_number=wo.order_number,
                plates=plates,
            ),
        )

    wo_dict = {
        "id": wo.id,
        "order_number": wo.order_number,
        "status": wo.status,
        "branch_id": wo.branch_id,
        "closed_at": wo.closed_at.isoformat() if wo.closed_at else None,
    }

    return DeliverResponse(
        delivery=DeliveryRead.model_validate(delivery),
        work_order=wo_dict,
        pdf_url=pdf_url,
        whatsapp_link=wa_link,
    )


@router.get("/{work_order_id}/acuse.pdf")
def get_acuse_pdf(
    work_order_id: str,
    db: Session = Depends(get_db),
    ctx: TenantContext = Depends(get_tenant_context),
):
    """Genera (o regenera) el PDF de acuse de entrega para una OS."""
    wo = _get_wo_or_404(db, work_order_id, ctx)
    if not (
        has_permission(ctx.user, Permission.WORK_ORDER_DELIVER)
        or ctx.user.role == "admin"
    ):
        raise HTTPException(403, "No tienes permiso para descargar acuses")

    delivery = (
        db.query(Delivery)
        .filter(Delivery.work_order_id == wo.id, Delivery.deleted_at.is_(None))
        .order_by(Delivery.delivered_at.desc())
        .first()
    )
    if delivery is None:
        raise HTTPException(404, "Esta OS no tiene entrega registrada")

    pdf_bytes = render_delivery_acuse(db, delivery.id)
    filename = f"acuse-OS-{wo.order_number}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
