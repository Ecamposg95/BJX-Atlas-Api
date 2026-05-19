"""procurement_gaps: partial receive + folio counters + IR↔PO link + supplier_price.part_id

Revision ID: c5pr0c2
Revises: b2pr0p05a
Create Date: 2026-05-19

Cambios:
- purchase_order_items: quantity_received, received_at, inventory_request_id
- folio_counters: tabla nueva para generación de folios sin race conditions
- supplier_prices: part_id nullable + valid_from + source; relax service_id/model_id a nullable
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "c5pr0c2"
down_revision = "c4w0m4rg"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    # --- purchase_order_items: nuevas columnas ---
    with op.batch_alter_table("purchase_order_items") as batch_op:
        batch_op.add_column(
            sa.Column(
                "quantity_received",
                sa.Numeric(14, 3),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "inventory_request_id",
                sa.String(length=36),
                sa.ForeignKey(
                    "inventory_requests.id",
                    name="fk_purchase_order_items_inventory_request_id",
                    ondelete="SET NULL",
                ),
                nullable=True,
            )
        )

    op.create_index(
        "ix_purchase_order_items_inventory_request_id",
        "purchase_order_items",
        ["inventory_request_id"],
    )

    # --- folio_counters ---
    op.create_table(
        "folio_counters",
        sa.Column("name", sa.String(length=128), primary_key=True),
        sa.Column("value", sa.Integer(), nullable=False, server_default="0"),
    )

    # --- supplier_prices: part_id, valid_from, source ---
    with op.batch_alter_table("supplier_prices") as batch_op:
        batch_op.add_column(
            sa.Column(
                "part_id",
                sa.String(length=36),
                sa.ForeignKey(
                    "parts.id",
                    name="fk_supplier_prices_part_id",
                    ondelete="RESTRICT",
                ),
                nullable=True,
            )
        )
        batch_op.add_column(sa.Column("valid_from", sa.Date(), nullable=True))
        batch_op.add_column(sa.Column("source", sa.String(length=64), nullable=True))
        # Relax service_id / model_id to nullable for part-based price rows
        batch_op.alter_column("service_id", existing_type=sa.String(length=36), nullable=True)
        batch_op.alter_column("model_id", existing_type=sa.String(length=36), nullable=True)

    op.create_index(
        "ix_supplier_prices_part_id",
        "supplier_prices",
        ["part_id"],
    )

    # --- Nota sobre el nuevo status `partially_received` en purchase_orders.status ---
    # No existe CheckConstraint declarado: status es String libre. SQLite además
    # no soporta DROP CHECK directo. Si en producción se agrega un CheckConstraint
    # se debe regenerar aquí incluyendo `partially_received`.


def downgrade() -> None:
    op.drop_index("ix_supplier_prices_part_id", table_name="supplier_prices")
    with op.batch_alter_table("supplier_prices") as batch_op:
        batch_op.alter_column("model_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.alter_column("service_id", existing_type=sa.String(length=36), nullable=False)
        batch_op.drop_column("source")
        batch_op.drop_column("valid_from")
        batch_op.drop_column("part_id")

    op.drop_table("folio_counters")

    op.drop_index(
        "ix_purchase_order_items_inventory_request_id",
        table_name="purchase_order_items",
    )
    with op.batch_alter_table("purchase_order_items") as batch_op:
        batch_op.drop_column("inventory_request_id")
        batch_op.drop_column("received_at")
        batch_op.drop_column("quantity_received")
