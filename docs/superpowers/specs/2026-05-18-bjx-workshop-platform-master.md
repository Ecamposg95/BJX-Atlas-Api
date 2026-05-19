# BJX Atlas — Workshop Platform Master Spec

**Spec ID:** `bjx-workshop-platform-master`
**Fecha:** 2026-05-18
**Estado:** Aprobado (pendiente revisión final del usuario)
**Owner:** Equipo BJX-Atlas
**Repo:** [Ecamposg95/BJX-Atlas-Api](https://github.com/Ecamposg95/BJX-Atlas-Api)
**Branching:** `feature/*` → `develop` → `main` (auto-deploy Railway)

---

## Contexto

CLAUDE.md describe BJX Atlas como "plataforma de cotización, costos y márgenes". El estado real del repositorio es muy superior a esa descripción: ya existe multi-tenancy (Organization → Branch), roles operativos detallados (recepcion / mecanico / jefe_taller / almacen / gerente_sede / director), modelos y routers de Work Orders con multi-líneas y timer, Service Bays, Evidence (R2 storage), inventario completo (warehouses, parts, stock_levels, movements append-only, inventory_requests con workflow), auditoría por listeners SQLAlchemy y frontend React/Vite con páginas de Mechanic, OperationalDashboard, WorkshopBoard.

Este spec maestro define la **evolución completa** del producto para cubrir las historias de usuario del backlog ampliado (recepción → mecánica → inventario → catálogo → dashboards → portal cliente → compras → multi-sucursal). No reescribe lo existente; lo **extiende** mediante 4 fases mergeables independientemente a `main`.

## Objetivo del producto

Plataforma operativa end-to-end para taller automotriz multi-sucursal (BJX Motors × Brame) que cubra:

- Recepción de unidades con tipo (cita / grúa / stand-by / walk-in / garantía / interno)
- Flujo completo recepción → asignación → reparación → QA → entrega con historial inmutable
- Asignación de mecánicos validada por nivel + skills + carga
- Vista mecánico mobile-first con máximo 3 acciones primarias
- Inventario operativo con semáforo y workflow refacciones
- Catálogo de servicios con propuesta del jefe y aprobación del gerente
- Dashboards por rol (asesor, jefe, almacenista, gerente, director)
- Portal cliente público por folio + token
- Compras y proveedores con rotación SKU
- Multi-sucursal con aislamiento estricto y vistas globales para roles GLOBAL

## Decomposición en fases

| Fase | Nombre | Estado | User Stories | Esfuerzo estimado |
|------|--------|--------|--------------|-------------------|
| **Fase 1** 🔴 Core | Flujo de unidades + Asignación + Vista mecánico | Lista para arrancar | US-01, US-02, US-03, US-04 | ~110h |
| **Fase 2** 🟠 Operación | Inventario operativo + Refacciones en OS | Bloqueada por Fase 1 | US-05, US-06 + refinos | ~58h |
| **Fase 3** 🟡 Gestión | Catálogo dinámico + Dashboards gerenciales + Notificaciones | Bloqueada por Fases 1-2 | US-07, US-09, US-10 | ~105h |
| **Fase 4** 🟢 Expansión | Portal cliente + Compras + Capacitación + Escala | Bloqueada por Fases 1-3 | US-12 + Compras + UX | ~130h |

**Cada fase mergea a `main` y se despliega independientemente.** El plan ejecutable (vía `writing-plans`) se genera por fase, JIT, al cerrar la anterior. Solo Fase 1 se planea junto a este master.

---

## Sección 1 — Principios de arquitectura

### 1.1 Principios no-negociables

| # | Principio | Implicación práctica |
|---|-----------|---------------------|
| **P1** | **Domain-Driven, módulos delimitados** | Cada subdominio (`workshop`, `inventory`, `catalog`, `pricing`, `customer_portal`, `analytics`, `procurement`) vive en su carpeta. Sin cross-imports salvo a través de servicios públicos del dominio. |
| **P2** | **Multi-tenancy estricto** | Toda query operativa pasa por `branch_scoped_query()`. Roles GLOBAL hacen override con `X-Branch-Id`. Roles BRANCH_SCOPED no pueden escapar de su sucursal. |
| **P3** | **Inmutabilidad y append-only para historiales** | Status changes, asignaciones, movimientos de inventario, cambios de precio, aprobaciones — todo en tablas `*_history` o `*_movements`. Nunca UPDATE destructivo sobre datos auditables. |
| **P4** | **State machines explícitas** | Toda entidad con estados tiene un mapa `valid_transitions` declarativo en su módulo, validado por servicio. No `if status == 'x'` esparcidos en routers. |
| **P5** | **Servicios puros vs. routers thin** | Routers: validar payload, resolver tenant, llamar servicio, mapear errores. Toda lógica de negocio en `app/services/*_engine.py`. |
| **P6** | **Eventos de dominio para side-effects** | Cambios importantes emiten un `DomainEvent` síncrono. Suscriptores: auditoría, notificaciones, recalculo de KPIs. |
| **P7** | **Idempotencia y reintentos** | Endpoints de mutación aceptan header `Idempotency-Key`. TTL 24h. |
| **P8** | **Backwards-compat durante migraciones** | Cada migración Alembic incluye downgrade probado. Cambios destructivos vía expansion/contraction. |
| **P9** | **Observabilidad por defecto** | Todo request tiene `request_id`. Eventos críticos loggean a `audit_log`. Health checks deep. |
| **P10** | **Tests son contrato** | Cada endpoint nuevo tiene test de integración. Cada engine tiene tests unitarios. CI gate ≥80% global. |

### 1.2 Estructura de carpetas objetivo

Aditiva — **no se mueve nada existente que funciona**:

```
app/
├── main.py
├── database.py
├── dependencies.py
├── middleware/
├── models/
│   ├── workshop.py            # ya existe — se extiende
│   ├── work_orders.py         # ya existe — se extiende
│   ├── workshop_history.py    # NUEVO: status history
│   ├── mechanic_profiles.py   # NUEVO: skills, niveles
│   ├── service_proposals.py   # NUEVO: workflow aprobación
│   ├── customer_portal.py     # NUEVO: tokens públicos
│   ├── procurement.py         # NUEVO: purchase orders
│   ├── notifications.py       # NUEVO
│   └── ...
├── routers/
│   ├── work_orders.py         # ya existe — refactor a thin router
│   ├── assignments.py         # NUEVO
│   ├── me.py                  # NUEVO: /me/tasks, /me/profile
│   ├── mechanics.py           # NUEVO
│   ├── service_proposals.py   # NUEVO
│   ├── dashboard_advisor.py   # NUEVO
│   ├── dashboard_manager.py   # NUEVO
│   ├── dashboard_executive.py # NUEVO
│   ├── customer_portal.py     # NUEVO: rutas públicas
│   ├── procurement.py         # NUEVO
│   ├── notifications.py       # NUEVO
│   └── ...
├── services/
│   ├── work_order_engine.py   # se amplía
│   ├── assignment_engine.py   # NUEVO
│   ├── inventory_engine.py    # ya existe
│   ├── procurement_engine.py  # NUEVO
│   ├── kpi_engine.py          # NUEVO
│   ├── notification_service.py # NUEVO
│   ├── state_machines/        # NUEVO carpeta
│   │   ├── work_order_sm.py
│   │   ├── work_order_line_sm.py
│   │   ├── assignment_sm.py
│   │   ├── inventory_request_sm.py
│   │   ├── service_proposal_sm.py
│   │   └── purchase_order_sm.py
│   └── ...
├── schemas/                   # espejo de routers
├── events/                    # NUEVO
│   ├── __init__.py            # EventBus, BaseEvent
│   ├── workshop_events.py
│   ├── inventory_events.py
│   ├── catalog_events.py
│   └── subscribers/
│       ├── audit_subscriber.py
│       ├── notification_subscriber.py
│       └── kpi_subscriber.py
├── security/
│   ├── __init__.py
│   ├── tenant.py              # ya existe
│   ├── permissions.py         # NUEVO: matriz declarativa
│   ├── scoping.py             # NUEVO: filtros por rol
│   └── public_token.py        # NUEVO: portal cliente
├── analytics/                 # Fase 3
│   ├── materializers.py
│   └── cache.py
└── utils/
    ├── idempotency.py         # NUEVO
    ├── logging.py             # NUEVO
    └── pagination.py
```

### 1.3 Versionado de API

- **`/api/...`** — legacy, se mantiene
- **`/api/v1/...`** — todos los endpoints nuevos desde Fase 1
- **`/api/public/v1/...`** — portal cliente, sin auth
- **OpenAPI** publicado en `/api/docs` y snapshot a `docs/openapi/v{version}.json` en cada release tag
- **Deprecation:** endpoints removidos pasan 1 release con `deprecated=True` + header `Deprecation: <date>`

### 1.4 Estrategia de datos

- PostgreSQL prod, SQLite local/test (ya está)
- Alembic con autogenerate REVISADO siempre
- JSONB / TEXT JSON solo para metadata no consultable
- Soft-delete universal por `AuditMixin.deleted_at`
- `audit_log` como caja negra (existe; se extiende con `business_context_json`)

---

## Sección 2 — Modelo de datos completo

### 2.1 Enums nuevos

```python
# app/models/work_orders.py — añadir
class WorkOrderType(str, enum.Enum):
    appointment = "appointment"
    walk_in     = "walk_in"
    tow         = "tow"
    standby     = "standby"
    warranty    = "warranty"
    internal    = "internal"

# Status flow ampliado (sustituye al actual)
class WorkOrderStatus(str, enum.Enum):
    received       = "received"
    assigned       = "assigned"        # NUEVO
    in_progress    = "in_progress"
    waiting_parts  = "waiting_parts"
    quality_check  = "quality_check"   # NUEVO (opcional via config flag)
    completed      = "completed"
    delivered      = "delivered"
    cancelled      = "cancelled"       # NUEVO
```

```python
# app/models/mechanic_profiles.py — NUEVO
class MechanicLevel(str, enum.Enum):
    junior     = "junior"        # nivel 1
    intermedio = "intermedio"    # nivel 2
    master     = "master"        # nivel 3

class SkillCategory(str, enum.Enum):
    frenos = "frenos"; motor = "motor"; transmision = "transmision"
    suspension = "suspension"; electrico = "electrico"; diagnostico = "diagnostico"
    hojalateria = "hojalateria"; afinacion = "afinacion"; diesel = "diesel"; otros = "otros"
```

```python
# app/models/assignments.py
class AssignmentStatus(str, enum.Enum):
    active = "active"; reassigned = "reassigned"
    completed = "completed"; cancelled = "cancelled"
```

```python
# app/models/service_proposals.py
class ServiceProposalStatus(str, enum.Enum):
    pending = "pending"; approved = "approved"
    rejected = "rejected"; superseded = "superseded"
```

```python
# app/models/catalog.py — añadir
class ServiceRequiredLevel(str, enum.Enum):
    junior = "junior"; intermedio = "intermedio"; master = "master"
```

```python
# app/models/procurement.py — Fase 4
class PurchaseOrderStatus(str, enum.Enum):
    draft = "draft"; submitted = "submitted"; approved = "approved"
    sent = "sent"; partial = "partial"; received = "received"; cancelled = "cancelled"
```

```python
# app/models/customer_portal.py — Fase 4
class PortalTokenScope(str, enum.Enum):
    read_status_only = "read_status_only"
    read_full        = "read_full"
```

### 2.2 Columnas añadidas a tablas existentes

#### `work_orders`
```sql
ALTER TABLE work_orders ADD COLUMN type           VARCHAR(32) NOT NULL DEFAULT 'walk_in';
ALTER TABLE work_orders ADD COLUMN priority       VARCHAR(16) NOT NULL DEFAULT 'normal';
ALTER TABLE work_orders ADD COLUMN scheduled_at   TIMESTAMPTZ NULL;
ALTER TABLE work_orders ADD COLUMN promised_at    TIMESTAMPTZ NULL;
ALTER TABLE work_orders ADD COLUMN customer_id    VARCHAR(36) NULL;
ALTER TABLE work_orders ADD COLUMN tow_provider   VARCHAR(120) NULL;
ALTER TABLE work_orders ADD COLUMN entry_mileage  INT NULL;
ALTER TABLE work_orders ADD COLUMN exit_mileage   INT NULL;
ALTER TABLE work_orders ADD COLUMN portal_token   VARCHAR(64) NULL UNIQUE;

CREATE INDEX ix_work_orders_type            ON work_orders(type);
CREATE INDEX ix_work_orders_priority        ON work_orders(priority);
CREATE INDEX ix_work_orders_scheduled_at    ON work_orders(scheduled_at);
CREATE INDEX ix_work_orders_branch_status   ON work_orders(branch_id, status);
CREATE INDEX ix_work_orders_branch_received ON work_orders(branch_id, received_at);
```

**Nota:** `WorkOrder.status` migra de Enum nativo a `VARCHAR(32)` por compatibilidad con `WorkOrderLineStatus` y evitar drama de Postgres `CREATE TYPE`. Validación queda en Pydantic + state machine.

#### `services`
```sql
ALTER TABLE services ADD COLUMN required_level   VARCHAR(16) NOT NULL DEFAULT 'junior';
ALTER TABLE services ADD COLUMN approved         BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE services ADD COLUMN approved_by      VARCHAR(36) NULL;
ALTER TABLE services ADD COLUMN approved_at      TIMESTAMPTZ NULL;
ALTER TABLE services ADD COLUMN proposed_by      VARCHAR(36) NULL;
ALTER TABLE services ADD COLUMN proposal_id      VARCHAR(36) NULL;

CREATE INDEX ix_services_required_level ON services(required_level);
CREATE INDEX ix_services_approved       ON services(approved);
```

#### `parts`
```sql
ALTER TABLE parts ADD COLUMN reorder_point  FLOAT NOT NULL DEFAULT 5.0;
ALTER TABLE parts ADD COLUMN safety_stock   FLOAT NOT NULL DEFAULT 10.0;
ALTER TABLE parts ADD COLUMN abc_class      VARCHAR(1) NULL;
ALTER TABLE parts ADD COLUMN rotation_days  INT NULL;
```

### 2.3 Tablas nuevas

Definidas formalmente en este spec; código en cada fase respectiva.

**Fase 1:**
- `work_order_status_history` — historial inmutable de transiciones (US-02)
- `mechanic_profiles` — perfil del mecánico (nivel, costo/hr, capacidad)
- `mechanic_skills` — N:M skill × proficiency 1-5 × certified
- `assignments` — historial de asignaciones; unique partial index `(work_order_id, COALESCE(work_order_line_id,'')) WHERE status='active'`
- `work_order_findings` — hallazgos adicionales del mecánico pendientes de aprobación
- `idempotency_keys` — TTL 24h, hash de body para detectar key-reuse con request distinto

**Fase 2:** sin tablas nuevas; solo columnas en `parts`.

**Fase 3:**
- `service_proposals` — workflow `pending → approved/rejected/superseded`
- `notifications` — in-app desde Fase 3, email desde Fase 3.3
- `kpi_daily_snapshots` — cache de KPIs por `(branch_id, snapshot_date, metric_key, dimension_key, dimension_value)` unique

**Fase 4:**
- `customer_portal_tokens` — hash bcrypt o hex, TTL configurable, revocable
- `purchase_orders` + `purchase_order_lines` — workflow PO completo
- `help_resources` — tour onboarding + videos (opcional Fase 4)

Schemas SQLAlchemy completos en los specs hijos.

### 2.4 Orden de migraciones Alembic

| Orden | Fase | Migración | Cambios principales |
|-------|------|-----------|---------------------|
| 1 | Fase 1 | `add_workshop_workflow_core` | enums + cols `work_orders`/`services` + tablas history/profiles/skills/assignments/findings/idempotency. **Backfill:** row inicial en `work_order_status_history` por cada OS existente. |
| 2 | Fase 2 | `inventory_thresholds_and_rotation` | cols `reorder_point`, `safety_stock`, `abc_class`, `rotation_days` en `parts`. **Backfill:** `min_stock → reorder_point`, `min_stock*2 → safety_stock`. |
| 3 | Fase 3 | `service_proposals_and_kpi_cache` | tablas `service_proposals`, `notifications`, `kpi_daily_snapshots`. Cols approval en `services` (existentes quedan `approved=TRUE`). |
| 4 | Fase 4 | `customer_portal_and_procurement` | tablas `customer_portal_tokens`, `purchase_orders`, `purchase_order_lines`. Cols `customer_id`, `portal_token` en `work_orders`. |

**Regla anti-drama:** cada migración corre en CI contra SQLite y Postgres. Upgrade + downgrade probados.

### 2.5 Decisiones explícitas

- `Service.required_level` como enum, no FK (3 niveles, no catálogo editable)
- `mechanic_skills` como tabla separada (no JSON column) para consultas eficientes
- Status como `VARCHAR(32)` (no Postgres enum) para evitar migrations dolorosas
- Idempotency keys TTL 24h
- `customer_portal_tokens` hash + revoke (no exponemos token claro)
- `kpi_daily_snapshots` desde Fase 3, recálculo nocturno + invalidación por evento
- `Notification` tabla aunque MVP no envíe correos (cableado early)
- **No** CQRS, **no** Redis ni Celery hasta Fase 4 (YAGNI)

---

## Sección 3 — Contratos de API

### 3.1 Convenciones

- Prefijos: `/api/v1/` (nuevo), `/api/` (legacy), `/api/public/v1/` (portal)
- Headers estándar: `Authorization: Bearer`, `X-Branch-Id`, `X-Request-Id`, `Idempotency-Key`, `Accept-Language`
- Errores siempre con shape estandarizado:

```json
{
  "error": {
    "code": "WORK_ORDER_INVALID_TRANSITION",
    "message": "No se puede pasar de 'delivered' a 'in_progress'",
    "detail": { "from_status": "delivered", "to_status": "in_progress", "allowed_targets": [] },
    "request_id": "01HZ8K5...",
    "timestamp": "2026-05-18T14:32:11Z"
  }
}
```

- Códigos HTTP: 400 BAD_REQUEST, 401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 422 VALIDATION_ERROR, 423 LOCKED, 429 RATE_LIMITED, 500 INTERNAL_ERROR
- Paginación: `?page=1&page_size=20&sort=-received_at`; response `{items, total, page, page_size, total_pages}`
- Timestamps: ISO 8601 UTC con sufijo Z; cliente decide TZ display desde `branch.timezone`
- IDs: UUID v4 string(36) generados server-side

### 3.2 Endpoints por fase

#### Fase 1 — Work Orders + Assignments + Me

```
POST   /api/v1/work-orders                                  US-01
GET    /api/v1/work-orders
GET    /api/v1/work-orders/{id}
PATCH  /api/v1/work-orders/{id}
PATCH  /api/v1/work-orders/{id}/status                      US-02
GET    /api/v1/work-orders/{id}/status-history              US-02
POST   /api/v1/work-orders/{id}/cancel
DELETE /api/v1/work-orders/{id}                              (admin)

POST   /api/v1/assignments                                  US-03
GET    /api/v1/assignments
GET    /api/v1/assignments/{id}
PATCH  /api/v1/assignments/{id}/release
POST   /api/v1/work-orders/{id}/reassign

GET    /api/v1/mechanics
GET    /api/v1/mechanics/{user_id}
POST   /api/v1/mechanics
PATCH  /api/v1/mechanics/{user_id}
POST   /api/v1/mechanics/{user_id}/skills
DELETE /api/v1/mechanics/{user_id}/skills/{category}
GET    /api/v1/mechanics/{user_id}/workload

GET    /api/v1/me/tasks                                     US-04
GET    /api/v1/me/tasks/today
GET    /api/v1/me/profile
POST   /api/v1/me/tasks/{line_id}/findings

GET    /api/v1/findings?status=pending                       (bandeja jefe)
POST   /api/v1/findings/{id}/approve
POST   /api/v1/findings/{id}/reject
```

#### Fase 2 — Inventario operativo

```
GET    /api/v1/inventory/stock-board                        US-05
GET    /api/v1/inventory/parts/{id}/availability
POST   /api/v1/work-orders/{id}/parts                       US-06
GET    /api/v1/work-orders/{id}/parts
GET    /api/v1/work-orders/{id}/parts/availability
```

#### Fase 3 — Catálogo + Dashboards

```
POST   /api/v1/service-proposals                            US-07
GET    /api/v1/service-proposals
GET    /api/v1/service-proposals/{id}
POST   /api/v1/service-proposals/{id}/approve
POST   /api/v1/service-proposals/{id}/reject

GET    /api/v1/dashboard/advisor                            US-09
GET    /api/v1/dashboard/manager                            US-10
GET    /api/v1/dashboard/executive
GET    /api/v1/dashboard/warehouse
GET    /api/v1/dashboard/mechanic

GET    /api/v1/notifications
GET    /api/v1/notifications/count
POST   /api/v1/notifications/{id}/read
POST   /api/v1/notifications/read-all
POST   /api/v1/admin/notifications/process                  (cron)
```

#### Fase 4 — Portal + Compras

```
GET    /api/public/v1/units/{portal_token}                  US-12
GET    /api/public/v1/units/lookup?folio=&plates=

GET    /api/v1/procurement/suggestions
POST   /api/v1/procurement/purchase-orders
GET    /api/v1/procurement/purchase-orders
GET    /api/v1/procurement/purchase-orders/{id}
PATCH  /api/v1/procurement/purchase-orders/{id}
POST   /api/v1/procurement/purchase-orders/{id}/submit
POST   /api/v1/procurement/purchase-orders/{id}/approve
POST   /api/v1/procurement/purchase-orders/{id}/receive
GET    /api/v1/procurement/rotation-report
```

### 3.3 Ejemplos de schemas críticos

#### `POST /api/v1/work-orders`

Request body completo en spec de Fase 1. Validaciones críticas:
- `type=appointment` ⇒ `scheduled_at` obligatorio futuro
- `type=tow` ⇒ `tow_provider` requerido
- `vehicle.plates` único activo por sucursal (reutiliza si existe)
- Crea `WorkOrderStatusHistory(from=NULL, to='received')`
- Crea `portal_token` plain en response 1 vez + hash en `customer_portal_tokens`
- Emite evento `WorkOrderCreated`

#### `PATCH /api/v1/work-orders/{id}/status`

Request: `{"to_status": "assigned", "reason": "...", "metadata": {...}}`

Response: `{id, status, previous_status, history_entry_id, transitioned_at, transitioned_by}`

State machine validada en `app/services/state_machines/work_order_sm.py`. Reglas R1-R7, R12 aplicadas.

#### `POST /api/v1/assignments`

Lógica del engine:
1. Verifica OS existe y branch_id accesible
2. Verifica `MechanicProfile` activo, mismo `branch_id`
3. Calcula `service_required_level` (de la línea o de la OS principal)
4. Si `mechanic.level >= service.required_level` ⇒ `level_check=pass`
5. Si no, y `override_level_check=True` + permiso + reason ⇒ `level_check=override`
6. Si no ⇒ 409 `ASSIGNMENT_LEVEL_INSUFFICIENT`
7. Si existe `Assignment.active` ⇒ marca `reassigned`, crea nueva
8. Actualiza `WorkOrder.assigned_mechanic_id` (back-compat) **y** crea `Assignment`
9. Auto-transición `received → assigned` vía state machine
10. Emite `MechanicAssigned`

Niveles: `junior=1 < intermedio=2 < master=3`

#### `GET /api/v1/me/tasks` (US-04)

Response shape optimizado mobile con `available_actions` máx 3 por línea, parts pre-resueltas con flag `blocking`, timer state, semáforo. Schema completo en spec Fase 1.

#### `GET /api/public/v1/units/{portal_token}` (US-12)

Response **NO expone**: `mechanic_id`, `bay_id`, costos, márgenes, evidencias internas, notes internas. Solo: status, progress_pct, milestones, vehicle (plates parcialmente enmascarado), branch info pública.

Rate limit: 30 req/min por IP. Lookup brute-force: 5 fallos/15min → lockout.

---

## Sección 4 — Roles, permisos y state machines

### 4.1 Roles

| Rol | Scope | Propósito |
|-----|-------|-----------|
| `admin` | GLOBAL | Plataforma + gestión usuarios + overrides con motivo |
| `director` | GLOBAL | Dashboards ejecutivos multi-sucursal, no gestiona usuarios |
| `gerente_sede` | BRANCH | Aprueba servicios, configura bahías/almacenes, dashboard executive de su sede |
| `jefe_taller` | BRANCH | Asigna mecánicos, aprueba findings, propone servicios, supervisa QA |
| `recepcion` | BRANCH | Crea OS, transiciona received→assigned, entrega |
| `mecanico` | BRANCH | Ve sus tareas, transiciona líneas, pide refacciones, reporta findings |
| `almacen` | BRANCH | Picking, deliver, ajustes, recepción de POs |
| `cliente_corp` | GLOBAL | Consulta sus flotas (futuro) |
| `operador` | BRANCH | Legacy multi-función; **deprecado en Fase 3** |
| `viewer` | GLOBAL | Solo lectura cross-branch (auditores, accionistas) |

**Regla de oro:** ningún rol BRANCH puede leer/escribir datos de otra sucursal. Si intenta vía `X-Branch-Id` → 403 `FORBIDDEN_BRANCH_SCOPE`.

### 4.2 Matriz de permisos

Implementación vía `app/security/permissions.py` con enum `Permission` y dict `PERMISSION_MATRIX: dict[Permission, set[Role]]`. Helper `require_permission(P)` como FastAPI dependency.

**Ventajas:**
- Fácil añadir rol nuevo (solo tocar matriz)
- Tests directos al permiso, no a lista de roles
- Documentación auto-generada por OpenAPI

Matriz completa por endpoint × rol en spec de cada fase. Resumen Fase 1:

| Permiso | Roles |
|---------|-------|
| `work_order:create` | admin, director, gerente_sede, jefe_taller, recepcion |
| `work_order:transition` | admin, gerente_sede, jefe_taller, recepcion, mecanico, almacen |
| `work_order:cancel` | admin, gerente_sede, jefe_taller |
| `work_order:delete` | admin |
| `assignment:create` | admin, gerente_sede, jefe_taller |
| `assignment:override_level` | admin, gerente_sede, jefe_taller |
| `mechanic:level:write` | admin, gerente_sede |
| `service:propose` | admin, gerente_sede, jefe_taller |
| `service:approve` | admin, gerente_sede |
| `dashboard:executive` | admin, director, gerente_sede |

### 4.3 Filtros automáticos por rol (`app/security/scoping.py`)

- `mecanico` solo OS con `Assignment.active` propia
- `almacen` solo OS con `inventory_requests` abiertos
- `cliente_corp` solo OS de su `customer_id`

Aplicado **siempre** en list/get; imposible olvidarlo porque los routers llaman `scope_work_orders_for_user` después de `branch_scoped_query`.

### 4.4 State machines

Cada entidad tiene un mapa `TRANSITIONS: dict[(from, to), {permission, reason, post_actions}]` en `app/services/state_machines/`.

#### WorkOrder

```
received ──► assigned ──► in_progress ──► waiting_parts ──► in_progress
                              │                                  │
                              ├──► quality_check ◄───────────────┘
                              │         │
                              │         └──► completed ──► delivered
                              │
                              └──► completed ──► delivered

Cualquier estado (excepto delivered) ──► cancelled  [reason obligatorio]
```

Timestamps automáticos: `work_started_at` en primera transición a in_progress; `work_finished_at` en completed; `closed_at` en delivered/cancelled.

#### WorkOrderLine (ya existe)

```
pending ↔ in_progress ↔ paused
              ↕
       waiting_parts
              ↓
          completed | cancelled
```

#### Assignment

```
active ──► reassigned (cuando se crea nueva active sobre misma OS/línea)
active ──► completed  (cuando línea/OS pasa a completed/delivered)
active ──► cancelled  (OS cancelada o release explícito)
```

#### InventoryRequest (ya existe)

```
pending → approved → picked → delivered → used | returned
   ↓        ↓
rejected  rejected
```

#### ServiceProposal

```
pending → approved (crea Service con approved=true)
pending → rejected (reason obligatorio)
pending → superseded
```

#### PurchaseOrder

```
draft → submitted → approved → sent → partial → received
                ↓        ↓        ↓        ↓
            cancelled cancelled cancelled cancelled
```

### 4.5 Reglas de negocio críticas

Enumeradas para evitar bugs filtrándose:

**Work Orders:**
- R1. No `WorkOrderLine` nueva si OS en estado terminal
- R2. Todas las líneas `completed` → OS auto-pasa a `quality_check` o `completed` según `quality_check_enabled` config
- R3. OS `cancelled` cascadea a líneas no terminales
- R4. OS `waiting_parts` propaga a líneas dependientes
- R5. OS no a `completed` con findings `pending`
- R6. OS no a `delivered` con `inventory_requests` en `picked`/`delivered` sin `used`
- R7. `exit_mileage >= entry_mileage` al `delivered`

**Asignaciones:**
- R8. Solo un `Assignment.active` por `(work_order_id, line_id)` — unique partial index
- R9. No asignar a mecánico inactivo o de otra sucursal
- R10. No asignar si `mechanic.level < service.required_level` salvo override + reason
- R11. Warn (no block) si `current_load + service.hrs > capacity * 1.3`
- R12. Liberar/reasignar asignación con línea `in_progress` → línea pasa a `paused` con `reason="reassignment"`

**Inventario:**
- R13. No `inventory_request` si OS terminal
- R14. Aprobar no descuenta stock; solo `pick` reserva
- R15. `pick` falla 409 si `available - reserved < quantity`
- R16. `use` solo tras `delivered` (consume reserva)
- R17. `returned` libera reserva
- R18. Todo movimiento queda en ledger append-only con `performed_by`
- R19. Stock nunca negativo

**Catálogo:**
- R20. `Service` con `approved=false` no listado para roles sin permiso
- R21. `Service` con `approved=false` no usable en nueva OS
- R22. Aprobar proposal con `name` duplicado → 409 con `existing_service_id`

**Portal cliente:**
- R23. `portal_token` se invalida automáticamente a `delivered + 90 días`
- R24. Lookup público: 5 intentos fallidos/15min → lockout
- R25. Portal nunca expone `mechanic_id`, `bay_id`, `cost`, `margin`, `internal_notes`

### 4.6 Concurrencia y locking

- **Doble asignación:** unique partial index `WHERE status='active'`
- **Doble transición:** optimistic locking opcional con header `If-Match: <updated_at>`
- **Doble picking:** `SELECT ... FOR UPDATE` en transición `approved → picked`
- **Race en stock:** `with_for_update()` en `apply_reservation`/`apply_outbound`
- **Idempotency:** hash de body + key en `idempotency_keys` con TTL 24h; key+body distinto → 409 `IDEMPOTENCY_KEY_REUSE`

### 4.7 Auditoría

`audit_log` append-only por contrato. Cada transición/asignación/aprobación genera entrada vía SQLAlchemy listener (`install_audit_listeners` ya existe). Action types ampliados: transition, assign, release, approve, reject, cancel, pick, deliver, use, return.

---

## Sección 5 — Frontend, UX y mobile-first

### 5.1 Stack

Ya existente: React 18 + TypeScript + Vite + Tailwind + Zustand + React Router v6.

Añadidos en Fase 1:
- **TanStack Query v5** (estado servidor)
- **React Hook Form + Zod** (formularios)
- **TanStack Table v8** (vistas densas)
- **Recharts** (charts, lazy)
- **Sonner** (toasts)
- **Lucide React** (iconos)
- **date-fns + date-fns-tz**
- Tests: **Vitest + RTL + MSW**; E2E: **Playwright**

### 5.2 Estructura de carpetas frontend objetivo

```
frontend/src/
├── api/
│   ├── client.ts                    # interceptors + X-Branch-Id
│   ├── endpoints/                   # thin clients por dominio
│   ├── queryKeys.ts                 # fuente única
│   └── types.ts                     # generado desde OpenAPI
├── components/
│   ├── ui/                          # primitivas + SemaphoreBadge, Skeleton, Badge, Table
│   ├── layout/                      # Layout, Sidebar, BranchSwitcher, ThemeToggle, MobileBottomNav
│   ├── work-orders/
│   ├── assignments/
│   ├── inventory/
│   ├── dashboards/
│   └── shared/                      # DataTable, PageHeader, PermissionGate, ErrorBoundary
├── pages/
│   ├── advisor/                     # AdvisorDashboard, WorkOrders, WorkOrderDetail
│   ├── manager/                     # ManagerDashboard, AssignmentBoard, FindingsInbox
│   ├── executive/                   # ExecutiveDashboard
│   ├── mechanic/                    # MechanicHome, MechanicTaskDetail (mobile), MechanicProfile
│   ├── warehouse/                   # WarehouseDashboard, StockBoard, InventoryRequestsInbox, PurchaseOrders
│   ├── reception/                   # ReceptionDashboard, NewWorkOrder
│   ├── gerente/                     # GerenteDashboard, ServiceProposalsApproval
│   └── public/                      # PortalUnitStatus (sin auth)
├── hooks/                           # useAuth, usePermission, useWorkOrder, useMyTasks, usePoll
├── store/                           # auth, branch, theme (existentes)
├── lib/                             # permissions, statusLabels, semaphore, currency, time
└── routes/                          # routes.tsx con guards por rol
```

### 5.3 Routing por rol

Login → `<RoleRouter>` redirige a home natural:
- `mecanico` → `/mechanic`
- `recepcion` / `operador` → `/advisor`
- `jefe_taller` → `/manager`
- `gerente_sede` → `/gerente`
- `almacen` → `/warehouse`
- `director` → `/executive`
- `admin` → `/admin`

Guards: `<RequireRoles roles={...}>` redirige + toast si acceso denegado.

### 5.4 RBAC frontend

`PERMISSION_MATRIX` espejo del backend en `lib/permissions.ts`. Hook `usePermission(P)` retorna bool. Component `<PermissionGate permission={P}>` **solo oculta UI** — el backend autoriza.

### 5.5 Design tokens

Paleta del semáforo (consistente backend ↔ frontend):

```js
semaphore: {
  green:   { bg: '#dcfce7', text: '#166534', solid: '#10b981' },
  yellow:  { bg: '#fef9c3', text: '#854d0e', solid: '#f59e0b' },
  red:     { bg: '#fee2e2', text: '#991b1b', solid: '#ef4444' },
  pending: { bg: '#e5e7eb', text: '#374151', solid: '#6b7280' },
}
```

Modo oscuro con `dark:` variants en todos los nuevos componentes.

### 5.6 Vista mecánico mobile-first — la pieza crítica del MVP

**Principio:** máx 3 acciones primarias visibles por card/pantalla.

Acciones por estado de línea:

| Estado | Acción 1 | Acción 2 | Overflow (⋮) |
|--------|----------|----------|--------------|
| `pending` | ▶ Iniciar | 📦 Pedir refacción | foto, nota, hallazgo |
| `in_progress` | ⏸ Pausar | ✓ Finalizar | foto, refacción, hallazgo |
| `paused` | ▶ Reanudar | ✓ Finalizar | … |
| `waiting_parts` | (disabled) | ver detalle | … |
| `completed` | (read-only) | ver detalle | — |

Patrones obligatorios:
- Touch targets ≥ 44×44 px (Tailwind `min-h-12`)
- `active:scale-95` + spinner si action > 300ms
- Confirmaciones explícitas en destructivas
- Captura foto: input `accept="image/*" capture="environment"`
- Sin scroll horizontal: tablas → cards en `<md`
- Bottom navigation fija en `/mechanic`
- Pull-to-refresh
- Timer activo persistido en localStorage

### 5.7 Offline-light (no PWA completa en Fase 1)

- React Query con `networkMode: 'offlineFirst'`
- Mutations optimistic con `onMutate` + rollback `onError`
- Cola en localStorage con visualización "N acciones pendientes de sincronizar"
- Replay con `Idempotency-Key` al recuperar red
- Fotos en IndexedDB con background upload

PWA completa solo si telemetría de Fase 2-3 lo justifica.

### 5.8 Polling adaptativo (no WebSockets en Fase 1-3)

| Vista | Refresh |
|-------|---------|
| MechanicHome | 30s mientras visible |
| AdvisorDashboard | 20s en horario, 60s fuera |
| ManagerDashboard | 15s |
| StockBoard | 60s + invalidate manual |
| ExecutiveDashboard | manual |
| Portal | 30s mientras no delivered |

Invalidaciones cross-page por prefijo de queryKey.

### 5.9 Formularios, errores, i18n

- RHF + Zod estándar único
- Validation client-side primero, server-side siempre autoritario
- Errores 422 → `form.setError` por campo
- Loading: skeletons que respetan layout, no spinners genéricos
- Toasts con Sonner por severidad
- i18n: español-MX en MVP, mapas en `lib/statusLabels.ts`, migración futura a `react-i18next` sin reescribir

### 5.10 Performance budget

- FCP mobile 4G < 1.5s
- LCP < 2.5s
- TTI < 3.5s
- Bundle inicial < 200 KB gz
- ≤ 2 requests por interacción

Lazy split por rutas vía `lazy()`.

### 5.11 Testing frontend

| Tipo | Stack | Coverage |
|------|-------|----------|
| Unit componentes puros | Vitest + RTL | 90% en `lib/`, 70% en componentes |
| Integración con MSW | Vitest + RTL + MSW | rutas principales |
| E2E | Playwright (Chromium en CI, headed local) | 3-5 flujos críticos |

---

## Sección 6 — Eventos, notificaciones, observabilidad y operación

### 6.1 EventBus de dominio

Síncrono in-process. Extiende patrón existente `install_audit_listeners`.

**Reglas:**
- Publicar después de `db.flush()`, antes de `db.commit()` (rollback en cascada)
- Subscribers no pueden lanzar excepciones hacia el dominio (bus los atrapa)
- Subscribers no escriben en la misma transacción que el publisher
- Eventos inmutables, naming en pasado participio

**Catálogo (resumen):**

Workshop: `WorkOrderCreated`, `WorkOrderStatusChanged`, `MechanicAssigned`, `WorkOrderFindingReported`, `WorkOrderFindingApproved`
Inventory: `InventoryRequestCreated`, `StockLevelChanged`, `LowStockDetected`
Catalog: `ServiceProposalSubmitted`, `ServiceApproved`

**Subscribers Fase 1:** audit, notification, kpi_invalidation.

### 6.2 Notificaciones

Tabla `notifications` desde Fase 3. Mapa evento → topic → destinatarios → canal.

Endpoints in-app desde Fase 3. Email vía Resend desde Fase 3.3 con templates Jinja2 en `app/templates/email/`.

Job de envío: `POST /api/v1/admin/notifications/process` invocado por cron cada 5 min (Railway scheduled).

Anti-spam:
- Coalescing: `LowStockDetected` por SKU no genera notif si ya hay `pending`/`sent` en últimas 4h
- Digest diario 8am low-stock por sucursal
- Preferencias por usuario en Fase 4

### 6.3 Logging estructurado

JSON Lines a stdout (Railway captura). Formatter en `app/utils/logging.py`. Contexto inyectado por middleware via `contextvars`: `request_id`, `user_id`, `branch_id`.

Niveles: DEBUG (off en prod), INFO (mutaciones), WARNING (recuperables), ERROR (5xx), CRITICAL.

**No loggear:** passwords, JWTs, refresh tokens, portal tokens, PII completa, bodies sensibles.

### 6.4 Métricas

Técnicas (Fase 3 con Prometheus exporter): http_requests_total, http_request_duration_seconds, db_query_duration_seconds, events_published_total, event_handler_duration_seconds, notifications_pending.

Negocio (`kpi_daily_snapshots`): avg_cycle_minutes, promised_on_time_pct, mechanic_utilization_pct, stockout_events, low_stock_skus_pct, findings_per_wo, wo_cancelled_pct, assignment_override_pct.

Error tracking: **Sentry desde Fase 1** (DSN en env, captura 5xx, tags `branch_id`/`user_role`/`request_id`).

### 6.5 Health checks

- `GET /api/health` liveness
- `GET /api/health/db` readiness
- `GET /api/health/deep` (autenticado): db, storage_r2, smtp, migrations head

### 6.6 Deploy y entornos

| Entorno | Plataforma | Branch | DB |
|---------|------------|--------|-----|
| local | dev local | cualquiera | SQLite |
| dev | Railway `bjx-atlas-dev` | `develop` | Postgres dev |
| staging | Railway `bjx-atlas-staging` | `release/*` | Postgres staging |
| prod | Railway `bjx-atlas-prod` | `main` | Postgres prod |

Pre-deploy (Railway `releaseCommand`): `alembic upgrade head && python scripts/healthcheck_postdeploy.py`.

Rollback: `railway rollback` o `alembic downgrade -1` manual + redeploy SHA anterior.

Expansion/Contraction para tablas grandes (post-MVP).

### 6.7 Secrets

`DATABASE_URL`, `SECRET_KEY`, `R2_*`, `SENTRY_DSN`, `EMAIL_API_KEY`, `ADMIN_BOOTSTRAP_PASSWORD`, `INTERNAL_API_TOKEN`.

Reglas: nunca en repo (solo `.env.example`), local en `.env` gitignored, `os.getenv(KEY, default)` con default seguro o fail fast, rotación documentada en runbooks.

Config dinámico vs estático:
- Estático (DB URL, SECRET_KEY) → env vars, requiere redeploy
- Dinámico (technician_cost_hr, target_margin, quality_check_enabled, semáforo thresholds) → `config_params` tabla, hot reload
- Feature flags → `config_params` con prefix `feature.*` (Fase 4)

### 6.8 Backups y DR

- Railway Postgres snapshots diarios, retención 30 días
- Backup propio semanal vía `pg_dump` → R2 carpeta `backups/`
- Test de restore trimestral
- R2 con versioning + lifecycle a coldline tras 1 año
- RPO ≤ 24h, RTO ≤ 4h

Runbooks en `docs/runbooks/`: incident-db-down, restore-from-backup, secret-rotation, cancel-stuck-work-order, rollback-migration.

### 6.9 Rate limiting

- `/public/v1/units/{token}`: 30/min/IP
- `/public/v1/units/lookup`: 5 intentos/15min + lockout
- `/auth/login`: 5 fallos/15min + lockout 15min
- `/auth/refresh`: 30/min/user
- `/work-orders` POST: 60/min/user
- `/inventory/movements` POST: 60/min/user
- `/admin/notifications/process`: 1 invocación concurrente (lock)

In-memory MVP, Redis cuando escalemos multi-worker.

### 6.10 Seguridad operacional

- HTTPS (Railway termina TLS)
- CORS restringido a `ALLOWED_ORIGINS`
- CSRF: no aplica (JWT stateless en Authorization)
- Headers: HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options:DENY
- JWT HS256, refresh tokens hash en DB con rotación
- Passwords bcrypt cost 12, mínimo 8 chars + 1 número
- Lockout 5 fallos / 15 min
- Audit de cambios de role con `actor_id` + `previous_role`
- Pen-test ligero antes go-live Fase 4

### 6.11 CI/CD

GitHub Actions: backend (pytest unit/integration/contract), frontend (typecheck/lint/test/build), e2e (Playwright en PR a `main`), lint-and-security (ruff, black, bandit, pip-audit, npm audit).

Branch protection en `main` y `develop`. PR no mergea sin CI verde + 1 review. Squash merge obligatorio.

---

## Sección 7 — Testing strategy

### 7.1 Pirámide

- **Unit ~70%** — funciones puras, state machines, scoring, formatters
- **Integration ~25%** — routers + DB + auth + tenant
- **Contract ~3%** — OpenAPI vs implementación (schemathesis)
- **E2E ~2%** — 3-5 flujos críticos browser

### 7.2 Stack

Backend: pytest + pytest-asyncio + pytest-cov + pytest-mock + pytest-xdist + factory-boy + faker + freezegun + schemathesis + httpx.

Frontend: vitest + @testing-library/react + @testing-library/user-event + msw + @playwright/test.

### 7.3 Factories

factory-boy reemplaza setup artesanal. Factories declarativas en `tests/factories/` con `SubFactory` para construir grafos (Vehicle → Model → Service → WorkOrder).

### 7.4 Tests obligatorios por dominio Fase 1

Patrón estándar: cada endpoint nuevo tiene minimum: happy path, 403, 404, 422, 409 si aplica, multi-tenant isolation con segunda sucursal `branch_b`.

State machines: tests unitarios cubren cada transición permitida, cada inválida, terminal states, reason required, actor ownership.

AssignmentEngine: level pass/fail/override, cross-branch blocked, overload warn, reassignment marks previous, unique active constraint DB-level, event emitted.

InventoryEngine (ya parcial): semaphore boundaries, pick insufficient, use from reserved, return release, adjustment non-negative, transfer atomic, concurrent pick.

PermissionMatrix: every permission has ≥1 role, viewer read-only, matrix alineada con endpoints (parsea OpenAPI).

Multi-tenancy: cada tabla nueva tiene test de aislamiento.

### 7.5 Contract tests con Schemathesis

Property-based vs OpenAPI; detecta defensive-code gaps. Se corre una vez por release.

### 7.6 Performance

`pytest-benchmark` para casos: dashboard manager 500 OS, assign con 1000 mechs, stock-board 5000 SKUs, bulk seed 100k movs. Si degrada > 30% vs baseline → bloquea release.

### 7.7 E2E flujos

1. `mechanic-completes-task.spec.ts`
2. `reception-creates-and-delivers.spec.ts`
3. `warehouse-fulfills-request.spec.ts`
4. `manager-approves-proposal.spec.ts`
5. `customer-portal-shows-status.spec.ts`

### 7.8 Coverage gates

Backend: services 95%, security 90%, routers 80%, events 85%, models 70% (warning), utils 85%, global 80%.

Frontend: lib 90%, hooks 80%, components ui 80%, components dominio 70%, pages 60% (cubre E2E), global 70%.

### 7.9 Migraciones

Cada migración Alembic tiene test mínimo: upgrade creates tables, downgrade reverts cleanly, backfill correctness.

### 7.10 Anti-flaky

- Nunca `time.sleep` (usar freezegun)
- Sort explícito antes de comparar listas
- Mock external (S3, email)
- Cada test rolling-back o DB fresca
- UUIDs random capturados, no hardcoded
- pytest-xdist `-n auto`
- Flaky detectado → arregla antes de mergear

### 7.11 Definición de "listo para mergear"

10 criterios obligatorios: tests nuevos, coverage no baja, CI verde, downgrade probado, sin secrets, sin TODOs sin issue, OpenAPI actualizado, CHANGELOG, self-review (bandit/ruff), review humana aprobada.

---

## Sección 8 — Plan ejecutivo por fases

### 8.1 Visión consolidada

4 fases mergeables independientemente a `main`. Cada fase entrega valor en producción. Spec hijo se escribe JIT al cerrar fase anterior, excepto Fase 1 que se planea junto al master.

### 8.2 Estimación global

| Fase | Backend | Frontend | QA + docs | Total |
|------|---------|----------|-----------|-------|
| Fase 1 | 55h | 40h | 15h | **~110h** |
| Fase 2 | 25h | 25h | 8h | **~58h** |
| Fase 3 | 45h | 45h | 15h | **~105h** |
| Fase 4 | 60h | 50h | 20h | **~130h** |
| **TOTAL** | 185h | 160h | 58h | **~403h** |

Calendario aproximado con 1 senior + 1 mid en paralelo: ~11.5 semanas (3 meses), sin buffer.

### 8.3 Fase 1 — Flujo de Unidades + Asignación

**Sprints:**
1. Foundations + State Machine (5 días)
2. Endpoints + Permisos (5 días)
3. Frontend Mechanic + Manager (5 días)
4. Polish + QA (3 días)

**Deliverables:**
- 1 migración Alembic `add_workshop_workflow_core`
- ~12 endpoints nuevos
- 2 engines + 5 state machines
- EventBus formal
- 4 páginas frontend nuevas + 15 componentes
- ~80 tests nuevos + 1-2 E2E
- Spec hijo: `2026-05-18-phase-1-workflow-units.md`

**Done criteria:**
1. OS pasa todo el flujo en UI real ≤ 5 min demo
2. Vista mecánico mobile usable en 360px
3. Asignar junior a master → 409 con detalle
4. Historial completo en timeline UI
5. Tests verdes, coverage services ≥ 95%
6. Migración upgrade+downgrade en CI
7. Sentry capturando en staging
8. Demo end-to-end con 4 roles

### 8.4 Fase 2 — Inventario operativo

**Sprints:** Backend (4 días) → Frontend (3-4 días) → Polish (1-2 días)

**Deliverables:** migración `inventory_thresholds_and_rotation` + 6 endpoints + 3 páginas + integración mecánico/manager + E2E warehouse.

**Done criteria:** stock-board < 300ms con 500 SKUs; mecánico ve "no disponible" antes de iniciar; almacenista procesa pick→deliver→used desde UI; stock no negativo; LowStockDetected con coalescing.

### 8.5 Fase 3 — Catálogo + Dashboards gerenciales

**Sprints:** Service proposals + Catalog API (5 días) → KPI engine + Dashboards (6 días) → Email + Notifications (3 días) → Polish + Performance (3 días)

**Deliverables:** migración `service_proposals_and_kpi_cache` + 12 endpoints + 5 páginas + Resend integrado + KPI nightly cron + Prometheus exporter.

**Done criteria:** propuesta → aprobación ≤ 1 min; manager refresca 15s consistente; email digest low-stock 8am; multi-branch executive agrega 3+ sucursales; cron KPIs idempotente; coverage ≥ 80%.

### 8.6 Fase 4 — Portal cliente + Compras + Expansión

**Sprints:** Portal cliente (5 días) → Procurement engine (7 días) → Pulido UX + capacitación (5 días) → Preparación a escala (3 días)

**Deliverables:** migración `customer_portal_and_procurement` + 15 endpoints (incl. `/public/*`) + 4 páginas + tour onboarding + Cloudflare WAF + multi-worker probado + runbooks finales.

**Done criteria:** portal < 2s sin auth; brute-force bloqueado; PO sugerida → recibida → stock actualizado; rotation report top 10 slow-movers; tour primer login; WAF activo; load test 50 req/s en staging.

### 8.7 Cross-cutting (en cada fase)

- CHANGELOG actualizado en cada PR
- OpenAPI snapshot committed en cada release tag
- Coverage report en CI artifact
- pip-audit + npm audit semanal, major bumps trimestral
- Restore de backup mensual a DB scratch
- Sentry triage semanal Fase 1, diario Fase 4
- User-testing con 1-2 usuarios reales por fase

### 8.8 Dependencias entre fases

- Fase 1 desbloquea Fases 2, 3, 4 (state machine, EventBus, historial, assignment data)
- Fase 2 alimenta Fase 4 (procurement consume thresholds y rotation)
- Fase 3 alimenta Fase 4 (rotation_report usa KPI snapshots)

**Crítico:** nada bloquea Fase 1. Esa entrega la base operativa independiente.

### 8.9 Specs hijos

```
docs/superpowers/specs/
├── 2026-05-18-bjx-workshop-platform-master.md       ← este doc
├── 2026-05-18-phase-1-workflow-units.md             ← junto al master
├── 2026-XX-XX-phase-2-inventory-operations.md      ← al cerrar Fase 1
├── 2026-XX-XX-phase-3-catalog-dashboards.md         ← al cerrar Fase 2
└── 2026-XX-XX-phase-4-portal-procurement.md         ← al cerrar Fase 3
```

### 8.10 Definición de éxito global

Al cerrar las 4 fases:
1. Cada rol tiene dashboard que abre primero al loguear
2. OS de creación a entrega sin Excel manual
3. Sistema sabe dónde está cada unidad y por qué se atrasó
4. Multi-sucursal: agregar sede = POST + seeds, no fork de código
5. Reportes para BJX × Brame son endpoint, no SELECT manual
6. Bugs prod reportados por usuarios < 1/sprint tras Fase 4
7. Coverage global ≥ 80%, engines ≥ 95%, ningún módulo < 60%
8. Onboarding equipo nuevo: local + tests en < 30 min con docs

### 8.11 Riesgos globales

| Riesgo | Mitigación |
|--------|-----------|
| Scope creep entre fases | Done criteria duros; extra va a fase siguiente |
| Resistencia mecánicos a abandonar papel/Excel | User-testing por fase con mecánicos reales; campeones internos; UI simple |
| Migración legacy mal | Backfill con `--dry-run`; primero staging con snapshot prod |
| Performance degrada con datos reales | Performance gates CI por sprint; bench tras seed 100k |
| Equipo se ahoga en testing | Pirámide respetada; factory-boy reduce boilerplate |
| Decisiones técnicas obsoletas entre fases | Spec hijo JIT, no upfront |
| Cliente cambia prioridades mid-fase | Fases cortas (1.5-4 sem); aguantar actual + replan en transición |
| Bug crítico en `main` | Branch protection; rollback < 5min; staging obligatorio |

---

## Apéndice A — Decisiones explícitas consolidadas

Para anti-second-guessing en revisiones futuras:

**Arquitectura:**
- Módulos por dominio, no por capa técnica
- Multi-tenancy estricto vía `branch_scoped_query`
- Append-only para historiales (no UPDATE destructivo)
- State machines centralizadas (no `if status` en routers)
- EventBus síncrono in-process (no Kafka/Redis hasta Fase 4)
- `/api/v1/` prefix para nuevo, `/api/` legacy se mantiene

**Datos:**
- Status como VARCHAR(32), no Postgres ENUM (evita migrations dolorosas)
- `mechanic_skills` tabla separada (no JSON column)
- `required_level` como enum (no FK)
- Idempotency TTL 24h con hash de body
- `kpi_daily_snapshots` desde Fase 3 (no live aggregation)

**API:**
- Errores con `code` machine-readable
- Filtros csv en query
- page_size max 200
- Portal con token hash + revoke
- `me/tasks` separado para shape mobile-optimizado
- Dashboards distintos por rol

**Roles:**
- Matriz declarativa en `permissions.py`
- State machines en módulos dedicados (testables sin DB)
- Reasignación = release + new (no UPDATE)
- Optimistic locking opcional (no obligatorio)
- QA opcional via config flag

**Frontend:**
- React Query como estado servidor
- RHF + Zod para formularios
- Polling adaptativo, no WebSockets en Fase 1-3
- Offline-light, no PWA completa
- Routing por rol (no feature flag)
- `PermissionGate` solo oculta UI, backend autoriza
- Mobile-first solo `/mechanic`
- OpenAPI → types generados (sin drift)

**Operación:**
- EventBus síncrono in-process
- Notificaciones via tabla + endpoint primero
- JSON logs siempre (incluso local)
- Sentry desde Fase 1, Prometheus Fase 3
- Backups custom semanales + Railway diarios
- Rate limiting in-memory MVP, Redis al escalar
- Cron via Railway o GitHub Actions (sin Celery hasta duela)
- Sin tracing Fase 1-3
- Cloudflare WAF en Fase 4

**Testing:**
- factory-boy + faker
- schemathesis property-based
- Playwright E2E ≤ 5 flujos
- Coverage por carpeta (no flat)
- pytest-xdist `-n auto`
- MSW frontend
- Snapshots controlados
- Migration tests obligatorios
- Sin load testing en MVP

**Planeación:**
- 4 fases mergeables independientes
- Master + 4 hijos, hijos JIT
- Fase 1 junto al master
- Estimaciones sin buffer (PM aplica)
- User-testing por fase obligatorio
- Performance gates por sprint
- Sin fechas calendario en spec

---

## Apéndice B — Glosario

| Término | Definición |
|---------|-----------|
| **OS** | Orden de Servicio = WorkOrder |
| **Línea** | WorkOrderLine — un servicio dentro de una OS (multi-servicio) |
| **Bay** | ServiceBay — espacio físico del taller donde se ejecuta un servicio |
| **Refacción** | Part — pieza/material del inventario |
| **Folio** | order_number formato `WO-{YYYY}-{NNNN}` |
| **Semáforo** | indicador green/yellow/red para stock o tiempos |
| **Branch / Sede** | Sucursal — unidad operativa con su propio almacén y staff |
| **Tenant context** | Resolución del scope multi-sucursal por request |
| **State machine** | Grafo declarativo de transiciones válidas |
| **Event bus** | Pub/sub síncrono in-process para side-effects |
| **Idempotency key** | Header opcional para detectar requests duplicados |
| **Portal token** | Token corto para acceso público a una OS sin auth |
| **Override** | Operación que salta una regla (asignar bajo nivel, sobrecarga) con `reason` obligatorio |

---

## Apéndice C — Referencias del repositorio actual

Estado del código al momento de escribir este spec (commit `2d76654` en `main`):

**Modelos ya implementados:** Organization, Branch, User+Role, VehicleModel, Service, ServiceCatalog, Vehicle, Supplier, SupplierPrice, Quote, QuoteLine, ConfigParam, ConfigHistory, WorkOrder (legacy enum), AuditLog, Document, Warehouse, Part, StockLevel, InventoryMovement, InventoryRequest, ServiceBay, WorkOrderLine, Evidence.

**Routers ya implementados:** auth, engine, catalog, vehicles, suppliers, quotes, dashboard (pricing), config, users, work_orders (parcial), branches, audit, inventory, workshop, admin_seed.

**Engines:** pricing_engine, supplier_engine, work_order_engine (básico), inventory_engine (completo).

**Frontend páginas:** Login, Home, Dashboard, Calculator, Catalog, Inventory, InventoryRequests, MechanicWork, OperationalDashboard, WorkshopBoard, Quotes, Suppliers, Config, Branches, Admin.

**Migraciones existentes:** `b3e9e2389f20_initial_schema`, `c4f1a8b3d502_multitenancy_foundation_and_erp`, `9a7c8f1d2b10_add_work_orders_domain`, `0d8a4e6f3c11_relax_service_catalog_history_uniqueness`, `7b2f8c1d9a31_create_vehicles_domain`.

**Patrones establecidos a respetar:**
- `UUIDMixin`, `AuditMixin`, `BranchScopedMixin` en `app/models/mixins.py`
- `TenantContext` + `branch_scoped_query` + `assert_branch_access` en `app/security/tenant.py`
- `require_role` decorator en `app/security`
- SQLAlchemy listeners para audit en `app/services/audit.py`
- R2 storage para evidencias en `app/services/storage/`
- AlembicConfig en `alembic.ini` + `alembic/versions/`

---

## Próximos pasos

1. ✅ Master spec escrito a `docs/superpowers/specs/2026-05-18-bjx-workshop-platform-master.md`
2. ⏭️ Spec de Fase 1 a `docs/superpowers/specs/2026-05-18-phase-1-workflow-units.md` (siguiente paso inmediato)
3. ⏭️ Self-review de ambos specs (placeholders, contradicciones, ambigüedades, scope)
4. ⏭️ Commit a `develop`
5. ⏭️ Review humana final del usuario
6. ⏭️ Invocar `superpowers:writing-plans` para generar plan ejecutable de Fase 1
