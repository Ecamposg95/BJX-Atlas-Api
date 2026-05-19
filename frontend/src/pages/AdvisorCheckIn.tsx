/**
 * Check-in del Asesor (US-09) — mobile-first.
 *
 * Flujo:
 *  1. Asesor toma datos de unidad (placas, km, gasolina) + cliente.
 *  2. Captura script de falla en sus palabras.
 *  3. Marca daños visibles sobre silueta del vehículo.
 *  4. Adjunta hasta 3 fotos como evidencia.
 *  5. Submit → crea Vehicle (si nuevo) + WorkOrder + vincula evidencias.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Save, Send, ChevronDown, ChevronUp } from 'lucide-react'
import api from '@/api/client'
import { MobileShell } from '@/components/mobile/MobileShell'
import { BodyDamageMap, type DamageMark } from '@/components/mobile/BodyDamageMap'
import { PhotoCapture, type UploadedEvidence } from '@/components/mobile/PhotoCapture'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/ToastProvider'

type FuelLevel = 'q1' | 'q2' | 'q3' | 'full'

const FUEL_OPTIONS: { value: FuelLevel; label: string }[] = [
  { value: 'q1', label: '1/4' },
  { value: 'q2', label: '1/2' },
  { value: 'q3', label: '3/4' },
  { value: 'full', label: 'Lleno' },
]

interface SimpleItem {
  id: string
  name: string
}

interface CreatedWorkOrder {
  id: string
  order_number: string
}

export function AdvisorCheckInPage() {
  const navigate = useNavigate()
  const toast = useToast()

  // form state
  const [plates, setPlates] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [mileage, setMileage] = useState('')
  const [fuel, setFuel] = useState<FuelLevel>('q2')
  const [customer, setCustomer] = useState('')
  const [contact, setContact] = useState('')
  const [failureScript, setFailureScript] = useState('')
  const [marks, setMarks] = useState<DamageMark[]>([])
  const [evidence, setEvidence] = useState<UploadedEvidence[]>([])
  const [damageOpen, setDamageOpen] = useState(false)
  const [modelId, setModelId] = useState('')
  const [serviceId, setServiceId] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // catalogos para FKs
  const modelsQuery = useQuery({
    queryKey: ['catalog-models-min'],
    queryFn: async (): Promise<SimpleItem[]> => {
      const r = await api.get<{ items: { id: string; name: string; brand?: string }[] }>('/catalog/models', { params: { page: 1, size: 100 } })
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      return items.map((m) => ({ id: m.id, name: m.brand ? `${m.brand} ${m.name}` : m.name }))
    },
  })

  const servicesQuery = useQuery({
    queryKey: ['catalog-services-min'],
    queryFn: async (): Promise<SimpleItem[]> => {
      const r = await api.get<{ items: { id: string; name: string }[] }>('/catalog/services', { params: { page: 1, size: 100 } })
      const items = Array.isArray(r.data?.items) ? r.data.items : []
      return items.map((s) => ({ id: s.id, name: s.name }))
    },
  })

  useEffect(() => {
    if (!modelId && modelsQuery.data && modelsQuery.data.length > 0) {
      setModelId(modelsQuery.data[0].id)
    }
  }, [modelId, modelsQuery.data])

  useEffect(() => {
    if (!serviceId && servicesQuery.data && servicesQuery.data.length > 0) {
      // preferir "Diagnóstico" si existe
      const preferred = servicesQuery.data.find((s) => /diagn/i.test(s.name))
      setServiceId((preferred ?? servicesQuery.data[0]).id)
    }
  }, [serviceId, servicesQuery.data])

  const modelOptions = useMemo(
    () => (modelsQuery.data ?? []).map((m) => ({ value: m.id, label: m.name })),
    [modelsQuery.data],
  )
  const serviceOptions = useMemo(
    () => (servicesQuery.data ?? []).map((s) => ({ value: s.id, label: s.name })),
    [servicesQuery.data],
  )

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!plates.trim()) next.plates = 'Las placas son obligatorias'
    if (!mileage.trim()) next.mileage = 'El kilometraje es obligatorio'
    else if (Number.isNaN(Number(mileage)) || Number(mileage) < 0) next.mileage = 'Kilometraje inválido'
    if (!failureScript.trim() || failureScript.trim().length < 5) next.failureScript = 'Mínimo 5 caracteres'
    if (!customer.trim()) next.customer = 'Cliente o flotilla es obligatorio'
    if (!modelId) next.modelId = 'Selecciona un modelo de referencia'
    if (!serviceId) next.serviceId = 'Selecciona un servicio inicial'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function ensureVehicleId(): Promise<string> {
    // Busca por placas; si no existe, crea.
    const plate = plates.trim().toUpperCase()
    const search = await api.get<{ items: { id: string; plates?: string | null }[] }>('/vehicles', { params: { search: plate, page: 1, size: 10 } })
    const found = (search.data?.items ?? []).find((v) => (v.plates ?? '').trim().toUpperCase() === plate)
    if (found) return found.id

    const created = await api.post<{ id: string }>('/vehicles', {
      customer_name: customer.trim(),
      contact: contact.trim() || null,
      plates: plate,
      mileage: Number(mileage),
      active: true,
    })
    return created.data.id
  }

  function buildNotes(): string {
    const lines: string[] = []
    lines.push(`Script de falla: ${failureScript.trim()}`)
    lines.push(`Cliente/Flotilla: ${customer.trim()}${contact.trim() ? ` (${contact.trim()})` : ''}`)
    if (unitNumber.trim()) lines.push(`Unidad/Eco: ${unitNumber.trim()}`)
    lines.push(`Combustible: ${FUEL_OPTIONS.find((f) => f.value === fuel)?.label ?? fuel}`)
    if (marks.length > 0) {
      const summary = marks
        .map((m, i) => `${i + 1}. ${m.severity}@${m.view}(${m.x.toFixed(0)},${m.y.toFixed(0)})`)
        .join('; ')
      lines.push(`Daños marcados: ${summary}`)
    }
    if (evidence.length > 0) {
      lines.push(`Evidencias: ${evidence.map((e) => e.id).join(', ')}`)
    }
    return lines.join('\n')
  }

  async function submit(asDraft = false) {
    if (!validate()) {
      toast.error('Completa los campos requeridos')
      return
    }
    setSubmitting(true)
    try {
      const vehicleId = await ensureVehicleId()
      const wo = await api.post<CreatedWorkOrder>('/work-orders', {
        vehicle_id: vehicleId,
        model_id: modelId,
        service_id: serviceId,
        notes: buildNotes(),
      })
      // Vincular evidencias subidas previamente
      await Promise.allSettled(
        evidence
          .filter((e) => !e.work_order_id)
          .map((e) => api.patch(`/v1/evidence/${e.id}/link`, { work_order_id: wo.data.id })),
      )
      toast.success(asDraft ? 'Borrador guardado' : `OS ${wo.data.order_number} creada`)
      navigate('/advisor')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al crear la OS'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MobileShell
      title="Nuevo check-in"
      subtitle="Recepción"
      onBack={() => navigate('/advisor')}
      bottomActions={[
        {
          label: 'Borrador',
          variant: 'secondary',
          onClick: () => void submit(true),
          icon: <Save size={16} />,
          disabled: submitting,
        },
        {
          label: 'Crear OS',
          variant: 'primary',
          onClick: () => void submit(false),
          icon: <Send size={16} />,
          loading: submitting,
          type: 'submit',
        },
      ]}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(false)
        }}
      >
        {/* Unidad */}
        <Section title="Datos de unidad">
          <FormField
            label="Placas"
            name="plates"
            value={plates}
            onChange={(v) => setPlates(v.toUpperCase())}
            placeholder="ABC-1234"
            required
            error={errors.plates}
            autoComplete="off"
          />
          <FormField
            label="Unidad / Número económico"
            name="unitNumber"
            value={unitNumber}
            onChange={setUnitNumber}
            placeholder="Opcional"
          />
          <FormField
            label="Kilometraje"
            name="mileage"
            type="number"
            value={mileage}
            onChange={setMileage}
            placeholder="45000"
            required
            min={0}
            error={errors.mileage}
          />
          <fieldset className="flex flex-col gap-1.5">
            <legend
              style={{
                color: 'var(--text-muted)',
                fontSize: '0.7rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Nivel de combustible
            </legend>
            <div role="radiogroup" aria-label="Nivel de combustible" className="grid grid-cols-4 gap-2">
              {FUEL_OPTIONS.map((opt) => {
                const active = fuel === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFuel(opt.value)}
                    className={`min-h-12 rounded-xl border-2 font-bold text-sm transition-all ${
                      active
                        ? 'border-amber-400 bg-amber-400/15 text-amber-800 dark:text-amber-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </Section>

        {/* Cliente */}
        <Section title="Cliente / Flotilla">
          <FormField
            label="Cliente o flotilla"
            name="customer"
            value={customer}
            onChange={setCustomer}
            placeholder="Juan Pérez / Flotilla CocaCola"
            required
            error={errors.customer}
          />
          <FormField
            label="Contacto (teléfono / email)"
            name="contact"
            value={contact}
            onChange={setContact}
            placeholder="Opcional"
            autoComplete="off"
          />
        </Section>

        {/* Script de falla */}
        <Section title="Script de falla (palabras del chofer)">
          <FormField
            label="Reporte"
            name="failureScript"
            type="textarea"
            value={failureScript}
            onChange={setFailureScript}
            placeholder="Chofer reporta vibración al frenar, ruido en suspensión delantera derecha…"
            required
            rows={4}
            error={errors.failureScript}
            helper="Mínimo 5 caracteres. Esta nota se incluirá en la OS."
          />
        </Section>

        {/* Mapa de daños */}
        <Section
          title="Mapa de carrocería"
          collapsible
          open={damageOpen}
          onToggle={() => setDamageOpen((o) => !o)}
          badge={marks.length > 0 ? `${marks.length} daño${marks.length === 1 ? '' : 's'}` : undefined}
        >
          {damageOpen && (
            <BodyDamageMap marks={marks} onMarksChange={setMarks} />
          )}
        </Section>

        {/* Evidencia */}
        <Section title="Evidencia fotográfica" subtitle="Hasta 3 fotos, máx 5 MB cada una">
          <div className="grid grid-cols-1 gap-3">
            {[0, 1, 2].map((i) => (
              <PhotoCapture
                key={i}
                label={`Foto ${i + 1}`}
                helper={i === 0 ? 'Recomendado: vista general del vehículo' : i === 1 ? 'Detalle del daño principal' : 'Tablero / kilómetros'}
                autoUpload={{ kind: 'damage_photo' }}
                onUploaded={(ev) => setEvidence((prev) => [...prev.filter((_, idx) => idx !== i), ev])}
              />
            ))}
          </div>
        </Section>

        {/* Catalogos (compactos) */}
        <Section title="Servicio inicial">
          <FormField
            label="Modelo de referencia"
            name="modelId"
            type="select"
            value={modelId}
            onChange={setModelId}
            options={modelOptions}
            placeholder={modelsQuery.isLoading ? 'Cargando…' : 'Selecciona modelo'}
            required
            error={errors.modelId}
          />
          <FormField
            label="Servicio inicial"
            name="serviceId"
            type="select"
            value={serviceId}
            onChange={setServiceId}
            options={serviceOptions}
            placeholder={servicesQuery.isLoading ? 'Cargando…' : 'Selecciona servicio'}
            required
            error={errors.serviceId}
            helper="Se puede ajustar después del diagnóstico"
          />
        </Section>

        {/* hidden submit fallback for keyboards */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
      </form>
    </MobileShell>
  )
}

interface SectionProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
  badge?: string
}

function Section({ title, subtitle, children, collapsible, open, onToggle, badge }: SectionProps) {
  return (
    <section
      className="rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
      style={{ borderColor: 'var(--border)' }}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {badge && (
            <span className="rounded-full bg-amber-400/20 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-xs font-bold">
              {badge}
            </span>
          )}
          {collapsible && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </header>
      {(!collapsible || open) && children}
    </section>
  )
}
