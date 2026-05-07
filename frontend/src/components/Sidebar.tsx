import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  House, LayoutDashboard, Calculator, FileText, BookOpen,
  Truck, Settings, LogOut, ChevronLeft, Menu, ShieldCheck,
  Package, ClipboardList, Wrench, Wrench as WrenchIcon, Building2, Activity,
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { ThemeToggle } from './ThemeToggle'
import { BranchSwitcher } from './BranchSwitcher'

const PRIMARY_ITEMS = [
  { to: '/home', icon: House, label: 'Home ejecutiva' },
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/dashboard/operational', icon: Activity, label: 'Operativo' },
  { to: '/quotes', icon: FileText, label: 'Cotizaciones' },
  { to: '/calculator', icon: Calculator, label: 'Calculadora' },
  { to: '/catalog', icon: BookOpen, label: 'Catálogo' },
  { to: '/suppliers', icon: Truck, label: 'Proveedores' },
]

const WORKSHOP_ITEMS = [
  { to: '/workshop/board', icon: Wrench, label: 'Tablero taller' },
  { to: '/me/work', icon: WrenchIcon, label: 'Mis OS' },
]

const INVENTORY_ITEMS = [
  { to: '/inventory', icon: Package, label: 'Inventario' },
  { to: '/inventory/requests', icon: ClipboardList, label: 'Solicitudes' },
]

const ADMIN_ITEMS = [
  { to: '/branches',   icon: Building2,        label: 'Sucursales',     adminOnly: true },
  { to: '/config',     icon: Settings,         label: 'Configuración', adminOnly: true },
  { to: '/admin',      icon: ShieldCheck,      label: 'Administración', adminOnly: true },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'sidebar-role sidebar-role--admin',
  director: 'sidebar-role sidebar-role--admin',
  gerente_sede: 'sidebar-role sidebar-role--operador',
  jefe_taller: 'sidebar-role sidebar-role--operador',
  operador: 'sidebar-role sidebar-role--operador',
  recepcion: 'sidebar-role sidebar-role--operador',
  mecanico: 'sidebar-role sidebar-role--operador',
  almacen: 'sidebar-role sidebar-role--operador',
  cliente_corp: 'sidebar-role sidebar-role--viewer',
  viewer: 'sidebar-role sidebar-role--viewer',
}

const ADMIN_ROLES = new Set(['admin', 'director'])

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
    (item) => !item.adminOnly || (user?.role && ADMIN_ROLES.has(user.role))
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

      {/* Branch switcher */}
      <div className={clsx('px-2', collapsed ? 'py-2' : 'py-2.5')} style={{ borderBottom: '1px solid var(--sb-border, transparent)' }}>
        <BranchSwitcher collapsed={collapsed} />
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

        {!collapsed && (
          <p className="sidebar-section-label sidebar-section-label--secondary">
            Taller
          </p>
        )}
        {WORKSHOP_ITEMS.map(({ to, icon: Icon, label }) => (
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

        {!collapsed && (
          <p className="sidebar-section-label sidebar-section-label--secondary">
            Inventario
          </p>
        )}
        {INVENTORY_ITEMS.map(({ to, icon: Icon, label }) => (
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
