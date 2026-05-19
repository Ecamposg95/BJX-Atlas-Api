import os
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.database import check_db_connection
from app.routers import auth, engine, catalog, suppliers, quotes, dashboard, config, users, vehicles, work_orders
from app.routers import branches as branches_router, audit as audit_router
from app.routers import branch_stats as branch_stats_router
from app.routers import inventory as inventory_router, workshop as workshop_router
from app.routers import admin_seed as admin_seed_router
from app.routers import assignments as assignments_router
from app.routers import me as me_router
from app.routers import mechanics as mechanics_router
from app.routers import findings as findings_router
from app.routers import client_portal as client_portal_router
from app.routers import evidence as evidence_router
from app.routers import appointments as appointments_router
from app.routers import deliveries as deliveries_router
from app.middleware import AuditContextMiddleware
from app.services.audit import install_audit_listeners
from app.events.subscribers import setup_event_subscribers

logger = logging.getLogger("bjx-atlas")

# Registrar event listeners de auditoría una sola vez al boot.
install_audit_listeners()

# Registrar subscribers del EventBus (Fase 1+): audit, notifications, KPIs.
setup_event_subscribers()

app = FastAPI(
    title="BJX Atlas API",
    description="Plataforma de Cotización, Costos y Márgenes — BJX Motors × Brame",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", ""),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuditContextMiddleware)

# ── API routers (all under /api) ─────────────────────────────────────────────
app.include_router(auth.router, prefix="/api", tags=["Autenticación"])
app.include_router(engine.router, prefix="/api", tags=["Motor de Cálculo"])
app.include_router(catalog.router, prefix="/api", tags=["Catálogo"])
app.include_router(vehicles.router, prefix="/api", tags=["Vehículos"])
app.include_router(suppliers.router, prefix="/api", tags=["Proveedores"])
app.include_router(quotes.router, prefix="/api", tags=["Cotizaciones"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(config.router, prefix="/api", tags=["Configuración"])
app.include_router(users.router, prefix="/api", tags=["Usuarios"])
app.include_router(work_orders.router, prefix="/api", tags=["Órdenes de trabajo"])
app.include_router(work_orders.router_v1, prefix="/api", tags=["Work Orders v1"])
app.include_router(assignments_router.router, prefix="/api", tags=["Asignaciones v1"])
app.include_router(me_router.router, prefix="/api", tags=["Me v1"])
app.include_router(mechanics_router.router, prefix="/api", tags=["Mecánicos v1"])
app.include_router(findings_router.router, prefix="/api", tags=["Hallazgos v1"])
app.include_router(branches_router.router, prefix="/api", tags=["Sucursales"])
app.include_router(branch_stats_router.router, prefix="/api/v1", tags=["Sucursales — KPIs"])
app.include_router(audit_router.router, prefix="/api", tags=["Auditoría"])
app.include_router(inventory_router.router, prefix="/api", tags=["Inventario"])
app.include_router(workshop_router.router, prefix="/api", tags=["Taller"])
app.include_router(admin_seed_router.router, prefix="/api", tags=["Admin"])
app.include_router(client_portal_router.router, prefix="/api", tags=["Portal Cliente"])
app.include_router(evidence_router.router, prefix="/api", tags=["Evidencia Mobile v1"])
app.include_router(appointments_router.router, prefix="/api", tags=["Citas v1"])
app.include_router(deliveries_router.router, prefix="/api", tags=["Entregas v1"])


@app.get("/api/health", tags=["Sistema"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/health/db", tags=["Sistema"])
def health_check_db():
    db_ok = check_db_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "1.0.0",
        "db": "connected" if db_ok else "error",
    }


# ── Frontend static files ────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIR.is_dir():
    logger.info(f"[FRONTEND] Serving from {FRONTEND_DIR}")
    print(f"[FRONTEND] Serving from {FRONTEND_DIR}", flush=True)

    # Mount /assets for hashed static files (JS, CSS)
    assets_dir = FRONTEND_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend SPA — try static file first, fallback to index.html."""
        file_path = FRONTEND_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")
else:
    logger.warning(f"[FRONTEND] Not found at {FRONTEND_DIR} — API-only mode")
    print(f"[FRONTEND] Not found at {FRONTEND_DIR} — API-only mode", flush=True)

    @app.get("/")
    def root_no_frontend():
        return JSONResponse({
            "message": "BJX Atlas API is running. Frontend not built.",
            "docs": "/api/docs",
            "health": "/api/health",
        })
