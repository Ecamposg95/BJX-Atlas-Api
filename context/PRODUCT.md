# BJX Atlas — Producto (Master)

> **Documento maestro**. Antes de tocar código, leer este archivo + `STACK.md`.
> Actualizado: 2026-05-19 (Wave 6 cierre — todas las olas completas)

---

## 1. Vision en una pagina

**BJX Atlas** es el ERP multi-sucursal de BJX Motors × Brame (Synet Group): plataforma operativa para 10 talleres automotrices, deadline MVP beta **2026-05-18**.

Origen: reemplazar una calculadora Excel de cotizaciones y costos por una plataforma web completa. Hoy ya cubre el ciclo entero de una orden de servicio (recepcion → mecanico → almacen → QA → entrega) con multi-tenancy estricto por sucursal.

**Pilares**:

1. **Operacion del taller**: ordenes de servicio (OS), asignacion, ejecucion mobile-first del mecanico, almacen con semaforo de stock.
2. **Cotizacion y margenes**: motor de calculo config-driven (precio sugerido vs Brame, gap, margen).
3. **Multi-sucursal**: 10 sedes (Leon Centro, Queretaro Norte, ..., CDMX Periferico) con scope automatico via `branch_scoped_query()`.
4. **Roles diferenciados**: 10 roles, cada uno con vista propia y home redirigido por rol.
5. **Auditabilidad**: precios inmutables, overrides con `reason`, audit log append-only.

**Branding**: BJX Motors yellow `#FBBF24` + navy `#1E293B` + racing red `#DC2626`. Premium racing aesthetic en login + home ejecutiva. Mobile-first para roles operativos.

---

## 2. Catalogo de roles (10)

Sistema multi-tenant: **Organization → Branch**. Usuarios con scope GLOBAL (ven todas las sedes) o BRANCH (limitados a `default_branch_id`).

| Rol | Alcance | Home | Para que existe |
|---|---|---|---|
| `admin` | GLOBAL | `/admin` | Operar la plataforma. Crear usuarios, override de reglas con `reason`, runbooks. |
| `director` | GLOBAL | `/executive` | Decision multi-sucursal. Dashboards comparativos, aprobacion de proposals globales. |
| `gerente_sede` | BRANCH | `/manager` | Dirigir una sucursal. Aprobar excepciones, configurar bahias/almacenes, cambiar nivel de mecanicos. |
| `jefe_taller` | BRANCH | `/workshop` | Coordinar piso de taller. Asignar mecanicos (con override de nivel), QA pass/fail, aprobar findings. |
| `recepcion` | BRANCH | `/advisor` | Front-desk. Crear OS (6 tipos), transicionar received → assigned, deliver. |
| `mecanico` | BRANCH | `/mechanic` | Ejecutar reparaciones. Vista movil con max 3 acciones primarias. Solo ve sus `Assignment.active`. |
| `almacen` | BRANCH | `/warehouse` | Inventario fisico. Aprobar/picking/deliver, recibir compras, stock-board con semaforo. |
| `cliente_corp` | GLOBAL* | `/client-corp` | Cliente corporativo (futuro). Ve solo OS de su `customer_id`. |
| `operador` | BRANCH | `/quotes` | Multifuncion legacy de Sprint 0. Deprecado en Fase 3. |
| `viewer` | GLOBAL | `/dashboard` | Solo lectura cross-branch. Auditores externos, accionistas. |

*\* cliente_corp es GLOBAL pero filtrado por `customer_id` propio.*

Sets en codigo (`app/models/users.py`):
```python
BRANCH_SCOPED_ROLES = {gerente_sede, jefe_taller, recepcion, mecanico, almacen, operador}
GLOBAL_ROLES = {admin, director, viewer, cliente_corp}
```

### Permisos clave (resumen)

Matriz declarativa en `app/security/permissions.py:PERMISSION_MATRIX` (espejo frontend en `frontend/src/lib/permissions.ts`).

| Permiso | admin | director | gerente_sede | jefe_taller | recepcion | mecanico | almacen | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `work_order:create` | si | si | si | si | si | no | no | no |
| `work_order:transition` | si | no | si | si | si | si* | si** | no |
| `work_order:cancel` | si | no | si | si | no | no | no | no |
| `work_order:delete` | si | no | no | no | no | no | no | no |
| `work_order:qa_pass` | si | no | si | si | no | no | no | no |
| `work_order:deliver` | si | no | si | no | si | no | no | no |
| `assignment:create` | si | no | si | si | no | no | no | no |
| `assignment:override_level` | si | no | si | si | no | no | no | no |
| `mechanic:level:write` | si | no | si | no | no | no | no | no |
| `finding:report` | si | no | no | no | no | si | no | no |
| `finding:approve` | si | no | si | si | no | no | no | no |
| `me:tasks:read` | si | no | no | no | no | si | no | no |

*\* mecanico transiciona solo lineas de OS donde tiene `Assignment.active`.*
*\*\* almacen transiciona `waiting_parts → in_progress` al entregar refaccion.*

### Nivel del mecanico

| Nivel | Orden | Ejecuta servicios marcados como... |
|---|---|---|
| `junior` | 1 | required_level=junior |
| `intermedio` | 2 | junior, intermedio |
| `master` | 3 | junior, intermedio, master |

Asignar master a junior → `409 ASSIGNMENT_LEVEL_INSUFFICIENT` salvo `override_level_check=True` con `reason` (auditado).

Skills: `frenos`, `motor`, `transmision`, `suspension`, `electrico`, `diagnostico`, `hojalateria`, `afinacion`, `diesel`, `otros` (proficiency 1-5 + `certified`).

Load status del mecanico:
- `green` < 60% capacidad diaria
- `yellow` 60-89%
- `red` ≥ 90% (no asignar mas sin override)

---

## 3. Modulos y estado

### Fase 1 (DONE) — Workshop Workflow

- Multi-tenancy estricto (`branch_scoped_query`, `TenantContext`, `X-Branch-Id`)
- 10 roles + permission matrix
- Work orders (6 tipos: appointment/walk_in/tow/standby/warranty/internal) con state machine
- Asignaciones con validacion de nivel + override
- Vista movil mecanico (`/me/tasks`) con max 3 acciones primarias
- Findings (hallazgos): mecanico reporta → jefe aprueba → nueva linea
- Inventario: requests con flujo approve → pick → deliver → use/return
- Audit log append-only

### Ola 2 — Foundation ✅

- **Context cleanup**: este documento + `STACK.md`
- **Design system tokens** (`frontend/src/design-system/`)
- **UI restructure**: redirects por rol (`/home` → role-home), reorganizacion de Sidebar
- Seeder enriquecido para las 10 sucursales

### Ola 3 — Workshop UX polish ✅

- ✅ Stock-board con semaforo verde/amarillo/rojo (almacen) — `/warehouse/stock-board`
- ✅ Mecanico: solicitar refacciones con check de disponibilidad inline — `PartSearchModal`
- ✅ QA pass/fail UI — `/workshop/qa`

### Ola 4 — Manager + Director ✅

- ✅ `/manager`: dashboard de sucursal con KPIs cacheados (TTL 60s, cycle_time avg/p95, on_time_pct, top OS estancadas)
- ✅ `/executive`: BranchComparison multi-sucursal (cycle_time, on_time, margin ponderado por revenue, ranking 30/90 dias)
- ✅ Notificaciones in-app drawer (bell en topbar + endpoint `/v1/notifications`)
- ✅ Notificaciones WhatsApp (citas, entrega)
- ✅ Notificaciones email — SMTP via stdlib, modo dry-run sin SMTP_HOST, BackgroundTasks (FastAPI)
- ✅ Cableado de eventos reales: appointment_confirmed, wo_status_changed, qa_pending, delivery_ready, parts_request
- ✅ Margen real en `WorkOrderLine` + `WorkOrder` (columnas unit_price/unit_cost/total_*/margin_pct con `recompute_line_pricing` y `recompute_work_order_totals` invocados al create/update/finish/qa-pass)

### Ola 5 — Cliente corporativo + portal publico ✅

- ✅ `/client-corp`: dashboard de flota con scoping por `customer_id`, KPIs (unidades, en taller, listas, gasto del mes)
- ✅ Portal publico `/client/:folio` — etapas, lineas, galeria fotos check-in, ETA humanizado
- ✅ Service proposals: tabla independiente `service_proposals`, flujo jefe_taller propone → gerente_sede aprueba → materializa nueva `WorkOrderLine`

### Ola 6 — Compras ✅

- ✅ Procurement: `PurchaseOrder` + `PurchaseOrderItem`, state machine draft → submitted → approved → partially_received → received | cancelled, 9 endpoints `/v1/procurement/*`, UI `/procurement`
- ✅ `receive_po()` invoca `inventory_engine.apply_inbound()` por item → actualiza `Part.last_unit_cost` + crea `InventoryMovement` inbound
- ✅ Recepciones parciales con `quantity_received` acumulable por item
- ✅ Rotacion automatica de `SupplierPrice` cuando `unit_cost` recibido difiere >0.5% del vigente (`rotate_supplier_price` con tolerancia + idempotencia)
- ✅ Folio race-safe: tabla `folio_counters` + `next_folio()` con `SELECT FOR UPDATE` en Postgres / lock implicito en SQLite
- ✅ Link `PurchaseOrderItem.inventory_request_id` + endpoint `/procurement/inventory-requests/pending` + IR queda `purchased` al recibir
- ✅ Deprecacion `operador`: permission matrix limpia, routers migrados (quotes 3, workshop 7, vehicles 2), seed eliminado, migracion `c0d3p_0p` reasigna users existentes a `recepcion`
- ⚠ `Role.operador` se conserva como value del enum por compat de sesiones activas; no se asigna a nuevos usuarios

---

## 4. Reglas de negocio inmutables

Estas reglas son **invariantes**. Cualquier cambio requiere RFC explicito.

### Precios y cotizaciones

- **Precios inmutables**: nunca editar `supplier_prices`. Crear nuevo registro con `is_current=True` y desmarcar el anterior.
- **Config-driven**: el motor de calculo lee constantes desde `config_params` en BD (technician_cost_hr, target_margin, iva_rate, overhead_rate). Nunca hardcodear.
- **Data source transparente**: si falta dato en catalogo, usar estimado pero marcar `data_source="estimated"`.
- **Motor puro**: `services/pricing_engine.py` son funciones puras sin I/O ni efectos en BD.

### Margen y semaforo

```
duration_hrs        = catalogo BJX por modelo+servicio
labor_cost          = duration_hrs × technician_cost_hr
parts_cost          = BRAME_REF_ACTUAL (o BJX_REF si disponible)
total_bjx_cost      = labor_cost + parts_cost
margin_pesos        = brame_price - total_bjx_cost
margin_pct          = margin_pesos / brame_price
suggested_price     = total_bjx_cost / (1 - target_margin)
gap_vs_target       = brame_price - suggested_price

margin_status:
  ok       → margin_pct >= target_margin (default 40%)
  low      → margin_pct >= 0.30
  critical → margin_pct < 0.30
```

Defaults de configuracion:
- `technician_cost_hr = 156.25` MXN/hr
- `target_margin = 0.40`
- `iva_rate = 0.16`
- `overhead_rate = 0.15`
- `scoring_weights = price:0.50, time:0.30, tc:0.20`

### Multi-tenancy

- **Scope automatico**: `branch_scoped_query()` aplica filtro `WHERE branch_id = ?`. Imposible olvidar.
- Roles BRANCH no pueden leer/escribir datos de otra sucursal. Intento de `X-Branch-Id` distinto → `403 FORBIDDEN_BRANCH_SCOPE`.
- Filtros adicionales por rol (`scoping.py`):
  - `mecanico` → solo OS con `Assignment.active` propia
  - `almacen` → solo OS con `inventory_requests` abiertos
  - `cliente_corp` → solo OS de su `customer_id`

### Inventario

- R14: aprobar request **no** descuenta stock. Solo `pick` lo reserva.
- R15: `pick` falla 409 si `available - reserved < quantity`.
- R16: `use` solo se permite tras `delivered`.
- R19: stock nunca puede quedar negativo.

### Auditoria

- Toda operacion con `override_*` se loggea en `audit_log` con `reason` obligatorio.
- Cancelaciones de OS requieren `reason` en `work_order_status_history`.
- Politica: revisar mensualmente reportes con `override_*=true` por sucursal. Tasa > 10% indica problema sistemico.

### Seeds idempotentes

- Scripts de carga Excel pueden ejecutarse multiples veces sin duplicar (`upsert` por claves naturales como `model_name+service_name`).
- Filas con error: log con numero de fila y motivo, continua con las siguientes.
- `--dry-run` imprime resumen sin escribir.

---

## 5. Workflows tipicos

### Flujo de una OS de inicio a fin

```
1. recepcion crea OS                              → status=received
2. jefe_taller asigna mecanico (valida nivel)     → status=assigned
3. mecanico inicia trabajo                        → status=in_progress
   - Si falta refaccion: → waiting_parts
   - almacen entrega refaccion → in_progress
   - mecanico reporta hallazgos → jefe_taller aprueba/rechaza
4. mecanico finaliza → QA opcional               → quality_check
   - jefe_taller QA pass                         → completed
   - jefe_taller QA fail                         → in_progress (retorno)
5. recepcion entrega al cliente                  → delivered
```

Cualquier paso → `cancelled` con `reason` obligatorio (jefe_taller, gerente_sede o admin).

### Asignacion con override

```
jefe_taller: POST /api/v1/assignments
  {
    work_order_id, mechanic_id (junior),
    override_level_check: true,
    reason: "Sin masters disponibles. Junior bajo supervision."
  }

→ Valida ASSIGNMENT_OVERRIDE (jefe_taller si)
→ Requiere reason no vacio
→ Crea Assignment con override_level_check=true (auditable)
```

### Vista movil mecanico

```
GET /api/v1/me/tasks  (auth: mecanico)

Response shape:
- mechanic: { level, current_load_hrs, load_status }
- items[]:
  - work_order { id, order_number, type, priority, vehicle }
  - line { id, service_name, required_level, std_duration_hrs, status, bay }
  - timer { started_at, elapsed_min, remaining_min, semaphore }
  - parts_needed { total, available, blocking }
  - available_actions[]  ← max 3 segun status
- summary: { pending, in_progress, paused, waiting_parts }
```

Acciones primarias por estado:

| Status linea | Accion 1 | Accion 2 | Overflow |
|---|---|---|---|
| `pending` | Iniciar | Pedir refaccion | foto, hallazgo |
| `in_progress` | Pausar | Finalizar | refaccion, hallazgo |
| `paused` | Reanudar | Finalizar | ... |
| `waiting_parts` | (disabled) | Ver detalle | ... |

### Reasignacion atomica

```
POST /api/v1/work-orders/{wo_id}/reassign
{ "mechanic_id": "...", "reason": "Mecanico A reporto incapacidad" }
```

Sistema:
1. Marca Assignment previa como `reassigned` con `released_at=now`
2. Si linea estaba `in_progress`, la pausa con reason="reassignment"
3. Crea nueva Assignment activa
4. Valida nivel (o requiere override)
5. Emite evento

---

## 6. Onboarding de usuarios

Solo `admin` crea usuarios (Fase 1). Endpoint `/auth/register` requiere JWT de admin.

```bash
POST /api/auth/register
Authorization: Bearer <admin_jwt>
{
  "email": "juan.perez@bjx.mx",
  "password": "TempPassword123",
  "role": "mecanico",
  "default_branch_id": "<uuid>"
}
```

Para `mecanico` ademas crear `MechanicProfile`:

```bash
POST /api/v1/mechanics
{ "user_id": "...", "level": "intermedio", "employee_number": "BJX-MEC-042",
  "capacity_hrs_day": 8.0, "hourly_cost": 180.00 }
```

Y skills:
```bash
POST /api/v1/mechanics/{user_id}/skills
{"category": "frenos", "proficiency": 5, "certified": true}
```

---

## 7. Referencias en codigo

| Tema | Archivo |
|---|---|
| Enum `Role` + sets | `app/models/users.py` |
| Permission matrix | `app/security/permissions.py` |
| TenantContext + scoping | `app/security/tenant.py` |
| State machine OS | `app/services/state_machines/work_order_sm.py` |
| Engine de asignacion | `app/services/assignment_engine.py` |
| Pricing engine (puro) | `app/services/pricing_engine.py` |
| Endpoint mecanico | `app/routers/me.py` |
| Spec maestro | `docs/superpowers/specs/2026-05-18-bjx-workshop-platform-master.md` |
| Tokens UI | `frontend/src/design-system/tokens.ts` |
| Permission mirror UI | `frontend/src/lib/permissions.ts` |

---

## 8. Stack & comandos

Ver `STACK.md` para el detalle. Resumen rapido:

- Backend: FastAPI 0.127 + SQLAlchemy 2.0 + PostgreSQL (prod) / SQLite (dev) + JWT HS256
- Frontend: React 19 + Vite + TypeScript + Tailwind v4 + React Query + RHF + Zod
- Deploy: Railway auto-deploy desde `main`. Trabajo en `develop`.

```bash
# Backend
DATABASE_URL=sqlite:///./bjx_dev.db alembic upgrade head
DATABASE_URL=sqlite:///./bjx_dev.db python seeds/load_data.py
DATABASE_URL=sqlite:///./bjx_dev.db uvicorn app.main:app --reload
pytest

# Frontend
cd frontend && npm install && npm run dev
npm run build
```

---

## 9. Mantenedor

Equipo BJX-Atlas. Si añades un rol nuevo, modificas permisos, o cambias una regla inmutable:
1. Actualizar este documento.
2. Actualizar `app/security/permissions.py`.
3. Actualizar espejo `frontend/src/lib/permissions.ts`.
4. Anotar el cambio en `docs/superpowers/specs/`.
