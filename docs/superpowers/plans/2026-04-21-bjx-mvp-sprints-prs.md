# BJX MVP Sprint & PR Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el MVP operativo de BJX Motors sobre la base actual del repo, entregándolo por sprints y PRs pequeños que agreguen Operaciones, Almacén conectado y Calculadora integrada sin rehacer los módulos ya existentes.

**Architecture:** El repo ya corre sobre FastAPI + SQLAlchemy + React/Vite con módulos activos de catálogo, proveedores, cotizaciones, configuración y dashboard. El plan extiende esa arquitectura con nuevos dominios de trabajo (`vehicles`, `work_orders`, `inventory`, `operations`) y conecta esos datos con `quotes`, `dashboard` y `config`, manteniendo reglas de negocio puras en servicios y agregados expuestos por routers específicos.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Alembic, Pydantic v2, PostgreSQL/SQLite, React 18, TypeScript, Vite, TanStack Query, Recharts, ReportLab/OpenPyXL, Pytest.

---

## Contexto actual

- Backend existente:
  - `app/models/catalog.py`
  - `app/models/suppliers.py`
  - `app/models/quotes.py`
  - `app/models/config.py`
  - `app/models/users.py`
  - `app/routers/catalog.py`
  - `app/routers/suppliers.py`
  - `app/routers/quotes.py`
  - `app/routers/dashboard.py`
  - `app/routers/config.py`
  - `app/services/pricing_engine.py`
  - `app/services/supplier_engine.py`
- Frontend existente:
  - `frontend/src/pages/Dashboard.tsx`
  - `frontend/src/pages/Calculator.tsx`
  - `frontend/src/pages/Quotes.tsx`
  - `frontend/src/pages/Catalog.tsx`
  - `frontend/src/pages/Suppliers.tsx`
  - `frontend/src/pages/Config.tsx`
  - `frontend/src/pages/Admin.tsx`
  - `frontend/src/api/types.ts`
- Tests existentes:
  - `tests/test_dashboard.py`
  - `tests/test_quotes.py`
  - `tests/test_catalog.py`
  - `tests/test_suppliers.py`
  - `tests/test_config.py`
  - `tests/test_engine.py`
  - `tests/test_pricing_engine.py`

## Definición funcional del MVP a completar

- Operaciones:
  - órdenes de trabajo
  - vehículos y asignación de mecánicos
  - tiempos estándar vs tiempos reales
  - semáforo operativo y causas de demora
- Almacén:
  - inventario por SKU
  - mínimos, ideal, crítico y lead time por pieza
  - movimientos de inventario y consumo por orden
  - reportes de rotación, urgencia y rentabilidad
- Calculadora conectada:
  - cotización con proveedor, disponibilidad y tiempo de respuesta
  - rentabilidad y viabilidad operativa
  - exportables consistentes con costos y stock
- Capa transversal:
  - roles funcionales MVP
  - auditoría de cambios sensibles
  - dashboards ejecutivos y operativos

## Estrategia de entrega

- Rama base de trabajo: `develop`
- Ritmo recomendado: 2 PRs por semana si el PR es de alcance pequeño; 1 PR por semana si toca backend + frontend + migración
- Regla de tamaño: cada PR debe cerrar un slice verificable en menos de 500-800 líneas netas cuando sea posible
- Regla de secuencia:
  - primero migraciones/modelos
  - luego schemas/servicios
  - luego routers
  - luego frontend
  - luego reportes/exportables
- Regla de merge:
  - no mezclar más de un dominio nuevo por PR
  - todo PR debe incluir tests o ampliar tests existentes

## Mapa de archivos objetivo

### Backend nuevo

- Crear: `app/models/vehicles.py`
- Crear: `app/models/work_orders.py`
- Crear: `app/models/inventory.py`
- Crear: `app/models/audit.py`
- Crear: `app/schemas/vehicles.py`
- Crear: `app/schemas/work_orders.py`
- Crear: `app/schemas/inventory.py`
- Crear: `app/schemas/audit.py`
- Crear: `app/routers/vehicles.py`
- Crear: `app/routers/work_orders.py`
- Crear: `app/routers/inventory.py`
- Crear: `app/routers/operations_dashboard.py`
- Crear: `app/services/work_order_engine.py`
- Crear: `app/services/inventory_engine.py`
- Crear: `app/services/audit_service.py`
- Crear: `tests/test_vehicles.py`
- Crear: `tests/test_work_orders.py`
- Crear: `tests/test_inventory.py`
- Crear: `tests/test_operations_dashboard.py`
- Crear: `tests/test_audit.py`

### Backend existente a modificar

- Modificar: `app/models/__init__.py`
- Modificar: `app/routers/__init__.py`
- Modificar: `app/main.py`
- Modificar: `app/dependencies.py`
- Modificar: `app/models/catalog.py`
- Modificar: `app/models/quotes.py`
- Modificar: `app/models/users.py`
- Modificar: `app/schemas/dashboard.py`
- Modificar: `app/routers/dashboard.py`
- Modificar: `app/routers/quotes.py`
- Modificar: `app/services/pricing_engine.py`
- Modificar: `alembic/versions/b3e9e2389f20_initial_schema.py` solo como referencia; crear nueva migración incremental

### Frontend nuevo

- Crear: `frontend/src/pages/WorkOrders.tsx`
- Crear: `frontend/src/pages/Inventory.tsx`
- Crear: `frontend/src/pages/Operations.tsx`
- Crear: `frontend/src/components/work-orders/WorkOrderForm.tsx`
- Crear: `frontend/src/components/work-orders/WorkOrderTable.tsx`
- Crear: `frontend/src/components/inventory/InventoryTable.tsx`
- Crear: `frontend/src/components/inventory/StockBadge.tsx`
- Crear: `frontend/src/components/operations/OperationsKpis.tsx`
- Crear: `frontend/src/components/operations/MechanicRanking.tsx`

### Frontend existente a modificar

- Modificar: `frontend/src/App.tsx`
- Modificar: `frontend/src/components/Layout.tsx`
- Modificar: `frontend/src/components/Sidebar.tsx`
- Modificar: `frontend/src/api/index.ts`
- Modificar: `frontend/src/api/client.ts`
- Modificar: `frontend/src/api/types.ts`
- Modificar: `frontend/src/pages/Dashboard.tsx`
- Modificar: `frontend/src/pages/Calculator.tsx`
- Modificar: `frontend/src/pages/Quotes.tsx`
- Modificar: `frontend/src/pages/Admin.tsx`
- Modificar: `frontend/src/pages/Config.tsx`

## Sprint 0 — Base operativa y decisiones bloqueantes

**Objetivo:** dejar lista la base mínima para que los siguientes sprints no se frenen por datos, permisos o naming.

**Features:**
- mapa de entidades finales del MVP
- política temporal de roles funcionales
- backlog técnico ya dividido por PRs
- datos semilla mínimos para órdenes, inventario y tiempos estándar

**PRs:**

### PR-00.1 `docs: definir backlog ejecutable del MVP`
- Alcance:
  - consolidar este plan
  - documentar convenciones de branch naming, títulos de PR y checklist
  - documentar dependencias de negocio pendientes
- Archivos:
  - crear `docs/superpowers/plans/2026-04-21-bjx-mvp-sprints-prs.md`
  - opcional crear `docs/product/2026-04-21-bjx-mvp-backlog.md`
- Validación:
  - revisión manual del documento
  - confirmación de secuencia Sprint 1 → Sprint 4

### PR-00.2 `feat: preparar semillas mínimas para operaciones e inventario`
- Alcance:
  - ampliar `seeds/load_data.py` para soportar servicios estándar, proveedores base y stock inicial
  - no crear todavía el flujo operativo completo
- Archivos:
  - modificar `seeds/load_data.py`
  - crear nueva migración Alembic
  - crear `tests/test_seed_load.py` si se desea aislar el comportamiento
- Validación:
  - `pytest`
  - `DATABASE_URL=sqlite:///./bjx_dev.db python seeds/load_data.py`

**Salida del sprint:**
- backlog congelado
- nomenclatura funcional estable
- base lista para iniciar desarrollo incremental

## Sprint 1 — Operaciones núcleo

**Objetivo:** poder abrir una orden, asignar responsable y medir tiempo real contra tiempo estándar.

**Features:**
- vehículos
- catálogo de tiempos estándar
- órdenes de trabajo
- asignación de mecánico
- estatus operativos y timestamps
- semáforo operativo
- causa de demora

**PRs:**

### PR-01.1 `feat: modelo y API de vehículos`
- Alcance:
  - entidad `vehicles`
  - CRUD básico y búsqueda por placas/VIN/modelo
  - enlace con orden futura
- Archivos:
  - crear `app/models/vehicles.py`
  - crear `app/schemas/vehicles.py`
  - crear `app/routers/vehicles.py`
  - modificar `app/models/__init__.py`
  - modificar `app/main.py`
  - crear `tests/test_vehicles.py`
- Validación:
  - `pytest tests/test_vehicles.py -v`

### PR-01.2 `feat: estándares de servicio y tiempos operativos`
- Alcance:
  - extender `service_catalog` o crear soporte claro para `service_time_standards`
  - lectura por tipo de servicio y, si aplica, por vehículo
  - endpoint para consultar tiempo estándar
- Archivos:
  - modificar `app/models/catalog.py`
  - crear migración Alembic
  - modificar `app/schemas/catalog.py`
  - modificar `app/routers/catalog.py`
  - ampliar `tests/test_catalog.py`
- Validación:
  - `pytest tests/test_catalog.py -v`

### PR-01.3 `feat: work orders backend`
- Alcance:
  - entidad `work_orders`
  - timestamps `received_at`, `work_started_at`, `work_finished_at`, `closed_at`
  - mecánico responsable
  - cálculo de `time_real_minutes`
  - cálculo de semáforo operativo
- Archivos:
  - crear `app/models/work_orders.py`
  - crear `app/schemas/work_orders.py`
  - crear `app/services/work_order_engine.py`
  - crear `app/routers/work_orders.py`
  - modificar `app/models/users.py`
  - modificar `app/models/__init__.py`
  - modificar `app/main.py`
  - crear `tests/test_work_orders.py`
- Validación:
  - `pytest tests/test_work_orders.py -v`

### PR-01.4 `feat: work orders frontend`
- Alcance:
  - nueva vista `/work-orders`
  - tabla de órdenes
  - formulario de alta/edición
  - badges de estatus y semáforo
- Archivos:
  - crear `frontend/src/pages/WorkOrders.tsx`
  - crear `frontend/src/components/work-orders/WorkOrderForm.tsx`
  - crear `frontend/src/components/work-orders/WorkOrderTable.tsx`
  - modificar `frontend/src/App.tsx`
  - modificar `frontend/src/components/Sidebar.tsx`
  - modificar `frontend/src/api/index.ts`
  - modificar `frontend/src/api/types.ts`
- Validación:
  - `npm --prefix frontend run build`

**Salida del sprint:**
- BJX puede registrar una orden y medir desempeño por servicio

## Sprint 2 — Almacén operativo

**Objetivo:** convertir catálogo/proveedor en inventario real con stock, semáforos y movimientos.

**Features:**
- inventario por SKU
- stock actual, mínimo, ideal, crítico
- lead time por proveedor
- movimientos de inventario
- consumo por orden
- alertas de stock

**PRs:**

### PR-02.1 `feat: inventory item model and stock policy`
- Alcance:
  - entidad operacional de inventario separada de `service_catalog`
  - stock policy configurable por SKU
  - semáforo `green/yellow/red`
- Archivos:
  - crear `app/models/inventory.py`
  - crear `app/schemas/inventory.py`
  - crear `app/services/inventory_engine.py`
  - crear `app/routers/inventory.py`
  - modificar `app/models/suppliers.py`
  - modificar `app/models/__init__.py`
  - modificar `app/main.py`
  - crear `tests/test_inventory.py`
- Validación:
  - `pytest tests/test_inventory.py -v`

### PR-02.2 `feat: inventory movements and consumption by work order`
- Alcance:
  - entradas, salidas, ajustes y consumo
  - vínculo entre orden y piezas consumidas
  - descuentos de stock al cerrar o consumir
- Archivos:
  - modificar `app/models/inventory.py`
  - modificar `app/models/work_orders.py`
  - modificar `app/schemas/inventory.py`
  - modificar `app/routers/inventory.py`
  - modificar `app/routers/work_orders.py`
  - ampliar `tests/test_inventory.py`
  - ampliar `tests/test_work_orders.py`
- Validación:
  - `pytest tests/test_inventory.py tests/test_work_orders.py -v`

### PR-02.3 `feat: inventory frontend and stock alerts`
- Alcance:
  - vista `/inventory`
  - tabla filtrable de SKU
  - badges de semáforo y compras urgentes
  - detalle de movimientos
- Archivos:
  - crear `frontend/src/pages/Inventory.tsx`
  - crear `frontend/src/components/inventory/InventoryTable.tsx`
  - crear `frontend/src/components/inventory/StockBadge.tsx`
  - modificar `frontend/src/App.tsx`
  - modificar `frontend/src/components/Sidebar.tsx`
  - modificar `frontend/src/api/index.ts`
  - modificar `frontend/src/api/types.ts`
- Validación:
  - `npm --prefix frontend run build`

**Salida del sprint:**
- BJX puede detectar desabasto y registrar consumo real de piezas

## Sprint 3 — Calculadora conectada

**Objetivo:** cerrar el loop entre cotización, inventario, proveedor y viabilidad operativa.

**Features:**
- disponibilidad por pieza al cotizar
- lead time y proveedor alterno
- mano de obra + margen objetivo
- utilidad estimada
- aprobación y exportables consistentes

**PRs:**

### PR-03.1 `feat: enrich quote engine with availability and lead time`
- Alcance:
  - exponer disponibilidad real por SKU
  - incorporar lead time en resultado del engine o respuesta del cotizador
  - semáforo de viabilidad operativa
- Archivos:
  - modificar `app/services/pricing_engine.py`
  - modificar `app/services/supplier_engine.py`
  - modificar `app/schemas/engine.py`
  - modificar `app/schemas/quotes.py`
  - modificar `app/routers/engine.py`
  - modificar `app/routers/quotes.py`
  - ampliar `tests/test_engine.py`
  - ampliar `tests/test_pricing_engine.py`
  - ampliar `tests/test_quotes.py`
- Validación:
  - `pytest tests/test_engine.py tests/test_pricing_engine.py tests/test_quotes.py -v`

### PR-03.2 `feat: quote-to-work-order handoff`
- Alcance:
  - crear orden a partir de cotización aprobada
  - congelar valores clave de precio/tiempo/proveedor
  - preparar consumo de piezas
- Archivos:
  - modificar `app/models/quotes.py`
  - modificar `app/models/work_orders.py`
  - modificar `app/schemas/quotes.py`
  - modificar `app/schemas/work_orders.py`
  - modificar `app/routers/quotes.py`
  - modificar `app/routers/work_orders.py`
  - ampliar `tests/test_quotes.py`
  - ampliar `tests/test_work_orders.py`
- Validación:
  - `pytest tests/test_quotes.py tests/test_work_orders.py -v`

### PR-03.3 `feat: calculator and quotes frontend integration`
- Alcance:
  - mostrar disponibilidad, lead time y semáforo al cotizar
  - mostrar transición cotización → orden
  - mejorar vista de cotizaciones con estatus operativos
- Archivos:
  - modificar `frontend/src/pages/Calculator.tsx`
  - modificar `frontend/src/pages/Quotes.tsx`
  - modificar `frontend/src/api/index.ts`
  - modificar `frontend/src/api/types.ts`
- Validación:
  - `npm --prefix frontend run build`

**Salida del sprint:**
- ventas puede cotizar con datos reales de costo, stock y tiempo de respuesta

## Sprint 4 — Dashboards operativos, rankings y KPIs

**Objetivo:** consolidar la visibilidad gerencial y de taller pedida por el PDF.

**Features:**
- ventas vs cuota
- unidades atendidas
- tiempos promedio
- backlog
- top mecánicos
- top rotación
- stock crítico
- cotizaciones aprobadas y conversión

**PRs:**

### PR-04.1 `feat: operations dashboard backend`
- Alcance:
  - agregados de órdenes, tiempos y rankings
  - filtros por periodo, responsable y sucursal futura
- Archivos:
  - crear `app/routers/operations_dashboard.py`
  - modificar `app/schemas/dashboard.py`
  - modificar `app/routers/dashboard.py`
  - crear `tests/test_operations_dashboard.py`
  - ampliar `tests/test_dashboard.py`
- Validación:
  - `pytest tests/test_dashboard.py tests/test_operations_dashboard.py -v`

### PR-04.2 `feat: operations and inventory dashboards frontend`
- Alcance:
  - nueva vista `/operations`
  - KPIs operativos
  - ranking de mecánicos
  - alertas de stock y compras urgentes
- Archivos:
  - crear `frontend/src/pages/Operations.tsx`
  - crear `frontend/src/components/operations/OperationsKpis.tsx`
  - crear `frontend/src/components/operations/MechanicRanking.tsx`
  - modificar `frontend/src/pages/Dashboard.tsx`
  - modificar `frontend/src/App.tsx`
  - modificar `frontend/src/components/Sidebar.tsx`
  - modificar `frontend/src/api/index.ts`
  - modificar `frontend/src/api/types.ts`
- Validación:
  - `npm --prefix frontend run build`

### PR-04.3 `feat: top reports and exportables`
- Alcance:
  - top 10 mecánicos
  - top 50 rotación
  - top 50 baja rotación
  - top rentabilidad por pieza
  - exportables PDF/XLSX
- Archivos:
  - modificar `app/routers/dashboard.py`
  - modificar `app/routers/quotes.py`
  - crear utilidades de export si faltan en `app/utils/`
  - ampliar `tests/test_dashboard.py`
  - ampliar `tests/test_quotes.py`
- Validación:
  - `pytest tests/test_dashboard.py tests/test_quotes.py -v`

**Salida del sprint:**
- gerencia y jefe de taller tienen visibilidad operativa en una sola plataforma

## Sprint 5 — Roles, auditoría y endurecimiento de salida

**Objetivo:** cerrar el MVP con control de cambios, permisos finos y seguridad operativa mínima.

**Features:**
- mapa de roles funcionales BJX
- auditoría de descuentos, cierres, cambios de costo y stock
- permisos de edición por módulo
- estabilización de UX y QA final

**PRs:**

### PR-05.1 `feat: functional role mapping for BJX`
- Alcance:
  - mapear `admin`, `operador`, `viewer` a perfiles operativos reales o ampliar catálogo de roles
  - endurecer permisos de endpoints sensibles
- Archivos:
  - modificar `app/models/users.py`
  - modificar `app/dependencies.py`
  - modificar `app/security/__init__.py`
  - modificar routers sensibles
  - ampliar `tests/test_auth.py`
  - ampliar `tests/test_users.py` si se crea
- Validación:
  - `pytest tests/test_auth.py -v`

### PR-05.2 `feat: audit trail for sensitive changes`
- Alcance:
  - registrar cambios de costo, stock, descuentos y cierres
  - usuario, timestamp, acción y payload mínimo
- Archivos:
  - crear `app/models/audit.py`
  - crear `app/schemas/audit.py`
  - crear `app/services/audit_service.py`
  - modificar `app/routers/config.py`
  - modificar `app/routers/quotes.py`
  - modificar `app/routers/inventory.py`
  - modificar `app/routers/work_orders.py`
  - crear `tests/test_audit.py`
- Validación:
  - `pytest tests/test_audit.py -v`

### PR-05.3 `chore: final QA and release hardening`
- Alcance:
  - smoke tests de flujos clave
  - ajustes de UX
  - revisión de seeds y migraciones
  - documentación operativa mínima
- Archivos:
  - modificar tests relevantes
  - modificar `README.md`
  - crear `docs/release/bjx-mvp-qa.md`
- Validación:
  - `pytest`
  - `npm --prefix frontend run build`

**Salida del sprint:**
- MVP listo para prueba interna y demo con BJX

## Dependencias de negocio que hay que cerrar antes de Sprint 3

- matriz de tiempos estándar por servicio
- catálogo inicial de piezas críticas con stock mínimo/ideal/crítico
- lead times y proveedor principal/alterno por pieza
- costo hora taller y margen objetivo oficial
- reglas de descuento y quién autoriza
- definición de cuotas comerciales si se habilita `ventas vs cuota`

## Definición de Done por PR

- migración incluida si cambia modelo
- tests del dominio incluidos o ampliados
- endpoints documentados en OpenAPI de forma coherente
- frontend compila
- no rompe `quotes`, `catalog`, `suppliers` ni `dashboard` actual
- si introduce semáforos, la regla queda centralizada en servicio y no duplicada entre router y UI

## Riesgos a controlar

- mezclar catálogo de servicios con inventario físico en una sola entidad y generar deuda de datos
- acoplar lógica de semáforos en frontend y backend con reglas divergentes
- hacer un PR demasiado grande mezclando migración, dashboard y UI
- ampliar roles sin alinear `get_current_user` y dependencias de autorización
- cerrar Sprint 4 sin auditoría mínima para descuentos y cambios de stock

## Recomendación de orden real de ejecución

1. Sprint 1 completo
2. Sprint 2 PR-02.1 y PR-02.2
3. Sprint 3 PR-03.1
4. Sprint 2 PR-02.3
5. Sprint 3 PR-03.2 y PR-03.3
6. Sprint 4 completo
7. Sprint 5 completo

## Self-review del plan

- Cobertura del spec:
  - Operaciones: cubierto en Sprint 1
  - Almacén: cubierto en Sprint 2
  - Calculadora conectada: cubierto en Sprint 3
  - KPIs y reportes: cubierto en Sprint 4
  - Roles y auditoría: cubierto en Sprint 5
- Gaps detectados:
  - no se incluyó integración CFDI/Odoo porque el PDF la deja fuera del MVP
  - no se incluyó telemetría ni IA por la misma razón
- Consistencia:
  - el plan separa `inventory` de `catalog` para evitar mezclar catálogo de costos con existencias
  - el plan mantiene `quotes` como módulo base y agrega `work_orders` como flujo posterior

