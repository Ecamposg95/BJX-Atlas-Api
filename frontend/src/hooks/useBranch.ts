import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { useBranchStore } from '../store/branch'
import { switchBranch as apiSwitchBranch } from '../api'
import { GLOBAL_ROLES, type Branch } from '../api/types'

export interface UseBranchReturn {
  activeBranch: Branch | null
  branches: Branch[]
  switchTo: (branchId: string) => Promise<void>
  isGlobalUser: boolean
}

export function useBranch(): UseBranchReturn {
  const user = useAuthStore((s) => s.user)
  const branches = useBranchStore((s) => s.branches)
  const activeBranchId = useBranchStore((s) => s.activeBranchId)
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch)
  const queryClient = useQueryClient()

  const activeBranch = useMemo<Branch | null>(
    () => branches.find((b) => b.id === activeBranchId) ?? null,
    [branches, activeBranchId],
  )

  const isGlobalUser = useMemo<boolean>(
    () => Boolean(user && GLOBAL_ROLES.includes(user.role)),
    [user],
  )

  const switchTo = useCallback(
    async (branchId: string) => {
      await apiSwitchBranch(branchId)
      setActiveBranch(branchId)
      await queryClient.invalidateQueries()
    },
    [setActiveBranch, queryClient],
  )

  return { activeBranch, branches, switchTo, isGlobalUser }
}
