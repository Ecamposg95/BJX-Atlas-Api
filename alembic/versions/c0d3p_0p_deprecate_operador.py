"""deprecate_operador role

Migra todos los usuarios con role='operador' a role='recepcion'. El valor
SQL del rol se conserva en el enum (Postgres ALTER TYPE drop value es
invasivo y arriesga romper sesiones activas); sólo se reasignan los datos.

Revision ID: c0d3p_0p
Revises: b2pr0p05a
Create Date: 2026-05-19
"""
from __future__ import annotations

from alembic import op


revision = "c0d3p_0p"
down_revision = "b2pr0p05a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Reasignación idempotente: cualquier usuario operador legacy → recepcion.
    op.execute(
        "UPDATE users SET role = 'recepcion' WHERE role = 'operador'"
    )


def downgrade() -> None:
    # Sin downgrade: la deprecación es definitiva. Si se requiere revertir,
    # restaurar manualmente desde backup. Dejamos no-op para que `alembic
    # downgrade` no falle.
    pass
