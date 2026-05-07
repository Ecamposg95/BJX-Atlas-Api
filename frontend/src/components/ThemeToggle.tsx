import { MoonStar, SunMedium } from 'lucide-react'
import { useThemeStore } from '../store/theme'

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const isLight = theme === 'light'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Cambiar a tema ${isLight ? 'oscuro' : 'claro'}`}
      title={`Cambiar a tema ${isLight ? 'oscuro' : 'claro'}`}
    >
      {isLight ? <MoonStar size={14} /> : <SunMedium size={14} />}
    </button>
  )
}
