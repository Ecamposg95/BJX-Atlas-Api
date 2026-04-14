import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import { useAuthStore } from '../store/auth'

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
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%)',
        }}
      />

      <div
        className="relative w-full max-w-sm mx-4 rounded-2xl p-8 space-y-7"
        style={{
          background: 'var(--surface)',
          border: '1px solid rgba(139,92,246,0.2)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.05)',
        }}
      >
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                boxShadow: '0 8px 32px rgba(139,92,246,0.4)',
              }}
            >
              <span className="text-white font-black text-2xl leading-none">B</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--text)' }}>
              BJX Atlas
            </h1>
            <p className="text-xs font-semibold uppercase tracking-widest mt-1"
               style={{ color: 'var(--text-faint)' }}>
              Plataforma de Cotizaciones
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-xs font-bold uppercase tracking-widest mb-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Correo
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@bjx.com"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-colors"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          <div>
            <label
              className="block text-xs font-bold uppercase tracking-widest mb-1.5"
              style={{ color: 'var(--text-muted)' }}
            >
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-colors"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)')}
              onBlur={e  => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <div
              className="rounded-xl px-3.5 py-2.5 text-sm font-medium"
              style={{
                background: 'rgba(251,113,133,0.1)',
                border: '1px solid rgba(251,113,133,0.25)',
                color: '#fda4af',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider text-white transition-all"
            style={{
              background: loading
                ? 'rgba(139,92,246,0.4)'
                : 'linear-gradient(135deg, #7c3aed, #8b5cf6)',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(139,92,246,0.3)',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-[10px] uppercase tracking-widest"
           style={{ color: 'var(--text-faint)' }}>
          BJX Motors × Brame · Synet Group
        </p>
      </div>
    </div>
  )
}
