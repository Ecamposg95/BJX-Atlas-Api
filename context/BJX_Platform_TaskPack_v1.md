# BJX Platform — Task Pack v1.0
## Plataforma de Cotización, Costos y Márgenes

> **Contexto:** Plataforma Python/FastAPI centrada en el motor de cálculo de costos y márgenes para BJX Motors × Brame. La calculadora de Excel del MVP es el blueprint funcional — este task pack traduce esa lógica a una plataforma web completa con backend, API REST y frontend React.

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.12 · FastAPI · SQLAlchemy · PostgreSQL · Alembic · Pydantic v2 |
| Frontend | React 18 · Tailwind CSS · Recharts · React Query |
| Auth | JWT + bcrypt · roles: `admin`, `operador`, `viewer` |
| Infra | Docker · Railway o Render (deploy inicial) · GitHub Actions (CI) |
| Export | reportlab o weasyprint (PDF) · openpyxl (XLSX) |

---

## Arquitectura de módulos

```
bjx-platform/
├── backend/
│   ├── core/           # config, db, auth, deps
│   ├── modules/
│   │   ├── catalog/    # modelos, servicios, precios BJX
│   │   ├── engine/     # motor de cálculo (corazón)
│   │   ├── quotes/     # cotizaciones generadas
│   │   ├── suppliers/  # proveedores y listas de precio
│   │   ├── dashboard/  # agregaciones y KPIs
│   │   └── users/      # auth y roles
│   └── seeds/          # datos iniciales desde XLSXs
├── frontend/
│   ├── pages/
│   │   ├── Dashboard
│   │   ├── Calculator
│   │   ├── Quotes
│   │   ├── Catalog
│   │   └── Settings
│   └── components/
└── tests/
```

---

## Esquema de base de datos

```sql
-- Catálogo
models            (id, name, brand, active, created_at)
services          (id, name, category, active, created_at)
service_catalog   (id, model_id, service_id, bjx_labor_cost, bjx_parts_cost,
                   duration_hrs, source, updated_at, updated_by)

-- Proveedores
suppliers         (id, name, lead_time_days, warranty_days, return_policy,
                   contact_name, contact_email, active)
supplier_prices   (id, supplier_id, service_id, model_id, ref_cost,
                   labor_cost, total_price, price_date, is_current)

-- Cotizaciones
quotes            (id, quote_number, model_id, created_by, created_at,
                   status, technician_cost_hr, target_margin, notes)
quote_lines       (id, quote_id, service_id, supplier_id, labor_cost,
                   parts_cost, brame_price, margin_pct, duration_hrs)

-- Config
config_params     (id, key, value, description, updated_at, updated_by)
config_history    (id, config_id, old_value, new_value, changed_by, changed_at)

-- Usuarios
users             (id, email, hashed_password, role, active, created_at)
```

**Índices requeridos:**
- `service_catalog(model_id, service_id)` — unique
- `supplier_prices(supplier_id, is_current)`
- `quotes(created_at)`, `quotes(status)`

---

## Lógica del motor de cálculo (referencia)

```
duration_hrs        = catálogo BJX por modelo+servicio
labor_cost          = duration_hrs × technician_cost_hr
parts_cost          = BRAME_REF_ACTUAL (o BJX_REF_CATÁLOGO si disponible)
total_bjx_cost      = labor_cost + parts_cost
brame_price         = BRAME_TOTAL_ACTUAL (REF + MO tarifa actualizada)
margin_pesos        = brame_price - total_bjx_cost
margin_pct          = margin_pesos / brame_price
suggested_price     = total_bjx_cost / (1 - target_margin)
gap_vs_target       = brame_price - suggested_price

margin_status:
  ok       → margin_pct >= target_margin (default 40%)
  low      → margin_pct >= 0.30
  critical → margin_pct < 0.30
```

**Defaults de configuración:**
- `technician_cost_hr = 156.25` MXN/hr
- `target_margin = 0.40`
- `iva_rate = 0.16`
- `overhead_rate = 0.15`
- `scoring_weights = price:0.50, time:0.30, tc:0.20`

---

## Fuentes de datos (archivos seed)

| Archivo | Destino | Notas |
|---------|---------|-------|
| `Conceptos_de_Servico__Costo_por_Modelo.xlsx` | `service_catalog` | 16 modelos · ~569 servicios · MO + REF + Duración |
| `Brame_Precios.xlsx` | `supplier_prices` (Brame) | 5 modelos · 24 servicios · precios PASADO y ACTUALIZADO |
| `LP_DAPESA_ESPECIAL_SYNNER.xlsx` | `supplier_prices` (DAPESA) | 15 modelos · precio NETO por pieza |

**Normalización crítica de nombres de modelo:**
- `NISSAN - MARCH` → `NISSAN MARCH`
- `CHEVROLET - TORNADO PICK UP` → `CHEVROLET - TORNADO PU`
- `VOLKSWAGEN - SAVEIRO ` (con espacio) → `VOLKSWAGEN - SAVEIRO`

---

---

## MÓDULO 0 — Fundación y Setup

---

### TASK-001 · Inicialización del proyecto

**Módulo:** core  
**Prioridad:** P0 — bloqueante  
**Estimado:** 4 hrs  
**Dependencias:** ninguna

**Descripción:**
Crear repositorio, estructura de carpetas y configuración base del proyecto.

**Criterios de aceptación:**
- `docker-compose up` levanta backend (FastAPI :8000) + DB (PostgreSQL :5432) + frontend (React :3000) en local
- Variables de entorno gestionadas con `.env` y `python-dotenv` — nunca hardcodeadas
- `GET /health` retorna `{"status": "ok", "version": "1.0.0", "db": "connected"}`
- Pre-commit hooks configurados: black, ruff, isort
- `README.md` con instrucciones de setup local en menos de 5 pasos

---

### TASK-002 · Modelo de base de datos — esquema inicial

**Módulo:** core  
**Prioridad:** P0 — bloqueante  
**Estimado:** 5 hrs  
**Dependencias:** TASK-001

**Descripción:**
Definir y migrar todas las tablas core con Alembic usando el esquema definido arriba.

**Criterios de aceptación:**
- `alembic upgrade head` corre sin errores en DB limpia
- `alembic downgrade base` revierte completamente sin errores
- Todas las foreign keys con `ON DELETE RESTRICT`
- Índices creados en la migración, no post-facto
- Modelos SQLAlchemy en archivos separados por módulo (`catalog/models.py`, etc.)
- `alembic current` muestra la revisión correcta después de migrar

---

### TASK-003 · Seed de datos desde XLSXs existentes

**Módulo:** seeds  
**Prioridad:** P0 — bloqueante  
**Estimado:** 6 hrs  
**Dependencias:** TASK-002

**Descripción:**
Script Python `seeds/load_data.py` que lee los 3 archivos fuente y popula la DB con todos los datos de catálogo, costos BJX y precios de proveedores.

**Lógica de parsing requerida:**
- Parsear `MX$1,449.23` → `float(1449.23)` (strip `MX$` y comas)
- Detectar y normalizar nombres de modelo (ver tabla de normalización arriba)
- Para Brame: cargar `PASADO` y `ACTUALIZADO`, marcar `is_current=True` solo en ACTUALIZADO
- `duration_hrs` nunca NULL — si MO y REF están vacíos en fila, la duración siempre está presente
- Config defaults insertados en `config_params`

**Criterios de aceptación:**
- Script idempotente — re-ejecutar no duplica registros (upsert por `model_name+service_name`)
- Log final: `X modelos, Y servicios, Z precios Brame, W precios DAPESA cargados`
- Filas con error: log con número de fila y motivo, continúa con las siguientes (no aborta)
- `python seeds/load_data.py --dry-run` imprime resumen sin escribir a DB
- Verificación post-seed: queries de validación que confirman conteos esperados

---

---

## MÓDULO 1 — Motor de Cálculo (Engine)

> El corazón de la plataforma. Todo lo demás consume este módulo. Implementar como funciones puras — sin acceso a DB, sin side effects, 100% testeable en aislamiento.

---

### TASK-010 · Clase `PricingEngine` — función pura core

**Módulo:** engine  
**Prioridad:** P0 — bloqueante  
**Estimado:** 6 hrs  
**Dependencias:** TASK-001

**Descripción:**
Implementar la lógica de cálculo completa en `engine/pricing.py` como clase stateless.

**Interfaz:**
```python
class PricingEngine:
    def calculate(self, input: CalculationInput) -> CalculationResult: ...
    def build_quote_lines(
        self,
        services: list[ServiceInput],
        config: EngineConfig
    ) -> list[QuoteLine]: ...
```

**Tipos Pydantic requeridos:**
```python
class CalculationInput(BaseModel):
    model_id: int
    service_id: int
    technician_cost_hr: float = 156.25
    target_margin: float = 0.40
    override_duration_hrs: float | None = None

    # Datos del catálogo — inyectados por la capa de servicio
    catalog_labor_cost: float | None = None
    catalog_parts_cost: float | None = None
    catalog_duration_hrs: float
    brame_ref_actual: float
    brame_total_actual: float

class CalculationResult(BaseModel):
    duration_hrs: float
    labor_cost: float           # duration × technician_cost_hr
    parts_cost: float           # brame_ref_actual (o catalog_parts_cost)
    total_bjx_cost: float       # labor + parts
    brame_price: float          # brame_total_actual
    margin_pesos: float         # brame_price - total_bjx_cost
    margin_pct: float           # margin_pesos / brame_price
    suggested_price: float      # total_bjx_cost / (1 - target_margin)
    gap_vs_target: float        # brame_price - suggested_price
    margin_status: Literal["ok", "low", "critical"]
    data_source: Literal["catalog", "estimated"]

class EngineConfig(BaseModel):
    technician_cost_hr: float = 156.25
    target_margin: float = 0.40
    iva_rate: float = 0.16
    overhead_rate: float = 0.15
```

**Reglas de cálculo:**
- `duration_hrs`: usar `override_duration_hrs` si se pasa, si no `catalog_duration_hrs`
- `labor_cost`: si `catalog_labor_cost` está disponible usarlo, si no `duration_hrs × technician_cost_hr`
- `parts_cost`: si `catalog_parts_cost` está disponible usarlo, si no `brame_ref_actual`
- `data_source = "catalog"` cuando ambos (`catalog_labor_cost` y `catalog_parts_cost`) vienen del catálogo; `"estimated"` cuando se usó cualquier proxy
- `margin_status`: `ok` si `margin_pct >= target_margin`, `low` si `>= 0.30`, `critical` si `< 0.30`

**Criterios de aceptación:**
- Función pura: mismos inputs → mismo output, determinístico
- Zero division: si `brame_price == 0` → `margin_pct = 0.0`, `margin_status = "critical"`, sin excepción
- Negativos: si `margin_pesos < 0` → `margin_pct` negativo, `margin_status = "critical"` — no truncar
- 100% cobertura de tests unitarios (ver TASK-080)
- Sin imports de DB, requests, ni I/O de ningún tipo en este archivo

---

### TASK-011 · Clase `SupplierEngine` — scoring ponderado

**Módulo:** engine  
**Prioridad:** P0 — bloqueante  
**Estimado:** 4 hrs  
**Dependencias:** TASK-010

**Descripción:**
Motor de selección de proveedor óptimo con scoring min-max ponderado.

**Tipos:**
```python
class ScoringWeights(BaseModel):
    price_weight: float = 0.50
    time_weight: float = 0.30
    tc_weight: float = 0.20

    @model_validator(mode='after')
    def weights_sum_to_one(self) -> 'ScoringWeights':
        total = round(self.price_weight + self.time_weight + self.tc_weight, 10)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Weights must sum to 1.0, got {total}")
        return self

class SupplierOption(BaseModel):
    supplier_id: int
    supplier_name: str
    ref_cost: float
    labor_cost: float
    total_price: float
    lead_time_days: int
    warranty_days: int

class ScoredSupplier(SupplierOption):
    normalized_price: float     # 0-1, menor precio → score mayor
    normalized_time: float      # 0-1, menor tiempo → score mayor
    normalized_tc: float        # 0-1, mayor garantía → score mayor
    final_score: float          # suma ponderada
    rank: int                   # 1 = mejor
    recommended: bool           # True solo para rank == 1
```

**Lógica de normalización min-max:**
```
normalized_price = 1 - (price - min_price) / (max_price - min_price)
normalized_time  = 1 - (days  - min_days)  / (max_days  - min_days)
normalized_tc    = (warranty  - min_warranty) / (max_warranty - min_warranty)

Edge case: si max == min para una dimensión → score = 1.0 para todos en esa dimensión
```

**Criterios de aceptación:**
- Con un solo proveedor: `score = 1.0`, `rank = 1`, `recommended = True`
- Con múltiples: exactamente uno tiene `recommended = True`
- Pesos que no suman 1.0 → `ValidationError` de Pydantic, no silencioso
- Función pura, sin DB, sin I/O
- Tests para: precio igual en todos, tiempo igual en todos, garantía igual en todos

---

### TASK-012 · Endpoint `POST /engine/calculate`

**Módulo:** engine  
**Prioridad:** P0 — bloqueante  
**Estimado:** 4 hrs  
**Dependencias:** TASK-010, TASK-011, TASK-003

**Descripción:**
Exponer el motor de cálculo como endpoint REST. La capa de servicio resuelve los datos del catálogo y los inyecta en el engine como función pura.

**Request / Response:**
```
POST /engine/calculate
Authorization: Bearer <token>

{
  "model_id": 3,
  "service_id": 7,
  "technician_cost_hr": 156.25,    # opcional, default de config
  "target_margin": 0.40             # opcional, default de config
}

→ 200
{
  "input": { "model_name": "...", "service_name": "...", ... },
  "result": { ...CalculationResult },
  "suppliers": [ ...ScoredSupplier[] ],
  "recommended_supplier": { ...ScoredSupplier },
  "scoring_weights": { "price": 0.5, "time": 0.3, "tc": 0.2 }
}

→ 404  { "detail": "No catalog data for model_id=3 / service_id=99" }
→ 422  Pydantic validation error
```

**Criterios de aceptación:**
- Requiere JWT válido (cualquier rol)
- Valida existencia de `model_id` y `service_id` antes de llamar al engine
- Retorna lista de todos los proveedores con precio para ese combo, rankeados
- Tiempo de respuesta < 200ms (queries simples + cálculo en memoria)
- Si no hay proveedores para el combo: `suppliers = []`, `recommended_supplier = null`
- Tests de integración: combo válido, model_id inexistente, service_id sin precios Brame, sin JWT

---

### TASK-013 · Endpoint `POST /engine/batch`

**Módulo:** engine  
**Prioridad:** P1  
**Estimado:** 3 hrs  
**Dependencias:** TASK-012

**Descripción:**
Calcular múltiples servicios para un mismo modelo en una sola llamada. Usado por la calculadora multi-servicio y por la creación de cotizaciones.

**Request / Response:**
```
POST /engine/batch
{
  "model_id": 3,
  "service_ids": [7, 12, 18],
  "technician_cost_hr": 156.25,
  "target_margin": 0.40
}

→ 200
{
  "model": { "id": 3, "name": "CHEVROLET - AVEO" },
  "lines": [
    {
      "service_id": 7,
      "service_name": "CAMBIO DE BALATAS TRASERAS",
      "result": { ...CalculationResult },
      "recommended_supplier": { ...ScoredSupplier }
    }
  ],
  "summary": {
    "total_bjx_cost": 2450.00,
    "total_brame_price": 3200.00,
    "blended_margin_pct": 0.234,
    "blended_margin_pesos": 750.00,
    "ok_count": 1,
    "low_count": 1,
    "critical_count": 1,
    "no_data_count": 0
  }
}
```

**Criterios de aceptación:**
- Servicios sin datos retornan `margin_status: "no_data"` en su línea — no rompen el batch
- `blended_margin_pct` = `sum(margin_pesos) / sum(brame_price)` — no promedio simple de porcentajes
- Máximo 20 servicios por llamada → 422 si se excede
- Un solo query de DB para resolver todos los catálogos del batch (no N queries)

---

---

## MÓDULO 2 — Catálogo

---

### TASK-020 · CRUD modelos de vehículo

**Módulo:** catalog  
**Prioridad:** P1  
**Estimado:** 4 hrs  
**Dependencias:** TASK-002

**Endpoints:**
```
GET    /catalog/models              # lista paginada con métricas
GET    /catalog/models/{id}         # detalle + servicios disponibles
POST   /catalog/models              # crear (admin)
PUT    /catalog/models/{id}         # editar nombre/marca (admin)
DELETE /catalog/models/{id}         # soft-delete: active=False (admin)
```

**Criterios de aceptación:**
- `GET /catalog/models` incluye campo `service_count` (cuántos servicios tienen datos en catálogo para ese modelo)
- Filtro: `?brand=CHEVROLET`, `?active=true`
- Paginación: `?page=1&size=20`, retorna `{items, total, page, size}`
- No se puede eliminar un modelo con cotizaciones activas → 409 con mensaje explicativo
- `POST` valida que no exista ya ese nombre de modelo (case-insensitive)

---

### TASK-021 · CRUD servicios

**Módulo:** catalog  
**Prioridad:** P1  
**Estimado:** 4 hrs  
**Dependencias:** TASK-002

**Endpoints:**
```
GET    /catalog/services                      # con filtro y búsqueda
GET    /catalog/services/{id}                 # detalle + modelos donde tiene datos
GET    /catalog/services/{id}/models          # qué modelos tienen datos para este servicio
POST   /catalog/services                      # crear (admin)
PUT    /catalog/services/{id}                 # editar nombre/categoría (admin)
```

**Criterios de aceptación:**
- Campo `coverage_pct`: porcentaje de modelos activos que tienen datos de costo para este servicio
- Búsqueda parcial case-insensitive: `?search=balatas`
- Ordenamiento: `?sort=name|coverage_pct|category`
- Campo `category` para agrupar servicios: `frenos`, `motor`, `suspension`, `electrico`, `neumaticos`, `otros`

---

### TASK-022 · CRUD catálogo de costos BJX

**Módulo:** catalog  
**Prioridad:** P1  
**Estimado:** 5 hrs  
**Dependencias:** TASK-020, TASK-021

**Endpoints:**
```
GET  /catalog/costs                          # tabla completa paginada
GET  /catalog/costs?model_id=&service_id=    # lookup puntual
PUT  /catalog/costs/{model_id}/{service_id}  # actualizar costos (admin)
POST /catalog/costs/import                   # importar desde XLSX (admin)
GET  /catalog/costs/export                   # exportar a CSV
GET  /catalog/costs/missing                  # combos sin BJX costs
```

**Criterios de aceptación:**
- `PUT` registra `updated_at` y `updated_by` — historial inmutable (crear nueva versión, no editar)
- `GET /catalog/costs/missing` lista combos que tienen precio Brame pero NO tienen `bjx_labor_cost` ni `bjx_parts_cost` — estos son los que el engine usa proxy y son candidatos a completar
- Import desde XLSX: validar formato antes de procesar → retornar `{imported: N, skipped: M, errors: [{"row": 5, "reason": "..."}]}`
- Export CSV incluye columnas: `modelo, servicio, bjx_labor_cost, bjx_parts_cost, duration_hrs, updated_at`

---

---

## MÓDULO 3 — Proveedores

---

### TASK-030 · CRUD proveedores

**Módulo:** suppliers  
**Prioridad:** P1  
**Estimado:** 4 hrs  
**Dependencias:** TASK-002

**Endpoints:**
```
GET    /suppliers           # lista con métricas de cobertura
GET    /suppliers/{id}      # detalle + estadísticas agregadas
POST   /suppliers           # crear (admin)
PUT    /suppliers/{id}      # editar términos y condiciones (admin)
DELETE /suppliers/{id}      # soft-delete (admin)
```

**Campos del supplier:** `name`, `lead_time_days`, `warranty_days`, `return_policy` (texto libre), `contact_name`, `contact_email`, `active`.

**Criterios de aceptación:**
- `GET /suppliers` incluye por proveedor: `price_count`, `model_coverage` (# modelos cubiertos), `service_coverage` (# servicios cubiertos), `avg_price_index` (precio promedio normalizado vs Brame)
- No se puede desactivar si es el único proveedor activo con precios vigentes → 409
- Al crear proveedor: `lead_time_days >= 1`, `warranty_days >= 0`

---

### TASK-031 · CRUD precios de proveedor

**Módulo:** suppliers  
**Prioridad:** P1  
**Estimado:** 5 hrs  
**Dependencias:** TASK-030

**Endpoints:**
```
GET  /suppliers/{id}/prices                            # todos los precios vigentes
GET  /suppliers/{id}/prices?model_id=&service_id=      # lookup puntual
POST /suppliers/{id}/prices                            # agregar precio unitario (admin)
PUT  /suppliers/{id}/prices/{price_id}                 # actualizar precio (admin)
POST /suppliers/{id}/prices/import                     # importar lista desde XLSX (admin)
GET  /suppliers/{id}/prices/history/{model_id}/{service_id}  # historial
```

**Criterios de aceptación:**
- `PUT` es inmutable: NO edita el registro existente — crea uno nuevo con `is_current=True` y marca el anterior `is_current=False`
- `GET history` retorna últimos 12 registros ordenados por `price_date DESC`
- Import: upsert por `(supplier_id, model_id, service_id)`, marcar nuevo como `is_current=True`
- Campo `price_change_pct` en historial: variación porcentual respecto al precio anterior

---

### TASK-032 · Comparativo multi-proveedor

**Módulo:** suppliers  
**Prioridad:** P1  
**Estimado:** 3 hrs  
**Dependencias:** TASK-011, TASK-031

**Endpoint:**
```
GET /suppliers/compare?model_id=3&service_id=7&weights=50,30,20

→ 200
{
  "model": "CHEVROLET - AVEO",
  "service": "CAMBIO DE BALATAS TRASERAS",
  "weights": { "price": 0.5, "time": 0.3, "tc": 0.2 },
  "suppliers": [
    {
      "rank": 1,
      "supplier_name": "DAPESA",
      "ref_cost": 693.60,
      "labor_cost": 0,
      "total_price": 693.60,
      "lead_time_days": 1,
      "warranty_days": 90,
      "return_policy": "7 días",
      "normalized_price": 0.92,
      "normalized_time": 1.0,
      "normalized_tc": 0.75,
      "final_score": 0.93,
      "recommended": true
    }
  ],
  "bjx_calculation": { ...CalculationResult usando proveedor recomendado }
}
```

**Criterios de aceptación:**
- `weights` query param formato `price,time,tc` sumando 100 — si no se pasa usar defaults de `config_params`
- Si solo hay un proveedor: retornar igual con `rank=1`, `score=1.0`
- 404 si no hay ningún proveedor con precio vigente para ese combo
- `bjx_calculation` usa el proveedor con `rank=1`

---

---

## MÓDULO 4 — Cotizaciones

---

### TASK-040 · Crear y gestionar cotizaciones

**Módulo:** quotes  
**Prioridad:** P1  
**Estimado:** 6 hrs  
**Dependencias:** TASK-013, TASK-022

**Endpoints:**
```
POST   /quotes              # crear cotización (operador, admin)
GET    /quotes              # listar con filtros (todos los roles)
GET    /quotes/{id}         # detalle completo con líneas (todos los roles)
PUT    /quotes/{id}         # editar notas / cambiar status (operador, admin)
DELETE /quotes/{id}         # cancelar — status=cancelled, soft (operador, admin)
```

**Request POST:**
```json
{
  "model_id": 3,
  "service_ids": [7, 12, 18],
  "technician_cost_hr": 156.25,
  "target_margin": 0.40,
  "notes": "Cliente: Brame sucursal norte — renovación contrato Q2"
}
```

**Lifecycle de status:** `draft` → `confirmed` → `invoiced` → `cancelled`

**Criterios de aceptación:**
- `quote_number` autoincremental formato `BJX-YYYY-NNNN` (ej. `BJX-2026-0047`)
- Al confirmar (`status: confirmed`): congelar todos los valores calculados del engine en `quote_lines` — los precios no cambian aunque luego se actualice el catálogo
- `viewer` solo puede leer — 403 si intenta crear o editar
- No se puede cambiar a `draft` desde `confirmed` ni `invoiced`
- `confirmed` → `cancelled` permitido, `invoiced` → `cancelled` solo para `admin`
- `GET /quotes` paginado con filtros: `?status=`, `?model_id=`, `?from=`, `?to=`

---

### TASK-041 · Exportar cotización a PDF y XLSX

**Módulo:** quotes  
**Prioridad:** P2  
**Estimado:** 6 hrs  
**Dependencias:** TASK-040

**Endpoint:**
```
GET /quotes/{id}/export?format=pdf|xlsx
```

**Contenido del PDF:**
- Header: logo BJX Motors, número de cotización, fecha, modelo de vehículo
- Tabla de servicios: concepto, duración (hrs), costo MO, costo refacción, costo total BJX, precio Brame, margen $, margen %
- Semáforo de color por fila (verde/naranja/rojo según `margin_status`)
- Sección resumen: totales, margen blended %, gap vs objetivo
- Footer: parámetros usados (costo/hr técnico, margen objetivo), fecha de generación, versión

**Criterios de aceptación:**
- PDF: `reportlab` o `weasyprint`, stream directo (no guardar en disco)
- XLSX: `openpyxl`, mismo diseño que el MVP — colores por semáforo en columna de margen %
- Nombre de archivo: `BJX-{quote_number}-{YYYY-MM-DD}.pdf`
- Solo se puede exportar cotizaciones en status `confirmed` o `invoiced`
- Tiempo de generación < 3 segundos

---

### TASK-042 · Historial y estadísticas de cotizaciones

**Módulo:** quotes  
**Prioridad:** P2  
**Estimado:** 3 hrs  
**Dependencias:** TASK-040

**Endpoints:**
```
GET /quotes/stats
GET /quotes?sort=created_at|margin_pct|quote_number&order=asc|desc
```

**Response /quotes/stats:**
```json
{
  "period": "2026-04",
  "total_quotes": 23,
  "by_status": { "draft": 5, "confirmed": 14, "invoiced": 3, "cancelled": 1 },
  "avg_blended_margin_pct": 0.187,
  "critical_quotes_count": 8,
  "ok_quotes_count": 4,
  "by_model": [
    { "model": "CHEVROLET - AVEO", "count": 9, "avg_margin_pct": 0.21 }
  ]
}
```

**Criterios de aceptación:**
- Filtro por período: `?from=2026-01-01&to=2026-04-30`
- `by_model` ordenado por `count DESC`
- Solo cotizaciones en status `confirmed` o `invoiced` cuentan para estadísticas de margen

---

---

## MÓDULO 5 — Dashboard y Analytics

---

### TASK-050 · Endpoint KPIs ejecutivos

**Módulo:** dashboard  
**Prioridad:** P1  
**Estimado:** 4 hrs  
**Dependencias:** TASK-010, TASK-003

**Endpoint:**
```
GET /dashboard/summary
```

**Response:**
```json
{
  "total_services": 24,
  "total_models": 5,
  "total_combos": 120,
  "avg_margin_pct": 0.121,
  "critical_combos": 87,
  "low_combos": 21,
  "ok_combos": 12,
  "critical_pct": 0.725,
  "margin_distribution": {
    "ok":       { "count": 12,  "pct": 0.100 },
    "low":      { "count": 21,  "pct": 0.175 },
    "critical": { "count": 87,  "pct": 0.725 }
  },
  "config_used": {
    "technician_cost_hr": 156.25,
    "target_margin": 0.40
  },
  "last_calculated": "2026-04-10T08:00:00"
}
```

**Criterios de aceptación:**
- Usa `technician_cost_hr` y `target_margin` de `config_params` — no hardcodeados
- `avg_margin_pct` = promedio ponderado por precio Brame, no promedio simple
- Cacheable en memoria: recalcular cuando se actualizan precios o config (invalidación por evento)
- Tiempo de respuesta < 100ms
- `last_calculated` refleja cuándo se ejecutó el último recálculo

---

### TASK-051 · Rentabilidad por modelo

**Módulo:** dashboard  
**Prioridad:** P1  
**Estimado:** 3 hrs  
**Dependencias:** TASK-050

**Endpoint:**
```
GET /dashboard/by-model?sort=margin_pct_asc&status=critical
```

**Response (por modelo):**
```json
{
  "model_id": 3,
  "model_name": "CHEVROLET - AVEO",
  "service_count": 24,
  "avg_bjx_cost": 1087.69,
  "avg_brame_price": 1394.59,
  "avg_margin_pct": 0.202,
  "avg_margin_pesos": 386.89,
  "critical_count": 18,
  "low_count": 4,
  "ok_count": 2,
  "margin_status": "critical",
  "worst_services": [
    { "service_name": "CAMBIO DE BALATAS TRASERAS", "margin_pct": -0.035 }
  ]
}
```

**Criterios de aceptación:**
- `worst_services`: top 3 servicios con menor margen para ese modelo
- Filtro: `?status=critical|low|ok` retorna solo modelos con ese `margin_status`
- Ordenamiento: `?sort=margin_pct_asc|margin_pct_desc|model_name|service_count`

---

### TASK-052 · Rentabilidad por servicio

**Módulo:** dashboard  
**Prioridad:** P1  
**Estimado:** 3 hrs  
**Dependencias:** TASK-050

**Endpoint:**
```
GET /dashboard/by-service?category=frenos&sort=margin_pct_asc
```

**Response (por servicio):**
```json
{
  "service_id": 7,
  "service_name": "CAMBIO DE BALATAS TRASERAS",
  "category": "frenos",
  "model_count": 5,
  "critical_model_count": 4,
  "avg_margin_pct": 0.154,
  "worst_model": { "name": "CHEVROLET - BEAT", "margin_pct": -0.035 },
  "best_model": { "name": "NISSAN MARCH", "margin_pct": 0.32 }
}
```

**Criterios de aceptación:**
- Filtro: `?category=frenos|motor|suspension|electrico|neumaticos|otros`
- `critical_model_count`: cuántos modelos tienen ese servicio en status crítico
- Ordenamiento mismo que TASK-051

---

### TASK-053 · Simulación de escenarios

**Módulo:** dashboard  
**Prioridad:** P2  
**Estimado:** 4 hrs  
**Dependencias:** TASK-050, TASK-010

**Endpoint:**
```
POST /dashboard/simulate
{
  "technician_cost_hr": 140.00,
  "target_margin": 0.35,
  "brame_price_increase_pct": 0.05
}
```

**Response:**
```json
{
  "scenario": { "technician_cost_hr": 140, "target_margin": 0.35, "brame_increase": 0.05 },
  "summary": { ...mismo formato que /dashboard/summary },
  "delta_vs_current": {
    "avg_margin_pct_delta": +0.043,
    "critical_combos_delta": -12,
    "ok_combos_delta": +8
  }
}
```

**Criterios de aceptación:**
- No modifica `config_params` ni ninguna tabla — solo calcula en memoria
- `brame_price_increase_pct`: aplica multiplicador sobre todos los precios Brame antes de calcular
- Tiempo de respuesta < 500ms (recalcula todos los combos en memoria)
- Útil para reuniones de renegociación — mostrar impacto de cambio de tarifa Brame

---

---

## MÓDULO 6 — Configuración y Usuarios

---

### TASK-060 · Auth — registro, login, JWT

**Módulo:** users  
**Prioridad:** P0 — bloqueante  
**Estimado:** 5 hrs  
**Dependencias:** TASK-002

**Endpoints:**
```
POST /auth/register    # crear usuario (solo admin puede registrar nuevos)
POST /auth/login       # retorna access_token + refresh_token
POST /auth/refresh     # renovar access_token con refresh_token válido
POST /auth/logout      # invalidar refresh_token
GET  /auth/me          # datos del usuario autenticado
PUT  /auth/me          # cambiar password
```

**Roles y permisos:**

| Acción | admin | operador | viewer |
|--------|-------|----------|--------|
| Ver dashboard y calculadora | ✅ | ✅ | ✅ |
| Crear / editar cotizaciones | ✅ | ✅ | ❌ |
| Confirmar / cancelar cotizaciones | ✅ | ✅ | ❌ |
| Gestionar catálogo y proveedores | ✅ | ❌ | ❌ |
| Gestionar config y usuarios | ✅ | ❌ | ❌ |
| Importar precios | ✅ | ❌ | ❌ |

**Criterios de aceptación:**
- JWT `access_token` expira en 8 hrs, `refresh_token` en 30 días
- Passwords hasheados con bcrypt, mínimo 8 caracteres, al menos 1 número
- Rate limiting en `/auth/login`: máximo 5 intentos fallidos por IP en 10 minutos → 429
- 403 claro en endpoints por falta de rol (no 401 genérico)
- `GET /auth/me` retorna: `{id, email, role, created_at}` — nunca retornar `hashed_password`

---

### TASK-061 · CRUD parámetros de configuración

**Módulo:** core  
**Prioridad:** P2  
**Estimado:** 3 hrs  
**Dependencias:** TASK-060

**Endpoints:**
```
GET /config                  # todos los parámetros con descripción
PUT /config/{key}            # actualizar valor (solo admin)
GET /config/history/{key}    # historial de cambios de ese parámetro
```

**Parámetros gestionados:**

| Key | Default | Validación |
|-----|---------|-----------|
| `technician_cost_hr` | 156.25 | > 0 |
| `target_margin` | 0.40 | 0.01 – 0.99 |
| `iva_rate` | 0.16 | 0.0 – 0.30 |
| `overhead_rate` | 0.15 | 0.0 – 0.50 |
| `scoring_weight_price` | 0.50 | los 3 pesos deben sumar 1.0 |
| `scoring_weight_time` | 0.30 | ídem |
| `scoring_weight_tc` | 0.20 | ídem |

**Criterios de aceptación:**
- Todo cambio registra `{old_value, new_value, changed_by, changed_at}` en `config_history` — inmutable
- Al actualizar cualquier peso de scoring: validar que los 3 suman 1.0 en el mismo request
- El engine siempre lee config de DB si no se pasa override en el request individual
- `GET /config/history/{key}` retorna últimos 20 cambios ordenados por `changed_at DESC`

---

---

## MÓDULO 7 — Frontend

---

### TASK-070 · Layout y navegación base

**Módulo:** frontend  
**Prioridad:** P1  
**Estimado:** 4 hrs  
**Dependencias:** TASK-060

**Descripción:**
Shell de la aplicación: sidebar, header, routing y route guards.

**Criterios de aceptación:**
- Sidebar con ítems: Dashboard, Calculadora, Cotizaciones, Catálogo, Proveedores, Configuración
- Route guards: redirigir a `/login` si no hay JWT válido; mostrar solo rutas permitidas según rol
- Header: nombre de usuario, rol badge, botón logout
- Layout responsive: sidebar colapsable en mobile (hamburger)
- Estado global: React Context o Zustand para `user`, `config` (parámetros de `config_params`), `theme`

---

### TASK-071 · Página Dashboard

**Módulo:** frontend  
**Prioridad:** P1  
**Estimado:** 8 hrs  
**Dependencias:** TASK-070, TASK-050, TASK-051

**Descripción:**
Replicar el MVP de la imagen 1 — dashboard ejecutivo con KPIs, gráficas y tabla de rentabilidad.

**Componentes:**
- 4 KPI cards: Servicios (24), Modelos (5), Margen Promedio (12.1%), Combos Críticos (87/120)
- `BarChart` (Recharts): margen promedio por modelo, barras en color por status (verde/naranja/rojo)
- `PieChart` / `DoughnutChart` (Recharts): distribución ≥40% OK / 30-39% Bajo / <30% Crítico
- Tabla rentabilidad por modelo: columnas Modelo, Servicios, Costo BJX Prom., Precio Brame Prom., Margen $, Margen %, badge de semáforo
- Modal "Simular Escenario": 3 inputs (costo/hr, margen objetivo, % aumento Brame) → llama TASK-053 → muestra delta

**Criterios de aceptación:**
- Data desde `GET /dashboard/summary` + `GET /dashboard/by-model`
- Loading skeletons mientras carga (no spinner)
- Semáforo: `#10B981` (ok), `#F97316` (low), `#EF4444` (critical)
- Click en fila de modelo → navega a `/catalog?model_id=X`
- Responsive: en mobile tabla con scroll horizontal, charts apilados verticalmente

---

### TASK-072 · Página Calculadora

**Módulo:** frontend  
**Prioridad:** P0 — core  
**Estimado:** 10 hrs  
**Dependencias:** TASK-070, TASK-012, TASK-032

**Descripción:**
Replicar el MVP de la imagen 2 — calculadora interactiva con desglose de costos en tiempo real.

**Sección Selección:**
- Dropdown Modelo: carga de `GET /catalog/models`
- Dropdown Servicio: carga de `GET /catalog/services` filtrado por modelo — solo servicios con datos disponibles para ese modelo
- Al cambiar Modelo: limpiar Servicio y recargar opciones

**Sección Parámetros Dinámicos:**
- Input "Costo por hora técnico (MXN)": default de config, editable, highlight azul
- Input "Margen objetivo (%)": default de config, editable, highlight azul

**Sección Desglose de Costos (tabla de 10 filas):**

| # | Concepto | Fórmula / Lógica | Valor |
|---|----------|-----------------|-------|
| 1 | Duración del servicio | Catálogo BJX por modelo + servicio | X hrs |
| 2 | Costo/hora técnico BJX | Parámetro dinámico | $X |
| 3 | Costo Mano de Obra | Duración × Costo/hora | $X |
| 4 | Costo Refacción | BRAME_REF_ACTUAL / catálogo BJX | $X |
| 5 | Costo Total BJX | MO + Refacción | **$X** |
| 6 | Precio que paga Brame | BRAME_TOTAL_ACTUAL | **$X** |
| 7 | Margen Bruto ($) | Precio Brame − Costo BJX | **$X** |
| 8 | Margen Bruto (%) | Margen $ ÷ Precio Brame | **X%** |
| 9 | Precio sugerido (obj.) | Costo BJX ÷ (1 − margen obj.) | $X |
| 10 | Gap vs objetivo | Precio Brame − Precio sugerido | $X |

**Panel lateral — Comparativo de Proveedores:**
- Tabla con rank, proveedor, precio, días entrega, garantía, score
- Proveedor recomendado destacado con badge
- Sliders de pesos (precio / tiempo / T&C) → recalcula ranking en tiempo real

**Semáforo inferior:**
- `✅ Margen OK` (verde) / `⚠️ Margen Bajo` (naranja) / `🔴 Margen Crítico` (rojo)

**Botón "Guardar Cotización":**
- Abre modal: agregar más servicios al mismo modelo, campo notas
- `POST /quotes` → toast con número de cotización generado
- Link directo a `/quotes/{id}` en el toast

**Criterios de aceptación:**
- Cambiar cualquier parámetro recalcula en tiempo real (debounce 300ms sobre `POST /engine/calculate`)
- Si combo no tiene datos: mostrar `"Sin datos en catálogo — valores estimados"` con ícono de advertencia
- Si `margin_status = "critical"`: highlight rojo en fila de Margen % y en semáforo inferior
- Responsive: en mobile parámetros apilados, tabla con scroll
- Estado de loading: skeleton en la tabla mientras calcula (no bloquear toda la UI)

---

### TASK-073 · Página Cotizaciones

**Módulo:** frontend  
**Prioridad:** P2  
**Estimado:** 6 hrs  
**Dependencias:** TASK-070, TASK-040, TASK-041, TASK-042

**Descripción:**
Gestión completa del ciclo de vida de cotizaciones.

**Vistas:**
- Lista paginada con filtros (status, modelo, rango de fechas), búsqueda por `quote_number`
- Detalle de cotización: tabla de servicios con semáforo, resumen, botón confirmar / cancelar
- Botones de exportar a PDF y XLSX

**Criterios de aceptación:**
- Badge de color por status: `draft` gris, `confirmed` azul, `invoiced` verde, `cancelled` rojo
- Solo mostrar botón "Confirmar" si status = `draft` y usuario tiene permisos
- Exportar solo habilitado para status `confirmed` / `invoiced`
- Lista vacía state: ilustración + botón "Crear primera cotización"

---

### TASK-074 · Página Catálogo y Proveedores

**Módulo:** frontend  
**Prioridad:** P2  
**Estimado:** 8 hrs  
**Dependencias:** TASK-070, TASK-022, TASK-031

**Sub-páginas:**

**Catálogo (/catalog):**
- Tabla de `service_catalog` filtrable por modelo y servicio
- Celdas `bjx_labor_cost` y `bjx_parts_cost` editables inline (click para editar, enter para guardar)
- Indicador visual en filas donde `data_source = "estimated"` (celdas en amarillo)
- Sección "Combos sin datos": tabla de `GET /catalog/costs/missing` con botón para completar

**Proveedores (/suppliers):**
- Tarjetas por proveedor con métricas (cobertura, precio promedio)
- Al expandir: tabla de precios vigentes con historial de cambios por combo
- Botón "Importar lista de precios" → upload de XLSX + preview antes de confirmar

---

---

## MÓDULO 8 — Tests y Calidad

---

### TASK-080 · Tests unitarios — PricingEngine y SupplierEngine

**Módulo:** tests  
**Prioridad:** P1  
**Estimado:** 5 hrs  
**Dependencias:** TASK-010, TASK-011

**Cobertura mínima requerida: 95%**

**Casos de test obligatorios — PricingEngine:**

| Caso | Input | Expected |
|------|-------|----------|
| Margen normal positivo | costs normales | `margin_pct > 0`, `margin_status` correcto |
| Margen exactamente 40% | precio sugerido == brame_price | `margin_status = "ok"`, `gap = 0` |
| Margen cero | `brame_price == total_bjx_cost` | `margin_pct = 0`, `margin_status = "critical"` |
| Margen negativo | `total_bjx_cost > brame_price` | `margin_pct < 0`, `margin_status = "critical"` |
| Sin labor cost en catálogo | `catalog_labor_cost = None` | usa `duration × cost_hr`, `data_source = "estimated"` |
| Sin parts cost en catálogo | `catalog_parts_cost = None` | usa `brame_ref_actual`, `data_source = "estimated"` |
| Brame price cero | `brame_price = 0` | `margin_pct = 0.0`, no ZeroDivisionError |
| Override duration | `override_duration_hrs = 2.5` | usa 2.5, no el del catálogo |
| Ambos del catálogo | todos los valores presentes | `data_source = "catalog"` |

**Casos de test obligatorios — SupplierEngine:**

| Caso | Input | Expected |
|------|-------|----------|
| Un solo proveedor | lista de 1 | `score=1.0`, `rank=1`, `recommended=True` |
| Todos igual en precio | precios idénticos | `normalized_price=1.0` para todos |
| Todos igual en tiempo | días idénticos | `normalized_time=1.0` para todos |
| Todos igual en garantía | warranty idéntico | `normalized_tc=1.0` para todos |
| Pesos no suman 1.0 | `weights=(0.5, 0.3, 0.1)` | `ValidationError` |
| Proveedor claramente mejor | diferencias claras | `rank=1` correcto, exactamente 1 `recommended=True` |

---

### TASK-081 · Tests de integración — endpoints críticos

**Módulo:** tests  
**Prioridad:** P1  
**Estimado:** 6 hrs  
**Dependencias:** TASK-080

**Setup:** `pytest` + `TestClient` de FastAPI + SQLite en memoria + fixture que carga seed data mínimo.

**Endpoints con tests obligatorios:**

**`POST /engine/calculate`**
- Happy path: combo válido con datos completos
- Combo con `data_source = "estimated"` (sin BJX costs)
- `model_id` inexistente → 404
- `service_id` sin precios Brame → 404
- Sin JWT → 401
- JWT con rol `viewer` → 200 (puede ver)

**`POST /engine/batch`**
- 3 servicios válidos → summary correcto
- 1 servicio sin datos → aparece como `no_data`, no rompe el batch
- Más de 20 servicios → 422
- `model_id` inexistente → 404

**`GET /dashboard/summary`**
- Retorna estructura completa
- `critical_combos + low_combos + ok_combos == total_combos`
- `margin_distribution` sumas == 1.0

**`POST /quotes`**
- Crear cotización → `quote_number` en formato correcto
- Confirmar cotización → valores congelados en `quote_lines`
- `viewer` intenta crear → 403
- `PUT` con status inválido → 422

**`GET /suppliers/compare`**
- Combo con 2 proveedores → ranking correcto
- Pesos que no suman 100 → 422
- Combo sin proveedores → 404

**CI:** Corren automáticamente en GitHub Actions en cada PR a `main`. PR no se puede mergear si hay tests fallando.

---

---

## Resumen de prioridades y orden de ejecución

| Sprint | Tasks | Qué habilita | Duración estimada |
|--------|-------|-------------|-------------------|
| **Sprint 1 — Fundación** | TASK-001, TASK-002, TASK-003, TASK-060 | DB lista, datos cargados, auth funcionando | ~20 hrs |
| **Sprint 2 — Motor** | TASK-010, TASK-011, TASK-012, TASK-013 | El cálculo funciona vía API y es testeable | ~17 hrs |
| **Sprint 3 — Catálogo + Proveedores** | TASK-020, TASK-021, TASK-022, TASK-030, TASK-031, TASK-032 | Gestión de datos completa, comparativo multi-proveedor | ~25 hrs |
| **Sprint 4 — Cotizaciones + Dashboard** | TASK-040, TASK-041, TASK-042, TASK-050, TASK-051, TASK-052, TASK-053 | Flujo de negocio completo end-to-end | ~29 hrs |
| **Sprint 5 — Frontend** | TASK-070, TASK-071, TASK-072, TASK-073, TASK-074 | UI operativa, MVP web listo para testear | ~36 hrs |
| **Sprint 6 — Calidad** | TASK-061, TASK-080, TASK-081 | Producción-ready, CI verde | ~14 hrs |

**Total estimado: ~141 hrs de desarrollo**

---

## Notas de implementación críticas

**El engine es el contrato.** `PricingEngine` y `SupplierEngine` son funciones puras — implementarlas y testearlas primero (Sprint 1-2) antes de tocar DB o frontend. Todo lo demás las consume.

**Inmutabilidad de precios.** Los precios históricos NUNCA se editan — siempre se crean nuevos registros con `is_current` toggle. Esto aplica tanto a `supplier_prices` como a `service_catalog`.

**Config como fuente de verdad.** El engine nunca usa constantes hardcodeadas en el código — siempre lee de `config_params`. Los overrides por-request son excepciones explícitas (parámetros opcionales en los endpoints).

**Proxy transparente.** Cuando el catálogo BJX no tiene `bjx_labor_cost` o `bjx_parts_cost`, el engine usa proxies (duración×costo_hr y brame_ref_actual respectivamente). Esto debe quedar reflejado en `data_source = "estimated"` y mostrarse visualmente en el frontend como advertencia — no ocultarlo.

**Seed idempotente.** El script de seed debe poder correr en cualquier momento sin duplicar datos. Usar upsert por clave natural (`model_name + service_name` para catálogo, `supplier_id + model_id + service_id` para precios).
