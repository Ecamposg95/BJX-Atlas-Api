"""create_vehicles_domain

Revision ID: 7b2f8c1d9a31
Revises: b3e9e2389f20
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b2f8c1d9a31"
down_revision: Union[str, None] = "b3e9e2389f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vehicles",
        sa.Column("customer_name", sa.String(length=255), nullable=False),
        sa.Column("contact", sa.String(length=255), nullable=True),
        sa.Column("brand", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("plates", sa.String(length=50), nullable=True),
        sa.Column("vin", sa.String(length=100), nullable=True),
        sa.Column("mileage", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=100), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_vehicles_active"), "vehicles", ["active"], unique=False)
    op.create_index(op.f("ix_vehicles_brand"), "vehicles", ["brand"], unique=False)
    op.create_index(op.f("ix_vehicles_color"), "vehicles", ["color"], unique=False)
    op.create_index(op.f("ix_vehicles_contact"), "vehicles", ["contact"], unique=False)
    op.create_index(op.f("ix_vehicles_customer_name"), "vehicles", ["customer_name"], unique=False)
    op.create_index(op.f("ix_vehicles_model"), "vehicles", ["model"], unique=False)
    op.create_index(op.f("ix_vehicles_plates"), "vehicles", ["plates"], unique=False)
    op.create_index(op.f("ix_vehicles_vin"), "vehicles", ["vin"], unique=False)
    op.create_index(op.f("ix_vehicles_year"), "vehicles", ["year"], unique=False)
    op.execute(
        "CREATE UNIQUE INDEX uq_vehicles_plates_active_clean "
        "ON vehicles (lower(trim(plates))) "
        "WHERE deleted_at IS NULL AND plates IS NOT NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_vehicles_vin_active_clean "
        "ON vehicles (lower(trim(vin))) "
        "WHERE deleted_at IS NULL AND vin IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_vehicles_vin_active_clean")
    op.execute("DROP INDEX IF EXISTS uq_vehicles_plates_active_clean")
    op.drop_index(op.f("ix_vehicles_year"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_vin"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_plates"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_model"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_customer_name"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_contact"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_color"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_brand"), table_name="vehicles")
    op.drop_index(op.f("ix_vehicles_active"), table_name="vehicles")
    op.drop_table("vehicles")
