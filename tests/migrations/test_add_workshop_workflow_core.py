"""Tests para migración add_workshop_workflow_core."""
import pytest
from sqlalchemy import inspect, create_engine, text
from alembic.config import Config
from alembic import command


@pytest.fixture
def alembic_engine(tmp_path):
    db_path = tmp_path / "test_migration.db"
    engine = create_engine(f"sqlite:///{db_path}")
    return engine


@pytest.fixture
def alembic_config(alembic_engine):
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", str(alembic_engine.url))
    cfg.set_main_option("script_location", "alembic")
    return cfg


def test_upgrade_to_workshop_workflow_core(alembic_config, alembic_engine):
    """Upgrade head aplica add_workshop_workflow_core sin error."""
    command.upgrade(alembic_config, "head")
    inspector = inspect(alembic_engine)
    cols = [c["name"] for c in inspector.get_columns("work_orders")]
    assert "type" in cols
    assert "priority" in cols
    assert "scheduled_at" in cols
    assert "promised_at" in cols
    assert "portal_token" in cols


def test_downgrade_reverts_cleanly(alembic_config, alembic_engine):
    """Downgrade -1 desde head deja la BD en estado consistente."""
    command.upgrade(alembic_config, "head")
    command.downgrade(alembic_config, "-1")
    inspector = inspect(alembic_engine)
    cols = [c["name"] for c in inspector.get_columns("work_orders")]
    assert "type" not in cols
    assert "portal_token" not in cols
    assert "work_order_status_history" not in inspector.get_table_names()
    assert "assignments" not in inspector.get_table_names()
    assert "mechanic_profiles" not in inspector.get_table_names()


def test_backfill_status_history_per_existing_wo(alembic_config, alembic_engine):
    """Backfill crea 1 entry inicial por cada OS existente."""
    # Aplicar todas las migraciones previas (sin add_workshop_workflow_core aún)
    command.upgrade(alembic_config, "c4f1a8b3d502")

    # Insertar datos de prueba (schema de c4f1a8b3d502)
    with alembic_engine.begin() as conn:
        # La migración c4f1a8b3d502 ya siembra una org + branches por defecto,
        # así que podemos usar esos IDs directamente.
        conn.execute(text(
            "INSERT INTO models (id, name, brand, active, created_at) "
            "VALUES ('mod-1', 'AVEO', 'CHEVROLET', 1, '2026-01-01T00:00:00Z')"
        ))
        conn.execute(text(
            "INSERT INTO services (id, name, active, created_at) "
            "VALUES ('svc-1', 'Cambio balatas', 1, '2026-01-01T00:00:00Z')"
        ))
        # branch_id = DEFAULT_BRANCH_ID de la migración c4f1a8b3d502
        conn.execute(text(
            "INSERT INTO vehicles (id, branch_id, customer_name, active, created_at) "
            "VALUES ('veh-1', '00000000-0000-0000-0000-0000000000aa', 'Cliente Test', 1, '2026-01-01T00:00:00Z')"
        ))
        for i in range(2):
            conn.execute(text(
                f"INSERT INTO work_orders "
                f"(id, order_number, branch_id, vehicle_id, model_id, service_id, status, received_at, created_at) "
                f"VALUES ('wo-{i}', 'WO-2025-{i:04d}', '00000000-0000-0000-0000-0000000000aa', "
                f"'veh-1', 'mod-1', 'svc-1', 'received', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')"
            ))

    # Aplicar migración objetivo
    command.upgrade(alembic_config, "add_workshop_workflow_core")

    # Validar 2 entries en historial
    with alembic_engine.connect() as conn:
        result = conn.execute(text("SELECT COUNT(*) FROM work_order_status_history")).scalar()
        assert result == 2

        result = conn.execute(text(
            "SELECT from_status, to_status FROM work_order_status_history WHERE work_order_id = 'wo-0'"
        )).first()
        assert result.from_status is None
        assert result.to_status == "received"
