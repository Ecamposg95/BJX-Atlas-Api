"""relax_service_catalog_history_uniqueness

Revision ID: 0d8a4e6f3c11
Revises: b3e9e2389f20
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0d8a4e6f3c11"
down_revision: Union[str, None] = "b3e9e2389f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table("service_catalog", recreate="always") as batch_op:
            batch_op.drop_constraint("uq_catalog_model_service_current", type_="unique")
    else:
        op.drop_constraint("uq_catalog_model_service_current", "service_catalog", type_="unique")

    where_clause = "is_current = 1" if dialect == "sqlite" else "is_current = true"
    op.execute(
        sa.text(
            "CREATE UNIQUE INDEX uq_catalog_model_service_current "
            "ON service_catalog (model_id, service_id) "
            f"WHERE {where_clause}"
        )
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_catalog_model_service_current")
    dialect = op.get_bind().dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table("service_catalog", recreate="always") as batch_op:
            batch_op.create_unique_constraint(
                "uq_catalog_model_service_current",
                ["model_id", "service_id", "is_current"],
            )
    else:
        op.create_unique_constraint(
            "uq_catalog_model_service_current",
            "service_catalog",
            ["model_id", "service_id", "is_current"],
        )
