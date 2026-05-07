import { ArrowRight, BriefcaseBusiness } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import { useBranch } from '../../hooks/useBranch'

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

function getDateLabel() {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  }).format(new Date())
}

export function ExecutiveHero() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { activeBranch } = useBranch()
  const displayName = getDisplayName(user?.email)

  return (
    <section className="executive-hero">
      <div className="executive-hero__copy">
        <span className="executive-hero__eyebrow">
          <BriefcaseBusiness size={14} />
          {activeBranch ? `${activeBranch.code} · ${activeBranch.name}` : 'BJX Motors'}
        </span>
        <h1 className="executive-hero__title">Hola, {displayName}</h1>
        <p className="executive-hero__date">{getDateLabel()}</p>

        <div className="executive-hero__actions">
          <button
            type="button"
            className="executive-button executive-button--primary"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className="executive-button executive-button--secondary"
            onClick={() => navigate('/workshop/board')}
          >
            Tablero taller
          </button>
        </div>
      </div>
    </section>
  )
}
