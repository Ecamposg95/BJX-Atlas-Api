"""add_work_orders_domain

Revision ID: 9a7c8f1d2b10
Revises: 7b2f8c1d9a31
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a7c8f1d2b10"
down_revision: Union[str, None] = "0d8a4e6f3c11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "work_orders",
        sa.Column("order_number", sa.String(length=20), nullable=False),
        sa.Column("vehicle_id", sa.String(length=36), nullable=False),
        sa.Column("model_id", sa.String(length=36), nullable=False),
        sa.Column("service_id", sa.String(length=36), nullable=False),
        sa.Column("assigned_mechanic_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.Enum("received", "in_progress", "waiting_parts", "completed", "delivered", name="workorderstatus", create_type=True, checkfirst=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("work_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("work_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delay_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["assigned_mechanic_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_number", name="uq_work_orders_order_number"),
    )
    op.create_index(op.f("ix_work_orders_assigned_mechanic_id"), "work_orders", ["assigned_mechanic_id"], unique=False)
    op.create_index(op.f("ix_work_orders_model_id"), "work_orders", ["model_id"], unique=False)
    op.create_index(op.f("ix_work_orders_order_number"), "work_orders", ["order_number"], unique=True)
    op.create_index(op.f("ix_work_orders_service_id"), "work_orders", ["service_id"], unique=False)
    op.create_index(op.f("ix_work_orders_status"), "work_orders", ["status"], unique=False)
    op.create_index(op.f("ix_work_orders_vehicle_id"), "work_orders", ["vehicle_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_work_orders_vehicle_id"), table_name="work_orders")
    op.drop_index(op.f("ix_work_orders_status"), table_name="work_orders")
    op.drop_index(op.f("ix_work_orders_service_id"), table_name="work_orders")
    op.drop_index(op.f("ix_work_orders_order_number"), table_name="work_orders")
    op.drop_index(op.f("ix_work_orders_model_id"), table_name="work_orders")
    op.drop_index(op.f("ix_work_orders_assigned_mechanic_id"), table_name="work_orders")
    op.drop_table("work_orders")
    op.execute("DROP TYPE IF EXISTS workorderstatus")
