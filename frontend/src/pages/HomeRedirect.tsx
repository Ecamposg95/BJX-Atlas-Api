import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import type { Role } from '../api/types'

/**
 * Mapeo rol → home natural. Se actualiza junto con `Sidebar.tsx` y
 * `context/PRODUCT.md` §2.
 */
const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  director: '/executive',
  gerente_sede: '/manager',
  jefe_taller: '/workshop',
  recepcion: '/advisor',
  mecanico: '/mechanic',
  almacen: '/warehouse',
  cliente_corp: '/client-corp',
  operador: '/quotes',
  viewer: '/dashboard',
}

/**
 * HomeRedirect — entry point que redirige al home natural de cada rol.
 *
 * Renderizado en `/home`. No tiene UI propio; emite `<Navigate replace>`
 * inmediatamente. Si el usuario no esta autenticado, el `Layout` ya lo
 * mando al /login antes de llegar aqui.
 */
export function HomeRedirect() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  const target = ROLE_HOME[user.role] ?? '/dashboard'
  return <Navigate to={target} replace />
}
