/**
 * BJX Atlas — Design System entrypoint.
 *
 * Re-exporta tokens y utilities. Importar desde aqui en componentes:
 *
 *   import { tokens, cn } from '@/design-system'
 *   import { COLORS } from '@/design-system'
 */

export * from './tokens'

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * `cn` — concatena clases con clsx y resuelve conflictos de Tailwind.
 *
 *   cn('px-2 py-1', isActive && 'bg-yellow-400', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
