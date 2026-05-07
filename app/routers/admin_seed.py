"""Admin-only endpoints para disparar seeders idempotentes en prod sin redeploy.

ADVERTENCIA: solo admin/director pueden invocarlos. Los scripts son idempotentes
(skip si ya existe), así que es seguro llamarlos múltiples veces.
"""
import io
import sys
from contextlib import redirect_stdout
from typing import Literal
from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.models.users import User
from app.security import require_role


router = APIRouter(prefix="/admin/seed", tags=["admin"])


class SeedResponse(BaseModel):
    seeder: str
    status: Literal["ok", "error"]
    output: str
    error: str | None = None


def _capture(fn) -> tuple[str, str | None]:
    """Ejecuta fn() capturando stdout. Devuelve (output, error_msg)."""
    buf = io.StringIO()
    err: str | None = None
    try:
        with redirect_stdout(buf):
            fn()
    except SystemExit as e:
        err = f"SystemExit: {e}"
    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
    return buf.getvalue(), err


@router.post("/users", response_model=SeedResponse)
def seed_users_endpoint(
    _: User = Depends(require_role(["admin", "director"])),
):
    """Siembra los 10 usuarios demo (uno por rol). Idempotente."""
    from scripts.seed_users import seed_users

    def runner():
        created, skipped = seed_users()
        print(f"[done] {created} created, {skipped} existed")

    output, error = _capture(runner)
    return SeedResponse(
        seeder="seed_users",
        status="error" if error else "ok",
        output=output,
        error=error,
    )


@router.post("/operational", response_model=SeedResponse)
def seed_operational_endpoint(
    _: User = Depends(require_role(["admin", "director"])),
):
    """Siembra datos operacionales: parts, warehouses, stock, vehicles, OS,
    requests por sede. Idempotente.
    """
    # Asegurar import path
    from pathlib import Path
    project_root = str(Path(__file__).resolve().parent.parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from scripts.seed_operational import main as seed_operational

    output, error = _capture(seed_operational)
    return SeedResponse(
        seeder="seed_operational",
        status="error" if error else "ok",
        output=output,
        error=error,
    )


@router.post("/all", response_model=list[SeedResponse])
def seed_all_endpoint(
    _: User = Depends(require_role(["admin", "director"])),
):
    """Siembra TODO en orden: usuarios → datos operacionales."""
    results: list[SeedResponse] = []

    # 1. Users
    from scripts.seed_users import seed_users
    def run_users():
        created, skipped = seed_users()
        print(f"[users] {created} created, {skipped} existed")
    out, err = _capture(run_users)
    results.append(SeedResponse(seeder="seed_users", status="error" if err else "ok", output=out, error=err))

    # 2. Operational
    from pathlib import Path
    project_root = str(Path(__file__).resolve().parent.parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)
    from scripts.seed_operational import main as seed_operational
    out, err = _capture(seed_operational)
    results.append(SeedResponse(seeder="seed_operational", status="error" if err else "ok", output=out, error=err))

    return results
