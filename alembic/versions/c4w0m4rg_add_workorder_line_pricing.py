"""add_workorder_line_pricing

Adds pricing columns to ``work_order_lines`` and total/margin columns to
``work_orders`` to close Wave 4 (real margin per OS).

All columns are nullable; populated by ``app.services.work_order_pricing``
when lines complete or the work order closes.

Revision ID: c4w0m4rg
Revises: b2pr0p05a
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "c4w0m4rg"
down_revision = "c0d3p_0p"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("work_order_lines") as batch_op:
        batch_op.add_column(sa.Column("unit_price_mxn", sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column("unit_cost_mxn", sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column("total_price_mxn", sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column("total_cost_mxn", sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column("margin_pct", sa.Numeric(6, 4), nullable=True))

    with op.batch_alter_table("work_orders") as batch_op:
        batch_op.add_column(sa.Column("total_amount", sa.Numeric(14, 2), nullable=True))
        batch_op.add_column(sa.Column("cost_total", sa.Numeric(14, 2), nullable=True))
        batch_op.add_column(sa.Column("margin_pct", sa.Numeric(6, 4), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("work_orders") as batch_op:
        batch_op.drop_column("margin_pct")
        batch_op.drop_column("cost_total")
        batch_op.drop_column("total_amount")

    with op.batch_alter_table("work_order_lines") as batch_op:
        batch_op.drop_column("margin_pct")
        batch_op.drop_column("total_cost_mxn")
        batch_op.drop_column("total_price_mxn")
        batch_op.drop_column("unit_cost_mxn")
        batch_op.drop_column("unit_price_mxn")
