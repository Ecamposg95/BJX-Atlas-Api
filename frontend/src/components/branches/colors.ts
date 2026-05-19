import { COLORS } from '../../design-system/tokens'
import type { BranchSemaphore } from '../../api/types'

export const SEMAPHORE_HEX: Record<BranchSemaphore, string> = {
  green: COLORS.semaphore.green,
  amber: COLORS.semaphore.amber,
  red: COLORS.semaphore.red,
}

export const SEMAPHORE_HEX_DARK: Record<BranchSemaphore, string> = {
  green: COLORS.semaphore.greenDark,
  amber: COLORS.semaphore.amberDark,
  red: COLORS.semaphore.redDark,
}

export const SEMAPHORE_LABEL: Record<BranchSemaphore, string> = {
  green: 'Operando',
  amber: 'Atención',
  red: 'Crítico',
}
