import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { login } from '../api'
import { useAuthStore } from '../store/auth'
import { LoginTopBar } from '../components/login/LoginTopBar'
import { RacingStreaks } from '../components/login/RacingStreaks'
import { TelemetryGauge } from '../components/login/TelemetryGauge'
import { RacingCarSilhouette } from '../components/login/RacingCarSilhouette'

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
      <RacingStreaks />

      <LoginTopBar />

      <div className="login-shell__header" style={{ marginTop: '1rem' }}>
        <div className="login-shell__brandmark">
          <span>BJX Atlas</span>
          <small>RACING-GRADE OPS</small>
        </div>
      </div>

      <div className="login-shell__content">
        {/* ── EDITORIAL (left) ─────────────────────────────────── */}
        <section className="login-editorial">
          <span className="login-editorial__eyebrow">GARAGE ZONE / 19</span>

          <h1 className="login-editorial__title">Pit Lane Atlas</h1>

          <p className="login-editorial__text">
            La plataforma de operación racing-grade para el pit lane y el taller —
            telemetría, control y velocidad en cada decisión.
          </p>

          <div className="login-editorial__telemetry">
            <TelemetryGauge label="AUTOS HOY" value={12} max={20} accent="gold" />
            <TelemetryGauge label="OS ACTIVAS" value={8} max={15} accent="gold" />
            <TelemetryGauge label="RPM" value={7400} max={9000} unit="rpm" accent="red" />
          </div>

          <RacingCarSilhouette className="login-editorial__silhouette" />
        </section>

        {/* ── CARD (right) ─────────────────────────────────────── */}
        <section className="login-card">
          <span className="login-card__eyebrow">IGNITION</span>
          <h2 className="login-card__title">Iniciar sesión</h2>
          <p className="login-card__subtitle">
            Acceso al pit lane BJX. Identifícate para entrar al centro de operaciones.
          </p>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <label className="login-field__label" htmlFor="login-email">CORREO</label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jorge@bjx.com"
                className="login-field__input"
              />
            </div>

            <div className="login-field">
              <label className="login-field__label" htmlFor="login-password">CONTRASEÑA</label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="login-field__input"
              />
            </div>

            {error && <div className="login-error">[ ERR ] {error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="login-submit"
            >
              {loading ? (
                <>
                  <span className="login-submit__spinner" />
                  <span>ARRANCANDO…</span>
                </>
              ) : (
                <>
                  <ChevronRight size={16} strokeWidth={3} />
                  <span>ARRANCAR SESIÓN</span>
                </>
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
