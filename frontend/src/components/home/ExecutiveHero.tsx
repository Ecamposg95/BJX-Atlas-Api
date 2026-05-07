import { useEffect, useState } from 'react'
import { ArrowRight, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import { useBranch } from '../../hooks/useBranch'

function getDisplayName(email?: string | null) {
  if (!email) return 'Operador'
  const [localPart] = email.split('@')
  const normalized = localPart.replace(/[._-]+/g, ' ').trim()
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  director: 'Director',
  gerente_sede: 'Gerente sede',
  jefe_taller: 'Jefe de taller',
  recepcion: 'Recepción',
  mecanico: 'Mecánico',
  almacen: 'Almacén',
  cliente_corp: 'Cliente',
  operador: 'Operador',
  viewer: 'Viewer',
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: '2-digit', month: 'long' }).format(d)
}

function fmtTime(d: Date) {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

export function ExecutiveHero() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const { activeBranch } = useBranch()
  const displayName = getDisplayName(user?.email)
  const roleLabel = user?.role ? ROLE_LABELS[user.role] ?? user.role : ''

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <section className="executive-hero">
      <div className="executive-hero__copy">
        <span className="executive-hero__eyebrow">
          {activeBranch ? `${activeBranch.code} · ${roleLabel}` : `${roleLabel} · BJX MOTORS`}
        </span>

        <h1 className="executive-hero__title">Hola, {displayName}.</h1>

        <p className="executive-hero__date">
          {fmtDate(now)} · {fmtTime(now)} hrs
        </p>

        <div className="executive-hero__actions">
          <button
            type="button"
            className="executive-button executive-button--primary"
            onClick={() => navigate('/dashboard/operational')}
          >
            <Activity size={14} strokeWidth={2.5} />
            Operación en vivo
          </button>
          <button
            type="button"
            className="executive-button executive-button--secondary"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
            <ArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </section>
  )
}
