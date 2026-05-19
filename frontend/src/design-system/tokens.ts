/**
 * BJX Atlas — Design Tokens
 *
 * Fuente unica de verdad para colores, espaciado, radios, motion,
 * sombras y tipografia. Espejo de las CSS variables declaradas en
 * `src/index.css`.
 *
 * Reglas:
 *  - Preferir utilities de Tailwind que mapean a estos tokens.
 *  - Usar estos consts cuando se necesita el valor crudo (recharts,
 *    inline styles, framer-motion, librerias de terceros).
 */

// ── Colores de marca ─────────────────────────────────────────────────
export const COLORS = {
  brand: {
    yellow: '#FBBF24', // BJX Motors yellow
    navy: '#1E293B',   // BJX deep navy
    red: '#DC2626',    // Racing red accent
  },
  // Semaforo: verde / ambar / rojo con variantes light + dark
  semaphore: {
    green: '#10B981',
    greenLight: '#34D399',
    greenDark: '#059669',
    amber: '#F59E0B',
    amberLight: '#FBBF24',
    amberDark: '#D97706',
    red: '#EF4444',
    redLight: '#FB7185',
    redDark: '#B91C1C',
  },
} as const

// ── Espaciado (multiplos de 4) ──────────────────────────────────────
export const SPACING = {
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
} as const

// ── Radios ──────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const

// ── Motion ──────────────────────────────────────────────────────────
export const MOTION = {
  duration: {
    fast: 150,
    base: 250,
    slow: 400,
  },
  easing: {
    premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const

// ── Sombras ─────────────────────────────────────────────────────────
export const SHADOWS = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
  md: '0 4px 12px rgba(15, 23, 42, 0.08)',
  lg: '0 12px 30px rgba(15, 23, 42, 0.10)',
  xl: '0 32px 80px rgba(15, 23, 42, 0.14)',
} as const

// ── Tipografia ──────────────────────────────────────────────────────
export const TYPOGRAPHY = {
  size: {
    xs: 12,
    sm: 13,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 28,
    '4xl': 34,
  },
  lineHeight: {
    xs: 16,
    sm: 18,
    base: 20,
    lg: 24,
    xl: 28,
    '2xl': 30,
    '3xl': 36,
    '4xl': 42,
  },
} as const

// ── Aggregate ───────────────────────────────────────────────────────
export const tokens = {
  colors: COLORS,
  spacing: SPACING,
  radius: RADIUS,
  motion: MOTION,
  shadows: SHADOWS,
  typography: TYPOGRAPHY,
} as const

export type Tokens = typeof tokens
