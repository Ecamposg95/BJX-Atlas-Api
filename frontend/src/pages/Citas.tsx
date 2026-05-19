/**
 * Agenda de citas — vista semanal + lista mobile.
 *
 * Calendario simple: 7 columnas × 12 horas (8 AM – 8 PM).
 * Crear, marcar llegada, convertir a OS, cancelar.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Phone, Car, AlertTriangle,
  CheckCircle2, ArrowRight, X as XIcon, MessageCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { appointmentsApi, type AppointmentRead, type AppointmentStatus } from '@/api/endpoints/appointments'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Drawer } from '@/components/ui/Drawer'
import { FormField } from '@/components/ui/FormField'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastProvider'
import api from '@/api/client'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8) // 8 → 19 (start hours)
const WEEKDAYS_LBL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function startOfWeek(d: Date): Date {
  const result = new Date(d)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay()
  result.setDate(result.getDate() - day)
  return result
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(d: Date): string {
  return `${WEEKDAYS_LBL[d.getDay()]} ${d.getDate()}`
}

const STATUS_CFG: Record<AppointmentStatus, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Agendada', color: '#0369a1', bg: 'rgba(56, 189, 248, 0.15)' },
  arrived: { label: 'Llegó', color: '#15803d', bg: 'rgba(34, 197, 94, 0.18)' },
  converted_to_wo: { label: 'Convertida', color: '#7c3aed', bg: 'rgba(168, 85, 247, 0.18)' },
  cancelled: { label: 'Cancelada', color: '#dc2626', bg: 'rgba(248, 113, 113, 0.18)' },
  no_show: { label: 'No llegó', color: '#a16207', bg: 'rgba(250, 204, 21, 0.18)' },
}

export function CitasPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selected, setSelected] = useState<AppointmentRead | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDefaultSlot, setCreateDefaultSlot] = useState<Date | null>(null)

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])

  const listQuery = useQuery({
    queryKey: ['appointments', weekStart.toISOString()],
    queryFn: () =>
      appointmentsApi.list({
        date_from: weekStart.toISOString(),
        date_to: weekEnd.toISOString(),
      }),
  })

  const items = listQuery.data ?? []

  const handlePrevWeek = () => setWeekStart((w) => addDays(w, -7))
  const handleNextWeek = () => setWeekStart((w) => addDays(w, 7))
  const handleToday = () => setWeekStart(startOfWeek(new Date()))

  const handleSlotClick = (slot: Date) => {
    setCreateDefaultSlot(slot)
    setCreateOpen(true)
  }

  return (
    <PageShell wide>
      <PageHeader
        eyebrow="Recepción"
        title="Agenda de citas"
        description="Programa, recibe y convierte citas en órdenes de servicio."
        actions={
          <div className="flex gap-2 items-center">
            <Button variant="secondary" size="sm" onClick={handlePrevWeek} aria-label="Semana anterior">
              <ChevronLeft size={14} />
            </Button>
            <Button variant="secondary" size="sm" onClick={handleToday}>
              <Calendar size={14} /> Hoy
            </Button>
            <Button variant="secondary" size="sm" onClick={handleNextWeek} aria-label="Semana siguiente">
              <ChevronRight size={14} />
            </Button>
            <Button onClick={() => { setCreateDefaultSlot(null); setCreateOpen(true) }}>
              <Plus size={14} /> Nueva cita
            </Button>
          </div>
        }
      />

      {/* Mobile: lista */}
      <div className="lg:hidden">
        <MobileList
          items={items}
          loading={listQuery.isLoading}
          error={listQuery.isError}
          weekStart={weekStart}
          onSelect={setSelected}
        />
      </div>

      {/* Desktop: grid */}
      <div className="hidden lg:block">
        <CalendarGrid
          weekStart={weekStart}
          items={items}
          loading={listQuery.isLoading}
          onSelectAppointment={setSelected}
          onSelectSlot={handleSlotClick}
        />
      </div>

      {createOpen && (
        <CreateAppointmentModal
          defaultSlot={createDefaultSlot}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {selected && (
        <AppointmentDetailDrawer
          appointment={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </PageShell>
  )
}

// ─── Calendar grid ──────────────────────────────────────────────────────────
interface CalendarGridProps {
  weekStart: Date
  items: AppointmentRead[]
  loading: boolean
  onSelectAppointment: (a: AppointmentRead) => void
  onSelectSlot: (slot: Date) => void
}

function CalendarGrid({ weekStart, items, loading, onSelectAppointment, onSelectSlot }: CalendarGridProps) {
  if (loading) {
    return (
      <div className="grid gap-3" style={{ gridTemplateColumns: 'auto repeat(7, minmax(0, 1fr))' }}>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    )
  }

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div
      className="rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div
        className="grid border-b"
        style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))', borderColor: 'var(--border)' }}
      >
        <div />
        {days.map((d) => (
          <div
            key={d.toISOString()}
            className={clsx(
              'px-2 py-2 text-center text-xs font-bold uppercase tracking-wider border-l',
              sameDay(d, new Date()) && 'bg-amber-50 dark:bg-amber-950/30',
            )}
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            {fmtDay(d)}
          </div>
        ))}
      </div>

      {/* Rows: each hour */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="grid border-b"
          style={{ gridTemplateColumns: '60px repeat(7, minmax(0, 1fr))', borderColor: 'var(--border)', minHeight: '70px' }}
        >
          <div
            className="px-2 py-1 text-[11px] font-semibold border-r flex items-start"
            style={{ borderColor: 'var(--border)', color: 'var(--text-faint)' }}
          >
            {hour}:00
          </div>
          {days.map((d) => {
            const slot = new Date(d)
            slot.setHours(hour, 0, 0, 0)
            const cellItems = items.filter((a) => {
              const ad = new Date(a.scheduled_at)
              return sameDay(ad, d) && ad.getHours() === hour
            })
            return (
              <button
                key={d.toISOString() + hour}
                type="button"
                onClick={() => cellItems.length === 0 && onSelectSlot(slot)}
                className={clsx(
                  'border-l p-1 text-left transition-colors',
                  cellItems.length === 0 && 'hover:bg-amber-50 dark:hover:bg-amber-950/30',
                )}
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="space-y-1">
                  {cellItems.map((a) => (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      onClick={(e) => { e.stopPropagation(); onSelectAppointment(a) }}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface AppointmentCardProps {
  appointment: AppointmentRead
  onClick: (e: React.MouseEvent) => void
}

function AppointmentCard({ appointment, onClick }: AppointmentCardProps) {
  const cfg = STATUS_CFG[appointment.status]
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(e as unknown as React.MouseEvent) }}
      className="cursor-pointer rounded-lg border px-2 py-1.5 text-[11px] leading-tight font-semibold transition-shadow hover:shadow-md"
      style={{ background: cfg.bg, borderColor: cfg.color, color: cfg.color }}
    >
      <p className="truncate font-bold">{fmtTime(new Date(appointment.scheduled_at))} · {appointment.customer_name}</p>
      <p className="truncate opacity-80">{appointment.vehicle_plates ?? appointment.service_type}</p>
    </div>
  )
}

// ─── Mobile list ────────────────────────────────────────────────────────────
function MobileList({
  items, loading, error, weekStart, onSelect,
}: { items: AppointmentRead[]; loading: boolean; error: boolean; weekStart: Date; onSelect: (a: AppointmentRead) => void }) {
  if (loading) return <Skeleton className="h-32 w-full" />
  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} />}
        title="No se pudo cargar la agenda"
        description="Reintenta más tarde."
      />
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={28} />}
        title="Sin citas esta semana"
        description="Toca 'Nueva cita' para agendar la primera."
      />
    )
  }

  const grouped = items.reduce<Record<string, AppointmentRead[]>>((acc, a) => {
    const d = new Date(a.scheduled_at)
    const key = d.toISOString().slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
        const key = day.toISOString().slice(0, 10)
        const dayItems = grouped[key] ?? []
        return (
          <section key={key}>
            <h3 className="text-sm font-extrabold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              {fmtDay(day)}
            </h3>
            {dayItems.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--text-faint)' }}>Sin citas</p>
            ) : (
              <ul className="space-y-2">
                {dayItems.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(a)}
                      className="w-full min-h-16 text-left rounded-xl border bg-white dark:bg-slate-900 px-3 py-3 flex items-center gap-3"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div
                        className="h-12 w-12 flex-shrink-0 rounded-xl bg-amber-400/15 text-amber-700 dark:text-amber-300 flex flex-col items-center justify-center"
                        aria-hidden
                      >
                        <span className="text-[10px] font-bold">{fmtTime(new Date(a.scheduled_at)).split(' ')[0]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                          {a.customer_name}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {a.vehicle_plates ?? '—'} · {a.service_type}
                        </p>
                      </div>
                      <StatusPill status={a.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function StatusPill({ status }: { status: AppointmentStatus }) {
  const cfg = STATUS_CFG[status]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Create modal ───────────────────────────────────────────────────────────
function CreateAppointmentModal({ defaultSlot, onClose }: { defaultSlot: Date | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    vehicle_plates: '',
    service_type: 'Revisión general',
    scheduled_at: defaultSlot
      ? defaultSlot.toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    duration_minutes: '60',
    notes: '',
  })

  const mutation = useMutation({
    mutationFn: () => appointmentsApi.create({
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      vehicle_plates: form.vehicle_plates || null,
      service_type: form.service_type,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      duration_minutes: Number(form.duration_minutes),
      notes: form.notes || null,
    }),
    onSuccess: () => {
      toast.success('Cita creada')
      qc.invalidateQueries({ queryKey: ['appointments'] })
      onClose()
    },
    onError: () => toast.error('No se pudo crear la cita'),
  })

  return (
    <Modal open onClose={onClose} title="Nueva cita" size="md">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <FormField
          name="customer_name"
          label="Cliente"
          required
          value={form.customer_name}
          onChange={(v) => setForm((f) => ({ ...f, customer_name: v }))}
        />
        <FormField
          name="customer_phone"
          label="Teléfono"
          value={form.customer_phone}
          onChange={(v) => setForm((f) => ({ ...f, customer_phone: v }))}
          helper="Incluye lada (ej: 5215512345678)"
        />
        <FormField
          name="vehicle_plates"
          label="Placas"
          value={form.vehicle_plates}
          onChange={(v) => setForm((f) => ({ ...f, vehicle_plates: v.toUpperCase() }))}
        />
        <FormField
          name="service_type"
          label="Tipo de servicio"
          required
          value={form.service_type}
          onChange={(v) => setForm((f) => ({ ...f, service_type: v }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            name="scheduled_at"
            label="Fecha y hora"
            required
            type="text"
            value={form.scheduled_at}
            onChange={(v) => setForm((f) => ({ ...f, scheduled_at: v }))}
            helper="Formato: YYYY-MM-DDTHH:mm"
          />
          <FormField
            name="duration_minutes"
            label="Duración (min)"
            type="number"
            min={15}
            max={600}
            value={form.duration_minutes}
            onChange={(v) => setForm((f) => ({ ...f, duration_minutes: v }))}
          />
        </div>
        <FormField
          name="notes"
          label="Notas"
          type="textarea"
          rows={2}
          value={form.notes}
          onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Crear cita</Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Detail drawer ──────────────────────────────────────────────────────────
function AppointmentDetailDrawer({ appointment, onClose }: { appointment: AppointmentRead; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [cancelMode, setCancelMode] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [convertMode, setConvertMode] = useState(false)
  const [convertServiceId, setConvertServiceId] = useState('')
  const [waLink, setWaLink] = useState<string | null>(null)
  const [woNumber, setWoNumber] = useState<string | null>(null)

  const servicesQuery = useQuery({
    queryKey: ['catalog-services-citas'],
    queryFn: async () => {
      const r = await api.get<{ items: { id: string; name: string }[] }>('/catalog/services', {
        params: { page: 1, size: 100 },
      })
      return Array.isArray(r.data?.items) ? r.data.items : []
    },
    enabled: convertMode,
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['appointments'] })

  const arriveMut = useMutation({
    mutationFn: () => appointmentsApi.markArrived(appointment.id),
    onSuccess: () => { toast.success('Cliente marcado como llegado'); refresh() },
    onError: () => toast.error('No se pudo marcar'),
  })

  const cancelMut = useMutation({
    mutationFn: () => appointmentsApi.cancel(appointment.id, cancelReason),
    onSuccess: () => { toast.success('Cita cancelada'); refresh(); onClose() },
    onError: () => toast.error('No se pudo cancelar'),
  })

  const convertMut = useMutation({
    mutationFn: () => appointmentsApi.convert(appointment.id, { service_id: convertServiceId }),
    onSuccess: (data) => {
      toast.success(`OS ${data.work_order.order_number} creada`)
      setWaLink(data.whatsapp_link)
      setWoNumber(data.work_order.order_number)
      refresh()
    },
    onError: () => toast.error('No se pudo convertir'),
  })

  const cfg = STATUS_CFG[appointment.status]
  const dt = new Date(appointment.scheduled_at)

  return (
    <Drawer open onClose={onClose} title="Detalle de cita" size="md">
      <div className="space-y-4">
        <section
          className="rounded-2xl border p-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
                {dt.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-xl font-extrabold" style={{ color: 'var(--text)' }}>
                {fmtTime(dt)} <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>· {appointment.duration_minutes} min</span>
              </p>
            </div>
            <span
              className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </span>
          </div>

          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Cliente" value={appointment.customer_name} />
            <Row label="Teléfono" value={appointment.customer_phone ?? '—'} icon={<Phone size={14} />} />
            <Row label="Placas" value={appointment.vehicle_plates ?? '—'} icon={<Car size={14} />} />
            <Row label="Servicio" value={appointment.service_type} />
            {appointment.notes && <Row label="Notas" value={appointment.notes} />}
            {appointment.cancel_reason && <Row label="Motivo de cancelación" value={appointment.cancel_reason} />}
          </dl>
        </section>

        {woNumber && (
          <section className="rounded-2xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-4">
            <p className="font-bold text-emerald-700 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={18} /> OS {woNumber} creada
            </p>
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white px-4 py-2 font-bold text-sm shadow-md shadow-emerald-500/30"
              >
                <MessageCircle size={16} /> Notificar por WhatsApp
              </a>
            )}
          </section>
        )}

        {convertMode && (
          <section className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
            <p className="font-bold mb-2" style={{ color: 'var(--text)' }}>Convertir a OS</p>
            <FormField
              name="service_id"
              label="Servicio inicial"
              type="select"
              required
              value={convertServiceId}
              onChange={setConvertServiceId}
              options={(servicesQuery.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Seleccionar..."
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConvertMode(false)}>Cancelar</Button>
              <Button onClick={() => convertMut.mutate()} disabled={!convertServiceId} loading={convertMut.isPending}>
                Crear OS
              </Button>
            </div>
          </section>
        )}

        {cancelMode && (
          <section className="rounded-2xl border border-red-300 dark:border-red-700 p-4">
            <p className="font-bold mb-2 text-red-700 dark:text-red-300">Motivo de cancelación</p>
            <FormField
              name="cancel_reason"
              label="Razón"
              type="textarea"
              rows={2}
              value={cancelReason}
              onChange={setCancelReason}
              required
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelMode(false)}>Atrás</Button>
              <Button
                onClick={() => cancelMut.mutate()}
                disabled={!cancelReason.trim()}
                loading={cancelMut.isPending}
              >
                Confirmar cancelación
              </Button>
            </div>
          </section>
        )}

        {!cancelMode && !convertMode && appointment.status === 'scheduled' && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => arriveMut.mutate()} loading={arriveMut.isPending}>
              <CheckCircle2 size={14} /> Marcar llegada
            </Button>
            <Button variant="secondary" onClick={() => setConvertMode(true)}>
              <ArrowRight size={14} /> Convertir a OS
            </Button>
            <Button variant="secondary" onClick={() => setCancelMode(true)}>
              <XIcon size={14} /> Cancelar
            </Button>
          </div>
        )}

        {!cancelMode && !convertMode && appointment.status === 'arrived' && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setConvertMode(true)}>
              <ArrowRight size={14} /> Convertir a OS
            </Button>
            <Button variant="secondary" onClick={() => setCancelMode(true)}>
              <XIcon size={14} /> Cancelar
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  )
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-28 text-[11px] font-bold uppercase tracking-wider flex-shrink-0 pt-0.5" style={{ color: 'var(--text-faint)' }}>
        {label}
      </dt>
      <dd className="flex-1 flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
        {icon}
        <span>{value}</span>
      </dd>
    </div>
  )
}
