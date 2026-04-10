import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../store/auth'

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated()) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
