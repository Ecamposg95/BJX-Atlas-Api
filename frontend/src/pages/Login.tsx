import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react'
import { login } from '../api'
import { useAuthStore } from '../store/auth'
import { ThemeToggle } from '../components/ThemeToggle'

const DEMO_USERS = [
  { label: 'Jorge', email: 'jorge@bjx.com', role: 'Admin' },
  { label: 'Rene', email: 'rene@bjx.com', role: 'Operador' },
  { label: 'Carlos', email: 'carlos@bjx.com', role: 'Viewer' },
]

export function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { setToken, setUser }   = useAuthStore()
  const navigate                = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login({ email, password })
      setToken(data.access_token)
      setUser(data.user)
      navigate('/home')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-shell__ambient" />

      <div className="login-shell__header">
        <div className="login-shell__brandmark">
          <span>BJX</span>
          <small>Motors</small>
        </div>
        <ThemeToggle />
      </div>

      <div className="login-shell__content">
        <section className="login-editorial">
          <span className="login-editorial__eyebrow">
            <Sparkles size={14} />
            Suite corporativa premium
          </span>
          <h1 className="login-editorial__title">
            La vista ejecutiva para rentabilidad, operación y decisión comercial.
          </h1>
          <p className="login-editorial__text">
            BJX Atlas consolida la lectura del negocio en un solo lugar para
            dirección, seguimiento estratégico y foco operativo de alto nivel.
          </p>

          <div className="login-editorial__highlights">
            <article className="login-highlight">
              <span className="login-highlight__label">Lectura ejecutiva</span>
              <p className="login-highlight__body">
                Indicadores clave y alertas prioritarias desde la primera pantalla.
              </p>
            </article>
            <article className="login-highlight">
              <span className="login-highlight__label">Decisión rápida</span>
              <p className="login-highlight__body">
                Cotizaciones, costos y señales de riesgo en una experiencia clara y premium.
              </p>
            </article>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card__intro">
            <span className="login-card__eyebrow">Acceso ejecutivo</span>
            <h2 className="login-card__title">Iniciar sesión</h2>
            <p className="login-card__subtitle">
              Entra a tu centro ejecutivo BJX con la cuenta asignada.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-field__label">Correo</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jorge@bjx.com"
                className="login-field__input"
              />
            </div>

            <div className="login-field">
              <label className="login-field__label">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="login-field__input"
              />
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-submit"
            >
              <span>{loading ? 'Ingresando…' : 'Entrar al centro ejecutivo'}</span>
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <div className="login-demo">
            <div className="login-demo__header">
              <ShieldCheck size={15} />
              <span>Accesos demo MVP</span>
            </div>
            <div className="login-demo__list">
              {DEMO_USERS.map((user) => (
                <button
                  key={user.email}
                  type="button"
                  className="login-demo__item"
                  onClick={() => {
                    setEmail(user.email)
                    setPassword('1234')
                    setError('')
                  }}
                >
                  <div>
                    <p className="login-demo__name">{user.label}</p>
                    <p className="login-demo__email">{user.email}</p>
                  </div>
                  <span className="login-demo__role">{user.role}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
