import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, register, updateUser, deactivateUser } from '../api'
import type { UserRead } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', operador: 'Operador', viewer: 'Viewer',
}

// ── Modal ─────────────────────────────────────────────────────────────────────
type ModalMode = 'create' | 'edit'

interface ModalProps {
  mode: ModalMode
  user?: UserRead
  onClose: () => void
  onSaved: () => void
}

function UserModal({ mode, user, onClose, onSaved }: ModalProps) {
  const [email, setEmail]       = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState(user?.role ?? 'viewer')
  const [active, setActive]     = useState(user?.active ?? true)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const qc = useQueryClient()

  const submit = async () => {
    setError('')
    if (!email.trim()) return setError('El correo es requerido')
    if (mode === 'create' && password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    if (mode === 'create' && !/\d/.test(password)) return setError('La contraseña debe contener al menos un número')
    setLoading(true)
    try {
      if (mode === 'create') {
        await register({ email: email.trim(), password, role })
      } else {
        await updateUser(user!.id, { role, active })
      }
      qc.invalidateQueries({ queryKey: ['users'] })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>
            {mode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="text-xl leading-none transition-colors hover:opacity-80">&times;</button>
        </div>

        <div className="space-y-4">
          {mode === 'create' && (
            <>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="usuario@bjx.mx"
                />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Mínimo 8 caracteres con números"
                />
              </div>
            </>
          )}
          {mode === 'edit' && (
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
          )}

          <div>
            <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRead['role'])}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            >
              <option value="viewer">Viewer — solo lectura</option>
              <option value="operador">Operador — puede crear cotizaciones</option>
              <option value="admin">Admin — acceso total</option>
            </select>
          </div>

          {mode === 'edit' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                style={{ background: active ? 'var(--primary)' : 'var(--surface-2)' }}
              >
                <span
                  className="pointer-events-none inline-block h-4 w-4 transform rounded-full shadow ring-0 transition duration-200 ease-in-out"
                  style={{ background: '#fff', transform: active ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)' }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={loading}>
            {loading ? 'Guardando…' : mode === 'create' ? 'Crear usuario' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Row skeleton ──────────────────────────────────────────────────────────────
function RowSkeleton() {
  return (
    <tr>
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-5 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

// ── Admin Page ────────────────────────────────────────────────────────────────
export function AdminPage() {
  const qc = useQueryClient()
  const [modal, setModal]   = useState<{ mode: ModalMode; user?: UserRead } | null>(null)
  const [confirm, setConfirm] = useState<UserRead | null>(null)

  const usersQuery = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const users = usersQuery.data ?? []

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Administración</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Gestión de usuarios y accesos
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setModal({ mode: 'create' })}>
          + Nuevo usuario
        </Button>
      </div>

      {/* Error */}
      {usersQuery.isError && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
          Error cargando usuarios.
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-x-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-5 py-3 text-left">Correo</th>
              <th className="px-5 py-3 text-left">Rol</th>
              <th className="px-5 py-3 text-center">Estado</th>
              <th className="px-5 py-3 text-center">Creado</th>
              <th className="px-5 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usersQuery.isLoading
              ? Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
              : users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 font-medium" style={{ color: 'var(--text)' }}>{u.email}</td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                        style={{
                          background: u.role === 'admin' ? 'color-mix(in srgb, var(--primary) 18%, transparent)' : u.role === 'operador' ? 'color-mix(in srgb, #4f8df7 16%, transparent)' : 'color-mix(in srgb, var(--text-faint) 16%, transparent)',
                          color: u.role === 'admin' ? 'var(--primary-dark)' : u.role === 'operador' ? '#4f8df7' : 'var(--text-muted)',
                        }}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Badge variant={u.active ? 'ok' : 'cancelled'}>
                        {u.active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-center" style={{ color: 'var(--text-muted)' }}>
                      {fmtDate(u.created_at)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setModal({ mode: 'edit', user: u })}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary-dark)' }}
                        >
                          Editar
                        </button>
                        {u.active && (
                          <button
                            onClick={() => setConfirm(u)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                            style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
                          >
                            Desactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {!usersQuery.isLoading && users.length === 0 && (
          <p className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No hay usuarios registrados
          </p>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}

      {/* Deactivate confirm */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-black text-base" style={{ color: 'var(--text)' }}>Desactivar usuario</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              ¿Desactivar a <strong style={{ color: 'var(--text)' }}>{confirm.email}</strong>?
              No podrá iniciar sesión pero sus datos se conservan.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancelar</Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  deactivateMut.mutate(confirm.id)
                  setConfirm(null)
                }}
              >
                Desactivar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
