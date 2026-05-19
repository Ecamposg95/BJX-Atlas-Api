"""add_customer_id_to_users

Revision ID: a2d4f6b8c192
Revises: f1c4a9e7b203
Create Date: 2026-05-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "a2d4f6b8c192"
down_revision = "c1n0t1f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("customer_id", sa.String(length=36), nullable=True))
    op.create_index(
        "ix_users_customer_id",
        "users",
        ["customer_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_users_customer_id", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("customer_id")
