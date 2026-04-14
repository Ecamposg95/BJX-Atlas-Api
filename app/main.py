import os
import time
import logging
import traceback
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logging_config import setup_logging
from app.database import check_db_connection, log_pool_status, wait_for_db
from app.routers import auth, engine, catalog, suppliers, quotes, dashboard, config

# ── Logging must be configured before anything else logs ────────────────────
setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("bjx-atlas")

# ── Application ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="BJX Atlas API",
    description="Plataforma de Cotización, Costos y Márgenes — BJX Motors × Brame",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", ""),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)


# ── Exception handlers ───────────────────────────────────────────────────────

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """
    Log all HTTP exceptions.  4xx are logged at WARNING; 5xx at ERROR with
    a full traceback so Railway's log stream captures the root cause.
    """
    log_extra = {
        "method": request.method,
        "path": request.url.path,
        "status_code": exc.status_code,
        "detail": exc.detail,
    }
    if exc.status_code >= 500:
        logger.error(
            "HTTP %s — %s %s",
            exc.status_code,
            request.method,
            request.url.path,
            exc_info=True,
            extra=log_extra,
        )
    else:
        logger.warning(
            "HTTP %s — %s %s",
            exc.status_code,
            request.method,
            request.url.path,
            extra=log_extra,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Log 422 validation errors with the full error list."""
    logger.warning(
        "Request validation failed — %s %s",
        request.method,
        request.url.path,
        extra={
            "method": request.method,
            "path": request.url.path,
            "errors": exc.errors(),
        },
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for any exception that escapes route handlers.

    Logs the full traceback so we can diagnose silent 502s in Railway.
    Returns a generic 500 to the client — never leaks internal details.
    """
    logger.error(
        "Unhandled exception — %s %s",
        request.method,
        request.url.path,
        exc_info=True,
        extra={
            "method": request.method,
            "path": request.url.path,
            "query": str(request.url.query),
            "exception_type": type(exc).__name__,
            "exception": str(exc),
            "traceback": traceback.format_exc(),
        },
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# ── Request / response logging middleware ────────────────────────────────────

@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """
    Log every inbound request and its response status + latency.

    Skips the /api/health endpoint to avoid log noise from Railway's
    health-check polling.
    """
    start = time.perf_counter()
    path = request.url.path

    # Skip health-check spam
    if path in ("/api/health", "/api/health/db"):
        return await call_next(request)

    logger.info(
        "→ %s %s",
        request.method,
        path,
        extra={
            "method": request.method,
            "path": path,
            "query": str(request.url.query),
            "client": request.client.host if request.client else "unknown",
        },
    )

    try:
        response = await call_next(request)
    except Exception as exc:
        elapsed = round((time.perf_counter() - start) * 1000, 1)
        logger.error(
            "✗ %s %s — unhandled exception after %.1f ms",
            request.method,
            path,
            elapsed,
            exc_info=True,
            extra={
                "method": request.method,
                "path": path,
                "elapsed_ms": elapsed,
                "exception_type": type(exc).__name__,
                "exception": str(exc),
            },
        )
        raise

    elapsed = round((time.perf_counter() - start) * 1000, 1)
    level = logging.WARNING if response.status_code >= 400 else logging.INFO
    logger.log(
        level,
        "← %s %s %s (%.1f ms)",
        response.status_code,
        request.method,
        path,
        elapsed,
        extra={
            "method": request.method,
            "path": path,
            "status_code": response.status_code,
            "elapsed_ms": elapsed,
        },
    )
    return response


# ── Middleware stack ─────────────────────────────────────────────────────────

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
app.include_router(suppliers.router, prefix="/api", tags=["Proveedores"])
app.include_router(quotes.router, prefix="/api", tags=["Cotizaciones"])
app.include_router(dashboard.router, prefix="/api", tags=["Dashboard"])
app.include_router(config.router, prefix="/api", tags=["Configuración"])


# ── Startup / shutdown events ────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    """Verify DB connectivity at startup and log pool status."""
    logger.info("BJX Atlas API starting up…")
    db_ok = wait_for_db(retries=5, base_delay_s=1.0, backoff_factor=2.0)
    if db_ok:
        log_pool_status()
    else:
        logger.error(
            "Application started but database is UNREACHABLE — "
            "requests requiring DB will fail until connectivity is restored"
        )


@app.on_event("shutdown")
async def on_shutdown():
    logger.info("BJX Atlas API shutting down")


# ── Health endpoints ─────────────────────────────────────────────────────────

@app.get("/api/health", tags=["Sistema"])
def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/health/db", tags=["Sistema"])
def health_check_db():
    db_ok = check_db_connection()
    if not db_ok:
        logger.error("DB health check endpoint reported connection failure")
    pool = log_pool_status() if db_ok else {}
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "1.0.0",
        "db": "connected" if db_ok else "error",
        "pool": pool,
    }


# ── Frontend static files ────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIR.is_dir():
    logger.info("[FRONTEND] Serving from %s", FRONTEND_DIR)

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
    logger.warning("[FRONTEND] Not found at %s — API-only mode", FRONTEND_DIR)

    @app.get("/")
    def root_no_frontend():
        return JSONResponse({
            "message": "BJX Atlas API is running. Frontend not built.",
            "docs": "/api/docs",
            "health": "/api/health",
        })
