# Changelog

Todas las notables aquí. Formato sigue [Keep a Changelog](https://keepachangelog.com).

## [Unreleased] — Fase 1: Workshop Workflow + Asignación + Vista Mecánico

**Branch:** `feat/phase-1-workflow-units` (próximo merge a `develop`)

### Backend

#### Added
- **Migración `add_workshop_workflow_core`** con backfill automático del historial de status para OS existentes (1 row inicial por OS)
- **6 tablas nuevas:**
  - `work_order_status_history` — historial inmutable de transiciones (US-02)
  - `mechanic_profiles` — perfil de mecánico con nivel + capacidad
  - `mechanic_skills` — N:M skill × proficiency × certified
  - `assignments` — historial de asignaciones con unique partial index sobre las `active`
  - `work_order_findings` — workflow mecánico reporta → jefe aprueba/rechaza
  - `idempotency_keys` — TTL 24h + hash de body
- **Extensión de `work_orders`:** columnas `type` (cita/grúa/stand-by/walk_in/garantía/interno), `priority`, `scheduled_at`, `promised_at`, `customer_id`, `tow_provider`, `entry_mileage`, `exit_mileage`, `portal_token` (US-01)
- **Extensión de `services`:** `required_level`, `approved`, `approved_by`, `approved_at`, `proposed_by`, `proposal_id`
- **State machine declarativa** de `WorkOrder` con 14 transiciones, timestamps automáticos, eventos emitidos
- **AssignmentEngine** con validación de nivel + override con motivo + reasignación atómica que pausa líneas in_progress (R8-R12)
- **EventBus síncrono in-process** + 5 eventos de dominio (WorkOrderCreated, WorkOrderStatusChanged, MechanicAssigned, WorkOrderFindingReported, WorkOrderFindingApproved) + audit subscriber
- **Permission matrix declarativa** (`PERMISSION_MATRIX`) con 21 permisos × 10 roles + FastAPI dependency factory `require_permission(...)`
- **Idempotency helpers** (`compute_request_hash`, `lookup_idempotency`, `save_idempotency`) con TTL 24h
- **Endpoints `/api/v1/work-orders/*`:**
  - `PATCH /{id}/status` con state machine + reason validation
  - `GET /{id}/status-history` con duration calculada
  - `POST /{id}/cancel` con reason obligatorio
- **Endpoints `/api/v1/assignments`:**
  - `POST /` con validación nivel + override + cross-branch + auto-transition received→assigned
- **Endpoints `/api/v1/me/*`:**
  - `GET /tasks` con timer, semáforo, máx 3 acciones por status, load del mecánico (US-04)
  - `POST /tasks/{line_id}/findings` para reportar hallazgos
- **Endpoints `/api/v1/mechanics`:**
  - `GET /` listado con load + skills
  - `POST /` crear perfil
  - `PATCH /{user_id}` editar (level solo gerente/admin)
  - `POST /{user_id}/skills` upsert de skill
- **Endpoints `/api/v1/findings`:**
  - `GET /` listado por status
  - `POST /{id}/approve` (crea WorkOrderLine si hay suggested_service_id)
  - `POST /{id}/reject` con reason

#### Changed
- `work_orders.status` migrado de **Postgres Enum** → **VARCHAR(32)** para evitar drama de migraciones (validación queda en Pydantic + state machine)
- `app/security/__init__.py` ahora re-exporta `Permission`, `has_permission`, `require_permission` desde el módulo dedicado `permissions.py`. La función legacy `require_permission(*role_groups: str)` quedó sustituida — sin uso previo en routers
- `app/main.py` ahora invoca `setup_event_subscribers()` al boot

#### Fixed
- `tests/migrations/test_add_workshop_workflow_core.py` usa path absoluto a `alembic.ini` (resuelto desde `__file__`) para que pytest funcione sin importar cwd

### Frontend

#### Added
- **`@/` path alias** configurado en `vite.config.ts` + `tsconfig.app.json`
- **Deps:** `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`
- **`src/lib/` — librerías base:**
  - `permissions.ts` — Permission enum + PERMISSION_MATRIX espejo del backend + `hasPermission()`
  - `statusLabels.ts` — mapas español de WorkOrderStatus, WorkOrderType, WorkOrderLineStatus, Priority, MechanicLevel, Actions
  - `semaphore.ts` — `SEMAPHORE_COLORS`, `semaphoreFromTimer()`, `semaphoreFromLoad()`
  - `time.ts` — `formatDateTime`, `formatRelative`, `formatMinutes`, `formatTimer`
- **UI primitives:**
  - `components/ui/SemaphoreBadge.tsx` — badge con dot opcional + pulse, tamaños xs/sm/md/lg
  - `components/shared/PermissionGate.tsx` — component-level RBAC (no autoriza, solo oculta UI)
- **API v1 endpoint clients** (`src/api/endpoints/`):
  - `workOrdersV1.ts` — transitionStatus, getStatusHistory, cancel
  - `assignments.ts` — create
  - `me.ts` — getTasks, reportFinding
  - `mechanics.ts` — list, create, update, addSkill
  - `findings.ts` — list, approve, reject
- **`api/queryKeys.ts`** — fuente única de React Query keys
- **Hooks:**
  - `useAuth()` — wrapper conveniente del auth store
  - `usePermission(permission)` — RBAC reactivo
  - `usePoll(key, fetcher, opts)` — polling adaptativo con pause al perder foco
  - `useMyTasks()` — poll 30s del endpoint `/v1/me/tasks`
- **Componente `WorkOrderCard`** mobile-first con máx 2 acciones primarias visibles + overflow al detalle (touch ≥ 44px, scale tap)
- **Página `MechanicHomeV1`** (`/mechanic`) con header del mecánico (load bar), filtros (todas/pendientes/en proceso), lista de cards. Coexiste con `MechanicWork` legacy

### Documentación

#### Added
- `docs/superpowers/specs/2026-05-18-bjx-workshop-platform-master.md` — spec maestro de la plataforma (8 secciones, ~1250 líneas)
- `docs/superpowers/specs/2026-05-18-phase-1-workflow-units.md` — spec ejecutable de Fase 1 (~900 líneas)
- `docs/superpowers/plans/2026-05-18-phase-1-workflow-units.md` — plan ejecutable con 27 tasks y 176 steps TDD
- `context/roles_y_usuarios.md` — catálogo completo de 10 roles con alcance, permisos, workflows típicos, onboarding (~620 líneas)

### Tests

#### Added
- `tests/factories/` — UserFactory, WorkOrderFactory, InProgressWorkOrderFactory (factory-boy + faker)
- `tests/unit/test_factories_smoke.py` — smoke tests de imports
- `tests/unit/test_models_import.py` — 7 smoke tests de modelos nuevos
- `tests/unit/permissions/test_permission_matrix.py` — 10 tests del matrix + has_permission + require_permission
- `tests/unit/events/test_event_bus.py` — 4 tests del EventBus (subscribe, error isolation, multiple subscribers, no subs)
- `tests/unit/state_machines/test_work_order_sm.py` — 10 tests de state machine (transiciones válidas/inválidas, terminal states, reasons, ownership, events)
- `tests/unit/utils/test_idempotency.py` — 3 tests de helpers
- `tests/unit/engines/test_assignment_engine.py` — 3 smoke tests (validación funcional vive en integration tests con DB real)
- `tests/migrations/test_add_workshop_workflow_core.py` — 3 tests de migración: upgrade, downgrade, backfill

### Limitaciones conocidas

1. **Tests automatizados no se ejecutaron en este branch** — el entorno WSL Python 3.12 carece de pip/venv y los deps están solo en Windows Python (Task 1.1.1 documenta el workaround). Sintaxis validada con `ast.parse`. Verificación end-to-end pendiente en entorno con deps completos.
2. **Task 1.2.6 (multi-tenancy tests para tablas nuevas) pendiente.**
3. **Sprint 1.4 (E2E Playwright, Sentry init, runbooks, perf check)** pendiente.
4. **MechanicHomeV1 page coexiste con `MechanicWork` legacy** — migración del page legacy a usar endpoints v1 queda como follow-up.
5. **Status history de OS existentes pre-migración** queda con `from_status=NULL, to_status=<status_actual>, occurred_at=received_at` — entrada inicial sintética.

### Commits relevantes

```
1bc589e feat(frontend): MechanicHomeV1 page + WorkOrderCard mobile-first
e22f067 fix(frontend): WorkOrderCard usa Badge variants existentes
67c67b4 feat(frontend): Sprint 1.3 — libs + UI primitives + API v1 + hooks
c8e80c4 docs(context): catálogo completo de 10 roles
a25eb3f feat(v1): /me/tasks + /me/tasks/{id}/findings + /mechanics CRUD + /findings
30bb052 feat(assignments): POST /api/v1/assignments
46ebab8 feat(work-orders): /api/v1/work-orders endpoints status + history + cancel
6c3e276 feat(schemas): StatusTransition + StatusHistory schemas v1
05b0c25 feat(workshop): AssignmentEngine
506be00 feat(events): cablear setup_event_subscribers al boot
9872dfb feat(utils): idempotency helpers
6e0867e feat(workshop): state machine de WorkOrder
9878531 feat(events): EventBus + workshop events + audit subscriber
a3022e0 feat(security): permission matrix declarativa
167d25d feat(models): añade WorkOrderStatusHistory, MechanicProfile, Assignment, Finding, IdempotencyKey
5757bf5 fix(tests): resolve alembic.ini path absolute
8677bc7 feat(db): migración add_workshop_workflow_core con backfill historial
d157bbb test: add factory-boy + faker + scaffolding de tests/unit
```
