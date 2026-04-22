import { ArrowRight, BriefcaseBusiness } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'

function getDisplayName(email?: string | null) {
  if (!email) return 'Equipo ejecutivo'
  const [localPart] = email.split('@')
  const normalized = localPart.replace(/[._-]+/g, ' ').trim()
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getExecutiveDateLabel() {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

export function ExecutiveHero() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const displayName = getDisplayName(user?.email)

  return (
    <section className="executive-hero">
      <div className="executive-hero__copy">
        <span className="executive-hero__eyebrow">
          <BriefcaseBusiness size={14} />
          Centro ejecutivo BJX Motors
        </span>
        <h1 className="executive-hero__title">
          Bienvenido, {displayName}
        </h1>
        <p className="executive-hero__text">
          Un resumen premium del estado comercial y operativo para iniciar el d&iacute;a
          con foco, contexto y decisiones claras.
        </p>
        <p className="executive-hero__date">{getExecutiveDateLabel()}</p>

        <div className="executive-hero__actions">
          <button
            type="button"
            className="executive-button executive-button--primary"
            onClick={() => navigate('/quotes')}
          >
            Ver cotizaciones
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className="executive-button executive-button--secondary"
            onClick={() => navigate('/dashboard')}
          >
            Revisar dashboard
          </button>
        </div>
      </div>

      <div className="executive-hero__panel">
        <div className="executive-hero__signal">
          <span className="executive-hero__signal-label">Prioridad del d&iacute;a</span>
          <strong className="executive-hero__signal-title">Rentabilidad y seguimiento operativo</strong>
          <p className="executive-hero__signal-text">
            Mant&eacute;n el foco en margen promedio, combinaciones cr&iacute;ticas y velocidad de respuesta.
          </p>
        </div>
      </div>
    </section>
  )
}
