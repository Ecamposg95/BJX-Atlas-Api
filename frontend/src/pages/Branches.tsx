import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Edit2, MapPinned, Wrench, AlertTriangle, DollarSign, Settings,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import api from '../api/client'
import { listBranches, getBranchStats } from '../api'
import type { Branch, BranchMetric, BranchStat } from '../api/types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { FormField } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { TableSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/ToastProvider'
import { useAuthStore } from '../store/auth'
import { MexicoMap } from '../components/branches/MexicoMap'
import { ModeToggle } from '../components/branches/ModeToggle'
import { BranchRanking } from '../components/branches/BranchRanking'
import { BranchDrawer } from '../components/branches/BranchDrawer'
import { SEMAPHORE_HEX } from '../components/branches/colors'

// ── CRUD helpers (preserved from original) ──────────────────────────────────
const createBranchApi = (data: BranchPayload) =>
  api.post<Branch>('/branches', data).then((r) => r.data)

const updateBranchApi = (id: string, data: Partial<BranchPayload>) =>
  api.put<Branch>(`/branches/${id}`, data).then((r) => r.data)

interface BranchPayload {
  code: string
  name: string
  address?: string
  city?: string
  state?: string
  timezone?: string
  phone?: string
  active?: boolean
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n)

export function BranchesPage() {
  const user = useAuthStore((s) => s.user)
  const canManage = user && (user.role === 'admin' || user.role === 'director')
  const canView = user && ['admin', 'director', 'gerente_sede', 'viewer'].includes(user.role)

  const [metric, setMetric] = useState<BranchMetric>('operation')
  const [selected, setSelected] = useState<BranchStat | null>(null)
  const [crudModalOpen, setCrudModalOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)

  const statsQuery = useQuery({
    queryKey: ['branch-stats', metric],
    queryFn: () => getBranchStats({ metric }),
    enabled: Boolean(canView),
    refetchInterval: 30_000,
  })

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: listBranches,
    enabled: Boolean(canManage),
  })

  const stats = useMemo<BranchStat[]>(
    () => (Array.isArray(statsQuery.data) ? statsQuery.data : []),
    [statsQuery.data],
  )

  // Global aggregated KPIs
  const totals = useMemo(() => {
    if (stats.length === 0) {
      return { sedes: 0, os: 0, revenue: 0, alerts: 0, in_progress: 0 }
    }
    return stats.reduce(
      (acc, b) => ({
        sedes: acc.sedes + 1,
        os: acc.os + b.kpis.open_orders,
        revenue: acc.revenue + b.kpis.revenue_today,
        alerts: acc.alerts + b.kpis.alerts_count,
        in_progress: acc.in_progress + b.kpis.in_progress,
      }),
      { sedes: 0, os: 0, revenue: 0, alerts: 0, in_progress: 0 },
    )
  }, [stats])

  if (!canView) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={<Building2 size={28} />}
          title="Acceso restringido"
          description="Esta vista está disponible para administradores, directores y gerentes de sede."
        />
      </div>
    )
  }

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Operación Nacional"
        title="BJX Motors · México"
        description="10 sedes en vivo. Pulsa un pin del mapa para ver la salud operativa de cada sucursal."
        actions={
          <div className="flex items-center gap-2">
            <ModeToggle value={metric} onChange={setMetric} />
            {canManage && (
              <Button variant="secondary" onClick={() => { setEditing(null); setCrudModalOpen(true) }}>
                <Settings size={14} /> Gestión
              </Button>
            )}
          </div>
        }
      />

      {/* Racing accent line */}
      <div
        aria-hidden
        style={{
          height: 3,
          borderRadius: 999,
          background:
            'linear-gradient(90deg, transparent 0%, #FBBF24 25%, #1E293B 50%, #DC2626 75%, transparent 100%)',
          opacity: 0.55,
        }}
      />

      {/* Global KPI strip */}
      <section
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <KpiTile icon={Building2} label="Sedes activas" value={String(totals.sedes)} accent="#FBBF24" />
        <KpiTile icon={Wrench} label="OS abiertas" value={String(totals.os)} accent={SEMAPHORE_HEX.green} />
        <KpiTile icon={DollarSign} label="Ingresos hoy" value={fmtMoney(totals.revenue)} accent={SEMAPHORE_HEX.green} />
        <KpiTile
          icon={AlertTriangle}
          label="Alertas globales"
          value={String(totals.alerts)}
          accent={totals.alerts > 0 ? SEMAPHORE_HEX.amber : SEMAPHORE_HEX.green}
        />
      </section>

      {/* Main grid: Map + Ranking */}
      <section
        className="grid gap-4"
        style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}
      >
        <div className="executive-panel" style={{ padding: '1rem 1rem 0.6rem' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPinned size={14} style={{ color: 'var(--primary)' }} />
              <h2 className="text-sm font-extrabold uppercase" style={{ color: 'var(--text)', letterSpacing: '0.08em' }}>
                Mapa Nacional
              </h2>
            </div>
            <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
              {statsQuery.isFetching ? 'Actualizando…' : 'Live · 30s'}
            </span>
          </div>
          {statsQuery.isLoading ? (
            <div style={{ height: 540, display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
              Cargando telemetría…
            </div>
          ) : (
            <MexicoMap
              branches={stats}
              metric={metric}
              onBranchClick={(b) => setSelected(b)}
              selectedBranchId={selected?.branch_id}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <BranchRanking
            branches={stats}
            metric={metric}
            onSelect={(b) => setSelected(b)}
            selectedId={selected?.branch_id}
          />
          <AlertsByBranchChart branches={stats} />
        </div>
      </section>

      {/* Bottom row charts */}
      <section
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        <RevenueByBranchChart branches={stats} />
        <InProgressByBranchChart branches={stats} />
        <MechanicsDonut branches={stats} />
      </section>

      <BranchDrawer branch={selected} onClose={() => setSelected(null)} />

      {crudModalOpen && (
        <BranchCrudModal
          branches={branchesQuery.data ?? []}
          loading={branchesQuery.isLoading}
          editing={editing}
          onEdit={(b) => setEditing(b)}
          onClose={() => { setCrudModalOpen(false); setEditing(null) }}
        />
      )}
    </PageShell>
  )
}

// ── Sub: KPI tile ──────────────────────────────────────────────────────────
function KpiTile({
  icon: Icon, label, value, accent,
}: {
  icon: typeof Building2
  label: string
  value: string
  accent: string
}) {
  return (
    <div
      className="executive-panel"
      style={{
        padding: '1rem 1.1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: 3, height: '100%',
          background: accent,
        }}
      />
      <div className="flex items-center gap-2">
        <span style={{ color: accent }}>
          <Icon size={14} />
        </span>
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}
        >
          {label}
        </span>
      </div>
      <p
        className="font-extrabold"
        style={{ color: 'var(--text)', fontSize: 'clamp(1.25rem, 2vw, 1.65rem)' }}
      >
        {value}
      </p>
    </div>
  )
}

// ── Sub: Revenue chart ─────────────────────────────────────────────────────
function RevenueByBranchChart({ branches }: { branches: BranchStat[] }) {
  const data = branches.map((b) => ({
    code: b.code.replace('BJX-', ''),
    Ingresos: b.kpis.revenue_today,
  }))
  return (
    <div className="executive-panel" style={{ padding: '1.1rem 1.25rem', minHeight: 240 }}>
      <h3 className="text-xs font-extrabold uppercase mb-3" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
        Ingresos por sede (hoy)
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <XAxis dataKey="code" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <YAxis hide />
          <RTooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(v) => fmtMoney(Number(v))}
          />
          <Bar dataKey="Ingresos" fill="#FBBF24" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Sub: in-progress trend (sparkline-style) ───────────────────────────────
function InProgressByBranchChart({ branches }: { branches: BranchStat[] }) {
  const data = branches.map((b) => ({
    code: b.code.replace('BJX-', ''),
    OS: b.kpis.in_progress + b.kpis.open_orders,
  }))
  return (
    <div className="executive-panel" style={{ padding: '1.1rem 1.25rem', minHeight: 240 }}>
      <h3 className="text-xs font-extrabold uppercase mb-3" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
        Carga operativa por sede
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <XAxis dataKey="code" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
          <YAxis hide />
          <RTooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 11,
            }}
          />
          <Line type="monotone" dataKey="OS" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: '#10B981' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Sub: alerts by branch ──────────────────────────────────────────────────
function AlertsByBranchChart({ branches }: { branches: BranchStat[] }) {
  const data = branches.map((b) => ({
    code: b.code.replace('BJX-', ''),
    Alertas: b.kpis.alerts_count,
  }))
  const hasAny = data.some((d) => d.Alertas > 0)
  return (
    <div className="executive-panel" style={{ padding: '1.1rem 1.25rem', minHeight: 180 }}>
      <h3 className="text-xs font-extrabold uppercase mb-3" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
        Alertas por sede
      </h3>
      {hasAny ? (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data}>
            <XAxis dataKey="code" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <YAxis hide />
            <RTooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Bar dataKey="Alertas" fill="#F59E0B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Sin alertas activas en ninguna sede.
        </p>
      )}
    </div>
  )
}

// ── Sub: mechanics donut ──────────────────────────────────────────────────
function MechanicsDonut({ branches }: { branches: BranchStat[] }) {
  const data = branches
    .filter((b) => b.kpis.active_mechanics > 0)
    .map((b) => ({ name: b.code.replace('BJX-', ''), value: b.kpis.active_mechanics }))
  const colors = ['#FBBF24', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16', '#F97316']
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="executive-panel" style={{ padding: '1.1rem 1.25rem', minHeight: 240 }}>
      <h3 className="text-xs font-extrabold uppercase mb-3" style={{ color: 'var(--text-faint)', letterSpacing: '0.1em' }}>
        Mecánicos activos
      </h3>
      {total > 0 ? (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <RTooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 11,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Sin mecánicos activos ahora mismo.
        </p>
      )}
    </div>
  )
}

// ── Sub: CRUD Modal ────────────────────────────────────────────────────────
function BranchCrudModal({
  branches, loading, editing, onEdit, onClose,
}: {
  branches: Branch[]
  loading: boolean
  editing: Branch | null
  onEdit: (b: Branch | null) => void
  onClose: () => void
}) {
  const [formOpen, setFormOpen] = useState(Boolean(editing))

  return (
    <Modal open onClose={onClose} title="Gestión de sucursales" size="lg">
      {formOpen ? (
        <BranchFormInline
          branch={editing}
          onDone={() => { setFormOpen(false); onEdit(null) }}
          onCancel={() => { setFormOpen(false); onEdit(null) }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button onClick={() => { onEdit(null); setFormOpen(true) }}>
              <Plus size={14} /> Nueva sucursal
            </Button>
          </div>
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : branches.length === 0 ? (
            <EmptyState icon={<Building2 size={28} />} title="Sin sucursales" description="Crea la primera sucursal." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Código</th>
                    <th className="text-left">Nombre</th>
                    <th className="text-left">Ciudad</th>
                    <th className="text-left">Estado</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr key={b.id}>
                      <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{b.code}</td>
                      <td className="font-semibold" style={{ color: 'var(--text)' }}>{b.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{b.city ?? '—'}</td>
                      <td>
                        <Badge variant={b.active ? 'ok' : 'cancelled'}>{b.active ? 'Activa' : 'Inactiva'}</Badge>
                      </td>
                      <td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { onEdit(b); setFormOpen(true) }}>
                          <Edit2 size={12} /> Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function BranchFormInline({
  branch, onDone, onCancel,
}: {
  branch: Branch | null
  onDone: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = !!branch

  const [form, setForm] = useState<BranchPayload>({
    code: branch?.code ?? '',
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    state: branch?.state ?? '',
    timezone: branch?.timezone ?? 'America/Mexico_City',
    phone: branch?.phone ?? '',
    active: branch?.active ?? true,
  })

  const mutation = useMutation({
    mutationFn: () =>
      isEdit ? updateBranchApi(branch!.id, form) : createBranchApi(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Sucursal actualizada' : 'Sucursal creada')
      qc.invalidateQueries({ queryKey: ['branches'] })
      qc.invalidateQueries({ queryKey: ['branch-stats'] })
      onDone()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="code" label="Código" required value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} />
        <FormField name="name" label="Nombre" required value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
      </div>
      <FormField name="address" label="Dirección" value={form.address ?? ''} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="city" label="Ciudad" value={form.city ?? ''} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
        <FormField name="state" label="Estado" value={form.state ?? ''} onChange={(v) => setForm((f) => ({ ...f, state: v }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField name="timezone" label="Timezone" value={form.timezone ?? ''} onChange={(v) => setForm((f) => ({ ...f, timezone: v }))} />
        <FormField name="phone" label="Teléfono" value={form.phone ?? ''} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
      </div>
      {isEdit && (
        <FormField
          name="active" label="Status" type="select"
          value={form.active ? 'true' : 'false'}
          onChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}
          options={[
            { value: 'true', label: 'Activa' },
            { value: 'false', label: 'Inactiva' },
          ]}
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Guardar' : 'Crear'}</Button>
      </div>
    </form>
  )
}
