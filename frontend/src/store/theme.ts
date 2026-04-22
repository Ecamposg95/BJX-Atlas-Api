import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'bjx-theme'

function normalizeTheme(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : 'light'
}

function parseStoredTheme(rawValue: string | null): ThemeMode {
  if (!rawValue) return 'light'

  try {
    const parsed = JSON.parse(rawValue) as { state?: { theme?: unknown } } | string
    if (typeof parsed === 'string') return normalizeTheme(parsed)
    return normalizeTheme(parsed?.state?.theme)
  } catch {
    return normalizeTheme(rawValue)
  }
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
}

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return parseStoredTheme(window.localStorage.getItem(STORAGE_KEY))
}

export const useThemeStore = create<{
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (theme) => {
        const nextTheme = normalizeTheme(theme)
        applyTheme(nextTheme)
        set({ theme: nextTheme })
      },
      toggleTheme: () => {
        const nextTheme = get().theme === 'light' ? 'dark' : 'light'
        applyTheme(nextTheme)
        set({ theme: nextTheme })
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        applyTheme(normalizeTheme(state?.theme))
      },
    }
  )
)
