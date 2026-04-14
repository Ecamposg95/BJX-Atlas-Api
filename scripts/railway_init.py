"""
scripts/railway_init.py
=======================
Boot script for Railway production deployments.

Steps executed on every deploy:
  1. Run Alembic migrations (upgrade head)
  2. Seed config_params defaults (idempotent)
  3. Seed admin user (idempotent)

Usage:
    python scripts/railway_init.py
"""

import os
import sys
import time
import subprocess

# Ensure app imports work from scripts/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def ensure_db_consistency():
    """Ensure DB state is consistent before running Alembic migrations.

    Handles three scenarios:
    1. Fresh DB (no tables, no types)  → nothing to do, Alembic runs normally.
    2. Orphaned ENUMs (types exist, tables don't) → drop types so Alembic can recreate.
    3. Inconsistent version (tables exist, alembic_version empty/missing) → stamp head
       so Alembic skips re-creating what already exists.
    """
    from app.database import engine
    from sqlalchemy import text

    print("[BOOT] Checking DB consistency...", flush=True)
    with engine.connect() as conn:
        # Check if key tables exist
        result = conn.execute(text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'users'"
        ))
        tables_exist = result.scalar() > 0

        # Check alembic_version state
        version_stamped = False
        try:
            result = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'alembic_version'"
            ))
            version_table_exists = result.scalar() > 0
            if version_table_exists:
                result = conn.execute(text("SELECT COUNT(*) FROM alembic_version"))
                version_stamped = result.scalar() > 0
        except Exception:
            pass

        if tables_exist and not version_stamped:
            # Scenario 3: tables exist but Alembic thinks migration hasn't run.
            # Stamp head to avoid re-running CREATE TABLE / CREATE TYPE statements.
            print("[BOOT]   Tables exist but alembic_version is empty — stamping head...", flush=True)
            conn.commit()  # close any open transaction before subprocess
            result = subprocess.run(
                ["alembic", "stamp", "head"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                print(f"[ERROR] alembic stamp failed:\n{result.stderr}", flush=True)
                sys.exit(1)
            print("[BOOT]   Stamped. Alembic will skip to new migrations only.", flush=True)

        elif not tables_exist:
            # Scenario 2: drop any orphaned ENUM types so the migration can recreate them.
            conn.execute(text("DROP TYPE IF EXISTS role"))
            conn.execute(text("DROP TYPE IF EXISTS quotestatus"))
            conn.commit()
            print("[BOOT]   Dropped orphaned ENUM types (if any). Ready for migration.", flush=True)

        else:
            # Scenario 1: everything consistent.
            print("[BOOT]   DB state consistent. Proceeding with migrations.", flush=True)


def run_migrations():
    """Run alembic upgrade head."""
    print("[BOOT] Running Alembic migrations...", flush=True)
    t0 = time.time()
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    elapsed = time.time() - t0
    if result.stdout.strip():
        print(result.stdout, flush=True)
    if result.returncode != 0:
        print(f"[ERROR] Alembic failed ({elapsed:.1f}s):\n{result.stderr}", flush=True)
        sys.exit(1)
    print(f"[BOOT] Migrations done ({elapsed:.1f}s)", flush=True)


def seed_catalog():
    """Seed vehicle models, services, catalog costs and BRAME prices from Excel (idempotent)."""
    print("[BOOT] Seeding catalog from Excel...", flush=True)
    t0 = time.time()

    excel_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "context", "BJX_Calculadora_Brame_v1.xlsx",
    )

    if not os.path.exists(excel_path):
        print(f"[BOOT]   Excel not found at {excel_path} — skipping catalog seed.", flush=True)
        return

    from app.database import SessionLocal
    from app.models.catalog import VehicleModel, ServiceCatalog
    from app.models.suppliers import SupplierPrice
    from seeds.load_data import load_brame_excel

    db = SessionLocal()
    try:
        # Check if data already loaded
        n_models = db.query(VehicleModel).count()
        n_catalog = db.query(ServiceCatalog).count()
        if n_models >= 5 and n_catalog >= 50:
            print(f"[BOOT]   Catalog already loaded ({n_models} models, {n_catalog} entries) — skipping.", flush=True)
            return

        stats = load_brame_excel(db, excel_path, dry_run=False)
        db.commit()
        elapsed = time.time() - t0
        print(
            f"[BOOT]   Catalog done ({elapsed:.1f}s): "
            f"{stats['models']} models, {stats['services']} services, "
            f"{stats['catalog_entries']} catalog entries, "
            f"{stats['brame_prices_current']} BRAME prices",
            flush=True,
        )
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Catalog seed failed: {exc}", flush=True)
        # Non-fatal: server can still start without catalog data
    finally:
        db.close()


def seed_defaults():
    """Seed config params and admin user (idempotent)."""
    print("[BOOT] Seeding defaults...", flush=True)
    t0 = time.time()

    from app.database import SessionLocal
    from app.models.config import ConfigParam
    from app.models.users import User, Role
    from app.security import hash_password

    db = SessionLocal()
    try:
        # --- Config params ---
        defaults = {
            "technician_cost_hr": ("156.25", "Costo por hora del tecnico BJX en MXN"),
            "target_margin": ("0.40", "Margen objetivo por defecto (40%)"),
            "iva_rate": ("0.16", "Tasa IVA"),
            "overhead_rate": ("0.15", "Tasa de overhead operativo"),
            "scoring_weight_price": ("0.50", "Peso del precio en scoring de proveedores"),
            "scoring_weight_time": ("0.30", "Peso del tiempo de entrega en scoring"),
            "scoring_weight_tc": ("0.20", "Peso de terminos y condiciones en scoring"),
        }
        inserted = 0
        for key, (value, description) in defaults.items():
            existing = db.query(ConfigParam).filter(ConfigParam.key == key).first()
            if not existing:
                db.add(ConfigParam(key=key, value=value, description=description))
                inserted += 1
        if inserted:
            db.commit()
            print(f"[BOOT]   {inserted} config params inserted", flush=True)
        else:
            print("[BOOT]   Config params OK (already exist)", flush=True)

        # --- Admin user ---
        admin_email = os.getenv("ADMIN_EMAIL", "admin@bjx.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "Admin1234")

        existing_admin = db.query(User).filter(User.email == admin_email).first()
        if not existing_admin:
            admin = User(
                email=admin_email,
                hashed_password=hash_password(admin_password),
                role=Role.admin,
                active=True,
            )
            db.add(admin)
            db.commit()
            print(f"[BOOT]   Admin created: {admin_email}", flush=True)
        else:
            print(f"[BOOT]   Admin OK: {admin_email}", flush=True)

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Seeding failed: {exc}", flush=True)
        raise
    finally:
        db.close()

    elapsed = time.time() - t0
    print(f"[BOOT] Seeding done ({elapsed:.1f}s)", flush=True)


if __name__ == "__main__":
    total = time.time()
    db_url = os.getenv("DATABASE_URL", "NOT SET")
    # Show redacted URL for debugging (hide password)
    if "@" in db_url:
        safe = db_url.split("@")[-1]
        print(f"[BOOT] DATABASE_URL = ...@{safe}", flush=True)
    else:
        print(f"[BOOT] DATABASE_URL = {db_url}", flush=True)

    ensure_db_consistency()
    run_migrations()
    seed_defaults()
    seed_catalog()

    print(f"[BOOT] Init complete ({time.time() - total:.1f}s). Starting server...", flush=True)
