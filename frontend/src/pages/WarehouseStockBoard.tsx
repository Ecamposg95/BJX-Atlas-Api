/**
 * Tablero semáforo de stock por sucursal.
 * Mobile-first; consume /inventory/stock-board.
 */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, PackageX, AlertTriangle, PackageCheck, Boxes } from 'lucide-react'
import { getStockBoard } from '../api'
import type { StockBoardResponse, StockStatus } from '../api/types'
import { MobileShell } from '../components/mobile/MobileShell'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { useBranch } from '../hooks/useBranch'

type FilterKey = 'all' | StockStatus

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'Todos',
  ok: 'OK',
  warn: 'Bajo',
  critical: 'Crítico',
}

const STATUS_BADGE: Record<StockStatus, { label: string; cls: string; dot: string }> = {
  ok:       { label: 'OK',       cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
  warn:     { label: 'Bajo',     cls: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',         dot: 'bg-amber-500' },
  critical: { label: 'Crítico',  cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',                 dot: 'bg-red-500' },
}

export function WarehouseStockBoardPage() {
  const { activeBranch } = useBranch()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const boardQuery = useQuery<StockBoardResponse>({
    queryKey: ['warehouse', 'stock-board', filter, debounced],
    queryFn: () => getStockBoard({
      status: filter === 'all' ? undefined : filter,
      search: debounced || undefined,
      limit: 200,
    }),
    refetchInterval: 60_000,
  })

  const items = boardQuery.data?.items ?? []
  const counts = boardQuery.data?.counts ?? { ok: 0, warn: 0, critical: 0 }
  const total = counts.ok + counts.warn + counts.critical

  return (
    <MobileShell
      title="Stock-board"
      subtitle={activeBranch?.name ?? 'Sin sucursal'}
    >
      <section
        className="-mx-4 px-4 mb-4 flex gap-3 overflow-x-auto snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible"
        aria-label="Resumen semáforo"
      >
        <KpiCard icon={<Boxes size={18} />} label="Total" value={total} tone="slate" />
        <KpiCard icon={<PackageCheck size={18} />} label="OK" value={counts.ok} tone="emerald" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Bajo" value={counts.warn} tone="amber" />
        <KpiCard icon={<PackageX size={18} />} label="Crítico" value={counts.critical} tone="red" />
      </section>

      <div className="relative mb-3">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--text-faint)' }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por SKU o nombre..."
          className="w-full min-h-12 pl-10 pr-3 py-2 rounded-xl border-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
        />
      </div>

      <div
        role="tablist"
        aria-label="Filtrar por estado"
        className="flex gap-2 mb-3 overflow-x-auto pb-1"
      >
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
          const isActive = filter === key
          const count = key === 'all' ? total : counts[key]
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setFilter(key)}
              className={
                'inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all ' +
                (isActive
                  ? 'bg-amber-400 text-slate-900 shadow-sm'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200')
              }
            >
              {FILTER_LABELS[key]}
              <span
                className={
                  'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums ' +
                  (isActive ? 'bg-slate-900/15 text-slate-900' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200')
                }
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 pb-6">
        {boardQuery.isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Boxes size={26} />}
            title="Sin refacciones en esta vista"
            description={debounced ? 'No hay coincidencias para tu búsqueda.' : 'No hay refacciones en este estado.'}
          />
        ) : (
          items.map((it) => (
            <StockRow key={it.part_id} item={it} />
          ))
        )}
      </div>
    </MobileShell>
  )
}

interface StockRowProps {
  item: import('../api/types').StockBoardItem
}

function StockRow({ item }: StockRowProps) {
  const cfg = STATUS_BADGE[item.status]
  return (
    <article
      className="w-full rounded-2xl border bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <span
        aria-hidden
        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`}
      />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>
            {item.sku}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
            {cfg.label}
          </span>
        </div>
        <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
          {item.name}
        </p>
        <p className="text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
          Disponible <strong style={{ color: 'var(--text)' }}>{fmt(item.available)}</strong>
          <span className="opacity-60"> {item.unit} </span>
          · Mínimo {fmt(item.min_stock)}
          {item.reserved > 0 && <> · Reservado {fmt(item.reserved)}</>}
        </p>
      </div>
      <div className="text-right flex-shrink-0 tabular-nums">
        <strong className="block text-base font-extrabold" style={{ color: 'var(--text)' }}>
          {fmt(item.available)}
        </strong>
        <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-faint)' }}>
          {item.unit}
        </span>
      </div>
    </article>
  )
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2).replace(/\.?0+$/, '')
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'red' | 'slate'
}

function KpiCard({ icon, label, value, tone }: KpiCardProps) {
  const toneClasses: Record<KpiCardProps['tone'], string> = {
    emerald: 'border-emerald-300/60 bg-emerald-50 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300',
    amber:   'border-amber-300/60 bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300',
    red:     'border-red-300/60 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
    slate:   'border-slate-300/60 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200',
  }
  return (
    <article
      className={
        'snap-start flex-shrink-0 min-w-[140px] rounded-2xl border-2 px-4 py-3 flex flex-col gap-1 ' +
        toneClasses[tone]
      }
    >
      <div className="inline-flex items-center gap-2 text-[0.7rem] uppercase font-bold tracking-wider opacity-80">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <strong className="text-2xl font-black tabular-nums leading-none">{value}</strong>
    </article>
  )
}
