/**
 * MechanicTaskDetail — mobile-first detalle de una OS asignada al mecánico.
 *
 * Ruta: /mechanic/tasks/:lineId
 *
 * Pestañas verticales (segmented control sticky):
 *  - Diagnóstico: script de falla + checkboxes labores + comentarios + reportar hallazgo
 *  - Refacciones: lista de solicitudes para la OS + abrir PartSearchModal
 *  - Carrocería: BodyDamageMap (lectura de marks previos + agregar nuevos)
 *
 * BottomActionBar: acción primaria depende de estado de la línea
 * (Iniciar/Pausar/Reanudar/Finalizar). Auto-poll cada 30s mientras está en
 * progreso.
 */
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Play, Pause, Square, RotateCw, AlertTriangle, Package, ClipboardCheck,
  Stethoscope, Car, FileText, Plus, ArrowRight,
} from 'lucide-react'
import { clsx } from 'clsx'

import api from '@/api/client'
import { listInventoryRequests } from '@/api'
import { meApi } from '@/api/endpoints/me'
import { queryKeys } from '@/api/queryKeys'
import { useMyTasks } from '@/hooks/useMyTasks'
import type { MyTaskItem } from '@/api/endpoints/me'
import type { InventoryRequest, InventoryRequestStatus } from '@/api/types'

import { MobileShell } from '@/components/mobile/MobileShell'
import type { BottomAction } from '@/components/mobile/BottomActionBar'
import { BodyDamageMap, type DamageMark } from '@/components/mobile/BodyDamageMap'
import { PhotoCapture, type UploadedEvidence } from '@/components/mobile/PhotoCapture'
import { PartSearchModal } from '@/components/mobile/PartSearchModal'

import { SemaphoreBadge } from '@/components/ui/SemaphoreBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/ToastProvider'

import { WORK_ORDER_LINE_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/statusLabels'
import { formatTimer } from '@/lib/time'

// ── Local types ──────────────────────────────────────────────────────────────

interface WorkOrderVehicleSummary {
  id?: string
  customer_name?: string
  contact?: string | null
  brand?: string | null
  model?: string | null
  year?: number | null
  plates?: string | null
  vin?: string | null
}

interface WorkOrderDetail {
  id: string
  order_number: string
  status: string
  notes?: string | null
  vehicle_summary?: WorkOrderVehicleSummary
  service_name?: string
}

type TabKey = 'diagnostico' | 'refacciones' | 'carroceria'

const TABS: { key: TabKey; label: string; icon: typeof Stethoscope }[] = [
  { key: 'diagnostico', label: 'Diagnóstico', icon: Stethoscope },
  { key: 'refacciones', label: 'Refacciones', icon: Package },
  { key: 'carroceria', label: 'Carrocería', icon: Car },
]

// Labores comunes (checkbox list MVP — config-driven en futuro)
const COMMON_LABORES = [
  'Diagnóstico general',
  'Revisión de frenos',
  'Cambio de aceite y filtro',
  'Alineación y balanceo',
  'Inspección de suspensión',
  'Prueba de manejo',
  'Limpieza de inyectores',
  'Revisión eléctrica',
]

// Stock semaphore for inventory request status
const REQUEST_STATUS_META: Record<InventoryRequestStatus, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  approved: { label: 'Aprobada', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200' },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
  picked: { label: 'Surtida', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' },
  delivered: { label: 'Entregada', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
  used: { label: 'Usada', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' },
  returned: { label: 'Devuelta', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function MechanicTaskDetailPage() {
  const { lineId = '' } = useParams<{ lineId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()

  // Tabs + UI state
  const [tab, setTab] = useState<TabKey>('diagnostico')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [findingDrawerOpen, setFindingDrawerOpen] = useState(false)
  const [partsModalOpen, setPartsModalOpen] = useState(false)
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false)

  // Diagnóstico form state
  const [labores, setLabores] = useState<string[]>([])
  const [comments, setComments] = useState('')
  const [savingComments, setSavingComments] = useState(false)
  const [savingLabores, setSavingLabores] = useState(false)

  // Carrocería marks
  const [newMarks, setNewMarks] = useState<DamageMark[]>([])

  // Finding drawer state
  const [findingDesc, setFindingDesc] = useState('')
  const [findingSeverity, setFindingSeverity] = useState<'low' | 'medium' | 'high'>('medium')
  const [findingPhoto, setFindingPhoto] = useState<UploadedEvidence | null>(null)
  const [savingFinding, setSavingFinding] = useState(false)

  // Fetch the task list (derive this task from cached items)
  const tasksQuery = useMyTasks()
  const task: MyTaskItem | undefined = useMemo(
    () => tasksQuery.data?.items.find((t) => t.line.id === lineId),
    [tasksQuery.data, lineId],
  )

  const workOrderId = task?.work_order.id ?? ''

  // Fetch work order detail (for notes / script de falla)
  const woQuery = useQuery<WorkOrderDetail>({
    queryKey: queryKeys.workOrder(workOrderId),
    queryFn: () => api.get<WorkOrderDetail>(`/work-orders/${workOrderId}`).then((r) => r.data),
    enabled: !!workOrderId,
  })

  // Fetch inventory requests filtered by work order
  const requestsQuery = useQuery<InventoryRequest[]>({
    queryKey: ['inventory', 'requests', { work_order_id: workOrderId }],
    queryFn: async () => {
      const page = await listInventoryRequests({ work_order_id: workOrderId, page: 1, page_size: 200 })
      const items = Array.isArray(page?.items) ? page.items : []
      return items.filter((r) => r.work_order_id === workOrderId)
    },
    enabled: !!workOrderId,
  })

  // Auto-poll while line is in progress
  const linePolling = task?.line.status === 'in_progress'
  useQuery({
    queryKey: ['mechanic-task-poll', lineId],
    queryFn: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.myTasks() })
      return Date.now()
    },
    enabled: linePolling,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const lineAction = useMutation({
    mutationFn: async (action: 'start' | 'pause' | 'resume' | 'finish') => {
      await api.post(`/workshop/lines/${lineId}/${action}`)
      return action
    },
    onSuccess: (action) => {
      const labels: Record<typeof action, string> = {
        start: 'Tarea iniciada',
        pause: 'Tarea pausada',
        resume: 'Tarea reanudada',
        finish: 'Tarea finalizada',
      }
      toast.success(labels[action])
      qc.invalidateQueries({ queryKey: queryKeys.myTasks() })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Error en la operación'
      toast.error(msg)
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────
  function toggleLabor(labor: string) {
    setLabores((prev) => (prev.includes(labor) ? prev.filter((l) => l !== labor) : [...prev, labor]))
  }

  async function saveLabores() {
    if (labores.length === 0) {
      toast.warning('Marca al menos una labor')
      return
    }
    setSavingLabores(true)
    try {
      await meApi.reportFinding(lineId, {
        description: `Labores realizadas: ${labores.join(', ')}`,
      })
      toast.success('Labores guardadas')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudieron guardar las labores'
      toast.error(msg)
    } finally {
      setSavingLabores(false)
    }
  }

  async function saveComments() {
    const text = comments.trim()
    if (!text) return
    setSavingComments(true)
    try {
      await meApi.reportFinding(lineId, {
        description: `Comentario técnico: ${text}`,
      })
      toast.success('Comentario guardado')
      setComments('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar el comentario'
      toast.error(msg)
    } finally {
      setSavingComments(false)
    }
  }

  async function saveFinding() {
    const text = findingDesc.trim()
    if (!text) {
      toast.warning('Describe el hallazgo')
      return
    }
    setSavingFinding(true)
    try {
      const note = `[${findingSeverity.toUpperCase()}] ${text}${findingPhoto ? ` (foto ${findingPhoto.id.slice(0, 6)})` : ''}`
      await meApi.reportFinding(lineId, { description: note })
      toast.success('Hallazgo reportado')
      setFindingDesc('')
      setFindingSeverity('medium')
      setFindingPhoto(null)
      setFindingDrawerOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo reportar el hallazgo'
      toast.error(msg)
    } finally {
      setSavingFinding(false)
    }
  }

  async function saveDamageMarks() {
    if (newMarks.length === 0) {
      toast.warning('Marca al menos un daño')
      return
    }
    try {
      const summary = newMarks
        .map((m) => `${m.view} ${m.x.toFixed(0)}%,${m.y.toFixed(0)}% (${m.severity})`)
        .join('; ')
      await meApi.reportFinding(lineId, {
        description: `Daño marcado: ${summary}`,
      })
      toast.success('Daños registrados')
      setNewMarks([])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudieron guardar las marcas'
      toast.error(msg)
    }
  }

  function handleFinishConfirm() {
    setConfirmFinishOpen(false)
    lineAction.mutate('finish')
  }

  // ── Bottom actions builder ────────────────────────────────────────────────
  const bottomActions: BottomAction[] = useMemo(() => {
    if (!task) return []
    const status = task.line.status
    if (status === 'pending') {
      return [
        {
          label: 'Iniciar tarea',
          variant: 'primary',
          icon: <Play size={16} />,
          loading: lineAction.isPending,
          onClick: () => lineAction.mutate('start'),
        },
      ]
    }
    if (status === 'in_progress') {
      return [
        {
          label: 'Pausar',
          variant: 'secondary',
          icon: <Pause size={16} />,
          loading: lineAction.isPending,
          onClick: () => lineAction.mutate('pause'),
        },
        {
          label: 'Finalizar',
          variant: 'primary',
          icon: <Square size={16} />,
          onClick: () => setConfirmFinishOpen(true),
        },
      ]
    }
    if (status === 'paused') {
      return [
        {
          label: 'Reanudar',
          variant: 'primary',
          icon: <RotateCw size={16} />,
          loading: lineAction.isPending,
          onClick: () => lineAction.mutate('resume'),
        },
      ]
    }
    // completed/cancelled/waiting_parts → no primary
    return [
      {
        label: 'Cerrar',
        variant: 'secondary',
        onClick: () => navigate('/mechanic'),
      },
    ]
  }, [task, lineAction, navigate])

  // ── Render ────────────────────────────────────────────────────────────────
  const isLoading = tasksQuery.isLoading || (!!workOrderId && woQuery.isLoading)
  const loadError = tasksQuery.error || (!task && !tasksQuery.isLoading)

  if (isLoading) {
    return (
      <MobileShell title="OS" onBack={() => navigate('/mechanic')}>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </MobileShell>
    )
  }

  if (loadError || !task) {
    return (
      <MobileShell title="OS" onBack={() => navigate('/mechanic')}>
        <EmptyState
          icon={<AlertTriangle size={32} />}
          title="No se pudo cargar la OS"
          description="Revisa tu conexión y reintenta."
          action={
            <Button onClick={() => tasksQuery.refetch()}>Reintentar</Button>
          }
        />
      </MobileShell>
    )
  }

  const wo = task.work_order
  const line = task.line
  const timer = task.timer
  const stdMin = line.standard_duration_hrs != null ? line.standard_duration_hrs * 60 : null

  const requests = requestsQuery.data ?? []

  return (
    <MobileShell
      title={wo.order_number}
      subtitle={line.service_name}
      onBack={() => navigate('/mechanic')}
      bottomActions={bottomActions}
    >
      {/* Sticky compact header card (tap-to-collapse km/cliente) */}
      <section
        className="sticky top-14 -mx-4 px-4 z-10 backdrop-blur-md"
        style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          type="button"
          onClick={() => setHeaderCollapsed((v) => !v)}
          className="w-full text-left py-3"
          aria-expanded={!headerCollapsed}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <SemaphoreBadge status={timer.semaphore} size="sm">
              {WORK_ORDER_LINE_STATUS_LABEL[line.status as keyof typeof WORK_ORDER_LINE_STATUS_LABEL] ?? line.status}
            </SemaphoreBadge>
            <span className="font-extrabold text-base tabular-nums" style={{ color: 'var(--text)' }}>
              {wo.vehicle.plates ?? 's/placas'}
            </span>
            {wo.priority !== 'normal' && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200">
                {PRIORITY_LABEL[wo.priority] ?? wo.priority}
              </span>
            )}
            <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {formatTimer(timer.elapsed_minutes, stdMin)}
            </span>
          </div>
          {!headerCollapsed && (
            <div className="mt-2 text-xs flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-muted)' }}>
              <span>{[wo.vehicle.brand, wo.vehicle.model].filter(Boolean).join(' ') || '—'}</span>
              {woQuery.data?.vehicle_summary?.customer_name && (
                <span>Cliente: {woQuery.data.vehicle_summary.customer_name}</span>
              )}
              {line.bay_name && <span>Bahía {line.bay_name}</span>}
            </div>
          )}
        </button>

        {/* Tabs (segmented control, sticky just below header card) */}
        <div className="pb-2 -mx-1 px-1 overflow-x-auto">
          <div
            role="tablist"
            aria-label="Secciones de la OS"
            className="inline-flex gap-1 rounded-full p-1"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {TABS.map((t) => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={clsx(
                    'min-h-12 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all',
                    active
                      ? 'bg-amber-400 text-slate-900 shadow-sm'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700',
                  )}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Tab content */}
      <div className="mt-4 flex flex-col gap-4">
        {tab === 'diagnostico' && (
          <DiagnosticoTab
            scriptFalla={woQuery.data?.notes ?? null}
            labores={labores}
            onToggleLabor={toggleLabor}
            onSaveLabores={() => void saveLabores()}
            savingLabores={savingLabores}
            comments={comments}
            onChangeComments={setComments}
            onBlurComments={() => void saveComments()}
            savingComments={savingComments}
            onOpenFindingDrawer={() => setFindingDrawerOpen(true)}
          />
        )}
        {tab === 'refacciones' && (
          <RefaccionesTab
            requests={requests}
            isLoading={requestsQuery.isLoading}
            onOpenPartSearch={() => setPartsModalOpen(true)}
          />
        )}
        {tab === 'carroceria' && (
          <CarroceriaTab
            marks={newMarks}
            onMarksChange={setNewMarks}
            onSave={() => void saveDamageMarks()}
          />
        )}

        {/* "Ir a siguiente OS" mini link */}
        <button
          type="button"
          onClick={() => navigate('/mechanic')}
          className="inline-flex items-center justify-center gap-1.5 mt-2 text-xs font-bold tracking-wide self-center"
          style={{ color: 'var(--text-muted)' }}
        >
          Ir a siguiente OS <ArrowRight size={12} />
        </button>
      </div>

      {/* Confirm finish modal */}
      <Modal
        open={confirmFinishOpen}
        onClose={() => setConfirmFinishOpen(false)}
        title="¿Finalizar tarea?"
        description="Esta acción registra el cierre de la línea. Verifica que las labores y comentarios estén guardados."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmFinishOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleFinishConfirm} loading={lineAction.isPending}>
              Sí, finalizar
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Asegúrate de haber capturado todos los hallazgos antes de cerrar.
        </p>
      </Modal>

      {/* Finding drawer */}
      <Drawer
        open={findingDrawerOpen}
        onClose={() => setFindingDrawerOpen(false)}
        title="Reportar hallazgo crítico"
        description="Captura un problema que requiere atención adicional."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFindingDrawerOpen(false)} disabled={savingFinding}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void saveFinding()} loading={savingFinding}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[0.7rem] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Descripción
            </label>
            <textarea
              value={findingDesc}
              onChange={(e) => setFindingDesc(e.target.value)}
              rows={4}
              placeholder="Ej: pastillas de freno con desgaste avanzado, requiere reemplazo inmediato."
              className="min-h-24 px-3 py-2 rounded-xl border-2 text-sm resize-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[0.7rem] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Severidad
            </label>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {(['low', 'medium', 'high'] as const).map((s) => {
                const active = findingSeverity === s
                const lbl = s === 'low' ? 'Leve' : s === 'medium' ? 'Medio' : 'Grave'
                const color = s === 'low' ? '#22c55e' : s === 'medium' ? '#f59e0b' : '#dc2626'
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFindingSeverity(s)}
                    className="min-h-12 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold border-2"
                    style={{
                      borderColor: color,
                      background: active ? `${color}22` : 'transparent',
                      color: 'var(--text)',
                      opacity: active ? 1 : 0.7,
                    }}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>
          </div>

          <PhotoCapture
            label="Foto del hallazgo"
            helper="Opcional. Sube una imagen del componente."
            autoUpload={{
              kind: 'finding_photo',
              workOrderId,
              note: `Hallazgo OS ${wo.order_number}`,
            }}
            onUploaded={(ev) => setFindingPhoto(ev)}
          />
        </div>
      </Drawer>

      {/* Part search modal */}
      <PartSearchModal
        open={partsModalOpen}
        workOrderId={workOrderId}
        onClose={() => setPartsModalOpen(false)}
        onSubmitted={() => {
          qc.invalidateQueries({ queryKey: ['inventory', 'requests', { work_order_id: workOrderId }] })
        }}
      />
    </MobileShell>
  )
}

// ── Tab components ──────────────────────────────────────────────────────────

interface DiagnosticoProps {
  scriptFalla: string | null
  labores: string[]
  onToggleLabor: (l: string) => void
  onSaveLabores: () => void
  savingLabores: boolean
  comments: string
  onChangeComments: (v: string) => void
  onBlurComments: () => void
  savingComments: boolean
  onOpenFindingDrawer: () => void
}

function DiagnosticoTab({
  scriptFalla,
  labores,
  onToggleLabor,
  onSaveLabores,
  savingLabores,
  comments,
  onChangeComments,
  onBlurComments,
  savingComments,
  onOpenFindingDrawer,
}: DiagnosticoProps) {
  return (
    <>
      {/* Script de falla */}
      <section
        className="rounded-2xl border bg-white dark:bg-slate-900 p-4"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="flex items-center gap-2 mb-2">
          <FileText size={16} style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Script de falla
          </h2>
        </header>
        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text)' }}>
          {scriptFalla?.trim() || 'Sin script registrado. Consulta con asesor.'}
        </p>
      </section>

      {/* Labores realizadas */}
      <section
        className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={16} style={{ color: 'var(--text-muted)' }} />
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Labores realizadas
            </h2>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            {labores.length}/{COMMON_LABORES.length}
          </span>
        </header>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {COMMON_LABORES.map((l) => {
            const checked = labores.includes(l)
            return (
              <li key={l}>
                <label
                  className={clsx(
                    'flex items-center gap-2 min-h-12 px-3 py-2 rounded-xl border cursor-pointer text-sm',
                    checked
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-400/10'
                      : 'border-slate-200 dark:border-slate-800',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleLabor(l)}
                    className="h-5 w-5 accent-amber-500 flex-shrink-0"
                  />
                  <span style={{ color: 'var(--text)' }}>{l}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <Button
          variant="secondary"
          onClick={onSaveLabores}
          loading={savingLabores}
          disabled={savingLabores || labores.length === 0}
        >
          Guardar labores
        </Button>
      </section>

      {/* Comentarios técnicos */}
      <section
        className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-2"
        style={{ borderColor: 'var(--border)' }}
      >
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Comentarios técnicos
        </label>
        <textarea
          value={comments}
          onChange={(e) => onChangeComments(e.target.value)}
          onBlur={onBlurComments}
          rows={3}
          placeholder="Notas para el asesor / cliente..."
          className="min-h-24 px-3 py-2 rounded-xl border-2 text-sm resize-none"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
        />
        {savingComments && (
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            Guardando...
          </span>
        )}
      </section>

      {/* Reportar hallazgo crítico CTA */}
      <button
        type="button"
        onClick={onOpenFindingDrawer}
        className="min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 font-bold text-sm hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        <AlertTriangle size={16} />
        Reportar hallazgo crítico
      </button>
    </>
  )
}

interface RefaccionesProps {
  requests: InventoryRequest[]
  isLoading: boolean
  onOpenPartSearch: () => void
}

function RefaccionesTab({ requests, isLoading, onOpenPartSearch }: RefaccionesProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenPartSearch}
        className="min-h-12 inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 text-slate-900 font-bold text-sm shadow-md shadow-amber-400/30 hover:bg-amber-300 active:scale-[0.99]"
      >
        <Plus size={16} />
        Solicitar refacción
      </button>

      <section
        className="rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Solicitadas para esta OS ({requests.length})
          </h2>
        </header>
        {isLoading ? (
          <div className="p-4 flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={<Package size={28} />}
            title="Sin refacciones"
            description="Aún no has solicitado refacciones para esta OS."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {requests.map((r) => {
              const meta = REQUEST_STATUS_META[r.status]
              return (
                <li key={r.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {r.part_name ?? `Refacción ${r.part_id.slice(0, 6)}`}
                    </p>
                    <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
                      {r.part_sku ?? r.part_id.slice(0, 8)} · cant {r.quantity}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold whitespace-nowrap',
                      meta.cls,
                    )}
                  >
                    {meta.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

interface CarroceriaProps {
  marks: DamageMark[]
  onMarksChange: (m: DamageMark[]) => void
  onSave: () => void
}

function CarroceriaTab({ marks, onMarksChange, onSave }: CarroceriaProps) {
  return (
    <>
      <section
        className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <header className="flex items-center gap-2">
          <Car size={16} style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Mapa de carrocería
          </h2>
        </header>
        <BodyDamageMap marks={marks} onMarksChange={onMarksChange} />
      </section>

      <Button
        variant="primary"
        onClick={onSave}
        disabled={marks.length === 0}
      >
        Guardar daños ({marks.length})
      </Button>
    </>
  )
}
