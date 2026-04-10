import { NavLink, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Calculator, FileText, BookOpen,
  Truck, Settings, LogOut, ChevronLeft, Menu
} from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { Badge } from './ui/Badge'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calculator', icon: Calculator, label: 'Calculadora' },
  { to: '/quotes', icon: FileText, label: 'Cotizaciones' },
  { to: '/catalog', icon: BookOpen, label: 'Catálogo' },
  { to: '/suppliers', icon: Truck, label: 'Proveedores' },
  { to: '/config', icon: Settings, label: 'Configuración', adminOnly: true },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
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
        'flex flex-col bg-gray-900 text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-3 border-b border-gray-800">
        {!collapsed && (
          <span className="text-sm font-semibold truncate">BJX Atlas</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
        >
          {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {visibleItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-gray-800 p-3">
        {!collapsed && user && (
          <div className="mb-2 space-y-1">
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
            <Badge variant={user.role}>{user.role}</Badge>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Salir</span>}
        </button>
      </div>
    </aside>
  )
}
