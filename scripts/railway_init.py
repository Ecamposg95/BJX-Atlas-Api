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
import subprocess

# Ensure app imports work from scripts/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def run_migrations():
    """Run alembic upgrade head."""
    print("[BOOT] Running Alembic migrations...")
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print(f"[ERROR] Alembic migration failed:\n{result.stderr}")
        sys.exit(1)
    print("[BOOT] Migrations completed.")


def seed_defaults():
    """Seed config params and admin user (idempotent)."""
    print("[BOOT] Seeding defaults...")

    from app.database import SessionLocal, engine, Base
    from app.models.config import ConfigParam
    from app.models.users import User, Role
    from app.security import hash_password

    # Ensure tables exist (safety net if alembic didn't run)
    Base.metadata.create_all(bind=engine)

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
            print(f"[BOOT] Inserted {inserted} config params.")
        else:
            print("[BOOT] Config params already exist, skipped.")

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
            print(f"[BOOT] Admin user created: {admin_email}")
        else:
            print(f"[BOOT] Admin user already exists: {admin_email}")

    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Seeding failed: {exc}")
        raise
    finally:
        db.close()

    print("[BOOT] Seeding completed.")


if __name__ == "__main__":
    run_migrations()
    seed_defaults()
    print("[BOOT] Railway init done. Ready to serve.")
