"""Tests para servicio de notificaciones WhatsApp (Wave 4 — Módulo 5)."""
from __future__ import annotations

from app.services.notifications import (
    build_appointment_confirmation_message,
    build_delivery_message,
    build_whatsapp_link,
    normalize_phone,
)


def test_normalize_phone_strips_non_digits():
    assert normalize_phone("+52 (155) 1234-5678") == "5215512345678"
    assert normalize_phone("") == ""
    assert normalize_phone("abcd") == ""


def test_build_whatsapp_link_encodes_message():
    link = build_whatsapp_link("521 5512345678", "Hola: ¿cómo estás?")
    assert link is not None
    assert link.startswith("https://wa.me/5215512345678?text=")
    assert "%C3%B3" in link  # ó encoded


def test_build_whatsapp_link_empty_phone_returns_none():
    assert build_whatsapp_link("", "hola") is None
    assert build_whatsapp_link("---", "hola") is None


def test_build_appointment_message_contains_data():
    msg = build_appointment_confirmation_message(
        customer_name="Juan",
        order_number="WO-1",
        plates="ABC-123",
        service_type="Frenos",
    )
    assert "Juan" in msg
    assert "WO-1" in msg
    assert "ABC-123" in msg
    assert "Frenos" in msg


def test_build_delivery_message():
    msg = build_delivery_message(customer_name="Ana", order_number="WO-2", plates="XYZ-9")
    assert "Ana" in msg
    assert "WO-2" in msg
    assert "XYZ-9" in msg
