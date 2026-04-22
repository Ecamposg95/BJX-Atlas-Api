import { MoonStar, SunMedium } from 'lucide-react'
import { useThemeStore } from '../store/theme'

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
      title={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {theme === 'light' ? <MoonStar size={15} /> : <SunMedium size={15} />}
      </span>
      <span className="theme-toggle__label">
        {theme === 'light' ? 'Oscuro' : 'Claro'}
      </span>
    </button>
  )
}
