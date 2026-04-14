import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Calculator, FileText, BookOpen,
  Truck, Settings, LogOut, ChevronLeft, Menu
} from 'lucide-react'
import { useAuthStore } from '../store/auth'

const NAV_ITEMS = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calculator', icon: Calculator,       label: 'Calculadora' },
  { to: '/quotes',     icon: FileText,         label: 'Cotizaciones' },
  { to: '/catalog',    icon: BookOpen,         label: 'Catálogo' },
  { to: '/suppliers',  icon: Truck,            label: 'Proveedores' },
  { to: '/config',     icon: Settings,         label: 'Configuración', adminOnly: true },
]

const ROLE_COLORS: Record<string, string> = {
  admin:    'bg-violet-500/20 text-violet-300 border border-violet-500/30',
  operador: 'bg-blue-500/20   text-blue-300   border border-blue-500/30',
  viewer:   'bg-slate-500/20  text-slate-300  border border-slate-500/30',
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onNavClick?: () => void
}

export function Sidebar({ collapsed, onToggle, onNavClick }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  )

  return (
    <aside
      className={clsx(
        'flex flex-col transition-all duration-250',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo / Brand */}
      <div
        className={clsx(
          'flex h-14 items-center border-b px-3',
          'border-[rgba(139,92,246,0.15)]'
        )}
        style={{ justifyContent: collapsed ? 'center' : 'space-between' }}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            {/* Logo mark */}
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-900/40">
              <span className="text-white font-black text-xs leading-none">B</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-none truncate">BJX Atlas</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest leading-none mt-0.5"
                 style={{ color: 'var(--sb-active-text)' }}>
                Cotizaciones
              </p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg transition-colors flex-shrink-0"
          style={{ color: 'var(--sb-text)' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--sb-text)')}
        >
          {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 space-y-0.5 px-1.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest"
             style={{ color: 'var(--text-faint)' }}>
            Módulos
          </p>
        )}
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavClick}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx('nav-item', isActive && 'active', collapsed && 'justify-center')
            }
          >
            <Icon size={17} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div
        className="border-t p-2 space-y-1"
        style={{ borderColor: 'rgba(139,92,246,0.12)' }}
      >
        {!collapsed && user && (
          <div className="px-2 py-1.5 rounded-lg"
               style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-muted)' }}>
              {user.email}
            </p>
            <span
              className={clsx(
                'inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer
              )}
            >
              {user.role}
            </span>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={clsx(
            'nav-item w-full',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={17} className="flex-shrink-0" />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}
