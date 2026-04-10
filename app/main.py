from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.database import check_db_connection
from app.routers import auth
from app.routers import engine

app = FastAPI(
    title="BJX Atlas API",
    description="Plataforma de Cotización, Costos y Márgenes — BJX Motors × Brame",
    version="1.0.0",
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

app.include_router(auth.router, prefix="/auth", tags=["Autenticación"])
app.include_router(engine.router, tags=["Motor de Cálculo"])
# catalog, suppliers, quotes, dashboard, config — se agregan al completar Sprint 3/4


@app.get("/health", tags=["Sistema"])
def health_check():
    db_ok = check_db_connection()
    return {
        "status": "ok" if db_ok else "degraded",
        "version": "1.0.0",
        "db": "connected" if db_ok else "error",
    }
