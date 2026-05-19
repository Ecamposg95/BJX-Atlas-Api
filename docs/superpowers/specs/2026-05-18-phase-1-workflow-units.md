# Fase 1 — Flujo de Unidades + Asignación + Vista Mecánico

**Spec ID:** `bjx-phase-1-workflow-units`
**Fecha:** 2026-05-18
**Estado:** Aprobado para implementación (sujeto a review final)
**Padre:** [bjx-workshop-platform-master](./2026-05-18-bjx-workshop-platform-master.md)
**User Stories cubiertas:** US-01, US-02, US-03, US-04
**Esfuerzo estimado:** ~110h (3 semanas con 1 senior + 1 mid en paralelo)
**Target branch:** `develop` (PRs por sprint) → merge a `main` al cerrar fase

---

## Objetivo

Cerrar el ciclo operativo **recepción → entrega** de una unidad, con:
- Asignación de mecánico validada por nivel + skills + carga
- Historial inmutable de estados (US-02)
- Vista mecánico mobile-first usable en piso de taller (US-04)
- Tipos de OS (cita, grúa, stand-by, walk-in, garantía, interno) (US-01)
- Reporte de hallazgos del mecánico con aprobación del jefe

Esta fase **es la base operativa** del producto. Sin esto, Fases 2-4 no tienen contexto.

---

## Out of scope (NO en Fase 1)

Documentado explícitamente para evitar scope creep:

- Semáforo de stock con thresholds (Fase 2 — usamos `min_stock` existente como proxy en mientras)
- Dashboards gerenciales con KPIs cacheados (Fase 3)
- Notificaciones por email (Fase 3)
- Portal cliente público (Fase 4)
- Compras / Purchase Orders (Fase 4)
- Multi-worker / Redis (Fase 4)
- Service worker / PWA completa (no planeado)
- Tour onboarding (Fase 4)

Lo único que **SÍ** se hace en Fase 1 relacionado con futuras fases:
- Columna `portal_token` se crea en `work_orders` (Fase 4 la usará) — generación opcional, sin endpoint público todavía
- Tabla `idempotency_keys` se crea (usada en Fase 1 para mobile)
- EventBus formal queda cableado para Fase 2-4 lo extiendan

---

## Sprint 1.1 — Foundations + State Machine (5 días)

### Sprint 1.1 — Tarea 1.1.1: Migración Alembic `add_workshop_workflow_core`

**Archivo:** `alembic/versions/{rev}_add_workshop_workflow_core.py`

**Cambios upgrade:**

Columnas en `work_orders`:
```python
op.add_column('work_orders', sa.Column('type', sa.String(32), nullable=False, server_default='walk_in'))
op.add_column('work_orders', sa.Column('priority', sa.String(16), nullable=False, server_default='normal'))
op.add_column('work_orders', sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True))
op.add_column('work_orders', sa.Column('promised_at', sa.DateTime(timezone=True), nullable=True))
op.add_column('work_orders', sa.Column('customer_id', sa.String(36), nullable=True))
op.add_column('work_orders', sa.Column('tow_provider', sa.String(120), nullable=True))
op.add_column('work_orders', sa.Column('entry_mileage', sa.Integer(), nullable=True))
op.add_column('work_orders', sa.Column('exit_mileage', sa.Integer(), nullable=True))
op.add_column('work_orders', sa.Column('portal_token', sa.String(64), nullable=True))

op.create_index('ix_work_orders_type', 'work_orders', ['type'])
op.create_index('ix_work_orders_priority', 'work_orders', ['priority'])
op.create_index('ix_work_orders_scheduled_at', 'work_orders', ['scheduled_at'])
op.create_index('ix_work_orders_branch_status', 'work_orders', ['branch_id', 'status'])
op.create_index('ix_work_orders_branch_received', 'work_orders', ['branch_id', 'received_at'])
op.create_index('ix_work_orders_portal_token', 'work_orders', ['portal_token'], unique=True,
                postgresql_where=sa.text('portal_token IS NOT NULL'),
                sqlite_where=sa.text('portal_token IS NOT NULL'))
```

**Conversión de `status` de Enum a VARCHAR(32):**

```python
# PostgreSQL: ALTER COLUMN TYPE VARCHAR USING status::text + DROP TYPE
# SQLite: recreate table workaround (Alembic batch_alter_table maneja)
with op.batch_alter_table('work_orders') as batch:
    batch.alter_column('status', type_=sa.String(32), existing_type=sa.Enum('received','in_progress','waiting_parts','completed','delivered', name='workorderstatus'))
# Postgres: op.execute("DROP TYPE workorderstatus")
```

Columnas en `services`:
```python
op.add_column('services', sa.Column('required_level', sa.String(16), nullable=False, server_default='junior'))
op.add_column('services', sa.Column('approved', sa.Boolean(), nullable=False, server_default=sa.true()))
op.add_column('services', sa.Column('approved_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
op.add_column('services', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
op.add_column('services', sa.Column('proposed_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
op.add_column('services', sa.Column('proposal_id', sa.String(36), nullable=True))  # FK soft a service_proposals (Fase 3)

op.create_index('ix_services_required_level', 'services', ['required_level'])
op.create_index('ix_services_approved', 'services', ['approved'])
```

Tabla `work_order_status_history`:
```python
op.create_table('work_order_status_history',
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('branch_id', sa.String(36), sa.ForeignKey('branches.id', ondelete='SET NULL'), index=True),
    sa.Column('work_order_id', sa.String(36), sa.ForeignKey('work_orders.id', ondelete='CASCADE'), nullable=False, index=True),
    sa.Column('from_status', sa.String(32), nullable=True),
    sa.Column('to_status', sa.String(32), nullable=False),
    sa.Column('changed_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('metadata_json', sa.Text(), nullable=True),
    sa.Column('occurred_at', sa.DateTime(timezone=True), nullable=False),
)
op.create_index('ix_wo_status_history_wo_occurred', 'work_order_status_history', ['work_order_id', 'occurred_at'])
```

Tabla `mechanic_profiles`:
```python
op.create_table('mechanic_profiles',
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('branch_id', sa.String(36), sa.ForeignKey('branches.id', ondelete='SET NULL'), index=True),
    sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True, index=True),
    sa.Column('level', sa.String(16), nullable=False, server_default='junior'),
    sa.Column('employee_number', sa.String(32), nullable=True, index=True),
    sa.Column('hire_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('hourly_cost', sa.Float(), nullable=True),
    sa.Column('capacity_hrs_day', sa.Float(), nullable=False, server_default='8.0'),
    sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column('notes', sa.Text(), nullable=True),
)
op.create_index('ix_mechanic_profiles_level', 'mechanic_profiles', ['level'])
```

Tabla `mechanic_skills`:
```python
op.create_table('mechanic_skills',
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('mechanic_profile_id', sa.String(36), sa.ForeignKey('mechanic_profiles.id', ondelete='CASCADE'), nullable=False, index=True),
    sa.Column('category', sa.String(32), nullable=False, index=True),
    sa.Column('proficiency', sa.Integer(), nullable=False, server_default='3'),
    sa.Column('certified', sa.Boolean(), nullable=False, server_default=sa.false()),
)
op.create_index('uq_mechanic_skill', 'mechanic_skills', ['mechanic_profile_id', 'category'], unique=True)
```

Tabla `assignments`:
```python
op.create_table('assignments',
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('branch_id', sa.String(36), sa.ForeignKey('branches.id', ondelete='SET NULL'), index=True),
    sa.Column('work_order_id', sa.String(36), sa.ForeignKey('work_orders.id', ondelete='CASCADE'), nullable=False, index=True),
    sa.Column('work_order_line_id', sa.String(36), sa.ForeignKey('work_order_lines.id', ondelete='CASCADE'), nullable=True, index=True),
    sa.Column('mechanic_id', sa.String(36), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False, index=True),
    sa.Column('assigned_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    sa.Column('status', sa.String(16), nullable=False, server_default='active'),
    sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('override_level_check', sa.Boolean(), nullable=False, server_default=sa.false()),
)
op.create_index('ix_assignments_active', 'assignments', ['work_order_id', 'status'])
op.create_index('ix_assignments_mechanic_active', 'assignments', ['mechanic_id', 'status'])

# Unique partial index — solo un Assignment.active por línea
op.create_index('uq_assignments_one_active_per_line', 'assignments',
                ['work_order_id', sa.text("COALESCE(work_order_line_id, '')")],
                unique=True,
                postgresql_where=sa.text("status = 'active'"),
                sqlite_where=sa.text("status = 'active'"))
```

Tabla `work_order_findings`:
```python
op.create_table('work_order_findings',
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('branch_id', sa.String(36), sa.ForeignKey('branches.id', ondelete='SET NULL'), index=True),
    sa.Column('work_order_id', sa.String(36), sa.ForeignKey('work_orders.id', ondelete='CASCADE'), nullable=False, index=True),
    sa.Column('work_order_line_id', sa.String(36), sa.ForeignKey('work_order_lines.id', ondelete='SET NULL'), nullable=True, index=True),
    sa.Column('reported_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('suggested_service_id', sa.String(36), sa.ForeignKey('services.id', ondelete='SET NULL'), nullable=True),
    sa.Column('estimated_extra_hrs', sa.Float(), nullable=True),
    sa.Column('status', sa.String(16), nullable=False, server_default='pending'),  # pending|approved|rejected
    sa.Column('reviewed_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rejection_reason', sa.Text(), nullable=True),
    sa.Column('resulting_line_id', sa.String(36), sa.ForeignKey('work_order_lines.id', ondelete='SET NULL'), nullable=True),
)
op.create_index('ix_findings_branch_status', 'work_order_findings', ['branch_id', 'status'])
```

Tabla `idempotency_keys`:
```python
op.create_table('idempotency_keys',
    sa.Column('id', sa.String(36), primary_key=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('key', sa.String(128), nullable=False, unique=True, index=True),
    sa.Column('endpoint', sa.String(128), nullable=False),
    sa.Column('user_id', sa.String(36), nullable=True, index=True),
    sa.Column('request_hash', sa.String(128), nullable=False),
    sa.Column('response_status', sa.Integer(), nullable=False),
    sa.Column('response_body', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False, index=True),
)
```

**Backfill** (en `upgrade()` antes de finalizar):

```python
# Por cada WorkOrder existente, crea row inicial en work_order_status_history
op.execute("""
    INSERT INTO work_order_status_history
        (id, branch_id, work_order_id, from_status, to_status, occurred_at, created_at)
    SELECT
        lower(hex(randomblob(16))),  -- SQLite; en Postgres usar gen_random_uuid()::text
        wo.branch_id,
        wo.id,
        NULL,
        wo.status,
        wo.received_at,
        wo.received_at
    FROM work_orders wo
    WHERE NOT EXISTS (
        SELECT 1 FROM work_order_status_history h WHERE h.work_order_id = wo.id
    )
""")
```

Para Postgres, query equivalente con `gen_random_uuid()`. Migration usa `op.get_bind().dialect.name` para discriminar.

**Downgrade:** revierte en orden inverso. **Probado obligatoriamente en CI.**

---

### Sprint 1.1 — Tarea 1.1.2: Modelos SQLAlchemy

**Archivos nuevos:**
- `app/models/workshop_history.py` — `WorkOrderStatusHistory`
- `app/models/mechanic_profiles.py` — `MechanicProfile`, `MechanicSkill`, enums `MechanicLevel`, `SkillCategory`
- `app/models/assignments.py` — `Assignment`, enum `AssignmentStatus`
- `app/models/findings.py` — `WorkOrderFinding`
- `app/models/idempotency.py` — `IdempotencyKey`

**Archivos modificados:**
- `app/models/work_orders.py` — añade `WorkOrderType` enum, status nuevo enum, nuevas columnas
- `app/models/catalog.py` — añade columnas approval + `ServiceRequiredLevel` enum
- `app/models/__init__.py` — exporta los nuevos modelos

**Patrón:** todos heredan `Base, UUIDMixin, AuditMixin, BranchScopedMixin` excepto `MechanicSkill` (sin branch) e `IdempotencyKey` (sin branch ni audit completo).

**Relaciones:**
- `WorkOrder.status_history` → `WorkOrderStatusHistory[]`
- `WorkOrder.assignments` → `Assignment[]`
- `WorkOrder.findings` → `WorkOrderFinding[]`
- `User.mechanic_profile` → `MechanicProfile` (1:1)
- `MechanicProfile.skills` → `MechanicSkill[]`

---

### Sprint 1.1 — Tarea 1.1.3: State machine de WorkOrder

**Archivo:** `app/services/state_machines/__init__.py` + `work_order_sm.py`

```python
# app/services/state_machines/work_order_sm.py
from typing import Optional
from datetime import datetime, timezone
import json

from sqlalchemy.orm import Session

from app.models.work_orders import WorkOrder, WorkOrderStatus
from app.models.workshop_history import WorkOrderStatusHistory
from app.models.assignments import Assignment
from app.models.users import User
from app.security.permissions import Permission, has_permission
from app.events import EventBus
from app.events.workshop_events import WorkOrderStatusChanged


class InvalidTransition(Exception):
    def __init__(self, code: str, detail: dict):
        self.code = code
        self.detail = detail
        super().__init__(code)


class Forbidden(Exception):
    def __init__(self, code: str, detail: dict):
        self.code = code
        self.detail = detail


S = WorkOrderStatus

# (from, to) -> rule dict
TRANSITIONS: dict[tuple[S, S], dict] = {
    (S.received, S.assigned):        {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.received, S.cancelled):       {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.assigned, S.in_progress):     {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION, "actor_must_own_assignment": True},
    (S.assigned, S.received):        {"reason": True,  "permission": Permission.ASSIGNMENT_RELEASE},
    (S.assigned, S.cancelled):       {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.in_progress, S.waiting_parts):  {"reason": True,  "permission": Permission.WORK_ORDER_TRANSITION},
    (S.in_progress, S.quality_check):  {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.in_progress, S.completed):      {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.in_progress, S.cancelled):      {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.waiting_parts, S.in_progress):  {"reason": False, "permission": Permission.WORK_ORDER_TRANSITION},
    (S.waiting_parts, S.cancelled):    {"reason": True,  "permission": Permission.WORK_ORDER_CANCEL},
    (S.quality_check, S.completed):    {"reason": False, "permission": Permission.WORK_ORDER_QA_PASS},
    (S.quality_check, S.in_progress):  {"reason": True,  "permission": Permission.WORK_ORDER_QA_FAIL},
    (S.completed, S.delivered):        {"reason": False, "permission": Permission.WORK_ORDER_DELIVER},
}

TERMINAL_STATES: set[S] = {S.delivered, S.cancelled}


def allowed_targets_from(status: S) -> list[str]:
    return [t.value for (f, t) in TRANSITIONS if f == status]


def transition(
    db: Session,
    work_order: WorkOrder,
    to_status: S,
    actor: User,
    reason: Optional[str],
    metadata: Optional[dict] = None,
) -> WorkOrderStatusHistory:
    from_status = S(work_order.status)

    if from_status in TERMINAL_STATES:
        raise InvalidTransition(code="WORK_ORDER_TERMINAL", detail={"from_status": from_status.value})

    rule = TRANSITIONS.get((from_status, to_status))
    if rule is None:
        raise InvalidTransition(
            code="WORK_ORDER_INVALID_TRANSITION",
            detail={
                "from_status": from_status.value,
                "to_status": to_status.value,
                "allowed_targets": allowed_targets_from(from_status),
            }
        )

    if rule["reason"] and not (reason and reason.strip()):
        raise InvalidTransition(code="REASON_REQUIRED", detail={"to_status": to_status.value})

    if not has_permission(actor, rule["permission"]):
        raise Forbidden(code="FORBIDDEN_TRANSITION", detail={"required": rule["permission"].value})

    if rule.get("actor_must_own_assignment"):
        owns = db.query(Assignment.id).filter(
            Assignment.work_order_id == work_order.id,
            Assignment.mechanic_id == actor.id,
            Assignment.status == "active",
        ).first()
        if not owns:
            raise Forbidden(code="NOT_ASSIGNED_MECHANIC", detail={"work_order_id": work_order.id})

    # Aplicar transición
    work_order.status = to_status.value
    _set_timestamp_for_status(work_order, to_status)

    history = WorkOrderStatusHistory(
        branch_id=work_order.branch_id,
        work_order_id=work_order.id,
        from_status=from_status.value,
        to_status=to_status.value,
        changed_by=actor.id,
        reason=reason,
        metadata_json=json.dumps(metadata) if metadata else None,
        occurred_at=datetime.now(timezone.utc),
    )
    db.add(history)
    db.flush()

    EventBus.publish(WorkOrderStatusChanged.make(
        work_order_id=work_order.id,
        from_status=from_status.value,
        to_status=to_status.value,
        reason=reason,
        branch_id=work_order.branch_id,
        actor_id=actor.id,
    ))

    return history


def _set_timestamp_for_status(wo: WorkOrder, status: S) -> None:
    now = datetime.now(timezone.utc)
    if status == S.in_progress and wo.work_started_at is None:
        wo.work_started_at = now
    elif status == S.completed and wo.work_finished_at is None:
        wo.work_finished_at = now
    elif status in (S.delivered, S.cancelled) and wo.closed_at is None:
        wo.closed_at = now
```

**Tests obligatorios** (en `tests/unit/state_machines/test_work_order_sm.py`):
- `test_each_valid_transition_passes` — itera TRANSITIONS, ejecuta cada una
- `test_invalid_transition_returns_allowed_targets`
- `test_terminal_state_blocks_all`
- `test_cancel_requires_reason`
- `test_assigned_to_in_progress_requires_active_assignment`
- `test_assigned_to_in_progress_fails_without_active_assignment`
- `test_status_history_entry_created_with_correct_fields`
- `test_timestamps_set_on_first_in_progress`
- `test_timestamps_not_overwritten_on_second_in_progress`
- `test_event_published_with_correct_payload`

---

### Sprint 1.1 — Tarea 1.1.4: AssignmentEngine

**Archivo:** `app/services/assignment_engine.py`

Lógica completa documentada en master spec §3.2.2 y §4.5 (R8-R12). Función pública:

```python
def assign_mechanic(
    db: Session,
    *,
    work_order_id: str,
    work_order_line_id: Optional[str],
    mechanic_user_id: str,
    actor: User,
    override_level_check: bool = False,
    reason: Optional[str] = None,
) -> Assignment:
    ...
```

Implementa:
1. Verificar OS existe + branch_id accesible
2. Verificar `MechanicProfile` activo + mismo branch_id
3. Calcular `service_required_level` (línea o OS principal)
4. Comparar `mechanic.level` vs `required_level` con orden `junior=1 < intermedio=2 < master=3`
5. Si falla: validar `override_level_check + permission + reason`, si no → 409 `ASSIGNMENT_LEVEL_INSUFFICIENT`
6. Buscar `Assignment.active` previa: marcarla `reassigned`, `released_at=now`
7. Si la línea estaba `in_progress`, pausarla con `reason="reassignment"`
8. Crear nueva `Assignment(status='active')`
9. Actualizar `WorkOrder.assigned_mechanic_id` (back-compat)
10. Si OS en `received` → transición auto a `assigned` vía state machine
11. Emitir `MechanicAssigned`

**Tests obligatorios** (`tests/unit/engines/test_assignment_engine.py`):

| Test | Setup | Expected |
|------|-------|----------|
| `test_level_pass_junior_to_junior` | mechanic=junior, service=junior | `level_check_result="pass"` |
| `test_level_pass_master_to_junior` | mechanic=master, service=junior | `level_check_result="pass"` |
| `test_level_fail_junior_to_master` | mechanic=junior, service=master | raises with code `ASSIGNMENT_LEVEL_INSUFFICIENT`, detail.required_level=master |
| `test_override_with_reason_and_permission_pass` | failing case + override=True + jefe + reason | `level_check_result="override"` |
| `test_override_without_reason_fails` | override=True sin reason | raises `REASON_REQUIRED` |
| `test_override_without_permission_fails` | override=True + recepcion | raises `FORBIDDEN_PERMISSION` |
| `test_cross_branch_mechanic_blocked` | mechanic en sucursal B, OS en A | raises with code `CROSS_BRANCH_NOT_ALLOWED` |
| `test_inactive_mechanic_blocked` | profile.active=False | raises `MECHANIC_INACTIVE` |
| `test_reassignment_marks_previous_reassigned` | dos asignaciones consecutivas | primera quedó status=reassigned + released_at set |
| `test_reassignment_pauses_in_progress_line` | línea en in_progress + reasignar | línea pasa a paused con reason="reassignment" |
| `test_unique_active_constraint` | insert manual de 2 active misma línea | IntegrityError (Postgres) / OperationalError (SQLite) |
| `test_auto_transition_to_assigned` | OS en received | después de assign, status=assigned + history entry creado |
| `test_event_emitted_with_level_check_result` | capturar evento publicado | MechanicAssigned con level_check_result correcto |

---

### Sprint 1.1 — Tarea 1.1.5: EventBus formal

**Archivos:**
- `app/events/__init__.py` — `BaseEvent`, `EventBus`, helpers de contexto
- `app/events/workshop_events.py` — `WorkOrderCreated`, `WorkOrderStatusChanged`, `MechanicAssigned`, `WorkOrderFindingReported`, `WorkOrderFindingApproved`
- `app/events/subscribers/__init__.py` + `audit_subscriber.py`

Implementación per master §6.1.

`setup_event_subscribers()` registrado al boot en `app/main.py`.

**Tests:**
- `test_subscribe_and_publish_works`
- `test_event_handler_error_does_not_propagate`
- `test_multiple_subscribers_to_same_event`
- `test_no_subscribers_publish_silently`

---

### Sprint 1.1 — Tarea 1.1.6: Permissions matrix

**Archivo:** `app/security/permissions.py`

Define enum `Permission` con TODOS los permisos de Fase 1:
- `WORK_ORDER_CREATE`, `WORK_ORDER_UPDATE`, `WORK_ORDER_CANCEL`, `WORK_ORDER_DELETE`, `WORK_ORDER_TRANSITION`, `WORK_ORDER_QA_PASS`, `WORK_ORDER_QA_FAIL`, `WORK_ORDER_DELIVER`
- `ASSIGNMENT_CREATE`, `ASSIGNMENT_OVERRIDE`, `ASSIGNMENT_RELEASE`
- `MECHANIC_PROFILE_READ`, `MECHANIC_PROFILE_WRITE`, `MECHANIC_LEVEL_WRITE`, `MECHANIC_SKILLS_WRITE`
- `FINDING_REPORT`, `FINDING_APPROVE`, `FINDING_REJECT`, `FINDING_LIST`
- `ME_TASKS_READ`

Matriz `PERMISSION_MATRIX: dict[Permission, set[Role]]` declarativa.

Helpers:
- `has_permission(user, permission) -> bool`
- `require_permission(permission)` — FastAPI dependency factory

**Tests:**
- `test_every_permission_has_at_least_one_role`
- `test_no_branch_role_for_global_permissions`
- `test_require_permission_returns_403_with_correct_code`
- `test_viewer_has_only_read_permissions`

---

### Sprint 1.1 — Tarea 1.1.7: Idempotency utility

**Archivo:** `app/utils/idempotency.py`

```python
def with_idempotency(
    db: Session,
    *,
    key: Optional[str],
    endpoint: str,
    user_id: str,
    request_body: dict,
    handler: Callable[[], tuple[int, dict]],
) -> tuple[int, dict]:
    """Ejecuta handler con cache de idempotencia.

    Si key existe + hash igual → devuelve cached.
    Si key existe + hash distinto → raise 409 IDEMPOTENCY_KEY_REUSE.
    Si key nueva → ejecuta + cachea con TTL 24h.
    Si key None → ejecuta sin cache.
    """
    ...
```

Decorador FastAPI opcional: `@idempotent(endpoint="POST /work-orders")`.

**Tests:**
- `test_first_call_executes_handler`
- `test_repeated_call_same_body_returns_cache`
- `test_repeated_call_different_body_raises_409`
- `test_expired_key_treated_as_new`
- `test_no_key_no_caching`

---

## Sprint 1.2 — Endpoints + Permisos (5 días)

### Tareas

| Tarea | Archivos | Endpoints |
|-------|----------|-----------|
| 1.2.1 | `app/schemas/work_orders.py` (extender) + `app/routers/work_orders.py` (refactor) | `POST/GET/PATCH/DELETE /api/v1/work-orders`, `PATCH /api/v1/work-orders/{id}/status`, `GET .../status-history`, `POST .../cancel` |
| 1.2.2 | `app/schemas/assignments.py` + `app/routers/assignments.py` (nuevo) | `POST/GET/PATCH /api/v1/assignments`, `POST /work-orders/{id}/reassign` |
| 1.2.3 | `app/schemas/mechanics.py` + `app/routers/mechanics.py` (nuevo) | `GET/POST/PATCH /api/v1/mechanics`, skills endpoints, `GET .../workload` |
| 1.2.4 | `app/schemas/me.py` + `app/routers/me.py` (nuevo) | `GET /api/v1/me/tasks`, `/today`, `/profile`, `POST .../findings` |
| 1.2.5 | `app/schemas/findings.py` + `app/routers/findings.py` (nuevo) | `GET /api/v1/findings`, `POST .../approve`, `.../reject` |
| 1.2.6 | Tests integración en `tests/integration/` | mínimo 6 tests por endpoint nuevo (ver §7.4 master) |

### Acceptance específico Sprint 1.2

- `POST /api/v1/work-orders` con `type='appointment'` sin `scheduled_at` → 422 con campo correcto
- `POST /api/v1/work-orders` con `type='appointment'` y `scheduled_at` en pasado → 422
- `POST /api/v1/work-orders` con `type='tow'` sin `tow_provider` → 422
- `POST /api/v1/work-orders` con `vehicle.plates` ya activo en otra OS abierta → reutiliza vehicle, no crea otro
- `POST /api/v1/work-orders` retorna `portal_token` plain una sola vez (GET posterior no lo incluye)
- `PATCH .../status` cubre todas las transiciones de TRANSITIONS + errores
- `GET .../status-history` retorna entries ordenadas + duración en cada estado calculada
- `POST /api/v1/assignments` flujo completo incluyendo override
- `GET /api/v1/me/tasks` filtra por `Assignment.active` del usuario (no `WorkOrder.assigned_mechanic_id`)
- `GET /api/v1/me/tasks` incluye `parts_needed` con flag `blocking` por línea
- `GET /api/v1/me/tasks` incluye máximo 3 acciones por línea según estado
- Idempotency key reutilizada con mismo body → mismo response (cached)
- Idempotency key reutilizada con body distinto → 409

---

## Sprint 1.3 — Frontend Mechanic + Manager (5 días)

### Tareas

#### 1.3.1 — Setup base

- Instalar deps: `@tanstack/react-query`, `@tanstack/react-table`, `react-hook-form`, `zod`, `@hookform/resolvers`, `sonner`, `lucide-react`, `date-fns`, `date-fns-tz`
- `App.tsx`: añadir `<QueryClientProvider>` con config global (`staleTime: 30s`, `gcTime: 5min`, `retry: 1`)
- `<Toaster position="top-right" richColors />` de Sonner
- Generador de types: script `scripts/generate-api-types.sh` que corre `openapi-typescript` contra `/api/openapi.json`

#### 1.3.2 — Libs base

- `src/lib/permissions.ts` — espejo del backend con `Permission` enum, `PERMISSION_MATRIX`, `hasPermission(role, p)`
- `src/lib/statusLabels.ts` — mapas español:
  ```ts
  export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
    received: 'Recibido', assigned: 'Asignado',
    in_progress: 'En proceso', waiting_parts: 'Esperando refacción',
    quality_check: 'Control de calidad', completed: 'Terminado',
    delivered: 'Entregado', cancelled: 'Cancelado',
  };
  ```
- `src/lib/semaphore.ts` — `getSemaphoreColor(status)`, `getSemaphoreFromTimer(elapsed, standard)`
- `src/lib/time.ts` — formato relativo + zona horaria del branch

#### 1.3.3 — Componentes UI primitivos

- `SemaphoreBadge` (variantes xs/sm/md/lg, pulse, withDot)
- `Skeleton.Table`, `Skeleton.Card`
- `Badge`, `Chip`, `EmptyState`
- `ConfirmDialog`
- `PermissionGate`

#### 1.3.4 — Componentes de dominio

- `WorkOrderCard`, `WorkOrderStatusTimeline`
- `StatusTransitionButton` (con confirm + reason si aplica)
- `MechanicLoadBar`, `LevelMatchIndicator`
- `AssignMechanicDialog` (con buscador, filtros por skill/nivel)
- `PartAvailabilityChip`

#### 1.3.5 — Páginas

**Routing** (`src/routes/routes.tsx`): config completa por rol con guards `<RequireRoles>`.

**`/mechanic` (MechanicHome):**
- Header con nombre + nivel + carga bar
- Filtros (todas/hoy/pendientes/en proceso)
- Lista de cards (uso `useMyTasks()` hook con poll 30s + refetch al volver foco)
- Bottom navigation: Tareas | Buscar | Perfil
- Mobile-first: `<md` solo cards, `≥md` puede ser tabla densa

**`/mechanic/tasks/:lineId` (MechanicTaskDetail):**
- Header con back button
- Info de OS + vehículo + bay
- Timer grande (00:23:47 / 1:30:00) con progress bar
- Acciones primarias (máx 2 visibles + overflow ⋮)
- Sección Refacciones (con check de availability)
- Sección Evidencias (input file con capture cámara + preview)
- Sección Hallazgos (form para reportar)

**`/manager` (ManagerDashboard):**
- KPI cards top: en proceso, pendientes, atrasadas, mecánicos disponibles
- Grid de bahías con ocupación visual
- Tabla de mecánicos con load bar
- Lista de OS sin asignar (CTA "Asignar")
- Findings pendientes (badge en sidebar)

**`/manager/board` (AssignmentBoard):**
- Kanban-like con columnas por estado
- Drag card → modal de asignación
- Filtros sticky por prioridad/tipo

**`/manager/findings` (FindingsInbox):**
- Lista con preview de descripción + foto
- Modal de approve (convierte a línea) / reject (con motivo)

#### 1.3.6 — Hooks y polling

- `useMyTasks()` — query `/me/tasks` poll 30s mientras visible
- `useWorkOrder(id)` — query + mutations (transition, cancel)
- `useAssignment()` — mutations + invalidate keys correctos
- `usePoll(key, fetcher, opts)` — wrapper de `useQuery` con polling adaptativo

#### 1.3.7 — Offline-light

- Mutations con `onMutate` (optimistic) + `onError` (rollback + toast)
- Cola en localStorage: `pendingMutations[]` con `{id, endpoint, body, retries}`
- Hook `useOfflineQueue()` que escucha `online` event y replay con `Idempotency-Key`
- Indicator visual "N acciones pendientes" en header móvil

---

## Sprint 1.4 — Polish + QA (3 días)

### 1.4.1 — E2E Playwright (2 flujos)

**`tests/e2e/flows/mechanic-completes-task.spec.ts`:**
1. Login con usuario `mecanico_test`
2. Verifica home muestra task asignada
3. Click "Iniciar" → status cambia a in_progress, timer arranca
4. Espera 2s → click "Finalizar"
5. Confirma modal → status pasa a quality_check o completed
6. Verifica timeline en detalle muestra ambas transiciones

**`tests/e2e/flows/reception-creates-and-assigns.spec.ts`:**
1. Login `recepcion_test`
2. Crear OS appointment (form completo)
3. Verifica order_number generado + portal_token visible una vez
4. Switch user a `jefe_taller_test`
5. AssignmentBoard → asignar a mecánico junior un servicio master
6. Verifica error 409 con detalle visible
7. Asignar a mecánico master → success
8. Verifica OS pasó a `assigned`

### 1.4.2 — Sentry

- Backend: `pip install sentry-sdk[fastapi]`, init en `app/main.py` con DSN env var
- Frontend: `@sentry/react` con DSN env var
- Tags `branch_id`, `user_role`, `request_id`
- Test manual de captura en staging

### 1.4.3 — Docs y runbooks

- `docs/runbooks/cancel-stuck-work-order.md` — cómo cancelar OS atascada manualmente vía DB + audit
- `docs/runbooks/reassign-mechanic-manual.md` — escenarios de reasignación fuera del flujo normal
- `CHANGELOG.md` entry con resumen de Fase 1

### 1.4.4 — Performance check

- Seed script con 100 OS + 20 mecánicos + 5 sucursales
- Benchmark:
  - `GET /me/tasks` < 200ms con 50 OS activas del usuario
  - `GET /work-orders?status=in_progress` < 300ms con 100 OS
  - `POST /assignments` < 250ms
- Si pasa: tag de release `v1.4.0` (asumiendo numeración fase = minor)

---

## Done criteria Fase 1 (checklist final)

Antes de declarar Fase 1 cerrada, todos estos deben pasar:

- [ ] Migración `add_workshop_workflow_core` corre en CI contra SQLite Y Postgres (upgrade + downgrade)
- [ ] Backfill de status_history poblado correctamente (1 row por OS existente)
- [ ] Todos los endpoints documentados anteriormente devuelven el shape exacto del spec
- [ ] State machine `work_order_sm.py` tiene tests de TODAS las transiciones (positivas y negativas)
- [ ] `assignment_engine.py` tiene tests R8-R12 explícitos
- [ ] Permission matrix tiene test que valida correspondencia con endpoints (parsea OpenAPI)
- [ ] Multi-tenancy: test específico por cada tabla nueva (status_history, assignments, mechanic_profiles, findings)
- [ ] Coverage backend: `app/services/state_machines/` ≥ 95%, `app/services/assignment_engine.py` ≥ 95%, `app/routers/*` nuevos ≥ 80%
- [ ] Coverage frontend: `src/lib/permissions.ts` ≥ 90%, hooks ≥ 80%, componentes ui ≥ 80%
- [ ] E2E `mechanic-completes-task` pasa en Chromium headless
- [ ] E2E `reception-creates-and-assigns` pasa en Chromium headless
- [ ] Vista mecánico testeada manualmente en pantalla 360×640 (iPhone SE) — usable, máx 3 acciones visibles
- [ ] Sentry capturando errores 5xx en staging (test de smoke con error intencional)
- [ ] Performance: `GET /me/tasks` < 200ms con 50 OS
- [ ] OpenAPI snapshot a `docs/openapi/v1.4.0.json` committed
- [ ] CHANGELOG entry escrito
- [ ] Demo end-to-end realizada con 4 roles (recepcion → jefe → mecanico → recepcion) en ≤ 5 min
- [ ] User-testing con al menos 1 mecánico real, feedback documentado, ajustes aplicados o backloggeados
- [ ] Runbooks 1.4.3 escritos
- [ ] PR mergeado a `develop` y validado en entorno dev
- [ ] PR `develop → main` aprobado y mergeado, Railway auto-deploy verificado

---

## Tests obligatorios — lista completa

### Unit (`tests/unit/`)

**state_machines/test_work_order_sm.py:**
- `test_each_valid_transition_passes` (parametrized)
- `test_invalid_transition_returns_allowed_targets`
- `test_terminal_state_blocks_all`
- `test_cancel_requires_reason`
- `test_qa_pass_requires_quality_check_origin`
- `test_qa_fail_back_to_in_progress_requires_reason`
- `test_assigned_to_in_progress_requires_active_assignment`
- `test_assigned_to_in_progress_fails_without_active_assignment`
- `test_status_history_entry_created_with_correct_fields`
- `test_status_history_metadata_serialized_as_json`
- `test_timestamps_set_on_first_in_progress`
- `test_timestamps_not_overwritten_on_second_in_progress`
- `test_event_published_with_correct_payload`
- `test_actor_permission_checked`

**engines/test_assignment_engine.py:**
- Los 13 tests listados en §1.1.4

**permissions/test_permission_matrix.py:**
- `test_every_permission_has_at_least_one_role`
- `test_no_branch_role_for_global_permissions`
- `test_require_permission_returns_403_with_correct_code`
- `test_viewer_has_only_read_permissions`
- `test_admin_has_all_permissions`
- `test_matrix_aligns_with_openapi_dependencies` (slow, runs in contract job)

**utils/test_idempotency.py:**
- 5 tests listados en §1.1.7

**events/test_event_bus.py:**
- 4 tests listados en §1.1.5

### Integration (`tests/integration/`)

Por cada endpoint, mínimo 6 tests. Listado por archivo:

**test_work_orders_v1.py** — 30+ tests:
- POST happy path por cada `type`
- POST validation errors (appointment sin scheduled_at, tow sin tow_provider, plates duplicadas)
- POST genera portal_token only once
- GET con filtros amplios
- PATCH /status: cada transición válida + 3 inválidas
- PATCH /status: 403 sin permiso, 409 transición inválida, 422 to_status faltante
- GET /status-history shape + duración calculada
- POST /cancel con/sin reason
- DELETE soft + restrict a admin
- Multi-tenant: branch_b no ve OS de branch_a

**test_assignments.py** — 15+ tests:
- POST happy path con level pass
- POST 409 level insufficient con detail
- POST override con reason + permiso → pass
- POST cross-branch blocked
- POST reasignación pausa línea in_progress
- POST unique active enforced en DB
- POST auto-transition received → assigned
- POST con `Idempotency-Key`: cached vs reuse
- PATCH /release devuelve mecánico
- Reassign endpoint atómico (release + new)
- Multi-tenant aislamiento

**test_me_tasks.py** — 10+ tests:
- GET /tasks solo del usuario actual (no de otros)
- GET /tasks con Assignment activa, no por `assigned_mechanic_id` solo
- GET /tasks con parts_needed correcto
- GET /tasks con available_actions ≤ 3 por línea
- GET /tasks/today filtra por scheduled_at o received_at
- POST /findings crea finding con status=pending
- POST /findings con suggested_service_id válido
- POST /findings sin permiso de no-mecánico → 403
- GET /me/profile retorna skills + workload

**test_findings.py** — 10+ tests:
- GET /findings filtros por status, work_order_id
- POST /findings/{id}/approve crea WorkOrderLine + cambia status + emite evento
- POST /findings/{id}/reject con reason
- approve/reject sin permiso → 403
- Multi-tenant

**test_mechanics.py** — 12+ tests:
- GET con filtros (available, skill, min_level)
- GET workload calcula correctamente
- POST crea profile + skills
- PATCH nivel solo permitido a gerente/admin
- PATCH skills permitido a jefe
- DELETE skill
- Multi-tenant

**test_multitenancy_v1.py** — extender el existente:
- assignments isolated per branch
- status_history isolated
- mechanic_profiles isolated
- findings isolated
- idempotency_keys isolated by user (no por branch, pero validar leak)

### E2E (`tests/e2e/`)

2 flujos en Fase 1 (los otros 3 vienen en fases siguientes):
- `mechanic-completes-task.spec.ts`
- `reception-creates-and-assigns.spec.ts`

### Migration tests

- `tests/migrations/test_add_workshop_workflow_core.py`:
  - `test_upgrade_creates_all_tables_and_columns`
  - `test_downgrade_reverts_cleanly`
  - `test_backfill_status_history_per_existing_wo`
  - `test_status_enum_converted_to_varchar`
  - `test_unique_partial_index_for_active_assignment`

---

## Riesgos específicos Fase 1 y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-----------|
| Conversión status enum → varchar rompe queries existentes | media | alto | Tests integración del CRUD existente en CI sobre rama de migración; backfill probado con dataset real en staging |
| Backfill de status_history sobre OS sucias (sin received_at) | media | medio | Script con `--dry-run` reporta discrepancias antes de aplicar; fallback `created_at` si `received_at IS NULL` |
| Unique partial index no soportado igual en SQLite vs Postgres | media | medio | Test específico que cubre ambos; usar `sqlite_where` y `postgresql_where` en migration |
| Vista mecánico mal recibida por usuarios reales | media | alto | User-testing pre-cierre Sprint 1.3 con 1 mecánico real; iterar 1 día en Sprint 1.4 si necesario |
| State machine se hace ingobernable | media | alto | Tests unit completos antes de escribir endpoints (TDD del SM); refactor solo via tabla TRANSITIONS, no código condicional |
| Idempotency key se vuelve dolor en clientes simples | baja | bajo | Key es OPCIONAL, no obligatoria; documentar en OpenAPI cuándo usarla |
| Mecánicos pierden tareas por bug de filtro `Assignment.active` | media | alto | Tests específicos del filtro; demo con 2 mecánicos distintos antes de cerrar |
| Performance degrada con ~50 OS por mecánico | baja | medio | Performance check final con seed real; índices en `assignments(mechanic_id, status)` ya planeados |

---

## Próximos pasos al cerrar Fase 1

1. Tag de release `v1.4.0` (o equivalente según versioning del equipo)
2. Validación en producción de las queries críticas (logs de Sentry + métricas)
3. Retrospectiva con stakeholders: qué funcionó, qué no, qué ajustar en Fase 2
4. **Escribir** `docs/superpowers/specs/2026-XX-XX-phase-2-inventory-operations.md` (JIT)
5. Invocar `superpowers:writing-plans` para Fase 2

Este spec **no se vuelve a abrir** después de cerrar Fase 1, excepto para correcciones inline. Aprendizajes que cambien la arquitectura → al master spec o al spec de Fase 2.
