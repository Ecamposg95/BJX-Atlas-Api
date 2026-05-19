"""add_service_proposals

Revision ID: b2pr0p05a
Revises: b1ord3r5a
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "b2pr0p05a"
down_revision = "b1ord3r5a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_proposals",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "branch_id",
            sa.String(length=36),
            sa.ForeignKey("branches.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "work_order_id",
            sa.String(length=36),
            sa.ForeignKey("work_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "service_id",
            sa.String(length=36),
            sa.ForeignKey("services.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("service_name", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("estimated_hours", sa.Numeric(10, 2), nullable=True),
        sa.Column("estimated_parts_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("estimated_total", sa.Numeric(12, 2), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column(
            "proposed_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("proposed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "reviewed_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column(
            "materialized_line_id",
            sa.String(length=36),
            sa.ForeignKey("work_order_lines.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_service_proposals_work_order_id",
        "service_proposals",
        ["work_order_id"],
    )
    op.create_index(
        "ix_service_proposals_status",
        "service_proposals",
        ["status"],
    )
    op.create_index(
        "ix_service_proposals_branch_id",
        "service_proposals",
        ["branch_id"],
    )
    op.create_index(
        "ix_service_proposals_proposed_by_id",
        "service_proposals",
        ["proposed_by_id"],
    )
    op.create_index(
        "ix_service_proposals_service_id",
        "service_proposals",
        ["service_id"],
    )
    op.create_index(
        "ix_service_proposals_branch_status",
        "service_proposals",
        ["branch_id", "status"],
    )
    op.create_index(
        "ix_service_proposals_wo_status",
        "service_proposals",
        ["work_order_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_service_proposals_wo_status", table_name="service_proposals")
    op.drop_index("ix_service_proposals_branch_status", table_name="service_proposals")
    op.drop_index("ix_service_proposals_service_id", table_name="service_proposals")
    op.drop_index("ix_service_proposals_proposed_by_id", table_name="service_proposals")
    op.drop_index("ix_service_proposals_branch_id", table_name="service_proposals")
    op.drop_index("ix_service_proposals_status", table_name="service_proposals")
    op.drop_index("ix_service_proposals_work_order_id", table_name="service_proposals")
    op.drop_table("service_proposals")
