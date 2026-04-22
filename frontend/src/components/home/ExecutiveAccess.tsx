import { ArrowRight, BookOpen, Calculator, FileText, LayoutDashboard, Truck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const ACCESS_ITEMS = [
  {
    title: 'Cotizaciones',
    description: 'Revisa el pipeline comercial y el avance de propuestas.',
    to: '/quotes',
    icon: FileText,
  },
  {
    title: 'Calculadora',
    description: 'Simula rentabilidad y escenarios de costo con rapidez.',
    to: '/calculator',
    icon: Calculator,
  },
  {
    title: 'Dashboard',
    description: 'Profundiza en lectura táctica del desempeño actual.',
    to: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Catálogo',
    description: 'Consulta cobertura, costos y estructura de servicios.',
    to: '/catalog',
    icon: BookOpen,
  },
  {
    title: 'Proveedores',
    description: 'Contrasta cobertura y base de suministro disponible.',
    to: '/suppliers',
    icon: Truck,
  },
]

export function ExecutiveAccess() {
  const navigate = useNavigate()

  return (
    <section className="executive-panel">
      <div className="executive-panel__header">
        <div>
          <p className="executive-panel__eyebrow">Access layer</p>
          <h2 className="executive-panel__title">Herramientas ejecutivas</h2>
        </div>
      </div>

      <div className="executive-access-grid">
        {ACCESS_ITEMS.map((item) => (
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
              <p className="executive-access-card__description">{item.description}</p>
            </div>
            <ArrowRight size={16} className="executive-access-card__arrow" />
          </button>
        ))}
      </div>
    </section>
  )
}
