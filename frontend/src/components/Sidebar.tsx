import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  House, LayoutDashboard, Calculator, FileText, BookOpen,
  Truck, Settings, LogOut, ChevronLeft, Menu, ShieldCheck,
  Package, Wrench, HardHat, Building2, Activity, ClipboardCheck, PackageOpen,
  Briefcase, UsersRound, CalendarDays, BadgeCheck, PackageCheck, ShoppingCart,
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { ThemeToggle } from './ThemeToggle'
import { BranchSwitcher } from './BranchSwitcher'
import { NotificationDrawer } from './NotificationDrawer'
import type { Role } from '../api/types'

type NavItem = {
  to: string
  icon: typeof House
  label: string
  roles: Role[]
}

// Convencion: cada ruta declara que roles la pueden ver.
// El backend valida con require_role()/require_permission() — esto es solo UI.

// ── MI TRABAJO — home del rol + tareas personales ───────────────────
const WORK_ITEMS: NavItem[] = [
  { to: '/admin',       icon: ShieldCheck,    label: 'Plataforma',     roles: ['admin'] },
  { to: '/executive',   icon: Briefcase,      label: 'Vision ejecutiva', roles: ['admin', 'director'] },
  { to: '/manager',     icon: Building2,      label: 'Mi sucursal',    roles: ['admin', 'director', 'gerente_sede'] },
  { to: '/workshop',    icon: HardHat,        label: 'Mando taller',   roles: ['admin', 'jefe_taller'] },
  { to: '/advisor',     icon: ClipboardCheck, label: 'Recepcion',      roles: ['admin', 'recepcion'] },
  { to: '/mechanic',    icon: Wrench,         label: 'Mis tareas',     roles: ['admin', 'mecanico'] },
  { to: '/warehouse',   icon: PackageOpen,    label: 'Almacen',        roles: ['admin', 'almacen'] },
  { to: '/client-corp', icon: UsersRound,     label: 'Mi flota',       roles: ['admin', 'cliente_corp'] },
]

// ── OPERACION — piso y stock ─────────────────────────────────────────
const OPERATIONS_ITEMS: NavItem[] = [
  { to: '/citas',          icon: CalendarDays, label: 'Citas',          roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'recepcion'] },
  { to: '/workshop/board', icon: Wrench,       label: 'Tablero taller', roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'recepcion', 'almacen'] },
  { to: '/workshop/qa',    icon: BadgeCheck,   label: 'QA',             roles: ['admin', 'director', 'gerente_sede', 'jefe_taller'] },
  { to: '/inventory',      icon: Package,      label: 'Inventario',     roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'almacen'] },
  { to: '/warehouse/stock-board', icon: PackageCheck, label: 'Stock-board', roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'almacen', 'viewer'] },
]

// ── NEGOCIO — cotizaciones, catalogo, proveedores, sucursales ────────
const BUSINESS_ITEMS: NavItem[] = [
  { to: '/quotes',     icon: FileText,   label: 'Cotizaciones', roles: ['admin', 'director', 'gerente_sede', 'recepcion'] },
  { to: '/calculator', icon: Calculator, label: 'Calculadora',  roles: ['admin', 'director', 'gerente_sede', 'recepcion'] },
  { to: '/catalog',    icon: BookOpen,   label: 'Catalogo',     roles: ['admin', 'director', 'gerente_sede'] },
  { to: '/suppliers',  icon: Truck,      label: 'Proveedores',  roles: ['admin', 'director', 'almacen'] },
  { to: '/procurement', icon: ShoppingCart, label: 'Compras',     roles: ['admin', 'director', 'gerente_sede', 'almacen'] },
  { to: '/branches',   icon: Building2,  label: 'Sucursales',   roles: ['admin', 'director', 'gerente_sede'] },
]

// ── ANALISIS — dashboards ────────────────────────────────────────────
const ANALYTICS_ITEMS: NavItem[] = [
  { to: '/dashboard',             icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'director', 'gerente_sede', 'cliente_corp', 'viewer'] },
  { to: '/dashboard/operational', icon: Activity,        label: 'Operativo', roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'almacen', 'viewer'] },
]

// ── ADMIN — configuracion de plataforma ──────────────────────────────
const ADMIN_ITEMS: NavItem[] = [
  { to: '/config', icon: Settings,    label: 'Configuracion',  roles: ['admin', 'director'] },
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

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  director: 'Director',
  gerente_sede: 'Gerente sede',
  jefe_taller: 'Jefe taller',
  recepcion: 'Recepcion',
  mecanico: 'Mecanico',
  almacen: 'Almacen',
  cliente_corp: 'Cliente',
  operador: 'Operador',
  viewer: 'Viewer',
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onNavClick?: () => void
}

function filterByRole(items: NavItem[], role: Role | undefined): NavItem[] {
  if (!role) return []
  return items.filter((i) => i.roles.includes(role))
}

export function Sidebar({ collapsed, onToggle, onNavClick }: SidebarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const role = user?.role
  const work = filterByRole(WORK_ITEMS, role)
  const operations = filterByRole(OPERATIONS_ITEMS, role)
  const business = filterByRole(BUSINESS_ITEMS, role)
  const analytics = filterByRole(ANALYTICS_ITEMS, role)
  const adminSection = filterByRole(ADMIN_ITEMS, role)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const renderItems = (items: NavItem[]) =>
    items.map(({ to, icon: Icon, label }) => (
      <NavLink
        key={to}
        to={to}
        onClick={onNavClick}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          clsx('nav-item', isActive && 'active', collapsed && 'justify-center')
        }
      >
        <Icon size={15} className="flex-shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    ))

  return (
    <aside
      className={clsx(
        'sidebar-panel flex flex-col',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo / Brand */}
      <div className="sidebar-brand" style={{ justifyContent: collapsed ? 'center' : 'space-between', gap: '0.5rem' }}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="sidebar-brand__mark">
              <span className="text-white font-black text-xs leading-none">B</span>
            </div>
            <p className="sidebar-brand__title truncate">BJX Atlas</p>
          </div>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!collapsed && <NotificationDrawer />}
          {!collapsed && <ThemeToggle />}
          <button
            onClick={onToggle}
            className="p-1 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--sb-text)' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--sb-text)')}
          >
            {collapsed ? <Menu size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </div>

      {/* Branch switcher */}
      <div className={clsx('px-2', collapsed ? 'py-1.5' : 'py-2')} style={{ borderBottom: '1px solid var(--sb-border, transparent)' }}>
        <BranchSwitcher collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 space-y-0 px-1 overflow-y-auto">
        {work.length > 0 && (
          <>
            {!collapsed && <p className="sidebar-section-label">Mi trabajo</p>}
            {renderItems(work)}
          </>
        )}

        {operations.length > 0 && (
          <>
            {!collapsed && <p className="sidebar-section-label sidebar-section-label--secondary">Operacion</p>}
            {renderItems(operations)}
          </>
        )}

        {business.length > 0 && (
          <>
            {!collapsed && <p className="sidebar-section-label sidebar-section-label--secondary">Negocio</p>}
            {renderItems(business)}
          </>
        )}

        {analytics.length > 0 && (
          <>
            {!collapsed && <p className="sidebar-section-label sidebar-section-label--secondary">Analisis</p>}
            {renderItems(analytics)}
          </>
        )}

        {adminSection.length > 0 && (
          <>
            {!collapsed && <p className="sidebar-section-label sidebar-section-label--secondary">Admin</p>}
            {renderItems(adminSection)}
          </>
        )}
      </nav>

      {/* User + Logout */}
      <div className="sidebar-footer">
        {!collapsed && user && (
          <div className="sidebar-user-card flex items-center justify-between gap-2">
            <p className="text-[0.7rem] font-semibold truncate" style={{ color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
              {user.email}
            </p>
            <span
              className={clsx(
                'inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0',
                ROLE_COLORS[user.role] ?? ROLE_COLORS.viewer
              )}
            >
              {ROLE_LABELS[user.role] ?? user.role}
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
          <LogOut size={15} className="flex-shrink-0" />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}
