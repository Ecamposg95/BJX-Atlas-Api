import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  House, LayoutDashboard, Calculator, FileText, BookOpen,
  Truck, Settings, LogOut, ChevronLeft, Menu, ShieldCheck
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { ThemeToggle } from './ThemeToggle'

const PRIMARY_ITEMS = [
  { to: '/home', icon: House, label: 'Home ejecutiva' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/quotes', icon: FileText, label: 'Cotizaciones' },
  { to: '/calculator', icon: Calculator, label: 'Calculadora' },
  { to: '/catalog', icon: BookOpen, label: 'Catálogo' },
  { to: '/suppliers', icon: Truck, label: 'Proveedores' },
]

const ADMIN_ITEMS = [
  { to: '/config',     icon: Settings,         label: 'Configuración', adminOnly: true },
  { to: '/admin',      icon: ShieldCheck,      label: 'Administración', adminOnly: true },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'sidebar-role sidebar-role--admin',
  operador: 'sidebar-role sidebar-role--operador',
  viewer: 'sidebar-role sidebar-role--viewer',
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

  const visibleAdminItems = ADMIN_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  )

  return (
    <aside
      className={clsx(
        'sidebar-panel flex flex-col',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo / Brand */}
      <div className="sidebar-brand" style={{ justifyContent: collapsed ? 'center' : 'space-between' }}>
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
            <div className="sidebar-brand__mark">
              <span className="text-white font-black text-xs leading-none">B</span>
            </div>
            <div className="min-w-0">
              <p className="sidebar-brand__title">BJX Atlas</p>
              <p className="sidebar-brand__meta">
                Executive Suite
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
          <p className="sidebar-section-label">
            Visión general
          </p>
        )}
        {PRIMARY_ITEMS.map(({ to, icon: Icon, label }) => (
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

        {!collapsed && visibleAdminItems.length > 0 && (
          <p className="sidebar-section-label sidebar-section-label--secondary">
            Gestión
          </p>
        )}
        {visibleAdminItems.map(({ to, icon: Icon, label }) => (
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
      <div className="sidebar-footer">
        {!collapsed && user && (
          <div className="sidebar-user-card">
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

        {!collapsed && (
          <div className="px-2 py-1">
            <ThemeToggle />
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
