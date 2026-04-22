import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '../store/auth'
import { ThemeToggle } from './ThemeToggle'

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated()) return <Navigate to="/login" replace />

  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-250 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar
          collapsed={false}
          onToggle={() => setMobileOpen(false)}
          onNavClick={() => setMobileOpen(false)}
        />
      </div>

      <div className="app-frame">
        {/* Mobile header */}
        <header className="mobile-frame-header md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-full p-2 transition-colors"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            aria-label="Abrir menú"
          >
            <Menu size={18} />
          </button>
          <div className="mobile-frame-brand">
            <span className="mobile-frame-brand__eyebrow">Centro ejecutivo</span>
            <span className="mobile-frame-brand__title">BJX Atlas</span>
            {user && <span className="mobile-frame-brand__meta">{user.email}</span>}
          </div>
          <ThemeToggle />
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
