import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserMe } from '../api/types'
import { logout as apiLogout } from '../api'

interface AuthState {
  token: string | null
  user: UserMe | null
  setToken: (token: string) => void
  setUser: (user: UserMe) => void
  logout: () => void
  isAuthenticated: () => boolean
  hasRole: (roles: Array<'admin' | 'operador' | 'viewer'>) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,

      setToken: (token) => {
        localStorage.setItem('access_token', token)
        set({ token })
      },

      setUser: (user) => set({ user }),

      logout: () => {
        apiLogout().catch(() => {})
        localStorage.removeItem('access_token')
        set({ token: null, user: null })
      },

      isAuthenticated: () => Boolean(get().token && get().user),

      hasRole: (roles) => {
        const { user } = get()
        return user ? roles.includes(user.role) : false
      },
    }),
    {
      name: 'bjx-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
)
