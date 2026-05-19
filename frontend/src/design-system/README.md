# Design System — BJX Atlas

Fuente unica de verdad para tokens visuales: colores, espaciado, radios, motion, sombras y tipografia.

## Uso

```ts
import { tokens, COLORS, cn } from '@/design-system'

// Inline style con valor crudo
<div style={{ background: COLORS.brand.yellow }} />

// Concatenar clases con resolucion de conflictos Tailwind
<button className={cn('px-4 py-2', isActive && 'bg-amber-400', className)} />

// Para Recharts y otras libs externas
<Line stroke={COLORS.semaphore.green} strokeWidth={tokens.spacing['1']} />
```

## Cuando usar tokens vs Tailwind utilities

**Preferir Tailwind utilities** mapeadas a estos tokens cuando se trate de estilo declarativo:

```tsx
<div className="bg-brand-yellow rounded-lg shadow-md">...</div>
```

**Usar `tokens.ts` solo cuando se necesite el valor crudo**:
- Recharts, react-flow, librerias que esperan strings/numbers
- Inline styles dinamicos
- Animaciones programaticas
- Cuando una clase Tailwind no existe para el caso

## Estructura

```
design-system/
├── tokens.ts      # COLORS, SPACING, RADIUS, MOTION, SHADOWS, TYPOGRAPHY
├── index.ts       # re-exports + cn helper
└── README.md      # este archivo
```

## Sincronia con Tailwind y CSS variables

Los tokens se replican en tres lugares:

1. **`tokens.ts`** — fuente TypeScript (este archivo).
2. **`src/index.css` @theme block** — habilita utilities Tailwind (`bg-brand-yellow`, etc.).
3. **`src/index.css` :root variables** — para uso con `var(--color-brand-yellow)`.

Cuando agregues un token nuevo:
1. Anadelo a `tokens.ts`.
2. Mirror en `@theme` de `index.css`.
3. Si lo vas a referenciar con `var(...)`, anadelo tambien en `:root`.
