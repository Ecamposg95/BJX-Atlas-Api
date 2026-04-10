# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**BJX-Atlas-Api** — Plataforma de Cotización, Costos y Márgenes para BJX Motors × Brame (Synet Group).

API backend en FastAPI que implementa un motor de cálculo de precios y márgenes para servicios automotrices, reemplazando una calculadora Excel manual.

## Context Files

Antes de escribir cualquier código, leer:

| Archivo | Propósito |
|---|---|
| `context/atlas_erp_pos_stack.md` | Stack completo, patrones de código y arquitectura base (FastAPI + SQLAlchemy + JWT) |
| `context/BJX_Platform_TaskPack_v1.md` | Reglas de negocio, módulos, esquema de BD, lógica de cálculo y plan de sprints del proyecto |

## Stack

Python 3.12 · FastAPI 0.127.0 · SQLAlchemy 2.0 · PostgreSQL (prod) / SQLite (local) · Pydantic v2 · JWT HS256

Ver `context/atlas_erp_pos_stack.md` para snippets de código listos para usar.

## Commands

```bash
# Crear y activar virtualenv (Python 3.12)
/usr/bin/python3.12 -m venv venv && source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar entorno local
cp .env.example .env   # editar DATABASE_URL y SECRET_KEY

# Migrar base de datos
DATABASE_URL=sqlite:///./bjx_dev.db alembic upgrade head

# Cargar datos semilla desde Excel
DATABASE_URL=sqlite:///./bjx_dev.db python seeds/load_data.py

# Correr servidor de desarrollo
DATABASE_URL=sqlite:///./bjx_dev.db uvicorn app.main:app --reload

# Correr todos los tests
pytest

# Correr un módulo de tests específico
pytest tests/test_pricing_engine.py -v

# Generar nueva migración (después de cambiar modelos)
alembic revision --autogenerate -m "descripcion"
```

## Architecture

```
app/
├── main.py          # App init, middleware, routers
├── database.py      # Engine, SessionLocal, get_db()
├── models/          # SQLAlchemy ORM (mixins: UUIDMixin, AuditMixin)
├── routers/         # Un archivo por módulo de negocio
├── schemas/         # Pydantic request/response
├── security/        # JWT, get_current_user, roles
├── services/        # Lógica de negocio (PricingEngine, SupplierEngine)
└── utils/           # PDF, exportación Excel
scripts/
├── init_db.py
├── seed_data.py     # Carga Excel → BD
└── railway_init.py  # Boot script producción
```

## Key Business Rules

- **Motor de cálculo** (`services/pricing_engine.py`): funciones puras sin I/O, sin efectos en BD.
- **Precios inmutables**: nunca editar registros de precio — crear nuevo con `is_current=True`.
- **Config-driven**: el motor lee constantes desde `config_params` en BD, nunca hardcodeadas.
- **Data source transparente**: si falta dato en catálogo, usar estimado pero marcar `data_source="estimated"`.
- **Seeds idempotentes**: los scripts de carga Excel pueden ejecutarse múltiples veces sin duplicar.

## Roles

`admin` · `operador` · `viewer` (definidos en `BJX_Platform_TaskPack_v1.md` §Módulo 6)
