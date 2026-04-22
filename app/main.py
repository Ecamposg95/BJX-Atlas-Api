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

logger = logging.getLogger("bjx-atlas")

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
