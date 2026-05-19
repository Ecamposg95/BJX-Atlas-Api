"""add_procurement (Ola 6)

Revision ID: b1ord3r5a
Revises: a2d4f6b8c192
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "b1ord3r5a"
down_revision = "a2d4f6b8c192"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purchase_orders",
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
        sa.Column("folio", sa.String(length=32), nullable=False, index=True),
        sa.Column(
            "supplier_id",
            sa.String(length=36),
            sa.ForeignKey("suppliers.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="draft",
            index=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("expected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "approved_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "received_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "created_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
    )
    op.create_index(
        "uq_purchase_orders_branch_folio",
        "purchase_orders",
        ["branch_id", "folio"],
        unique=True,
    )
    op.create_index(
        "ix_purchase_orders_branch_status",
        "purchase_orders",
        ["branch_id", "status"],
    )

    op.create_table(
        "purchase_order_items",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "purchase_order_id",
            sa.String(length=36),
            sa.ForeignKey("purchase_orders.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "part_id",
            sa.String(length=36),
            sa.ForeignKey("parts.id", ondelete="RESTRICT"),
            nullable=False,
            index=True,
        ),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), nullable=False),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("purchase_order_items")
    op.drop_index("ix_purchase_orders_branch_status", table_name="purchase_orders")
    op.drop_index("uq_purchase_orders_branch_folio", table_name="purchase_orders")
    op.drop_table("purchase_orders")
