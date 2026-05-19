/**
 * Entrega final (Módulo 3 + 4 — Wave 4).
 *
 * Asesor captura firma del cliente y confirma entrega → PDF acuse + link
 * WhatsApp.
 */
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Send, FileDown, MessageCircle, CheckCircle2 } from 'lucide-react'
import api from '@/api/client'
import { MobileShell } from '@/components/mobile/MobileShell'
import { SignaturePad, type SignaturePadHandle } from '@/components/mobile/SignaturePad'
import { PhotoCapture, type UploadedEvidence } from '@/components/mobile/PhotoCapture'
import { FormField } from '@/components/ui/FormField'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastProvider'
import { deliveriesApi, type DeliverResponse } from '@/api/endpoints/deliveries'

interface WorkOrderRead {
  id: string
  order_number: string
  status: string
  vehicle_summary?: { plates?: string | null; customer_name?: string | null; brand?: string | null; model?: string | null }
  service_name?: string
}

export function AdvisorDeliveryPage() {
  const { workOrderId } = useParams<{ workOrderId: string }>()
  const navigate = useNavigate()
  const toast = useToast()

  const signatureRef = useRef<SignaturePadHandle | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [idType, setIdType] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [exitMileage, setExitMileage] = useState('')
  const [evidence, setEvidence] = useState<UploadedEvidence[]>([])
  const [signature, setSignature] = useState<string | null>(null)
  const [result, setResult] = useState<DeliverResponse | null>(null)

  const woQuery = useQuery({
    queryKey: ['delivery-wo', workOrderId],
    queryFn: async () => {
      if (!workOrderId) throw new Error('Falta ID')
      const r = await api.get<WorkOrderRead>(`/work-orders/${workOrderId}`)
      return r.data
    },
    enabled: !!workOrderId,
  })

  const wo = woQuery.data

  // Pre-llenar nombre desde vehículo
  if (wo && !customerName && wo.vehicle_summary?.customer_name) {
    setCustomerName(wo.vehicle_summary.customer_name)
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!workOrderId) throw new Error('Falta ID')
      if (!signature) throw new Error('Falta firma')
      return deliveriesApi.deliverWithSignature(workOrderId, {
        customer_name: customerName.trim(),
        customer_id_type: idType || null,
        customer_id_number: idNumber || null,
        signature_base64: signature,
        evidence_ids: evidence.map((e) => e.id),
        exit_mileage: exitMileage ? Number(exitMileage) : null,
      })
    },
    onSuccess: (data) => {
      setResult(data)
      toast.success(`OS ${data.work_order.order_number} entregada`)
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Error al entregar'
      toast.error(msg)
    },
  })

  const handleSubmit = () => {
    if (!customerName.trim()) {
      toast.error('Falta nombre del cliente')
      return
    }
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast.error('Pide al cliente que firme')
      return
    }
    const sig = signatureRef.current.toDataURL()
    setSignature(sig)
    // wait microtask to ensure state updated before mutation reads it
    setTimeout(() => mutation.mutate(), 0)
  }

  // Success view
  if (result) {
    return (
      <MobileShell
        title="Entrega confirmada"
        subtitle={`OS ${result.work_order.order_number}`}
        onBack={() => navigate('/advisor')}
      >
        <section
          className="rounded-2xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-5 flex flex-col items-center gap-3 text-center"
        >
          <div className="h-16 w-16 rounded-full bg-emerald-500 flex items-center justify-center text-white">
            <CheckCircle2 size={32} />
          </div>
          <p className="text-lg font-extrabold text-emerald-900 dark:text-emerald-100">
            Entrega registrada
          </p>
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Acuse digital con firma generado para {result.delivery.customer_name}.
          </p>
        </section>

        <div className="mt-5 grid gap-3">
          {result.pdf_url && (
            <a
              href={result.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white px-4 py-3 font-bold text-base"
            >
              <FileDown size={20} /> Descargar acuse PDF
            </a>
          )}
          {!result.pdf_url && workOrderId && (
            <a
              href={`/api${deliveriesApi.acusePdfUrl(workOrderId)}`}
              target="_blank"
              rel="noreferrer"
              className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white px-4 py-3 font-bold text-base"
            >
              <FileDown size={20} /> Generar y descargar acuse
            </a>
          )}
          {result.whatsapp_link && (
            <a
              href={result.whatsapp_link}
              target="_blank"
              rel="noreferrer"
              className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-white px-4 py-3 font-bold text-base shadow-md shadow-emerald-500/30"
            >
              <MessageCircle size={20} /> Notificar cliente por WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate('/advisor')}
            className="min-h-14 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-4 py-3 font-bold text-base"
          >
            Volver al inicio
          </button>
        </div>
      </MobileShell>
    )
  }

  return (
    <MobileShell
      title="Entrega final"
      subtitle={wo ? `OS ${wo.order_number}` : 'Cargando…'}
      onBack={() => navigate(-1)}
      bottomActions={[
        {
          label: mutation.isPending ? 'Confirmando…' : 'Confirmar entrega',
          variant: 'primary',
          onClick: handleSubmit,
          loading: mutation.isPending,
          icon: <Send size={16} />,
        },
      ]}
    >
      {woQuery.isLoading && <Skeleton className="h-32 w-full" />}

      {wo && (
        <section
          className="rounded-2xl border bg-white dark:bg-slate-900 p-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
            Vehículo
          </p>
          <p className="font-bold text-base" style={{ color: 'var(--text)' }}>
            {wo.vehicle_summary?.plates ?? '—'} · {wo.vehicle_summary?.brand ?? ''} {wo.vehicle_summary?.model ?? ''}
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Cliente: {wo.vehicle_summary?.customer_name ?? '—'}
          </p>
        </section>
      )}

      <section
        className="mt-4 rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
          Datos de quien recibe
        </h3>
        <FormField
          name="customer_name"
          label="Nombre"
          required
          value={customerName}
          onChange={setCustomerName}
        />
        <div className="grid grid-cols-2 gap-2">
          <FormField
            name="id_type"
            label="Identificación"
            value={idType}
            onChange={setIdType}
            placeholder="INE / Pasaporte"
          />
          <FormField
            name="id_number"
            label="Número"
            value={idNumber}
            onChange={setIdNumber}
            placeholder="Opcional"
          />
        </div>
        <FormField
          name="exit_mileage"
          label="Kilometraje de salida"
          type="number"
          value={exitMileage}
          onChange={setExitMileage}
          min={0}
          placeholder="Opcional"
        />
      </section>

      <section
        className="mt-4 rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
          Firma del cliente
        </h3>
        <SignaturePad
          ref={signatureRef}
          onSign={(b64) => setSignature(b64)}
        />
        {signature && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <CheckCircle2 size={14} /> Firma capturada
          </p>
        )}
      </section>

      <section
        className="mt-4 rounded-2xl border bg-white dark:bg-slate-900 p-4 flex flex-col gap-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-extrabold uppercase tracking-widest" style={{ color: 'var(--text)' }}>
          Acuse fotográfico (opcional)
        </h3>
        <PhotoCapture
          label="Foto de entrega"
          autoUpload={{ kind: 'damage_photo', workOrderId }}
          onUploaded={(ev) => setEvidence((prev) => [...prev, ev])}
        />
      </section>
    </MobileShell>
  )
}
