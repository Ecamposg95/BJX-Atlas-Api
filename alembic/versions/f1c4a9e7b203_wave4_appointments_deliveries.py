"""wave4_appointments_deliveries

Revision ID: f1c4a9e7b203
Revises: e5a2b9d8c014
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "f1c4a9e7b203"
down_revision = "e5a2b9d8c014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "appointments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "branch_id",
            sa.String(length=36),
            sa.ForeignKey("branches.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("customer_name", sa.String(length=255), nullable=False, index=True),
        sa.Column("customer_phone", sa.String(length=64), nullable=True, index=True),
        sa.Column("vehicle_plates", sa.String(length=50), nullable=True, index=True),
        sa.Column(
            "vehicle_model_id",
            sa.String(length=36),
            sa.ForeignKey("models.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("service_type", sa.String(length=120), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="scheduled",
            index=True,
        ),
        sa.Column(
            "work_order_id",
            sa.String(length=36),
            sa.ForeignKey("work_orders.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "deliveries",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "branch_id",
            sa.String(length=36),
            sa.ForeignKey("branches.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "work_order_id",
            sa.String(length=36),
            sa.ForeignKey("work_orders.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("customer_name", sa.String(length=255), nullable=False),
        sa.Column("customer_id_type", sa.String(length=32), nullable=True),
        sa.Column("customer_id_number", sa.String(length=64), nullable=True),
        sa.Column("signature_url", sa.String(length=500), nullable=False),
        sa.Column("signature_storage_key", sa.String(length=500), nullable=True),
        sa.Column("pdf_url", sa.String(length=500), nullable=True),
        sa.Column("pdf_storage_key", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "delivered_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("deliveries")
    op.drop_table("appointments")
