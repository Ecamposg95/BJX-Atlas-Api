import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Plus, AlertTriangle, Clock, CheckCircle2, XCircle, FileText,
} from 'lucide-react'
import api from '../api/client'
import { getServices } from '../api'
import { serviceProposalsApi } from '../api/endpoints/serviceProposals'
import type { Service, ServiceProposal, ServiceProposalStatus } from '../api/types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { FormField } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/ToastProvider'
import { fmtDate } from '../utils/format'

interface OpenWorkOrder {
  id: string
  order_number: string
  status: string
  vehicle_plates?: string
  vehicle_model?: string
}

const fetchOpenWorkOrders = () =>
  api
    .get<{ items: OpenWorkOrder[] }>('/work-orders')
    .then((r) => Array.isArray(r.data?.items) ? r.data.items : [])
    .catch(() => [])

const STATUS_FILTERS: Array<{ key: ServiceProposalStatus | 'all'; label: string }> = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
  { key: 'cancelled', label: 'Canceladas' },
  { key: 'all', label: 'Todas' },
]

export function WorkshopPage() {
  const [filter, setFilter] = useState<ServiceProposalStatus | 'all'>('pending')
  const [createOpen, setCreateOpen] = useState(false)

  const proposalsQuery = useQuery({
    queryKey: ['service-proposals', filter],
    queryFn: () =>
      serviceProposalsApi.list(filter === 'all' ? {} : { status: filter }),
    refetchInterval: 60_000,
  })

  const items = proposalsQuery.data?.items ?? []

  const counts = useMemo(() => {
    const all = proposalsQuery.data?.items ?? []
    return {
      pending: all.filter((p) => p.status === 'pending').length,
    }
  }, [proposalsQuery.data])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Jefe de taller"
        title="Propuestas de servicio"
        description="Propón servicios adicionales para las OS en curso. El gerente aprueba o rechaza."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Nueva propuesta
          </Button>
        }
      />

      <nav
        className="flex flex-wrap gap-2 rounded-xl p-1.5"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
      >
        {STATUS_FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-all"
              style={{
                background: active ? 'var(--color-brand-yellow)' : 'transparent',
                color: active ? 'var(--color-brand-navy)' : 'var(--text-muted)',
              }}
            >
              {f.label}
              {f.key === 'pending' && counts.pending > 0 && (
                <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                  {counts.pending}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {proposalsQuery.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : proposalsQuery.isError ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="No se pudieron cargar propuestas"
          description="Verifica conexión e inténtalo de nuevo."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="Sin propuestas"
          description="Aún no hay propuestas en este estado."
        />
      ) : (
        <div className="space-y-2">
          {items.map((p) => <ProposalCard key={p.id} proposal={p} />)}
        </div>
      )}

      {createOpen && (
        <CreateProposalModal onClose={() => setCreateOpen(false)} />
      )}
    </PageShell>
  )
}

function ProposalCard({ proposal }: { proposal: ServiceProposal }) {
  const qc = useQueryClient()
  const toast = useToast()

  const cancel = useMutation({
    mutationFn: () => serviceProposalsApi.cancel(proposal.id),
    onSuccess: () => {
      toast.success('Propuesta cancelada')
      qc.invalidateQueries({ queryKey: ['service-proposals'] })
    },
    onError: () => toast.error('No se pudo cancelar'),
  })

  return (
    <article className="executive-panel" style={{ padding: '1rem 1.1rem' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>
              {proposal.service_name}
            </h3>
            <ProposalStatusBadge status={proposal.status} />
            <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              <Clock size={10} className="inline mr-1" />
              {fmtDate(proposal.created_at, { relative: true })}
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            OS {proposal.work_order_id.slice(0, 8)} · Qty {proposal.quantity}
            {proposal.estimated_hours ? ` · ${proposal.estimated_hours} h` : ''}
            {proposal.estimated_total ? ` · $${proposal.estimated_total}` : ''}
          </p>
          <p className="mt-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>
            "{proposal.reason}"
          </p>
          {proposal.review_notes && (
            <p className="mt-2 text-xs rounded-md p-2" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>
              <FileText size={11} className="inline mr-1" />
              {proposal.review_notes}
            </p>
          )}
        </div>
        {proposal.status === 'pending' && (
          <Button size="sm" variant="secondary" onClick={() => cancel.mutate()} loading={cancel.isPending}>
            Cancelar
          </Button>
        )}
      </div>
    </article>
  )
}

function ProposalStatusBadge({ status }: { status: ServiceProposalStatus }) {
  const cfg: Record<ServiceProposalStatus, { label: string; variant: 'ok' | 'low' | 'critical' | 'draft' | 'confirmed' }> = {
    pending: { label: 'Pendiente', variant: 'draft' },
    approved: { label: 'Aprobada', variant: 'ok' },
    rejected: { label: 'Rechazada', variant: 'critical' },
    cancelled: { label: 'Cancelada', variant: 'low' },
  }
  const c = cfg[status]
  return <Badge variant={c.variant}>{c.label}</Badge>
}

function CreateProposalModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    work_order_id: '',
    service_id: '',
    service_name: '',
    quantity: '1',
    estimated_hours: '',
    estimated_parts_cost: '',
    estimated_total: '',
    reason: '',
  })

  const wosQuery = useQuery({
    queryKey: ['workshop', 'open-work-orders'],
    queryFn: fetchOpenWorkOrders,
  })

  const servicesQuery = useQuery<Service[]>({
    queryKey: ['catalog', 'services-active'],
    queryFn: () => getServices({ status: 'approved' }),
  })

  const wos = (wosQuery.data ?? []).filter(
    (w) => w.status === 'in_progress' || w.status === 'waiting_parts',
  )
  const services = servicesQuery.data ?? []

  const mutation = useMutation({
    mutationFn: () =>
      serviceProposalsApi.create({
        work_order_id: form.work_order_id,
        service_id: form.service_id || null,
        service_name: form.service_name || (
          services.find((s) => s.id === form.service_id)?.name ?? ''
        ),
        quantity: Number(form.quantity) || 1,
        estimated_hours: form.estimated_hours || null,
        estimated_parts_cost: form.estimated_parts_cost || null,
        estimated_total: form.estimated_total || null,
        reason: form.reason,
      }),
    onSuccess: () => {
      toast.success('Propuesta enviada al gerente')
      qc.invalidateQueries({ queryKey: ['service-proposals'] })
      onClose()
    },
    onError: () => toast.error('No se pudo crear la propuesta'),
  })

  const canSubmit =
    form.work_order_id &&
    form.reason.trim().length >= 3 &&
    (form.service_id || form.service_name.trim().length >= 2)

  return (
    <Modal open onClose={onClose} title="Nueva propuesta de servicio" size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) mutation.mutate()
        }}
      >
        <FormField
          name="work_order_id"
          label="Orden de servicio"
          type="select"
          required
          value={form.work_order_id}
          onChange={(v) => setForm((f) => ({ ...f, work_order_id: v }))}
          placeholder="Seleccionar OS en curso..."
          options={wos.map((w) => ({
            value: w.id,
            label: `${w.order_number} · ${w.vehicle_plates ?? '—'}`,
          }))}
        />

        <FormField
          name="service_id"
          label="Servicio del catálogo (opcional)"
          type="select"
          value={form.service_id}
          onChange={(v) => {
            const svc = services.find((s) => s.id === v)
            setForm((f) => ({
              ...f,
              service_id: v,
              service_name: svc?.name ?? f.service_name,
            }))
          }}
          placeholder="Buscar en catálogo..."
          options={services.map((s) => ({ value: s.id, label: s.name }))}
        />

        <FormField
          name="service_name"
          label="Nombre del servicio (si es custom)"
          placeholder="Ej. Inspección adicional de frenos"
          required={!form.service_id}
          value={form.service_name}
          onChange={(v) => setForm((f) => ({ ...f, service_name: v }))}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="quantity"
            label="Cantidad"
            type="number"
            min={1}
            value={form.quantity}
            onChange={(v) => setForm((f) => ({ ...f, quantity: v }))}
          />
          <FormField
            name="estimated_hours"
            label="Horas estimadas"
            type="number"
            value={form.estimated_hours}
            onChange={(v) => setForm((f) => ({ ...f, estimated_hours: v }))}
          />
          <FormField
            name="estimated_parts_cost"
            label="Costo refacciones (MXN)"
            type="number"
            value={form.estimated_parts_cost}
            onChange={(v) => setForm((f) => ({ ...f, estimated_parts_cost: v }))}
          />
          <FormField
            name="estimated_total"
            label="Total estimado (MXN)"
            type="number"
            value={form.estimated_total}
            onChange={(v) => setForm((f) => ({ ...f, estimated_total: v }))}
          />
        </div>

        <FormField
          name="reason"
          label="Justificación"
          type="textarea"
          rows={3}
          required
          placeholder="Explica por qué el servicio adicional es necesario..."
          value={form.reason}
          onChange={(v) => setForm((f) => ({ ...f, reason: v }))}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
            Enviar al gerente
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export { CheckCircle2, XCircle }
