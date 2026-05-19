"""Seed idempotente: un usuario por rol para QA / piloto.

Uso:
    DATABASE_URL=sqlite:///./bjx_dev.db python scripts/seed_users.py
    # o en prod (cuidado):
    DATABASE_URL=postgresql://... python scripts/seed_users.py

Re-ejecutable: si el email ya existe, hace update no-op (no duplica, no rompe).
Las contraseñas son demo — cambiarlas en producción real.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Permitir correr desde cualquier cwd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.organizations import Branch  # noqa: E402
from app.models.users import Role, User  # noqa: E402
from app.security import hash_password  # noqa: E402


# Branch IDs sembrados por la migración c4f1a8b3d502
BRANCH = {
    "MAIN": "00000000-0000-0000-0000-0000000000aa",
    "LEON": "00000000-0000-0000-0000-0000000000ab",
    "QRO":  "00000000-0000-0000-0000-0000000000ac",
    "GDL":  "00000000-0000-0000-0000-0000000000ad",
}


# (email, role, default_branch_id, password, descripción)
SEED_USERS = [
    # ── Roles globales (sin sede asignada — ven todas) ────────────────────
    ("admin@bjx.com",        Role.admin,        BRANCH["MAIN"], "Admin1234",       "Super admin del sistema"),
    ("director@bjx.com",     Role.director,     None,           "Director1234",    "Director corporativo (cross-sede)"),
    ("viewer@bjx.com",       Role.viewer,       None,           "Viewer1234",      "Viewer global (read-only)"),
    ("brame@bjx.com",        Role.cliente_corp, None,           "Brame1234",       "Cliente corporativo BRAME"),

    # ── Roles branch-scoped (anclados a una sede) ─────────────────────────
    # Sede LEON
    ("gerente.leon@bjx.com",   Role.gerente_sede, BRANCH["LEON"], "Gerente1234",    "Gerente sede León"),
    ("jefe.leon@bjx.com",      Role.jefe_taller,  BRANCH["LEON"], "Jefe1234",       "Jefe de taller León"),
    ("recepcion.leon@bjx.com", Role.recepcion,    BRANCH["LEON"], "Recepcion1234",  "Recepción León"),
    ("mecanico.leon@bjx.com",  Role.mecanico,     BRANCH["LEON"], "Mecanico1234",   "Mecánico León"),
    ("almacen.leon@bjx.com",   Role.almacen,      BRANCH["LEON"], "Almacen1234",    "Almacén León"),

    # NOTA: el seed legacy `operador@bjx.com` fue retirado tras la deprecación
    # del rol `operador`. Sus capacidades fueron absorbidas por `recepcion`.
]


def seed_users() -> tuple[int, int]:
    """Devuelve (created, skipped)."""
    created = 0
    skipped = 0

    db = SessionLocal()
    try:
        # Validar que las branches referenciadas existen
        existing_branch_ids = {b.id for b in db.query(Branch).all()}
        missing = [b for b in BRANCH.values() if b not in existing_branch_ids]
        if missing:
            print(f"[ERROR] Branches faltantes en BD: {missing}")
            print("       Corre primero: alembic upgrade head")
            sys.exit(1)

        for email, role, branch_id, password, desc in SEED_USERS:
            existing = db.query(User).filter(User.email == email).first()
            if existing:
                skipped += 1
                print(f"  ↷ {email:<28} [{role.value:<14}] ya existe — skip")
                continue

            u = User(
                email=email,
                hashed_password=hash_password(password),
                role=role.value,
                default_branch_id=branch_id,
                active=True,
            )
            db.add(u)
            db.flush()
            created += 1
            branch_label = "GLOBAL" if branch_id is None else "LEON" if branch_id == BRANCH["LEON"] else "MAIN"
            print(f"  ✓ {email:<28} [{role.value:<14}] sede={branch_label:<6} pw={password}")

        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Seed falló: {exc}")
        raise
    finally:
        db.close()

    return created, skipped


if __name__ == "__main__":
    db_url = os.getenv("DATABASE_URL", "sqlite:///./bjx_dev.db")
    print(f"[SEED] DATABASE_URL = {db_url}")
    print(f"[SEED] Sembrando {len(SEED_USERS)} usuarios (1 por rol)…")
    print()

    created, skipped = seed_users()

    print()
    print(f"[SEED] Listo — {created} creados, {skipped} ya existían.")
    print()
    print("Credenciales demo (cambiar en prod):")
    for email, role, _, password, desc in SEED_USERS:
        print(f"  {email:<28} pw={password:<14} — {desc}")
