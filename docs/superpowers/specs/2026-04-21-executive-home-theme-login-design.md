# BJX Executive Home, Theme System, and Premium Login Design

**Goal**

Definir una nueva experiencia frontend `light-first` para BJX Atlas que introduzca una `Home ejecutiva de bienvenida`, un sistema global de tema claro/oscuro, y un `login` moderno con animaciones, sin romper los módulos existentes ni su navegación.

**Context**

- El frontend actual en `frontend/src/` está construido sobre React + React Router + Zustand + React Query.
- La UI actual es `dark-first`, con tokens globales en [frontend/src/index.css](/home/atlas-tech/Devs/BJX-Atlas-Api/frontend/src/index.css) y una dirección visual fuertemente violeta.
- La navegación autenticada entra hoy a `/dashboard` desde [frontend/src/pages/Login.tsx](/home/atlas-tech/Devs/BJX-Atlas-Api/frontend/src/pages/Login.tsx) y el shell principal vive en [frontend/src/components/Layout.tsx](/home/atlas-tech/Devs/BJX-Atlas-Api/frontend/src/components/Layout.tsx) y [frontend/src/components/Sidebar.tsx](/home/atlas-tech/Devs/BJX-Atlas-Api/frontend/src/components/Sidebar.tsx).
- Los usuarios disponibles hoy solo se distinguen por `email`, `role`, `active`; no existe todavía una categoría backend separada para ejecutivos.
- El PDF `context/BJX Software.pdf` marca una dirección visual clara: panel principal claro, shell oscuro controlado, acento cálido/ámbar, composición premium corporativa y look editorial automotriz.

## Product Direction

La plataforma debe dejar de sentirse como una consola táctica oscura y pasar a una `suite corporativa premium` pensada para usuarios C-level. Eso implica:

- primera impresión ejecutiva y no operativa
- lectura rápida de estado del negocio
- capas visuales más sobrias y cálidas
- menos protagonismo de la navegación funcional
- continuidad con los módulos actuales sin esconderlos por completo

La experiencia post-login ya no debe aterrizar en el dashboard operativo actual. Debe aterrizar en una `Home ejecutiva de bienvenida` que funcione como portada del producto.

## Scope

### In Scope

- nuevo landing autenticado `/home`
- redirección post-login a `/home`
- sistema global de tema `light-first` con toggle a oscuro
- persistencia local de la preferencia de tema
- rediseño del shell principal (`Layout`, `Sidebar`, mobile header)
- rediseño visual del login con animaciones y composición premium
- adaptación de templates existentes al nuevo sistema de tokens
- copy y tratamiento visual para usuarios ejecutivos existentes

### Out of Scope

- nuevas categorías de usuario en backend
- segmentación de experiencia por rol a nivel de negocio
- nuevos endpoints obligatorios para analytics ejecutivos
- reescritura completa de páginas funcionales
- animaciones complejas tipo storytelling o motion-heavy

## Users and Access Assumptions

Los usuarios disponibles hoy se tratarán como `usuarios ejecutivos` a nivel de experiencia. No se agregará una nueva columna ni un nuevo enum de backend en esta fase.

Usuarios semilla actuales:

- `jorge@bjx.com`
- `rene@bjx.com`
- `carlos@bjx.com`

La experiencia visual premium será la default para todos los usuarios autenticados en esta fase. La futura segmentación entre ejecutivos y usuarios operativos queda como evolución posterior.

## Experience Architecture

### Authenticated Flow

1. Usuario abre `/login`
2. Inicia sesión
3. La app guarda token y usuario como hoy
4. Redirige a `/home`
5. Desde `/home` puede navegar a módulos tácticos

### Routing Changes

- `/login` se conserva
- `/home` se agrega como nueva ruta autenticada principal
- `/` autenticado debe redirigir a `/home`
- el wildcard autenticado debe preferir `/home` en lugar de `/dashboard`
- `/dashboard` se mantiene como página táctica existente

## Visual System

### Theme Strategy

La aplicación pasa a `light-first`.

- tema default: `light`
- tema alterno: `dark`
- persistencia: `localStorage`
- sin dependencia inicial de preferencia del sistema operativo

### Palette Direction

Se abandona el violeta como color rector del producto.

Nueva guía:

- fondos claros cálidos: marfil, blanco humo, arena fría
- textos: carbón, grafito, gris tinta
- acento primario: ámbar/dorado premium
- acentos secundarios: verde sobrio para estados positivos, rojo controlado para alertas, azul grisáceo para información
- sidebar: carbón profundo o navy oscuro, no morado

### Visual Language

- contraste entre `shell` oscuro y `contenido` claro
- superficies tipo papel premium, no tarjetas genéricas de SaaS
- bordes suaves, sombras largas y sobrias
- grandes espacios en blanco
- microdetalles cálidos inspirados en automotriz premium
- fondos con capas, gradientes y texturas sutiles; evitar fondo plano único

## Home Executiva

### Purpose

`/home` debe responder en menos de 10 segundos a esta pregunta:

> “¿Cómo está el negocio hoy y qué merece mi atención?”

### Information Architecture

La Home ejecutiva tendrá cinco bloques:

1. `Hero de bienvenida`
- saludo por usuario
- subtítulo tipo “Centro ejecutivo BJX Motors”
- fecha o contexto corto
- acción principal y acción secundaria

2. `KPI rail`
- cotizaciones activas o recientes
- margen promedio
- órdenes abiertas
- alertas críticas

3. `Executive brief`
- resumen corto de ventas, margen, operación e inventario
- enfoque editorial, no tabla pesada

4. `Alertas prioritarias`
- stock crítico
- órdenes atrasadas
- riesgo de margen
- temas que requieren intervención

5. `Access layer`
- accesos destacados a módulos existentes
- calculadora, cotizaciones, catálogo, proveedores, dashboard
- presentados como herramientas secundarias, no núcleo visual

### Data Strategy

La primera versión no debe bloquearse por falta de endpoints nuevos.

Orden recomendado:

- reutilizar `dashboard/summary` y datos ya existentes
- usar placeholders estructurados donde no haya backend suficiente
- diseñar componentes preparados para swapping de datos reales después

### Tone

La Home no debe sentirse como una “landing de marketing” ni como una “tabla operativa”.

Debe sentirse como:

- portada ejecutiva
- brief diario
- panel de lectura rápida

## Login Redesign

### Goals

- elevar la primera impresión del producto
- alinear el acceso con la dirección premium del PDF
- mantener el flujo simple y rápido

### Layout

Se propone una composición de dos zonas:

- zona izquierda o superior: branding, claim ejecutivo, textura/fondo premium
- zona derecha o central: formulario, estados, CTA, hints discretos

### Motion

Animaciones permitidas:

- entrada del panel con `fade + translate`
- glow ambiental lento
- shift sutil en capas del fondo
- focus states suaves en inputs
- loading state de submit con transición refinada

Animaciones no deseadas:

- bouncing
- spring exagerado
- motion distractor
- secuencias largas

### Credentials Disclosure

Como el entorno sigue en MVP con usuarios de prueba, el login puede incluir un bloque discreto con accesos demo ejecutivos. Debe verse controlado y temporal, no como parte permanente del producto.

## Shell and Navigation

### Sidebar

La navegación debe bajar de agresividad visual.

- menos peso de iconografía brillante
- agrupación por prioridad
- `Home ejecutiva` como primera entrada
- módulos operativos más abajo
- footer de usuario más limpio
- toggle de tema visible pero sobrio

### Mobile

La experiencia móvil debe conservar:

- acceso al menú
- cambio de tema
- header compacto con identidad visible
- lectura clara de la Home ejecutiva

## Technical Design

### State

Se agregará un store o slice pequeño de tema, preferiblemente en `frontend/src/store/theme.ts`, con:

- `theme: 'light' | 'dark'`
- `setTheme`
- `toggleTheme`
- persistencia

### DOM Integration

El tema se aplicará mediante atributos globales en `document.documentElement`, por ejemplo:

- `data-theme="light"`
- `data-theme="dark"`

Esto permite migrar el CSS actual a tokens semánticos sin depender de clases utility fragmentadas.

### CSS Strategy

`frontend/src/index.css` debe migrar de un bloque `dark-first` a un sistema semántico:

- tokens base neutrales
- variables por tema
- variables de shell
- variables de estado
- variables de motion

Evitar:

- colores hardcodeados repetidos en páginas
- overrides masivos tipo “cambiar toda clase azul a violeta”

### Component Strategy

No conviene hacer una reescritura total de páginas. Conviene:

- introducir primitives de shell y theme
- rehacer `Login`, `Layout`, `Sidebar`
- crear `pages/Home.tsx`
- ir adaptando páginas clave al nuevo token system

## File-Level Impact

Archivos seguros para modificar:

- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/store/auth.ts`

Archivos nuevos recomendados:

- `frontend/src/pages/Home.tsx`
- `frontend/src/store/theme.ts`
- `frontend/src/components/ThemeToggle.tsx`
- `frontend/src/components/home/*` para bloques ejecutivos si se necesita dividir

Archivos a revisar durante adaptación:

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Calculator.tsx`
- `frontend/src/pages/Quotes.tsx`
- `frontend/src/pages/Catalog.tsx`
- `frontend/src/pages/Suppliers.tsx`
- `frontend/src/pages/Config.tsx`
- `frontend/src/pages/Admin.tsx`

## Error Handling and UX Constraints

- si falla `login`, el tratamiento visual debe seguir siendo premium y claro
- el tema no debe producir flashes severos al hidratar
- las páginas existentes no deben quedar ilegibles en light mode durante la transición
- el shell debe seguir funcionando sin datos nuevos de backend

## Testing Strategy

### Manual

- login en light y dark
- redirect post-login a `/home`
- persistencia de tema tras refresh
- navegación desktop y mobile
- contraste visual y legibilidad en páginas existentes

### Automated

En esta fase conviene agregar al menos tests de componentes o smoke tests para:

- redirect autenticado
- persistencia del store de tema
- render básico de la Home
- toggle de tema

Si el repo aún no tiene harness fuerte de tests frontend, se puede dejar esta parte en smoke tests manuales para el primer PR y endurecerla después.

## Delivery Strategy

La implementación debe dividirse en PRs pequeños:

1. infraestructura de tema global
2. shell premium
3. home ejecutiva
4. login premium con animaciones
5. adaptación del resto de templates

Esto reduce riesgo visual y hace más fácil revisar regresiones.

## Success Criteria

Se considera exitoso cuando:

- el login ya no parece una tarjeta oscura genérica
- la app entra por `/home` y no por `/dashboard`
- el tema claro es el default y se puede cambiar a oscuro
- las páginas existentes funcionan con ambos temas
- la experiencia general se percibe como `suite corporativa premium`

## Risks

- muchas páginas actuales dependen visualmente de tokens oscuros y colores hardcodeados
- migrar todo en un solo PR generaría ruido y regresiones
- si la Home ejecutiva intenta depender de nuevos endpoints desde el inicio, se bloquea el frontend

## Recommendation

Implementar primero shell + theming y luego la Home. Eso permite que el nuevo lenguaje visual se distribuya correctamente antes de rediseñar el punto de entrada y el login.
