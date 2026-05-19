"""us07_service_approval_workflow

Revision ID: d7a3c1e2f481
Revises: add_workshop_workflow_core
Create Date: 2026-05-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "d7a3c1e2f481"
down_revision = "add_workshop_workflow_core"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Columnas simples (sin FK) primero
    with op.batch_alter_table("services") as batch:
        batch.add_column(
            sa.Column(
                "status",
                sa.String(length=16),
                nullable=False,
                server_default="approved",
            )
        )
        batch.add_column(
            sa.Column("rejection_reason", sa.String(length=500), nullable=True)
        )

    # FKs separadas para evitar CircularDependencyError en batch SQLite
    with op.batch_alter_table("services") as batch:
        batch.add_column(
            sa.Column(
                "approved_by_id",
                sa.String(length=36),
                sa.ForeignKey(
                    "users.id",
                    ondelete="SET NULL",
                    name="fk_services_approved_by_id_users",
                ),
                nullable=True,
            )
        )

    with op.batch_alter_table("services") as batch:
        batch.add_column(
            sa.Column(
                "proposed_by_id",
                sa.String(length=36),
                sa.ForeignKey(
                    "users.id",
                    ondelete="SET NULL",
                    name="fk_services_proposed_by_id_users",
                ),
                nullable=True,
            )
        )

    op.create_index("ix_services_status", "services", ["status"])

    # Backfill: filas existentes quedan como approved (server_default ya lo cubre,
    # pero forzamos UPDATE explícito por idempotencia y para limpiar NULL eventuales).
    op.execute("UPDATE services SET status = 'approved' WHERE status IS NULL OR status = ''")


def downgrade() -> None:
    op.drop_index("ix_services_status", table_name="services")
    with op.batch_alter_table("services") as batch:
        batch.drop_column("rejection_reason")
        batch.drop_column("proposed_by_id")
        batch.drop_column("approved_by_id")
        batch.drop_column("status")
