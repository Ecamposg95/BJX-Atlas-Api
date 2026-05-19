# Executive Home, Theme System, and Premium Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la experiencia frontend autenticada hacia una suite corporativa premium con `Home ejecutiva`, `light mode` por defecto, `dark mode` opcional, y `login` moderno con animaciones.

**Architecture:** La implementación se divide en capas: primero infraestructura global de tema, luego shell y navegación, después la nueva Home ejecutiva, y por último login y migración visual del resto de templates. Se evita reescribir páginas funcionales desde cero y se prioriza introducir primitives reutilizables.

**Tech Stack:** React, TypeScript, React Router, Zustand, Tailwind utility classes existentes, CSS variables globales.

---

## File Map

**Create**
- `frontend/src/store/theme.ts` — estado persistente del tema
- `frontend/src/components/ThemeToggle.tsx` — toggle reusable para shell y login
- `frontend/src/pages/Home.tsx` — nueva home ejecutiva
- `frontend/src/components/home/ExecutiveHero.tsx` — bloque de bienvenida
- `frontend/src/components/home/KpiRail.tsx` — bloque de KPIs principales
- `frontend/src/components/home/ExecutiveBrief.tsx` — resumen ejecutivo
- `frontend/src/components/home/PriorityAlerts.tsx` — alertas prioritarias
- `frontend/src/components/home/ExecutiveAccess.tsx` — accesos secundarios

**Modify**
- `frontend/src/App.tsx` — nuevas rutas y redirecciones
- `frontend/src/main.tsx` — montaje del inicializador de tema
- `frontend/src/index.css` — tokens semánticos y temas light/dark
- `frontend/src/components/Layout.tsx` — shell premium
- `frontend/src/components/Sidebar.tsx` — navegación C-level
- `frontend/src/pages/Login.tsx` — login premium
- `frontend/src/store/auth.ts` — helpers de display si se necesitan
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Calculator.tsx`
- `frontend/src/pages/Quotes.tsx`
- `frontend/src/pages/Catalog.tsx`
- `frontend/src/pages/Suppliers.tsx`
- `frontend/src/pages/Config.tsx`
- `frontend/src/pages/Admin.tsx`

**Optional Test Files**
- `frontend/src/store/theme.test.ts`
- `frontend/src/pages/Home.test.tsx`
- `frontend/src/pages/Login.test.tsx`

---

### PR-UX-01: Theme Infrastructure

**Files**
- Create: `frontend/src/store/theme.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Create the persistent theme store**

Implement a small persisted Zustand store with `light` default.

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
    }),
    { name: 'bjx-theme' }
  )
)
```

- [ ] **Step 2: Mount the theme on document root**

Add a small initializer in `main.tsx` or a top-level effect in `App.tsx` that sets `document.documentElement.dataset.theme`.

Run: `sed -n '1,80p' frontend/src/main.tsx`
Expected: file imports app root and CSS only

- [ ] **Step 3: Replace dark-first tokens with semantic theme tokens**

Refactor `frontend/src/index.css` into:

- base semantic tokens
- `[data-theme='light']`
- `[data-theme='dark']`

Target tokens:

```css
:root {
  --radius-xl: 24px;
  --ease-premium: cubic-bezier(.22,1,.36,1);
}

html[data-theme='light'] {
  --bg: #f5f1e8;
  --surface: #fffdf8;
  --surface-2: #f3ede1;
  --surface-3: #ece3d4;
  --text: #1f2933;
  --text-muted: #5b6672;
  --text-faint: #8d96a0;
  --border: rgba(36, 30, 18, 0.08);
  --accent: #c79a3b;
  --accent-strong: #a57a23;
  --shell-bg: #121722;
  --shell-surface: #171d29;
}

html[data-theme='dark'] {
  --bg: #0c1117;
  --surface: #121a24;
  --surface-2: #18212d;
  --surface-3: #1d2734;
  --text: #eef2f6;
  --text-muted: #a6b0ba;
  --text-faint: #68717c;
  --border: rgba(255, 255, 255, 0.08);
  --accent: #d8ab4d;
  --accent-strong: #f0c66d;
  --shell-bg: #0b1017;
  --shell-surface: #111826;
}
```

- [ ] **Step 4: Verify no hard dependency on `color-scheme: dark` remains**

Run: `rg -n "color-scheme|primary-light|primary-dark|sb-active-text" frontend/src/index.css`
Expected: remaining matches are intentional or removed as part of token migration

- [ ] **Step 5: Verify the frontend still builds**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store/theme.ts frontend/src/main.tsx frontend/src/index.css
git commit -m "feat: add global theme system"
```

---

### PR-UX-02: Premium Shell and Navigation

**Files**
- Create: `frontend/src/components/ThemeToggle.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add a reusable theme toggle component**

Implement a compact control that reads and writes the theme store.

```tsx
export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()
  return (
    <button onClick={toggleTheme} aria-label="Cambiar tema">
      {theme === 'light' ? 'Oscuro' : 'Claro'}
    </button>
  )
}
```

- [ ] **Step 2: Reorder authenticated routing around `/home`**

Update `App.tsx`:

- add route `/home`
- redirect authenticated index to `/home`
- redirect unknown route to `/home`

Run: `sed -n '1,120p' frontend/src/App.tsx`
Expected: authenticated index currently redirects to `/dashboard`

- [ ] **Step 3: Redesign `Layout` as executive shell**

Update layout to:

- use premium header on mobile
- expose `ThemeToggle`
- keep sidebar and outlet
- reduce tactical density

Implementation target:

```tsx
<div className="app-shell">
  <Sidebar ... />
  <div className="app-frame">
    <header className="mobile-frame-header">
      <ThemeToggle />
    </header>
    <main className="app-content">
      <Outlet />
    </main>
  </div>
</div>
```

- [ ] **Step 4: Rebuild sidebar information hierarchy**

New order:

- `Home ejecutiva`
- `Dashboard`
- `Cotizaciones`
- `Calculadora`
- `Catálogo`
- `Proveedores`
- admin entries below separator

Also:

- soften role pill treatment
- improve brand block
- keep logout

- [ ] **Step 5: Verify navigation paths and auth guard**

Run: `cd frontend && npm run build`
Expected: build succeeds with new route and shell

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ThemeToggle.tsx frontend/src/components/Layout.tsx frontend/src/components/Sidebar.tsx frontend/src/App.tsx
git commit -m "feat: add premium executive shell"
```

---

### PR-UX-03: Executive Home

**Files**
- Create: `frontend/src/pages/Home.tsx`
- Create: `frontend/src/components/home/ExecutiveHero.tsx`
- Create: `frontend/src/components/home/KpiRail.tsx`
- Create: `frontend/src/components/home/ExecutiveBrief.tsx`
- Create: `frontend/src/components/home/PriorityAlerts.tsx`
- Create: `frontend/src/components/home/ExecutiveAccess.tsx`
- Modify: `frontend/src/api/index.ts` only if a lightweight aggregator helper is needed

- [ ] **Step 1: Create a thin page composition for `/home`**

The page should compose dedicated blocks instead of one large file.

```tsx
export function HomePage() {
  return (
    <div className="executive-home">
      <ExecutiveHero />
      <KpiRail />
      <div className="executive-grid">
        <ExecutiveBrief />
        <PriorityAlerts />
      </div>
      <ExecutiveAccess />
    </div>
  )
}
```

- [ ] **Step 2: Implement the welcome hero**

Use `auth.user.email` to derive a friendly display name fallback.

Visual requirements:

- greeting
- premium title
- date line
- 2 CTAs

- [ ] **Step 3: Implement KPI cards using current data where available**

Prefer existing `dashboard/summary` data and safe fallbacks:

- total services or activity proxy
- avg margin
- critical combos or alerts
- modules covered

- [ ] **Step 4: Implement executive brief and priority alerts**

Keep these blocks readable and editorial. Avoid dense tables.

Fallback copy is acceptable if specific APIs do not exist yet.

- [ ] **Step 5: Implement secondary access layer**

Cards should point to:

- dashboard
- quotes
- calculator
- catalog
- suppliers

These cards must look like “executive shortcuts”, not app launcher tiles.

- [ ] **Step 6: Verify route and responsive layout**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Home.tsx frontend/src/components/home
git commit -m "feat: add executive home page"
```

---

### PR-UX-04: Premium Login and Post-Login Flow

**Files**
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/store/auth.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Redirect successful login to `/home`**

Change current navigation target in `Login.tsx`.

Run: `rg -n "navigate\\('/dashboard'\\)" frontend/src/pages/Login.tsx`
Expected: one match

- [ ] **Step 2: Rebuild the login layout**

Target composition:

- immersive branded backdrop
- premium marketing column
- refined form column
- optional discreet demo credentials block

Use CSS classes and transitions aligned with the theme tokens.

- [ ] **Step 3: Add subtle motion**

Use CSS transitions or keyframes for:

- panel reveal
- ambient gradient drift
- focus ring transitions
- loading state polish

Do not add a heavy animation library unless already present.

- [ ] **Step 4: Improve error and loading feedback**

Error block and submit button should match the new art direction.

- [ ] **Step 5: Verify login flow manually against production-like API**

Run locally:

```bash
cd frontend && npm run dev
```

Expected:

- login screen renders in light theme
- successful login lands on `/home`
- refresh preserves theme and auth state

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/store/auth.ts frontend/src/App.tsx
git commit -m "feat: redesign login for executive experience"
```

---

### PR-UX-05: Template Adaptation and Visual Hardening

**Files**
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/Calculator.tsx`
- Modify: `frontend/src/pages/Quotes.tsx`
- Modify: `frontend/src/pages/Catalog.tsx`
- Modify: `frontend/src/pages/Suppliers.tsx`
- Modify: `frontend/src/pages/Config.tsx`
- Modify: `frontend/src/pages/Admin.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Audit hardcoded dark/violet values**

Run:

```bash
rg -n "139,92,246|violet|primary-light|bg-violet|text-white|rgba\\(255,255,255" frontend/src/pages frontend/src/components
```

Expected: a list of files that still depend on old visual tokens

- [ ] **Step 2: Replace page-level hardcoded colors with semantic tokens**

For each page:

- map background to `var(--surface)` or `var(--surface-2)`
- map text to `var(--text)` and `var(--text-muted)`
- map accents to `var(--accent)` and `var(--accent-strong)`

- [ ] **Step 3: Fix contrast regressions in both themes**

Focus especially on:

- table headers
- badges
- empty states
- form controls
- hover states

- [ ] **Step 4: Validate desktop and mobile shell across key routes**

Manual checklist:

- `/home`
- `/dashboard`
- `/quotes`
- `/calculator`
- `/catalog`
- `/suppliers`

- [ ] **Step 5: Build and smoke test**

Run: `cd frontend && npm run build`
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages frontend/src/index.css
git commit -m "feat: adapt core templates to premium theme"
```

---

## Execution Notes

- Do not mix the theme system and page adaptation into one PR.
- Do not introduce backend changes for executive-only users in this initiative.
- Keep `/dashboard` intact functionally even if its visuals are softened.
- Prefer CSS variables and small reusable components over large one-off inline styles.

## Verification Checklist

- `light` is default after first load
- `dark` can be toggled and persists
- authenticated root lands on `/home`
- login lands on `/home`
- home reads as an executive surface, not an operations board
- existing pages remain usable in both themes

## Self-Review

Spec coverage check:

- Home ejecutiva: covered in `PR-UX-03`
- theme global claro/oscuro: covered in `PR-UX-01`
- shell premium: covered in `PR-UX-02`
- login moderno con animaciones: covered in `PR-UX-04`
- adaptación del resto de templates: covered in `PR-UX-05`

Placeholder scan:

- no `TODO`
- no `TBD`
- no references to undefined files outside the current frontend structure

Type consistency:

- routing continues in `App.tsx`
- auth state remains in `store/auth.ts`
- theme state isolated in `store/theme.ts`
