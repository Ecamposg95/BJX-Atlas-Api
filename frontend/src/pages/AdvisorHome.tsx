/**
 * Home del Asesor de Recepción (US-09) — mobile-first.
 *
 * KPIs del día, lista de últimas OS recibidas, CTA para nuevo check-in.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, ChevronRight, Car, Clock, ClipboardCheck } from 'lucide-react'
import api from '@/api/client'
import { MobileShell } from '@/components/mobile/MobileShell'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/hooks/useAuth'
import { useBranchStore } from '@/store/branch'

interface WorkOrderItem {
  id: string
  order_number: string
  status: string
  received_at: string
  vehicle_summary?: { plates?: string | null; customer_name?: string | null; brand?: string | null; model?: string | null }
  service_name?: string
}

interface Paginated<T> {
  items: T[]
  total: number
  page: number
  size: number
}

function STATUS_LABEL(s: string): string {
  return (
    {
      received: 'Recibido',
      assigned: 'Asignado',
      in_progress: 'En proceso',
      waiting_parts: 'Esp. refacciones',
      quality_check: 'Calidad',
      completed: 'Listo',
      delivered: 'Entregado',
      cancelled: 'Cancelado',
    } as Record<string, string>
  )[s] ?? s
}

function STATUS_COLOR(s: string): string {
  return (
    {
      received: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
      assigned: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
      in_progress: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      waiting_parts: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
      quality_check: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
      delivered: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    } as Record<string, string>
  )[s] ?? 'bg-slate-100 text-slate-700'
}

function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function AdvisorHomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const activeBranch = useBranchStore((s) => s.getActiveBranch())

  const recentQuery = useQuery({
    queryKey: ['advisor-recent-orders'],
    queryFn: async (): Promise<WorkOrderItem[]> => {
      const r = await api.get<Paginated<WorkOrderItem>>('/work-orders', {
        params: { size: 20, page: 1 },
      })
      return Array.isArray(r.data?.items) ? r.data.items : []
    },
  })

  const kpis = useMemo(() => {
    const items = recentQuery.data ?? []
    const todayItems = items.filter((it) => isToday(it.received_at))
    const todayCount = todayItems.length
    const openCount = items.filter(
      (it) => !['delivered', 'cancelled', 'completed'].includes(it.status),
    ).length
    const waits = todayItems
      .map((it) => minutesBetween(it.received_at, new Date().toISOString()))
      .slice(0, 10)
    const avgWait = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0
    return { todayCount, openCount, avgWait }
  }, [recentQuery.data])

  const list = (recentQuery.data ?? []).slice(0, 10)
  const advisorName = user?.email?.split('@')[0] ?? 'Asesor'

  return (
    <MobileShell
      title={`Hola, ${advisorName}`}
      subtitle={activeBranch?.name ?? 'Recepción'}
      headerAction={
        <button
          type="button"
          onClick={() => navigate('/advisor/check-in')}
          className="min-h-12 inline-flex items-center gap-1.5 rounded-full bg-amber-400 text-slate-900 px-3 py-2 text-xs font-extrabold shadow-md shadow-amber-400/30"
          aria-label="Nuevo check-in"
        >
          <Plus size={16} /> Check-in
        </button>
      }
    >
      {/* KPI row */}
      <section className="grid grid-cols-3 gap-2.5" aria-label="Indicadores del día">
        <KpiCard icon={<ClipboardCheck size={18} />} label="Check-ins hoy" value={kpis.todayCount} accent="amber" />
        <KpiCard icon={<Car size={18} />} label="OS abiertas" value={kpis.openCount} accent="sky" />
        <KpiCard icon={<Clock size={18} />} label="Espera prom." value={`${kpis.avgWait}m`} accent="slate" />
      </section>

      {/* Big CTA */}
      <button
        type="button"
        onClick={() => navigate('/advisor/check-in')}
        className="mt-5 w-full min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 text-slate-900 px-5 py-4 text-base font-extrabold tracking-wide shadow-xl shadow-amber-400/30 active:scale-[0.99] transition-all"
      >
        <Plus size={22} /> Nuevo check-in
      </button>

      {/* Listado */}
      <section className="mt-6" aria-labelledby="recent-orders-heading">
        <header className="flex items-center justify-between mb-2">
          <h2 id="recent-orders-heading" className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
            Últimas OS
          </h2>
        </header>

        {recentQuery.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}

        {recentQuery.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">No se pudieron cargar las órdenes.</p>
        )}

        {!recentQuery.isLoading && !recentQuery.isError && list.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No hay órdenes recientes. Crea el primer check-in del día.
          </p>
        )}

        <ul className="space-y-2">
          {list.map((wo) => (
            <li key={wo.id}>
              <button
                type="button"
                onClick={() => navigate(`/workshop/board?wo=${wo.id}`)}
                className="w-full text-left rounded-xl border bg-white dark:bg-slate-900 px-3 py-3 flex items-center gap-3 active:scale-[0.99] transition-all min-h-16"
                style={{ borderColor: 'var(--border)' }}
              >
                <div
                  className="h-10 w-10 flex-shrink-0 rounded-xl bg-amber-400/15 text-amber-700 dark:text-amber-300 flex items-center justify-center font-extrabold text-sm"
                  aria-hidden="true"
                >
                  {wo.vehicle_summary?.plates?.slice(0, 3) ?? '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                    {wo.vehicle_summary?.plates ?? wo.order_number}
                    <span className="ml-2 font-medium" style={{ color: 'var(--text-muted)' }}>
                      {wo.vehicle_summary?.customer_name ?? ''}
                    </span>
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {wo.service_name ?? '—'}
                  </p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2 py-1 text-[0.65rem] font-bold ${STATUS_COLOR(wo.status)}`}>
                  {STATUS_LABEL(wo.status)}
                </span>
                <ChevronRight size={18} className="text-slate-400 flex-shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </MobileShell>
  )
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  accent: 'amber' | 'sky' | 'slate'
}

function KpiCard({ icon, label, value, accent }: KpiCardProps) {
  const accents: Record<KpiCardProps['accent'], string> = {
    amber: 'bg-amber-400/10 text-amber-700 dark:text-amber-300 border-amber-400/40',
    sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
    slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30',
  }
  return (
    <div className={`rounded-2xl border ${accents[accent]} p-3 flex flex-col gap-1`}>
      <div className="opacity-90">{icon}</div>
      <p className="text-2xl font-extrabold leading-none tracking-tight" style={{ color: 'var(--text)' }}>
        {value}
      </p>
      <p className="text-[0.65rem] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
    </div>
  )
}
