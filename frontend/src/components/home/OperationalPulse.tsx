import { useQuery } from '@tanstack/react-query'
import { Wrench, Package, ClipboardList, AlertTriangle } from 'lucide-react'
import api from '../../api/client'
import { listInventoryRequests, listParts } from '../../api'

interface PulseWorkOrder {
  status: string
}

const ACTIVE_WO_STATUSES = ['received', 'in_progress', 'waiting_parts']

export function OperationalPulse() {
  const wosQuery = useQuery({
    queryKey: ['home-pulse', 'wos'],
    queryFn: () =>
      api
        .get<{ items: PulseWorkOrder[] }>('/work-orders', { params: { size: 100 } })
        .then((r) => r.data.items ?? [])
        .catch(() => [] as PulseWorkOrder[]),
    refetchInterval: 60_000,
  })

  const pendingReqQuery = useQuery({
    queryKey: ['home-pulse', 'requests-pending'],
    queryFn: () =>
      listInventoryRequests({ status: 'pending', page_size: 1 })
        .then((r) => r.total)
        .catch(() => 0),
    refetchInterval: 60_000,
  })

  const lowStockQuery = useQuery({
    queryKey: ['home-pulse', 'low-stock'],
    queryFn: () =>
      listParts({ only_low_stock: true, page_size: 1 })
        .then((r) => r.total)
        .catch(() => 0),
    refetchInterval: 60_000,
  })

  const activeOrders = (wosQuery.data ?? []).filter((o) => ACTIVE_WO_STATUSES.includes(o.status)).length
  const totalOrders = wosQuery.data?.length ?? 0

  const tiles = [
    {
      label: 'AUTOS EN TALLER',
      value: wosQuery.isLoading ? '—' : String(activeOrders),
      icon: Wrench,
    },
    {
      label: 'OS TOTAL',
      value: wosQuery.isLoading ? '—' : String(totalOrders),
      icon: ClipboardList,
    },
    {
      label: 'SOLICITUDES',
      value: pendingReqQuery.isLoading ? '—' : String(pendingReqQuery.data ?? 0),
      icon: Package,
    },
    {
      label: 'STOCK BAJO',
      value: lowStockQuery.isLoading ? '—' : String(lowStockQuery.data ?? 0),
      icon: AlertTriangle,
    },
  ]

  return (
    <section className="executive-panel">
      <div className="executive-panel__header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div>
          <p className="executive-panel__eyebrow">Operación en vivo</p>
          <h2 className="executive-panel__title">Pulso del taller</h2>
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: '0.55rem',
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--success)',
              boxShadow: '0 0 8px color-mix(in srgb, var(--success) 80%, transparent)',
              animation: 'heroPulse 2s ease-in-out infinite',
            }}
          />
          LIVE · 60s
        </span>
      </div>

      <div className="executive-kpi-rail">
        {tiles.map(({ label, value, icon: Icon }) => (
          <article key={label} className="executive-kpi" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span
              style={{
                display: 'inline-flex',
                width: '2.2rem',
                height: '2.2rem',
                borderRadius: 10,
                background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                color: 'var(--primary-dark)',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="executive-kpi__label">{label}</span>
              <strong className="executive-kpi__value" style={{ fontSize: '1.7rem' }}>{value}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
