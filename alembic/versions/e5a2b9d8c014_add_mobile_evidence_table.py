"""add_mobile_evidence_table

Revision ID: e5a2b9d8c014
Revises: d7a3c1e2f481
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "e5a2b9d8c014"
down_revision = "d7a3c1e2f481"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mobile_evidence",
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
        sa.Column("kind", sa.String(length=32), nullable=False, index=True),
        sa.Column("storage_key", sa.String(length=500), nullable=False, unique=True),
        sa.Column("public_url", sa.String(length=500), nullable=True),
        sa.Column(
            "work_order_id",
            sa.String(length=36),
            sa.ForeignKey("work_orders.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "uploaded_by_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.String(length=64), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_mobile_evidence_branch_kind",
        "mobile_evidence",
        ["branch_id", "kind"],
    )


def downgrade() -> None:
    op.drop_index("ix_mobile_evidence_branch_kind", table_name="mobile_evidence")
    op.drop_table("mobile_evidence")
