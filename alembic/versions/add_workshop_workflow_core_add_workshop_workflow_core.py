"""add_workshop_workflow_core

Revision ID: add_workshop_workflow_core
Revises: c4f1a8b3d502
Create Date: 2026-05-18
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "add_workshop_workflow_core"
down_revision = "c4f1a8b3d502"
branch_labels = None
depends_on = None


def _is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def upgrade() -> None:
    # 1. Convertir status de Enum a VARCHAR(32)
    with op.batch_alter_table("work_orders") as batch:
        batch.alter_column(
            "status",
            existing_type=sa.Enum(
                "received", "in_progress", "waiting_parts", "completed", "delivered",
                name="workorderstatus",
            ),
            type_=sa.String(length=32),
            existing_nullable=False,
            postgresql_using="status::text",
        )

    if not _is_sqlite():
        op.execute("DROP TYPE IF EXISTS workorderstatus")

    # 2. Cols nuevas en work_orders
    op.add_column("work_orders", sa.Column("type", sa.String(length=32), nullable=False, server_default="walk_in"))
    op.add_column("work_orders", sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"))
    op.add_column("work_orders", sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("work_orders", sa.Column("promised_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("work_orders", sa.Column("customer_id", sa.String(length=36), nullable=True))
    op.add_column("work_orders", sa.Column("tow_provider", sa.String(length=120), nullable=True))
    op.add_column("work_orders", sa.Column("entry_mileage", sa.Integer(), nullable=True))
    op.add_column("work_orders", sa.Column("exit_mileage", sa.Integer(), nullable=True))
    op.add_column("work_orders", sa.Column("portal_token", sa.String(length=64), nullable=True))

    op.create_index("ix_work_orders_type", "work_orders", ["type"])
    op.create_index("ix_work_orders_priority", "work_orders", ["priority"])
    op.create_index("ix_work_orders_scheduled_at", "work_orders", ["scheduled_at"])
    op.create_index("ix_work_orders_branch_status", "work_orders", ["branch_id", "status"])
    op.create_index("ix_work_orders_branch_received", "work_orders", ["branch_id", "received_at"])

    # portal_token unique parcial (solo cuando no es NULL)
    if _is_sqlite():
        op.execute(
            "CREATE UNIQUE INDEX ix_work_orders_portal_token ON work_orders(portal_token) "
            "WHERE portal_token IS NOT NULL"
        )
    else:
        op.create_index(
            "ix_work_orders_portal_token",
            "work_orders",
            ["portal_token"],
            unique=True,
            postgresql_where=sa.text("portal_token IS NOT NULL"),
        )

    # 3. Cols nuevas en services
    op.add_column("services", sa.Column("required_level", sa.String(length=16), nullable=False, server_default="junior"))
    op.add_column("services", sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("services", sa.Column("approved_by", sa.String(length=36), nullable=True))
    op.add_column("services", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("services", sa.Column("proposed_by", sa.String(length=36), nullable=True))
    op.add_column("services", sa.Column("proposal_id", sa.String(length=36), nullable=True))

    op.create_index("ix_services_required_level", "services", ["required_level"])
    op.create_index("ix_services_approved", "services", ["approved"])

    # 4. work_order_status_history
    op.create_table(
        "work_order_status_history",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("branch_id", sa.String(length=36), sa.ForeignKey("branches.id", ondelete="SET NULL"), index=True),
        sa.Column("work_order_id", sa.String(length=36), sa.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=False),
        sa.Column("changed_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_wo_status_history_wo_occurred", "work_order_status_history", ["work_order_id", "occurred_at"])

    # 5. mechanic_profiles
    op.create_table(
        "mechanic_profiles",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("branch_id", sa.String(length=36), sa.ForeignKey("branches.id", ondelete="SET NULL"), index=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("level", sa.String(length=16), nullable=False, server_default="junior"),
        sa.Column("employee_number", sa.String(length=32), nullable=True, index=True),
        sa.Column("hire_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hourly_cost", sa.Float(), nullable=True),
        sa.Column("capacity_hrs_day", sa.Float(), nullable=False, server_default="8.0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_mechanic_profiles_level", "mechanic_profiles", ["level"])

    # 6. mechanic_skills
    op.create_table(
        "mechanic_skills",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("mechanic_profile_id", sa.String(length=36), sa.ForeignKey("mechanic_profiles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(length=32), nullable=False, index=True),
        sa.Column("proficiency", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("certified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("uq_mechanic_skill", "mechanic_skills", ["mechanic_profile_id", "category"], unique=True)

    # 7. assignments
    op.create_table(
        "assignments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("branch_id", sa.String(length=36), sa.ForeignKey("branches.id", ondelete="SET NULL"), index=True),
        sa.Column("work_order_id", sa.String(length=36), sa.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("work_order_line_id", sa.String(length=36), sa.ForeignKey("work_order_lines.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("mechanic_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("assigned_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("override_level_check", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_assignments_active", "assignments", ["work_order_id", "status"])
    op.create_index("ix_assignments_mechanic_active", "assignments", ["mechanic_id", "status"])

    # Unique partial index — solo un Assignment.active por línea
    op.execute(
        "CREATE UNIQUE INDEX uq_assignments_one_active_per_line "
        "ON assignments(work_order_id, COALESCE(work_order_line_id, '')) "
        "WHERE status = 'active'"
    )

    # 8. work_order_findings
    op.create_table(
        "work_order_findings",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("branch_id", sa.String(length=36), sa.ForeignKey("branches.id", ondelete="SET NULL"), index=True),
        sa.Column("work_order_id", sa.String(length=36), sa.ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("work_order_line_id", sa.String(length=36), sa.ForeignKey("work_order_lines.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("reported_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("suggested_service_id", sa.String(length=36), sa.ForeignKey("services.id", ondelete="SET NULL"), nullable=True),
        sa.Column("estimated_extra_hrs", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("reviewed_by", sa.String(length=36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("resulting_line_id", sa.String(length=36), sa.ForeignKey("work_order_lines.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_findings_branch_status", "work_order_findings", ["branch_id", "status"])

    # 9. idempotency_keys
    op.create_table(
        "idempotency_keys",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("key", sa.String(length=128), nullable=False, unique=True, index=True),
        sa.Column("endpoint", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True, index=True),
        sa.Column("request_hash", sa.String(length=128), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=False),
        sa.Column("response_body", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )

    # 10. Backfill work_order_status_history
    if _is_sqlite():
        op.execute(
            """
            INSERT INTO work_order_status_history
                (id, branch_id, work_order_id, from_status, to_status, occurred_at, created_at)
            SELECT
                lower(hex(randomblob(16))),
                wo.branch_id,
                wo.id,
                NULL,
                wo.status,
                COALESCE(wo.received_at, wo.created_at),
                COALESCE(wo.received_at, wo.created_at)
            FROM work_orders wo
            WHERE NOT EXISTS (
                SELECT 1 FROM work_order_status_history h WHERE h.work_order_id = wo.id
            )
            """
        )
    else:
        op.execute(
            """
            INSERT INTO work_order_status_history
                (id, branch_id, work_order_id, from_status, to_status, occurred_at, created_at)
            SELECT
                gen_random_uuid()::text,
                wo.branch_id,
                wo.id,
                NULL,
                wo.status,
                COALESCE(wo.received_at, wo.created_at),
                COALESCE(wo.received_at, wo.created_at)
            FROM work_orders wo
            WHERE NOT EXISTS (
                SELECT 1 FROM work_order_status_history h WHERE h.work_order_id = wo.id
            )
            """
        )


def downgrade() -> None:
    op.drop_table("idempotency_keys")
    op.drop_index("ix_findings_branch_status", table_name="work_order_findings")
    op.drop_table("work_order_findings")

    op.execute("DROP INDEX IF EXISTS uq_assignments_one_active_per_line")
    op.drop_index("ix_assignments_mechanic_active", table_name="assignments")
    op.drop_index("ix_assignments_active", table_name="assignments")
    op.drop_table("assignments")

    op.drop_index("uq_mechanic_skill", table_name="mechanic_skills")
    op.drop_table("mechanic_skills")

    op.drop_index("ix_mechanic_profiles_level", table_name="mechanic_profiles")
    op.drop_table("mechanic_profiles")

    op.drop_index("ix_wo_status_history_wo_occurred", table_name="work_order_status_history")
    op.drop_table("work_order_status_history")

    op.drop_index("ix_services_approved", table_name="services")
    op.drop_index("ix_services_required_level", table_name="services")
    op.drop_column("services", "proposal_id")
    op.drop_column("services", "proposed_by")
    op.drop_column("services", "approved_at")
    op.drop_column("services", "approved_by")
    op.drop_column("services", "approved")
    op.drop_column("services", "required_level")

    op.execute("DROP INDEX IF EXISTS ix_work_orders_portal_token")
    op.drop_index("ix_work_orders_branch_received", table_name="work_orders")
    op.drop_index("ix_work_orders_branch_status", table_name="work_orders")
    op.drop_index("ix_work_orders_scheduled_at", table_name="work_orders")
    op.drop_index("ix_work_orders_priority", table_name="work_orders")
    op.drop_index("ix_work_orders_type", table_name="work_orders")

    op.drop_column("work_orders", "portal_token")
    op.drop_column("work_orders", "exit_mileage")
    op.drop_column("work_orders", "entry_mileage")
    op.drop_column("work_orders", "tow_provider")
    op.drop_column("work_orders", "customer_id")
    op.drop_column("work_orders", "promised_at")
    op.drop_column("work_orders", "scheduled_at")
    op.drop_column("work_orders", "priority")
    op.drop_column("work_orders", "type")

    with op.batch_alter_table("work_orders") as batch:
        batch.alter_column(
            "status",
            existing_type=sa.String(length=32),
            type_=sa.Enum(
                "received", "in_progress", "waiting_parts", "completed", "delivered",
                name="workorderstatus",
            ),
            existing_nullable=False,
        )
