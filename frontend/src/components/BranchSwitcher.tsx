import { useEffect, useMemo, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronDown, Check, Search, Lock } from 'lucide-react'
import { clsx } from 'clsx'
import { listBranches } from '../api'
import { useAuthStore } from '../store/auth'
import { useBranchStore } from '../store/branch'
import { GLOBAL_ROLES, type Branch } from '../api/types'
import { useToast } from './ui/ToastProvider'
import { useBranch } from '../hooks/useBranch'

interface BranchSwitcherProps {
  collapsed?: boolean
  className?: string
}

export function BranchSwitcher({ collapsed = false, className }: BranchSwitcherProps) {
  const user = useAuthStore((s) => s.user)
  const setBranches = useBranchStore((s) => s.setBranches)
  const { activeBranch, branches, switchTo } = useBranch()
  const toast = useToast()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const isGlobal = Boolean(user && GLOBAL_ROLES.includes(user.role))
  const isReadonly = !isGlobal

  const { data } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: listBranches,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (data) setBranches(data)
  }, [data, setBranches])

  const filtered = useMemo<Branch[]>(() => {
    const term = search.trim().toLowerCase()
    if (!term) return branches
    return branches.filter(
      (b) =>
        b.code.toLowerCase().includes(term) ||
        b.name.toLowerCase().includes(term) ||
        (b.city ?? '').toLowerCase().includes(term),
    )
  }, [branches, search])

  const handleSelect = async (branchId: string) => {
    if (branchId === activeBranch?.id) {
      setOpen(false)
      return
    }
    setSwitchingId(branchId)
    try {
      await switchTo(branchId)
      const target = branches.find((b) => b.id === branchId)
      toast.success('Sede actualizada', {
        description: target ? `${target.code} · ${target.name}` : undefined,
      })
      setOpen(false)
    } catch {
      toast.error('No se pudo cambiar de sede', {
        description: 'Verifica tu conexión o permisos e intenta de nuevo.',
      })
    } finally {
      setSwitchingId(null)
    }
  }

  if (!user) return null

  const triggerLabel = activeBranch
    ? { code: activeBranch.code, name: activeBranch.name }
    : { code: '—', name: 'Sin sede asignada' }

  // Readonly mode: render as static chip
  if (isReadonly) {
    return (
      <div
        className={clsx('inline-flex items-center gap-2.5', className)}
        style={{
          minWidth: 0,
          padding: collapsed ? '0.45rem' : '0.55rem 0.85rem',
          borderRadius: collapsed ? '12px' : '14px',
          border: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--surface-2) 70%, transparent)',
          color: 'var(--text)',
        }}
        title={`${triggerLabel.code} · ${triggerLabel.name}`}
      >
        <span
          className="inline-flex items-center justify-center"
          style={{
            width: '1.6rem',
            height: '1.6rem',
            borderRadius: '8px',
            background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
            color: 'var(--primary-dark)',
            flexShrink: 0,
          }}
        >
          <Building2 size={14} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[0.62rem] font-extrabold"
              style={{
                color: 'var(--text-faint)',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              Sede asignada
            </p>
            <p
              className="truncate text-xs font-bold"
              style={{ color: 'var(--text)' }}
            >
              {triggerLabel.code} · {triggerLabel.name}
            </p>
          </div>
        )}
        <Lock size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
      </div>
    )
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={clsx(
            'inline-flex items-center gap-2.5 transition-colors focus:outline-none',
            className,
          )}
          style={{
            minWidth: 0,
            padding: collapsed ? '0.45rem' : '0.55rem 0.85rem',
            borderRadius: collapsed ? '12px' : '14px',
            border: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
          title={`${triggerLabel.code} · ${triggerLabel.name}`}
        >
          <span
            className="inline-flex items-center justify-center"
            style={{
              width: '1.6rem',
              height: '1.6rem',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--primary) 14%, transparent)',
              color: 'var(--primary-dark)',
              flexShrink: 0,
            }}
          >
            <Building2 size={14} />
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 text-left">
                <p
                  className="truncate text-[0.62rem] font-extrabold"
                  style={{
                    color: 'var(--text-faint)',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  Sede activa
                </p>
                <p
                  className="truncate text-xs font-bold"
                  style={{ color: 'var(--text)' }}
                >
                  {triggerLabel.code} · {triggerLabel.name}
                </p>
              </div>
              <ChevronDown
                size={14}
                style={{
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  transition: 'transform var(--duration-fast) var(--ease-premium)',
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          style={{
            zIndex: 60,
            minWidth: '280px',
            maxWidth: '360px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
            boxShadow: 'var(--shadow-lg)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: '0.65rem',
            animation: 'branchMenuIn var(--duration-fast) var(--ease-premium)',
          }}
        >
          <div
            className="flex items-center gap-2 rounded-xl px-2.5 py-2"
            style={{
              border: '1px solid var(--border)',
              background: 'color-mix(in srgb, var(--surface-2) 80%, transparent)',
            }}
          >
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar sede…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-transparent text-sm focus:outline-none"
              style={{ color: 'var(--text)' }}
            />
          </div>

          <div
            className="mt-2 max-h-72 overflow-y-auto pr-1"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
          >
            {filtered.length === 0 && (
              <p
                className="px-3 py-4 text-center text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                Sin coincidencias.
              </p>
            )}
            {filtered.map((b) => {
              const isActive = b.id === activeBranch?.id
              const isLoading = switchingId === b.id
              return (
                <DropdownMenu.Item
                  key={b.id}
                  onSelect={(e) => {
                    e.preventDefault()
                    handleSelect(b.id)
                  }}
                  disabled={isLoading}
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors focus:outline-none"
                  style={{
                    cursor: isLoading ? 'wait' : 'pointer',
                    background: isActive
                      ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                      : 'transparent',
                    border: '1px solid transparent',
                    color: 'var(--text)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background =
                        'color-mix(in srgb, var(--primary) 7%, transparent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: '1.4rem',
                      height: '1.4rem',
                      borderRadius: '6px',
                      background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                      color: 'var(--primary-dark)',
                      flexShrink: 0,
                    }}
                  >
                    <Building2 size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-bold"
                      style={{ color: 'var(--text)' }}
                    >
                      {b.code} · {b.name}
                    </p>
                    {b.city && (
                      <p
                        className="truncate text-[0.68rem]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {b.city}
                        {b.state ? `, ${b.state}` : ''}
                      </p>
                    )}
                  </div>
                  {isLoading ? (
                    <span
                      className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                      style={{ color: 'var(--primary)', flexShrink: 0 }}
                    />
                  ) : isActive ? (
                    <Check
                      size={14}
                      style={{ color: 'var(--primary)', flexShrink: 0 }}
                    />
                  ) : null}
                </DropdownMenu.Item>
              )
            })}
          </div>

          <style>{`
            @keyframes branchMenuIn {
              from { opacity: 0; transform: translateY(-4px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
