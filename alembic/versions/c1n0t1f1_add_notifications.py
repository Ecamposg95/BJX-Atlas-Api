"""add_notifications

Revision ID: c1n0t1f1
Revises: f1c4a9e7b203
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "c1n0t1f1"
down_revision = "f1c4a9e7b203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "user_id",
            sa.String(length=36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("kind", sa.String(length=32), nullable=False, index=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("link_url", sa.String(length=500), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "branch_id",
            sa.String(length=36),
            sa.ForeignKey("branches.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=36), nullable=True),
    )
    op.create_index(
        "ix_notifications_user_read",
        "notifications",
        ["user_id", "read_at"],
    )
    op.create_index(
        "ix_notifications_user_created",
        "notifications",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")
