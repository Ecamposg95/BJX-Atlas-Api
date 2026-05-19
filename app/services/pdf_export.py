"""Generación de PDFs de acuse de entrega.

Implementación basada en ReportLab (ya en deps). Si en el futuro se prefiere
HTML→PDF con WeasyPrint, sustituir aquí sin tocar los routers.
"""
from __future__ import annotations

import base64
import io
import re
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from app.models.deliveries import Delivery
from app.models.organizations import Branch
from app.models.users import User
from app.models.vehicles import Vehicle
from app.models.work_orders import WorkOrder
from app.services.storage import get_storage


_DATA_URI_RE = re.compile(r"^data:image/[a-zA-Z0-9.+-]+;base64,(?P<b64>.*)$", re.DOTALL)


def _signature_image_flowable(delivery: Delivery) -> Optional[Image]:
    """Recupera la firma desde storage y la convierte en flowable de ReportLab."""
    if not delivery.signature_storage_key:
        return None
    try:
        storage = get_storage()
        if not storage.exists(delivery.signature_storage_key):
            return None
        # No todos los backends exponen download; usamos read directo si LocalStorage
        backend = storage
        if hasattr(backend, "download"):
            sig_bytes = backend.download(delivery.signature_storage_key)  # type: ignore[attr-defined]
        else:
            # Fallback: LocalStorageBackend escribe a disco; reconstruir path
            from app.services.storage.local_backend import LocalStorageBackend

            if isinstance(backend, LocalStorageBackend):
                path = backend._abs_path(delivery.signature_storage_key)  # type: ignore[attr-defined]
                with open(path, "rb") as fh:
                    sig_bytes = fh.read()
            else:
                return None
        img = Image(io.BytesIO(sig_bytes), width=3.0 * inch, height=1.2 * inch)
        return img
    except Exception:
        return None


def render_delivery_acuse(db: Session, delivery_id: str) -> bytes:
    """Renderiza acuse PDF a bytes."""
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if delivery is None:
        raise ValueError(f"Delivery {delivery_id} no encontrado")

    wo = db.query(WorkOrder).filter(WorkOrder.id == delivery.work_order_id).first()
    if wo is None:
        raise ValueError(f"WorkOrder {delivery.work_order_id} no encontrada")

    vehicle = db.query(Vehicle).filter(Vehicle.id == wo.vehicle_id).first()
    branch = db.query(Branch).filter(Branch.id == wo.branch_id).first()
    delivered_by = (
        db.query(User).filter(User.id == delivery.delivered_by_id).first()
        if delivery.delivered_by_id
        else None
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
        title=f"Acuse de entrega — OS {wo.order_number}",
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "Title",
        parent=styles["Heading1"],
        fontSize=18,
        spaceAfter=4,
        textColor=colors.HexColor("#1E3A5F"),
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#6B7280"),
        spaceAfter=2,
    )
    value_style = ParagraphStyle(
        "Value",
        parent=styles["Normal"],
        fontSize=11,
        spaceAfter=8,
    )

    elements: list = []
    elements.append(Paragraph("BJX Motors — Acuse de entrega", title_style))
    if branch:
        elements.append(Paragraph(branch.name, styles["Normal"]))
    elements.append(Spacer(1, 0.15 * inch))

    # Bloque de datos
    info_rows = [
        ["Orden de servicio", wo.order_number],
        ["Fecha de entrega", delivery.delivered_at.strftime("%Y-%m-%d %H:%M")],
        ["Cliente", delivery.customer_name or (vehicle.customer_name if vehicle else "—")],
    ]
    if delivery.customer_id_type and delivery.customer_id_number:
        info_rows.append(
            [f"Identificación ({delivery.customer_id_type})", delivery.customer_id_number]
        )
    if vehicle:
        plates = vehicle.plates or "—"
        info_rows.append(["Placas", plates])
        veh_desc = " ".join(filter(None, [vehicle.brand, vehicle.model, str(vehicle.year or "")])).strip() or "—"
        info_rows.append(["Vehículo", veh_desc])
        if wo.exit_mileage is not None:
            info_rows.append(["Kilometraje de salida", f"{wo.exit_mileage:,}"])
    if delivered_by:
        info_rows.append(["Entregado por", delivered_by.email])

    info_table = Table(info_rows, colWidths=[2.0 * inch, 4.5 * inch])
    info_table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#374151")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ]
        )
    )
    elements.append(info_table)
    elements.append(Spacer(1, 0.3 * inch))

    # Descripción servicios (notes de OS)
    if wo.notes:
        elements.append(Paragraph("Servicios y observaciones", styles["Heading2"]))
        for line in wo.notes.splitlines():
            if line.strip():
                elements.append(Paragraph(line.strip(), styles["Normal"]))
        elements.append(Spacer(1, 0.2 * inch))

    # Conformidad
    conf_text = (
        "Recibo el vehículo en correctas condiciones y manifiesto conformidad "
        "con los servicios realizados conforme a esta orden."
    )
    elements.append(Paragraph(conf_text, styles["Normal"]))
    elements.append(Spacer(1, 0.25 * inch))

    # Firma
    elements.append(Paragraph("Firma del cliente", label_style))
    sig_img = _signature_image_flowable(delivery)
    if sig_img is not None:
        elements.append(sig_img)
    else:
        elements.append(Paragraph("(firma capturada digitalmente)", value_style))

    elements.append(Spacer(1, 0.1 * inch))
    elements.append(
        Paragraph(
            f"<b>{delivery.customer_name}</b>",
            styles["Normal"],
        )
    )

    doc.build(elements)
    buffer.seek(0)
    return buffer.read()
