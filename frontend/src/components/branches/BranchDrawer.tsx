import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, ClipboardList, Wrench, CheckCircle2, Users, DollarSign,
  Timer, PackageX, AlertTriangle, ExternalLink, ArrowRightLeft, MapPin,
} from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Button } from '../ui/Button'
import { useToast } from '../ui/ToastProvider'
import { useAuthStore } from '../../store/auth'
import { useBranch } from '../../hooks/useBranch'
import { GLOBAL_ROLES, type BranchStat } from '../../api/types'
import api from '../../api/client'
import { SEMAPHORE_HEX, SEMAPHORE_LABEL } from './colors'

interface BranchDrawerProps {
  branch: BranchStat | null
  onClose: () => void
}

interface WorkOrderLite {
  id: string
  order_number: string
  status: string
  priority?: string
  received_at?: string
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

const fmtHrs = (n: number) => (n > 0 ? `${n.toFixed(1)} h` : '—')

export function BranchDrawer({ branch, onClose }: BranchDrawerProps) {
  const user = useAuthStore((s) => s.user)
  const { activeBranch, switchTo } = useBranch()
  const toast = useToast()

  const open = Boolean(branch)
  const isGlobal = Boolean(user && GLOBAL_ROLES.includes(user.role))
  const isActive = Boolean(branch && activeBranch?.id === branch.branch_id)

  // Recent 5 work orders for this branch — uses X-Branch-Id header automatically
  // via client interceptor; we override per-request to scope to this branch.
  const recentQuery = useQuery({
    queryKey: ['branch-drawer-orders', branch?.branch_id],
    queryFn: async () => {
      if (!branch) return [] as WorkOrderLite[]
      try {
        const r = await api.get('/work-orders', {
          params: { size: 5 },
          headers: { 'X-Branch-Id': branch.branch_id },
        })
        const items = Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data) ? r.data : []
        return items as WorkOrderLite[]
      } catch {
        return [] as WorkOrderLite[]
      }
    },
    enabled: open,
    staleTime: 30_000,
  })

  const sem = branch?.semaphore ?? 'green'
  const semColor = SEMAPHORE_HEX[sem]

  const kpis = useMemo(
    () =>
      branch
        ? [
            {
              icon: ClipboardList,
              label: 'OS abiertas',
              value: branch.kpis.open_orders,
              color: 'var(--text)',
            },
            {
              icon: Wrench,
              label: 'En proceso',
              value: branch.kpis.in_progress,
              color: SEMAPHORE_HEX.green,
            },
            {
              icon: CheckCircle2,
              label: 'Finalizadas hoy',
              value: branch.kpis.finished_today,
              color: 'var(--text)',
            },
            {
              icon: Users,
              label: 'Mecánicos activos',
              value: branch.kpis.active_mechanics,
              color: 'var(--text)',
            },
            {
              icon: DollarSign,
              label: 'Ingresos hoy',
              value: fmtMoney(branch.kpis.revenue_today),
              color: SEMAPHORE_HEX.green,
            },
            {
              icon: Timer,
              label: 'Completion avg',
              value: fmtHrs(branch.kpis.avg_completion_hrs),
              color: 'var(--text)',
            },
            {
              icon: PackageX,
              label: 'Partes detenidas',
              value: branch.kpis.stalled_parts,
              color: branch.kpis.stalled_parts > 0 ? SEMAPHORE_HEX.amber : 'var(--text)',
            },
            {
              icon: AlertTriangle,
              label: 'Alertas',
              value: branch.kpis.alerts_count,
              color:
                branch.kpis.alerts_count > 3
                  ? SEMAPHORE_HEX.red
                  : branch.kpis.alerts_count > 0
                  ? SEMAPHORE_HEX.amber
                  : 'var(--text)',
            },
          ]
        : [],
    [branch],
  )

  const handleSwitch = async () => {
    if (!branch || !isGlobal || isActive) return
    try {
      await switchTo(branch.branch_id)
      toast.success('Contexto cambiado', { description: `${branch.code} · ${branch.name}` })
      onClose()
    } catch {
      toast.error('No se pudo cambiar de sede')
    }
  }

  if (!branch) return null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={branch.name}
      description={`${branch.code} · ${branch.city ?? ''}${branch.state ? `, ${branch.state}` : ''}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {isGlobal && !isActive && (
            <Button onClick={handleSwitch}>
              <ArrowRightLeft size={14} />
              Cambiar contexto
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Status badge */}
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-xl"
          style={{
            background: `color-mix(in srgb, ${semColor} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${semColor} 30%, transparent)`,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: semColor,
              boxShadow: `0 0 10px ${semColor}`,
              animation: branch.pulse ? 'bjxPulse 1.6s ease-out infinite' : undefined,
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
              Estado operativo
            </p>
            <p className="text-sm font-extrabold" style={{ color: semColor }}>
              {SEMAPHORE_LABEL[sem]}
              {branch.pulse ? ' · actividad en curso' : ''}
            </p>
          </div>
          <div
            className="text-[10px] font-bold uppercase flex items-center gap-1"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}
          >
            <MapPin size={11} />
            {branch.lat.toFixed(2)}, {branch.lng.toFixed(2)}
          </div>
        </div>

        {/* KPI grid 2x4 */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {kpis.map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              style={{
                padding: '0.75rem 0.8rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--surface-2) 55%, transparent)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minHeight: 78,
              }}
            >
              <span style={{ color: 'var(--text-faint)' }}>
                <Icon size={13} />
              </span>
              <p
                className="text-[9px] font-bold uppercase"
                style={{ color: 'var(--text-faint)', letterSpacing: '0.08em' }}
              >
                {label}
              </p>
              <p className="text-base font-extrabold" style={{ color }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Recent OS */}
        <section>
          <header className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
              OS recientes
            </h4>
            <a
              href={`/work-orders?branch_id=${branch.branch_id}`}
              className="text-[11px] font-bold inline-flex items-center gap-1"
              style={{ color: 'var(--primary)' }}
            >
              Ver todas <ExternalLink size={10} />
            </a>
          </header>
          {recentQuery.isLoading ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cargando…</p>
          ) : recentQuery.data && recentQuery.data.length > 0 ? (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0, padding: 0, listStyle: 'none' }}>
              {recentQuery.data.slice(0, 5).map((wo) => (
                <li
                  key={wo.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md text-xs"
                  style={{
                    border: '1px solid var(--border)',
                    background: 'color-mix(in srgb, var(--surface-2) 40%, transparent)',
                  }}
                >
                  <span className="font-extrabold font-mono" style={{ color: 'var(--text)' }}>
                    {wo.order_number}
                  </span>
                  <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>
                    {wo.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin OS recientes.</p>
          )}
        </section>

        {/* Mechanics activity placeholder */}
        <section
          style={{
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--border)',
            background: 'color-mix(in srgb, var(--surface-2) 30%, transparent)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Users size={13} style={{ color: 'var(--text-muted)' }} />
            <h4 className="text-xs font-extrabold uppercase" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
              Mecánicos activos
            </h4>
          </div>
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            <strong>{branch.kpis.active_mechanics}</strong> técnicos trabajando ahora mismo en esta sede.
          </p>
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            <Building2 size={10} style={{ display: 'inline', marginRight: 4 }} />
            {branch.code} · timezone America/Mexico_City
          </p>
        </section>
      </div>

      <style>{`
        @keyframes bjxPulse {
          0% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
          70% { box-shadow: 0 0 0 12px transparent; opacity: 0.4; }
          100% { box-shadow: 0 0 0 0 transparent; opacity: 1; }
        }
      `}</style>
    </Drawer>
  )
}
