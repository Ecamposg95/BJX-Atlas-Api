"""Construcción de links de notificación a clientes (WhatsApp wa.me)."""
from __future__ import annotations

import re
from urllib.parse import quote
from typing import Optional


_DIGITS_RE = re.compile(r"\D+")


def normalize_phone(phone: str) -> str:
    """Devuelve solo dígitos. Si empieza con 0+ lo limpiamos.

    wa.me espera el número completo con código de país sin +/-/() etc.
    Para MX se sugiere prefijar 521.
    """
    digits = _DIGITS_RE.sub("", phone or "")
    return digits


def build_whatsapp_link(phone: str, message: str) -> Optional[str]:
    """Construye un link wa.me con teléfono y mensaje URL-encoded.

    Si `phone` queda vacío tras normalizar, retorna None.
    """
    digits = normalize_phone(phone)
    if not digits:
        return None
    encoded = quote(message or "", safe="")
    return f"https://wa.me/{digits}?text={encoded}"


def build_appointment_confirmation_message(
    *,
    customer_name: str,
    order_number: str,
    plates: Optional[str],
    service_type: Optional[str] = None,
) -> str:
    parts = [
        f"Hola {customer_name},",
        f"Tu orden de servicio {order_number} ha sido registrada en BJX Motors.",
    ]
    if plates:
        parts.append(f"Vehículo: {plates}.")
    if service_type:
        parts.append(f"Servicio: {service_type}.")
    parts.append("Te avisaremos del avance. Gracias.")
    return " ".join(parts)


def build_delivery_message(
    *,
    customer_name: str,
    order_number: str,
    plates: Optional[str],
) -> str:
    parts = [
        f"Hola {customer_name},",
        f"Tu vehículo {plates or ''} (OS {order_number}) está listo para entrega.",
        "Adjuntamos acuse digital. Gracias por preferirnos.",
    ]
    return " ".join(p for p in parts if p)
