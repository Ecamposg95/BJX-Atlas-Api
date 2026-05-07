"""multitenancy_foundation_and_erp_modules

Revision ID: c4f1a8b3d502
Revises: 9a7c8f1d2b10
Create Date: 2026-05-06 00:00:00.000000

Sprint 0 + Fase A foundation:
- organizations + branches tables
- BranchScopedMixin rollout: branch_id en vehicles, work_orders, quotes, suppliers, supplier_prices
- users: default_branch_id + role como String (sin enum DB)
- audit_logs append-only
- documents (storage abstracto)
- inventory: warehouses, parts, stock_levels, inventory_movements, inventory_requests
- workshop: service_bays, work_order_lines, evidence

Backfill: crea organization "BJX Motors" + 10 branches placeholder, asigna branch_id por defecto.
"""
from typing import Sequence, Union
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


revision: str = "c4f1a8b3d502"
down_revision: Union[str, None] = "9a7c8f1d2b10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_BRANCH_ID = "00000000-0000-0000-0000-0000000000aa"
DEFAULT_BRANCHES = [
    (DEFAULT_BRANCH_ID, "BJX-MAIN", "BJX Motors — Casa Matriz"),
    ("00000000-0000-0000-0000-0000000000ab", "BJX-LEON", "BJX Motors — León"),
    ("00000000-0000-0000-0000-0000000000ac", "BJX-QRO", "BJX Motors — Querétaro"),
    ("00000000-0000-0000-0000-0000000000ad", "BJX-GDL", "BJX Motors — Guadalajara"),
    ("00000000-0000-0000-0000-0000000000ae", "BJX-CDMX", "BJX Motors — CDMX"),
    ("00000000-0000-0000-0000-0000000000af", "BJX-MTY", "BJX Motors — Monterrey"),
    ("00000000-0000-0000-0000-0000000000b0", "BJX-PUE", "BJX Motors — Puebla"),
    ("00000000-0000-0000-0000-0000000000b1", "BJX-TIJ", "BJX Motors — Tijuana"),
    ("00000000-0000-0000-0000-0000000000b2", "BJX-SLP", "BJX Motors — San Luis Potosí"),
    ("00000000-0000-0000-0000-0000000000b3", "BJX-AGS", "BJX Motors — Aguascalientes"),
]


def _is_postgres() -> bool:
    return op.get_context().dialect.name == "postgresql"


def upgrade() -> None:
    # ---- 1. organizations + branches ----
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_organizations_code"),
    )
    op.create_index("ix_organizations_code", "organizations", ["code"], unique=True)

    op.create_table(
        "branches",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("state", sa.String(length=120), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False, server_default="America/Mexico_City"),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_branches_organization_id", "branches", ["organization_id"], unique=False)
    op.create_index("uq_branches_org_code", "branches", ["organization_id", "code"], unique=True)

    # Seed default org + branches
    now = datetime.now(timezone.utc)
    op.execute(
        sa.text(
            "INSERT INTO organizations (id, code, name, active, created_at) "
            "VALUES (:id, 'BJX', 'BJX Motors', :active, :now)"
        ).bindparams(id=DEFAULT_ORG_ID, active=True, now=now)
    )
    for bid, code, name in DEFAULT_BRANCHES:
        op.execute(
            sa.text(
                "INSERT INTO branches (id, organization_id, code, name, timezone, active, created_at) "
                "VALUES (:id, :org, :code, :name, 'America/Mexico_City', :active, :now)"
            ).bindparams(id=bid, org=DEFAULT_ORG_ID, code=code, name=name, active=True, now=now)
        )

    # ---- 2. users: add default_branch_id + role to String ----
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("default_branch_id", sa.String(length=36), nullable=True))
        batch.alter_column("role", existing_type=sa.String(length=32), type_=sa.String(length=32), existing_nullable=False)
        batch.create_foreign_key("fk_users_default_branch", "branches", ["default_branch_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_users_default_branch_id", "users", ["default_branch_id"], unique=False)
    op.create_index("ix_users_role", "users", ["role"], unique=False)

    # En Postgres, el role ya era ENUM. Convertir a varchar.
    if _is_postgres():
        op.execute("ALTER TABLE users ALTER COLUMN role TYPE varchar(32) USING role::text")
        op.execute("DROP TYPE IF EXISTS role")

    # Asignar default_branch_id a usuarios existentes
    op.execute(sa.text("UPDATE users SET default_branch_id = :b").bindparams(b=DEFAULT_BRANCH_ID))

    # ---- 3. branch_id en tablas operativas existentes ----
    for table in ("vehicles", "work_orders", "quotes", "suppliers", "supplier_prices"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("branch_id", sa.String(length=36), nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET branch_id = :b").bindparams(b=DEFAULT_BRANCH_ID))
        with op.batch_alter_table(table) as batch:
            batch.alter_column("branch_id", existing_type=sa.String(length=36), nullable=False)
            batch.create_foreign_key(f"fk_{table}_branch", "branches", ["branch_id"], ["id"], ondelete="RESTRICT")
        op.create_index(f"ix_{table}_branch_id", table, ["branch_id"], unique=False)

    # ---- 4. audit_logs ----
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("user_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("table_name", sa.String(length=120), nullable=False),
        sa.Column("record_id", sa.String(length=36), nullable=True),
        sa.Column("old_data", sa.JSON(), nullable=True),
        sa.Column("new_data", sa.JSON(), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_branch_id", "audit_logs", ["branch_id"], unique=False)
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"], unique=False)
    op.create_index("ix_audit_logs_table_name", "audit_logs", ["table_name"], unique=False)
    op.create_index("ix_audit_logs_record_id", "audit_logs", ["record_id"], unique=False)
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"], unique=False)
    op.create_index("ix_audit_logs_table_record", "audit_logs", ["table_name", "record_id"], unique=False)

    # ---- 5. documents ----
    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("storage_backend", sa.String(length=32), nullable=False, server_default="r2"),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("owner_type", sa.String(length=64), nullable=True),
        sa.Column("owner_id", sa.String(length=36), nullable=True),
        sa.Column("uploaded_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key", name="uq_documents_storage_key"),
    )
    op.create_index("ix_documents_branch_id", "documents", ["branch_id"], unique=False)
    op.create_index("ix_documents_owner_type", "documents", ["owner_type"], unique=False)
    op.create_index("ix_documents_owner_id", "documents", ["owner_id"], unique=False)
    op.create_index("ix_documents_owner", "documents", ["owner_type", "owner_id"], unique=False)

    # ---- 6. parts ----
    op.create_table(
        "parts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False, server_default="pza"),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("default_supplier_id", sa.String(length=36), nullable=True),
        sa.Column("min_stock", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_stock", sa.Float(), nullable=True),
        sa.Column("lead_time_days", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_unit_cost", sa.Float(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["default_supplier_id"], ["suppliers.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", name="uq_parts_sku"),
    )
    op.create_index("ix_parts_sku", "parts", ["sku"], unique=True)
    op.create_index("ix_parts_name", "parts", ["name"], unique=False)
    op.create_index("ix_parts_category", "parts", ["category"], unique=False)

    # ---- 7. warehouses ----
    op.create_table(
        "warehouses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="main"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_warehouses_branch_id", "warehouses", ["branch_id"], unique=False)
    op.create_index("uq_warehouses_branch_code", "warehouses", ["branch_id", "code"], unique=True)

    # ---- 8. stock_levels ----
    op.create_table(
        "stock_levels",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("warehouse_id", sa.String(length=36), nullable=False),
        sa.Column("part_id", sa.String(length=36), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False, server_default="0"),
        sa.Column("reserved", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_movement_at", sa.String(length=64), nullable=True),
        sa.Column("last_counted_at", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_levels_branch_id", "stock_levels", ["branch_id"], unique=False)
    op.create_index("ix_stock_levels_warehouse_id", "stock_levels", ["warehouse_id"], unique=False)
    op.create_index("ix_stock_levels_part_id", "stock_levels", ["part_id"], unique=False)
    op.create_index("uq_stock_levels_warehouse_part", "stock_levels", ["warehouse_id", "part_id"], unique=True)

    # ---- 9. inventory_requests ----
    op.create_table(
        "inventory_requests",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("work_order_id", sa.String(length=36), nullable=False),
        sa.Column("requested_by", sa.String(length=36), nullable=True),
        sa.Column("part_id", sa.String(length=36), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("approved_by", sa.String(length=36), nullable=True),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_requests_branch_id", "inventory_requests", ["branch_id"], unique=False)
    op.create_index("ix_inventory_requests_work_order_id", "inventory_requests", ["work_order_id"], unique=False)
    op.create_index("ix_inventory_requests_requested_by", "inventory_requests", ["requested_by"], unique=False)
    op.create_index("ix_inventory_requests_part_id", "inventory_requests", ["part_id"], unique=False)
    op.create_index("ix_inventory_requests_status", "inventory_requests", ["status"], unique=False)

    # ---- 10. inventory_movements ----
    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("warehouse_id", sa.String(length=36), nullable=False),
        sa.Column("part_id", sa.String(length=36), nullable=False),
        sa.Column("movement_type", sa.String(length=32), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit_cost", sa.Float(), nullable=True),
        sa.Column("work_order_id", sa.String(length=36), nullable=True),
        sa.Column("inventory_request_id", sa.String(length=36), nullable=True),
        sa.Column("counterpart_warehouse_id", sa.String(length=36), nullable=True),
        sa.Column("performed_by", sa.String(length=36), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["part_id"], ["parts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["inventory_request_id"], ["inventory_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["counterpart_warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["performed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_movements_branch_id", "inventory_movements", ["branch_id"], unique=False)
    op.create_index("ix_inventory_movements_warehouse_id", "inventory_movements", ["warehouse_id"], unique=False)
    op.create_index("ix_inventory_movements_part_id", "inventory_movements", ["part_id"], unique=False)
    op.create_index("ix_inventory_movements_movement_type", "inventory_movements", ["movement_type"], unique=False)
    op.create_index("ix_inventory_movements_work_order_id", "inventory_movements", ["work_order_id"], unique=False)
    op.create_index("ix_inventory_movements_inventory_request_id", "inventory_movements", ["inventory_request_id"], unique=False)

    # ---- 11. service_bays ----
    op.create_table(
        "service_bays",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_service_bays_branch_id", "service_bays", ["branch_id"], unique=False)
    op.create_index("uq_service_bays_branch_code", "service_bays", ["branch_id", "code"], unique=True)

    # ---- 12. work_order_lines ----
    op.create_table(
        "work_order_lines",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("work_order_id", sa.String(length=36), nullable=False),
        sa.Column("service_id", sa.String(length=36), nullable=False),
        sa.Column("bay_id", sa.String(length=36), nullable=True),
        sa.Column("mechanic_id", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("standard_duration_hrs", sa.Float(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["bay_id"], ["service_bays.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["mechanic_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_work_order_lines_branch_id", "work_order_lines", ["branch_id"], unique=False)
    op.create_index("ix_work_order_lines_work_order_id", "work_order_lines", ["work_order_id"], unique=False)
    op.create_index("ix_work_order_lines_service_id", "work_order_lines", ["service_id"], unique=False)
    op.create_index("ix_work_order_lines_bay_id", "work_order_lines", ["bay_id"], unique=False)
    op.create_index("ix_work_order_lines_mechanic_id", "work_order_lines", ["mechanic_id"], unique=False)
    op.create_index("ix_work_order_lines_status", "work_order_lines", ["status"], unique=False)

    # ---- 13. evidence ----
    op.create_table(
        "evidence",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("branch_id", sa.String(length=36), nullable=False),
        sa.Column("work_order_id", sa.String(length=36), nullable=False),
        sa.Column("work_order_line_id", sa.String(length=36), nullable=True),
        sa.Column("document_id", sa.String(length=36), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="photo"),
        sa.Column("stage", sa.String(length=32), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("captured_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_line_id"], ["work_order_lines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["captured_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_evidence_branch_id", "evidence", ["branch_id"], unique=False)
    op.create_index("ix_evidence_work_order_id", "evidence", ["work_order_id"], unique=False)
    op.create_index("ix_evidence_work_order_line_id", "evidence", ["work_order_line_id"], unique=False)


def downgrade() -> None:
    op.drop_table("evidence")
    op.drop_table("work_order_lines")
    op.drop_table("service_bays")
    op.drop_table("inventory_movements")
    op.drop_table("inventory_requests")
    op.drop_table("stock_levels")
    op.drop_table("warehouses")
    op.drop_table("parts")
    op.drop_table("documents")
    op.drop_table("audit_logs")

    for table in ("supplier_prices", "suppliers", "quotes", "work_orders", "vehicles"):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(f"fk_{table}_branch", type_="foreignkey")
            batch.drop_column("branch_id")

    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_users_default_branch", type_="foreignkey")
        batch.drop_column("default_branch_id")

    op.drop_index("ix_branches_organization_id", table_name="branches")
    op.drop_index("uq_branches_org_code", table_name="branches")
    op.drop_table("branches")
    op.drop_index("ix_organizations_code", table_name="organizations")
    op.drop_table("organizations")
