# BJX Atlas API

Plataforma de Cotización, Costos y Márgenes para **BJX Motors × Brame** — Synet Group.

Backend API REST en FastAPI que reemplaza una calculadora Excel manual con un motor de cálculo de costos y márgenes para servicios automotrices.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 · FastAPI · SQLAlchemy · PostgreSQL |
| Auth | JWT + bcrypt · roles: `admin`, `operador`, `viewer` |
| Export | reportlab (PDF) · openpyxl (XLSX) |
| Deploy | Railway · GitHub Actions |

## Setup local

```bash
# Clonar e instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar DATABASE_URL y SECRET_KEY en .env

# Inicializar base de datos y datos semilla
python scripts/init_db.py
python scripts/seed_data.py

# Correr servidor
uvicorn app.main:app --reload
```

API disponible en `http://localhost:8000` · Docs en `http://localhost:8000/docs`

## Tests

```bash
pytest                                          # todos los tests
pytest tests/test_pricing_engine.py -v         # un módulo específico
```

## Módulos

| Módulo | Descripción |
|---|---|
| `engine` | Motor de cálculo de costos y márgenes (funciones puras) |
| `catalog` | Modelos de vehículo, servicios y costos BJX |
| `suppliers` | Proveedores y listas de precios (Brame, DAPESA) |
| `quotes` | Cotizaciones — ciclo de vida y exportación PDF/XLSX |
| `dashboard` | KPIs ejecutivos y análisis de rentabilidad |
| `users` | Autenticación y control de acceso por rol |

## Reglas de negocio clave

- El motor de cálculo nunca toca la BD — funciones puras, testeables en aislamiento.
- Los registros de precio son inmutables — se crea versión nueva con `is_current=True`.
- Todas las constantes del motor se leen desde `config_params` en BD (sin hardcodeo).
- Si falta un dato en catálogo, se usa estimado marcado como `data_source="estimated"`.
