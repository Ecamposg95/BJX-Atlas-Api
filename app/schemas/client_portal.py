"""Schemas del Portal Cliente público (US-12).

Vista de solo-lectura para que el cliente consulte el estatus de su unidad
usando el folio (order_number) como secret. Sin login, sin tokens.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ClientVehicleInfo(BaseModel):
    """Información básica del vehículo visible al cliente."""

    plates: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ClientTimelineEntry(BaseModel):
    """Entrada del historial de cambios de estatus."""

    status: str
    timestamp: datetime
    note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ClientServiceLine(BaseModel):
    """Servicio/línea de trabajo de la OS visible al cliente.

    Solo expone label legible y status — nunca costos, mecánico ni notas.
    """

    label: str
    status: str
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ClientStage(BaseModel):
    """Etapa del flujo de servicio con porcentaje completado."""

    key: str
    label: str
    pct: int
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ClientUnitView(BaseModel):
    """Vista pública del estatus de una unidad para el portal cliente.

    Contiene solo campos seguros: nunca expone costos, precios, datos de
    proveedor, ni información de contacto del cliente o mecánico.
    """

    folio: str
    status: str
    vehicle: ClientVehicleInfo
    received_at: Optional[datetime] = None
    estimated_ready_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    progress_pct: int
    branch_name: Optional[str] = None
    timeline: list[ClientTimelineEntry] = []
    lines: list[ClientServiceLine] = []
    photos: list[str] = []
    stages: list[ClientStage] = []
    eta_text: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
