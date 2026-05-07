import { ArrowRight, BookOpen, Calculator, FileText, LayoutDashboard, Truck, Wrench, Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import type { Role } from '../../api/types'

interface AccessItem {
  title: string
  to: string
  icon: typeof FileText
  roles: Role[]
}

const ACCESS_ITEMS: AccessItem[] = [
  { title: 'Cotizaciones',  to: '/quotes',               icon: FileText,        roles: ['admin', 'director', 'gerente_sede', 'recepcion', 'operador'] },
  { title: 'Calculadora',   to: '/calculator',           icon: Calculator,      roles: ['admin', 'director', 'gerente_sede', 'operador'] },
  { title: 'Dashboard',     to: '/dashboard',            icon: LayoutDashboard, roles: ['admin', 'director', 'gerente_sede', 'operador', 'viewer'] },
  { title: 'Tablero',       to: '/workshop/board',       icon: Wrench,          roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'recepcion', 'almacen'] },
  { title: 'Inventario',    to: '/inventory',            icon: Package,         roles: ['admin', 'director', 'gerente_sede', 'jefe_taller', 'almacen'] },
  { title: 'Catálogo',      to: '/catalog',              icon: BookOpen,        roles: ['admin', 'director', 'gerente_sede'] },
  { title: 'Proveedores',   to: '/suppliers',            icon: Truck,           roles: ['admin', 'director', 'almacen'] },
]

export function ExecutiveAccess() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  if (!user) return null

  const items = ACCESS_ITEMS.filter((i) => i.roles.includes(user.role))
  if (items.length === 0) return null

  return (
    <section className="executive-panel">
      <div className="executive-panel__header">
        <p className="executive-panel__eyebrow">Accesos rápidos</p>
        <h2 className="executive-panel__title">Tus herramientas</h2>
      </div>

      <div className="executive-access-grid">
        {items.map((item) => (
          <button
            key={item.title}
            type="button"
            className="executive-access-card"
            onClick={() => navigate(item.to)}
          >
            <div className="executive-access-card__icon">
              <item.icon size={18} />
            </div>
            <div className="executive-access-card__content">
              <p className="executive-access-card__title">{item.title}</p>
            </div>
            <ArrowRight size={16} className="executive-access-card__arrow" />
          </button>
        ))}
      </div>
    </section>
  )
}
