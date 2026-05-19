"""MobileEvidence — uploads desde la app mobile del asesor (US-09).

Modelo independiente del existente `app.models.workshop.Evidence` (que asocia
Documents formales a OS y/o líneas). Este es para evidencias rápidas tomadas con
la cámara del tablet/teléfono: fotos de daño en recepción, recibos de refacciones
en almacén, hallazgos de mecánico. Reutilizable por los sprints 1.1 (almacén)
y 1.3 (mecánico hallazgos).
"""
from __future__ import annotations

import enum

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text

from app.database import Base
from app.models.mixins import AuditMixin, BranchScopedMixin, UUIDMixin


class MobileEvidenceKind(str, enum.Enum):
    damage_photo = "damage_photo"
    parts_receipt = "parts_receipt"
    finding_photo = "finding_photo"


class MobileEvidence(Base, UUIDMixin, AuditMixin, BranchScopedMixin):
    """Evidencia fotográfica tomada desde cliente mobile.

    `work_order_id` es opcional: cuando se sube ANTES de crear la OS (flujo
    típico del check-in) el cliente luego puede asociarla por update — en MVP
    aceptamos que se envíe nullable y se vincule por separado.
    """

    __tablename__ = "mobile_evidence"

    kind = Column(String(32), nullable=False, index=True)
    storage_key = Column(String(500), nullable=False, unique=True)
    public_url = Column(String(500), nullable=True)
    work_order_id = Column(
        String(36),
        ForeignKey("work_orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    note = Column(Text, nullable=True)
    mime_type = Column(String(64), nullable=True)
    size_bytes = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_mobile_evidence_branch_kind", "branch_id", "kind"),
    )
