# Roles y Usuarios — BJX Atlas Platform

Documento de referencia del sistema de roles, alcance y permisos en BJX-Atlas-Api.

**Última actualización:** 2026-05-18 (Fase 1 — Workshop Workflow + Asignación + Vista Mecánico)

---

## Vista general

La plataforma usa un sistema **multi-tenant** con:

- **Organización** → contiene 1 o más **Sucursales (Branches)**
- **Usuarios** pueden tener alcance **GLOBAL** (ven todas las sucursales) o **BRANCH** (limitados a su sucursal)
- **Permisos** son declarativos vía `PERMISSION_MATRIX` (espejo backend ↔ frontend)
- **Scope automático** via `branch_scoped_query()` — imposible olvidar el filtro

```
Organization (BJX Motors)
├── Branch: León Centro
├── Branch: Querétaro Norte
├── Branch: ...
└── Branch: CDMX Periférico
```

---

## Catálogo completo de roles

| Rol | Alcance | Aria | Home natural (UI) |
|---|---|---|---|
| `admin` | GLOBAL | Plataforma | `/admin` |
| `director` | GLOBAL | Decisión multi-sucursal | `/executive` |
| `gerente_sede` | BRANCH | Operación de una sucursal | `/gerente` |
| `jefe_taller` | BRANCH | Piso del taller | `/manager` |
| `recepcion` | BRANCH | Front-desk | `/advisor` |
| `mecanico` | BRANCH | Ejecución técnica | `/mechanic` |
| `almacen` | BRANCH | Inventario y refacciones | `/warehouse` |
| `cliente_corp` | GLOBAL | Cliente corporativo (futuro) | `/dashboard` |
| `operador` | BRANCH | Multi-función legacy | `/advisor` |
| `viewer` | GLOBAL | Solo lectura (auditores) | `/dashboard` |

Constantes en código:
```python
# app/models/users.py
BRANCH_SCOPED_ROLES = {Role.gerente_sede, Role.jefe_taller, Role.recepcion,
                       Role.mecanico, Role.almacen, Role.operador}
GLOBAL_ROLES = {Role.admin, Role.director, Role.viewer, Role.cliente_corp}
```

---

## Detalle por rol

### 1. `admin` — Administrador de plataforma

**Alcance:** GLOBAL (cualquier sucursal mediante `X-Branch-Id`)

**Para qué existe:** Operar la plataforma completa. Crear/desactivar usuarios, ajustar configuración global, ejecutar acciones de override con motivo, troubleshooting.

**Puede:**
- Todo lo que cualquier otro rol puede hacer
- Crear/editar/borrar usuarios y asignar roles
- Override de cualquier regla de negocio con `reason` obligatorio
- Borrar (soft-delete) órdenes de trabajo (único rol que puede DELETE)
- Configurar parámetros del sistema (`config_params`)
- Acceso a runbooks y endpoints administrativos (`/admin/*`)

**No debe:** Usar la cuenta admin para operación diaria. Sólo para administración real.

**Ejemplos de tareas:**
- Onboarding de un nuevo gerente: crear usuario, asignar role=gerente_sede, asignar default_branch_id
- Recuperar OS atascada vía runbook `cancel-stuck-work-order.md`
- Rotar `SECRET_KEY` cada 6 meses

---

### 2. `director` — Director

**Alcance:** GLOBAL (todas las sucursales)

**Para qué existe:** Tomar decisiones que cruzan sucursales. Ver el panorama global de la operación.

**Puede:**
- Ver dashboards ejecutivos multi-sucursal (`/dashboard/executive`)
- Comparar performance entre sucursales (cycle time, margen, on-time delivery)
- Leer cualquier OS, asignación, refacción de cualquier sucursal
- Aprobar/rechazar service proposals globales (Fase 3)
- Recibir alertas de SLA en riesgo y bottlenecks

**No puede:**
- Gestionar usuarios (eso es `admin`)
- Tocar configuración técnica
- Crear/editar OS directamente (no es operativo)

**Ejemplos de tareas:**
- Reunión mensual con accionistas: revisar `avg_cycle_minutes` por sucursal
- Detectar que León Centro tiene 30% más OS críticas que Querétaro → escalar a gerente_sede
- Aprobar propuestas de servicios nuevos que afectan política de pricing

---

### 3. `gerente_sede` — Gerente de Sucursal

**Alcance:** BRANCH (su sucursal asignada vía `default_branch_id`)

**Para qué existe:** Dirigir la operación de una sucursal. Aprobar excepciones, configurar bahías y almacenes, supervisar KPIs de su sede.

**Puede:**
- Ver y editar dashboards de su sucursal (`/gerente`)
- Aprobar service proposals que el jefe_taller proponga (Fase 3, US-07)
- Cancelar OS con motivo (cualquier estado salvo terminal)
- Override de validación de nivel en asignaciones (cuando jefe_taller necesita escalar)
- Configurar bahías de servicio (ServiceBay), almacenes (Warehouse)
- Cambiar el nivel de los mecánicos (`MECHANIC_LEVEL_WRITE`) — único junto con admin
- Aprobar/rechazar findings (hallazgos del mecánico)
- Ver reportes financieros de su sede (margen, cycle time, ocupación)

**No puede:**
- Ver datos de otras sucursales (cross-branch bloqueado)
- Operar como mecánico (transicionar líneas que no le pertenecen)
- Eliminar usuarios o cambiar roles

**Ejemplos de tareas:**
- Aprobar proposal del jefe para añadir "Reemplazo bomba de agua eléctrica" al catálogo
- Promover a un mecánico de junior → intermedio tras evaluación
- Revisar end-of-day el dashboard `/gerente` con métricas del día

---

### 4. `jefe_taller` — Jefe de Mecánicos

**Alcance:** BRANCH

**Para qué existe:** Coordinar el piso del taller. Asignar trabajos, supervisar progreso, garantizar calidad, gestionar excepciones técnicas.

**Puede:**
- Asignar mecánicos a OS/líneas con validación de nivel (`POST /api/v1/assignments`)
- Activar `override_level_check=True` cuando es necesario por carga operativa (requiere reason)
- Reasignar mecánicos (release + new, atómico)
- Liberar asignaciones (`assignment:release`)
- Aprobar/rechazar findings (hallazgos del mecánico)
- Proponer servicios nuevos al catálogo (Fase 3, US-07)
- Hacer QA pass/fail al pasar OS por `quality_check`
- Cancelar OS con motivo
- Ver dashboard de piso (`/manager` y `/manager/board`)
- Configurar skills de mecánicos
- Ajuste manual de inventario (solo con reason)

**No puede:**
- Cambiar el nivel (junior/intermedio/master) de los mecánicos
- Aprobar service proposals (eso es gerente_sede)
- Crear/editar bahías o almacenes
- Picking/deliver de refacciones (eso es almacén)

**Ejemplos de tareas:**
- Mañana del lunes: revisar `/manager` y asignar 12 OS pendientes a los 5 mecánicos disponibles
- Cuando llega una OS urgente y solo hay junior → activar override con reason "Sin masters disponibles, juniora con supervisión"
- Aprobar hallazgo "Disco delantero también gastado" → se crea WorkOrderLine adicional
- Proponer nuevo servicio "Cambio bomba combustible diesel" que aparece en el inventario de varios talleres

---

### 5. `recepcion` — Recepcionista / Asesor de Servicio

**Alcance:** BRANCH

**Para qué existe:** Front-desk del taller. Crear órdenes de servicio, comunicarse con clientes, entregar unidades terminadas.

**Puede:**
- Crear OS (`POST /api/v1/work-orders`) con todos los tipos: appointment, walk_in, tow, standby, warranty, internal
- Editar metadatos de la OS (notes, priority, mileage) mientras no esté terminal
- Transicionar `received → assigned` (cuando jefe ya asignó)
- Transicionar `completed → delivered` (entregar al cliente)
- Cancelar OS con motivo (solo en estados no críticos; jefe_taller para cancelar avanzadas)
- Ver dashboard del asesor (`/advisor`) con unidades del día
- Acceder al status-history de cualquier OS de su sucursal
- Consultar cualquier mecánico y carga de trabajo (`MECHANIC_PROFILE_READ`)

**No puede:**
- Asignar mecánicos (eso es jefe_taller)
- Transicionar líneas individuales (`work_order_lines`) — solo el mecánico asignado
- Hacer QA pass/fail
- Borrar registros

**Ejemplos de tareas:**
- Cliente llega con cita: crear OS `type=appointment`, asignar `scheduled_at`, anotar mileage de entrada
- Cliente llega sin cita: crear OS `type=walk_in` y notificar al jefe_taller
- Llega grúa: crear OS `type=tow` con `tow_provider`
- OS terminada → llamar al cliente → cliente recoge → `POST /v1/work-orders/{id}/cancel` ah no, → `POST .../status {to_status: delivered}`

---

### 6. `mecanico` — Mecánico

**Alcance:** BRANCH (solo OS donde tiene `Assignment.active`)

**Para qué existe:** Ejecutar las reparaciones. Vista móvil optimizada con máx 3 acciones primarias.

**Puede:**
- Ver SUS tareas asignadas (`GET /api/v1/me/tasks`) — filtrado automático por `Assignment.active`
- Transicionar líneas de OS asignadas:
  - `pending → in_progress` (iniciar)
  - `in_progress ↔ paused` (pausar/reanudar)
  - `in_progress → waiting_parts` (esperando refacción, con motivo)
  - `in_progress → quality_check` o `completed`
- Solicitar refacciones (`POST /v1/work-orders/{id}/parts`)
- Reportar hallazgos adicionales (`POST /v1/me/tasks/{line_id}/findings`)
- Subir evidencias (fotos/videos) a R2 storage
- Ver SU perfil (`/mechanic/profile`) con skills y métricas mes
- Marcar refacciones recibidas como "used" tras consumir

**No puede:**
- Ver OS no asignadas a él
- Cambiar su propio nivel
- Asignar a otros mecánicos
- Hacer QA pass/fail (esa es revisión del jefe)
- Ver costos o margins (info interna de pricing)
- Acceder a otras sucursales

**Nivel del mecánico (US-03):**

| Nivel | Orden | Puede ejecutar servicios marcados como... |
|---|---|---|
| `junior` | 1 | required_level=junior |
| `intermedio` | 2 | junior, intermedio |
| `master` | 3 | junior, intermedio, master |

Servicios `master` requeridos a un junior → 409 `ASSIGNMENT_LEVEL_INSUFFICIENT` salvo override del jefe con reason.

**Skills (catálogo):** frenos, motor, transmision, suspension, electrico, diagnostico, hojalateria, afinacion, diesel, otros — con proficiency 1-5 y flag `certified`.

**Carga (load_status):**
- `green` < 60% de capacidad diaria (típicamente 8h)
- `yellow` 60-89% — atender con prudencia
- `red` ≥ 90% — no asignar más sin override

**Ejemplos de tareas:**
- Llegada turno 8am: abre `/mechanic` en su móvil, ve 3 OS asignadas
- Toca primera card → ▶ Iniciar → timer arranca
- Mientras trabaja detecta que disco también está gastado → ✎ Reportar hallazgo "Disco gastado, recomiendo cambio"
- Falta líquido frenos → 📦 Pedir refacción → solicitud va a almacén
- Termina balatas → ✓ Finalizar → pasa a quality_check (o completed si QA desactivado)

---

### 7. `almacen` — Almacenista

**Alcance:** BRANCH (solo OS con `inventory_requests` abiertos)

**Para qué existe:** Gestionar el inventario físico. Procesar solicitudes de refacciones, recibir compras, mantener stock saludable.

**Puede:**
- Ver dashboard `/warehouse` con stock-board (semáforo verde/amarillo/rojo — Fase 2)
- Aprobar/rechazar `inventory_requests` del mecánico
- Picking (reservar stock para una solicitud aprobada)
- Deliver (entregar físicamente al mecánico)
- Use (consumir stock tras `delivered`)
- Return (liberar reserva si no se usó)
- Recibir compras y aplicar `inbound` movements (Fase 4 — `procurement.purchase-orders/{id}/receive`)
- Hacer ajustes de inventario con motivo (cuenta física, descarte, etc.)
- Transferir stock entre almacenes de su sucursal
- Crear partes en el catálogo global (Part)
- Ver historial de movimientos (append-only)

**No puede:**
- Crear OS o asignar mecánicos
- Aprobar findings o service proposals
- Configurar nuevos almacenes (eso es gerente_sede)

**Reglas críticas:**
- R14: Aprobar request NO descuenta stock — solo `pick` lo reserva
- R15: `pick` falla 409 si `available - reserved < quantity`
- R16: `use` solo se permite tras `delivered`
- R19: Stock nunca puede quedar negativo

**Ejemplos de tareas:**
- Mecánico solicita "Balata delantera Aveo × 1" → recibe notif → revisa stock disponible → `POST .../approve`
- Marca picking del almacén → `POST .../pick` (reserva 1 unidad)
- Le entrega físicamente al mecánico → `POST .../deliver`
- Llega compra de Brame con 50 balatas → `inbound` movement con `unit_cost` actualizado → `last_unit_cost` se refresca
- Cuenta física mensual → ajuste con motivo "Conteo Q2 2026 — discrepancia de 2 unidades"

---

### 8. `cliente_corp` — Cliente Corporativo (futuro)

**Alcance:** GLOBAL (filtrado por `customer_id` propio)

**Para qué existe:** Empresas con flotas (e.g., Brame mismo, empresas de logística) que quieren ver el status de sus vehículos sin entrar al portal público.

**Puede (planeado Fase 4):**
- Ver únicamente OS de vehículos de su organización (`customer_id` propio)
- Ver progreso y status sin datos sensibles
- Recibir reportes mensuales
- Solicitar nuevas órdenes a futuro (Fase 4+)

**No puede:**
- Ver OS de otros clientes
- Ver costos internos, márgenes, mecánico asignado, evidencias
- Transicionar estados — esto lo hace BJX, no el cliente

**Estado actual:** Definido en enum pero sin endpoints específicos todavía. Usa `/dashboard` legacy genérico.

---

### 9. `operador` — Operador legacy (deprecado en Fase 3)

**Alcance:** BRANCH

**Para qué existe:** Rol multifunción heredado de versión MVP que usaba un solo usuario para todo (recepción + jefe + admin). Sigue funcionando como puente durante transición.

**Puede:** Casi lo mismo que `recepcion` + algunos endpoints internos de Sprint 0.

**Cuándo usarlo:** Solo para usuarios existentes pre-Fase 3. NO crear nuevos usuarios con role=operador.

**Migración:** En Fase 3 evaluamos por usuario si se reclasifica a `recepcion`, `jefe_taller` o `gerente_sede`.

---

### 10. `viewer` — Solo lectura cross-branch

**Alcance:** GLOBAL

**Para qué existe:** Auditores externos, accionistas, observadores sin necesidad operativa.

**Puede:**
- Leer **todo** en modo solo lectura desde cualquier sucursal
- Acceder a dashboards, listados, historiales, reportes
- Ver auditoría (`audit_log` vía `/audit`)

**No puede:**
- Crear, editar o borrar nada
- Asignar mecánicos
- Transicionar estados
- Configurar parámetros

**Ejemplos de tareas:**
- Auditor externo revisa cumplimiento ISO 9001 mensualmente
- Inversor ve dashboard ejecutivo trimestralmente

---

## Matriz de permisos (resumen Fase 1)

Permisos están en `app/security/permissions.py` con `PERMISSION_MATRIX: dict[Permission, set[Role]]`.

| Permiso | admin | director | gerente_sede | jefe_taller | recepcion | mecanico | almacen | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `work_order:create` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `work_order:transition` | ✅ | ❌ | ✅ | ✅ | ✅ | ✅* | ✅** | ❌ |
| `work_order:cancel` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `work_order:delete` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `work_order:qa_pass` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `work_order:deliver` | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `assignment:create` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `assignment:override_level` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `mechanic:profile:write` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `mechanic:level:write` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `finding:report` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `finding:approve` | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `me:tasks:read` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |

*\* mecanico transiciona solo OS donde tiene `Assignment.active` (validado por SM)*
*\*\* almacen transiciona `waiting_parts → in_progress` cuando entrega refacción*

Matriz completa: ver `app/security/permissions.py:PERMISSION_MATRIX`.

---

## Workflows típicos por rol

### Flujo de una OS de inicio a fin

```
1. recepcion crea OS                              → status=received
2. jefe_taller asigna mecánico (valida nivel)     → status=assigned
3. mecanico inicia trabajo                        → status=in_progress
   - Si falta refacción: → waiting_parts
   - almacen entrega refacción → in_progress
   - mecanico reporta hallazgos → jefe_taller aprueba/rechaza
4. mecanico finaliza → QA opcional               → quality_check
   - jefe_taller hace QA pass                    → completed
   - jefe_taller hace QA fail                    → in_progress (retorno)
5. recepcion entrega al cliente                  → delivered ✓
```

Cualquier paso → `cancelled` con `reason` obligatorio (jefe_taller, gerente_sede o admin).

### Asignación con override de nivel

```
jefe_taller: POST /api/v1/assignments
  {
    work_order_id, mechanic_id (junior),
    override_level_check: true,
    reason: "Sin masters disponibles. Junior bajo supervisión."
  }

→ Sistema valida que actor tenga ASSIGNMENT_OVERRIDE (✅ jefe_taller)
→ Sistema requiere reason no vacío
→ Crea Assignment con override_level_check=true (auditable)
→ Emite MechanicAssigned event con level_check_result="override"
```

### Vista mecánico (mobile-first, US-04)

```
GET /api/v1/me/tasks  (auth: mecanico)

Response shape optimizado para móvil:
- mechanic: { level, current_load_hrs, load_status (green/yellow/red) }
- items[]: 
  - work_order { id, order_number, type, priority, vehicle }
  - line { id, service_name, required_level, std_duration_hrs, status, bay }
  - timer { started_at, elapsed_min, remaining_min, semaphore }
  - parts_needed { total, available, blocking }
  - available_actions[]  ← máx 3 según status de la línea
- summary: { pending: N, in_progress: N, paused: N, waiting_parts: N }
```

Acciones primarias por estado:

| Status línea | Acción 1 | Acción 2 | Overflow (⋮) |
|---|---|---|---|
| `pending` | ▶ Iniciar | 📦 Pedir refacción | foto, hallazgo |
| `in_progress` | ⏸ Pausar | ✓ Finalizar | refacción, hallazgo |
| `paused` | ▶ Reanudar | ✓ Finalizar | … |
| `waiting_parts` | (deshabilitado) | Ver detalle | … |

---

## Reglas de scope y aislamiento

### Multi-tenancy estricto

- Roles BRANCH no pueden leer/escribir datos de otra sucursal
- Intento de `X-Branch-Id` distinto al propio → 403 `FORBIDDEN_BRANCH_SCOPE`
- `branch_scoped_query()` aplica filtro automático: imposible olvidar

### Filtros adicionales por rol (scoping.py)

- `mecanico`: solo OS con `Assignment.active` propia (no ve trabajo de colegas)
- `almacen`: solo OS con `inventory_requests` abiertos (no ve OS sin necesidad de refacción)
- `cliente_corp` (futuro): solo OS de vehículos cuyo `customer_id` pertenece al usuario

### Audit obligatorio para overrides

Toda operación con `override_*` se loggea en `audit_log` y queda con `reason` explícito en la fila correspondiente:
- `assignments.override_level_check` + `assignments.reason`
- `work_order_status_history.reason` para cancelaciones
- `audit_log.action` con tipo `assignment_override`, `transition_override`, etc.

**Política:** revisar mensualmente reportes con `override_*=true` por sucursal. Tasa > 10% indica un problema sistémico (faltan mecánicos del nivel correcto, mala planeación de citas, etc.).

---

## Onboarding de usuarios nuevos

### Cómo crear un usuario

Hoy (Fase 1): solo `admin` puede crear usuarios. Endpoint `/auth/register` requiere JWT de admin.

```bash
POST /api/auth/register
Authorization: Bearer <admin_jwt>

{
  "email": "juan.perez@bjx.mx",
  "password": "TempPassword123",
  "role": "mecanico",
  "default_branch_id": "uuid-de-leon-centro"
}
```

Tras crear el usuario `mecanico`, crear su `MechanicProfile`:

```bash
POST /api/v1/mechanics
Authorization: Bearer <jefe_jwt_or_gerente>

{
  "user_id": "uuid-del-usuario-recien-creado",
  "level": "intermedio",
  "employee_number": "BJX-MEC-042",
  "capacity_hrs_day": 8.0,
  "hourly_cost": 180.00
}
```

Añadir skills:

```bash
POST /api/v1/mechanics/{user_id}/skills
{"category": "frenos", "proficiency": 5, "certified": true}

POST /api/v1/mechanics/{user_id}/skills
{"category": "suspension", "proficiency": 3, "certified": false}
```

### Checklist de onboarding por rol

#### Mecánico
- [ ] User creado con role=mecanico + default_branch_id
- [ ] MechanicProfile creado (nivel, capacidad, hourly_cost)
- [ ] Mínimo 2 skills añadidos
- [ ] Usuario instala app web en su móvil
- [ ] Demo: hace login → ve `/mechanic` → asignar 1 OS de prueba

#### Recepcionista
- [ ] User creado con role=recepcion + default_branch_id
- [ ] Capacitación en `/advisor` y creación de OS
- [ ] Familiarizado con los 6 tipos de OS (cita/grúa/stand-by/walk_in/garantía/interno)

#### Jefe de taller
- [ ] User creado con role=jefe_taller + default_branch_id
- [ ] Tour de `/manager/board` (asignación)
- [ ] Capacitación en cuándo usar override_level_check
- [ ] Política de aprobación de findings

#### Gerente de sede
- [ ] User creado con role=gerente_sede + default_branch_id
- [ ] Aprende a aprobar service_proposals (Fase 3)
- [ ] Sabe cancelar OS atascadas
- [ ] Recibe acceso a runbooks (`docs/runbooks/`)

---

## Decisiones operativas comunes

### "¿Quién asigna a quién?"

- **Operativo normal:** `jefe_taller` asigna mecánicos a OS (validación automática de nivel)
- **Backup:** `gerente_sede` puede asignar si jefe está ausente
- **Emergencia:** `admin` con override + reason explícito

### "Mecánico A no está disponible. ¿Cómo lo reemplazo?"

```bash
POST /api/v1/work-orders/{wo_id}/reassign
{
  "mechanic_id": "uuid-de-mecanico-b",
  "reason": "Mecanico A reportó incapacidad médica"
}
```

Sistema atómicamente:
1. Marca Assignment previa como `reassigned` con `released_at=now`
2. Si la línea estaba `in_progress`, la pausa con reason="reassignment"
3. Crea nueva Assignment activa
4. Valida nivel del nuevo mecánico (o requiere override)
5. Emite evento

### "Mecánico reporta que la unidad necesita más trabajo del esperado"

```bash
POST /api/v1/me/tasks/{line_id}/findings
{
  "description": "Discos delanteros muy gastados, recomiendo cambio. Bombín trasero gotea.",
  "suggested_service_id": "uuid-del-servicio-cambio-discos",
  "estimated_extra_hrs": 1.5
}
```

→ Se notifica al jefe_taller (in-app, Fase 3: email también)
→ Jefe revisa y `POST /findings/{id}/approve` → crea nueva línea automáticamente
→ El nuevo trabajo se agrega a la OS sin perder la línea original

### "Cliente reclama datos del status sin tener login"

(Fase 4) Cliente recibe URL con `portal_token` en SMS al crear la OS:

```
https://atlas.bjx.mx/portal/abc123XYZ...

GET /api/public/v1/units/{portal_token}

→ Status, milestones, % progreso, vehículo (placas enmascaradas), branch info
→ NUNCA expone: mecánico, costos, márgenes, evidencias internas, notes internas
```

---

## Referencias en código

| Tema | Archivo |
|---|---|
| Definición enum `Role` | `app/models/users.py` |
| Sets BRANCH_SCOPED / GLOBAL | `app/models/users.py` |
| Permission matrix declarativa | `app/security/permissions.py` |
| TenantContext + branch_scoped_query | `app/security/tenant.py` |
| State machine de OS | `app/services/state_machines/work_order_sm.py` |
| Engine de asignación | `app/services/assignment_engine.py` |
| Endpoint mecánico | `app/routers/me.py` |
| Modelos de mecánico | `app/models/mechanic_profiles.py` |
| Spec maestro | `docs/superpowers/specs/2026-05-18-bjx-workshop-platform-master.md` |

---

## Cambios futuros previstos

| Fase | Cambio | Roles afectados |
|---|---|---|
| Fase 2 | Mecánico pide refacciones desde vista móvil con check de disponibilidad | mecanico, almacen |
| Fase 3 | Workflow propose → approve para servicios nuevos | jefe_taller, gerente_sede |
| Fase 3 | Dashboards específicos por rol con KPIs cacheados | todos |
| Fase 3 | Notificaciones por email + in-app drawer | todos |
| Fase 4 | Portal cliente público sin auth | clientes finales |
| Fase 4 | Compras (PurchaseOrder) con flujo draft→submitted→approved→received | almacen, gerente_sede |
| Fase 4 | Onboarding tour por rol en primer login | todos |
| Fase 4 | `operador` deprecado y migrado | operador (eliminado) |
| Futuro | `cliente_corp` con dashboard de flotas | cliente_corp |

---

**Mantenedor:** Equipo BJX-Atlas. Si añades un rol nuevo o modificas permisos: actualizar este documento + `app/security/permissions.py` + matriz en espejo `frontend/src/lib/permissions.ts`.
