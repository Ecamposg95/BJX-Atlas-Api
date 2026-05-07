import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Branch } from '../api/types'

interface BranchState {
  branches: Branch[]
  activeBranchId: string | null
  setBranches: (branches: Branch[]) => void
  setActiveBranch: (branchId: string | null) => void
  getActiveBranch: () => Branch | null
}

const STORAGE_KEY = 'bjx-active-branch'

export const useBranchStore = create<BranchState>()(
  persist(
    (set, get) => ({
      branches: [],
      activeBranchId: null,

      setBranches: (branches) => {
        // Si no hay branch activo, usar la primera disponible
        const current = get().activeBranchId
        const stillValid = current && branches.some((b) => b.id === current)
        let next = current
        if (!stillValid && branches.length > 0) {
          next = branches[0].id
          localStorage.setItem(STORAGE_KEY, next)
        }
        set({ branches, activeBranchId: next })
      },

      setActiveBranch: (branchId) => {
        if (branchId) {
          localStorage.setItem(STORAGE_KEY, branchId)
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
        set({ activeBranchId: branchId })
      },

      getActiveBranch: () => {
        const { branches, activeBranchId } = get()
        return branches.find((b) => b.id === activeBranchId) ?? null
      },
    }),
    {
      name: 'bjx-branch',
      partialize: (s) => ({ activeBranchId: s.activeBranchId }),
    },
  ),
)
