import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, Trash2, UploadCloud } from 'lucide-react'
import { clsx } from 'clsx'
import api from '@/api/client'
import { useToast } from '@/components/ui/ToastProvider'

export type EvidenceKindUpload = 'damage_photo' | 'parts_receipt' | 'finding_photo'

export interface UploadedEvidence {
  id: string
  url: string
  kind: EvidenceKindUpload
  work_order_id: string | null
  uploaded_by_id: string | null
  note: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

interface AutoUploadConfig {
  kind: EvidenceKindUpload
  workOrderId?: string
  note?: string
}

interface Props {
  label?: string
  helper?: string
  /** Subir automáticamente al endpoint /v1/evidence cuando se captura. */
  autoUpload?: AutoUploadConfig
  /** Devuelve el File local (independiente de upload). */
  onCapture?: (file: File) => void
  /** Devuelve la respuesta del backend tras upload exitoso. */
  onUploaded?: (evidence: UploadedEvidence) => void
  /** Tamaño máximo en bytes (default 5MB). */
  maxBytes?: number
  className?: string
}

const DEFAULT_MAX = 5 * 1024 * 1024

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Input mobile-first cámara-primero. Usa `capture="environment"` para forzar
 * cámara trasera en mobile (web) — en desktop cae al picker normal.
 */
export function PhotoCapture({
  label = 'Tomar foto',
  helper,
  autoUpload,
  onCapture,
  onUploaded,
  maxBytes = DEFAULT_MAX,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState<UploadedEvidence | null>(null)
  const toast = useToast()

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const doUpload = useCallback(
    async (f: File) => {
      if (!autoUpload) return
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', f)
        fd.append('kind', autoUpload.kind)
        if (autoUpload.workOrderId) fd.append('work_order_id', autoUpload.workOrderId)
        if (autoUpload.note) fd.append('note', autoUpload.note)
        const res = await api.post<UploadedEvidence>('/v1/evidence', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setUploaded(res.data)
        onUploaded?.(res.data)
        toast.success('Foto subida')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error subiendo foto'
        toast.error(msg)
      } finally {
        setUploading(false)
      }
    },
    [autoUpload, onUploaded, toast],
  )

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > maxBytes) {
      toast.error(`La foto excede ${formatBytes(maxBytes)} (recibido ${formatBytes(f.size)})`)
      e.target.value = ''
      return
    }
    const okMime = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!okMime.includes(f.type)) {
      toast.error(`Formato no soportado: ${f.type || 'desconocido'}`)
      e.target.value = ''
      return
    }
    setFile(f)
    setUploaded(null)
    onCapture?.(f)
    void doUpload(f)
  }

  const clear = () => {
    setFile(null)
    setUploaded(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const replace = () => {
    inputRef.current?.click()
  }

  return (
    <div className={clsx('photo-capture flex flex-col gap-2', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePick}
        className="hidden"
        aria-label={label}
      />

      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed',
            'px-4 py-3 font-bold text-sm',
            'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200',
            'hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10',
            'active:scale-[0.98] transition-all',
          )}
        >
          <Camera size={20} />
          {label}
        </button>
      )}

      {file && preview && (
        <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          <img src={preview} alt="Vista previa" className="w-full aspect-[4/3] object-cover bg-slate-100 dark:bg-slate-800" />
          <div className="absolute top-2 right-2 flex gap-2">
            {uploading && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/80 text-white px-2.5 py-1 text-xs font-bold">
                <UploadCloud size={14} className="animate-pulse" /> Subiendo…
              </span>
            )}
            {uploaded && !uploading && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 text-white px-2.5 py-1 text-xs font-bold">
                <UploadCloud size={14} /> Subida
              </span>
            )}
          </div>
          <div className="flex items-stretch gap-2 p-2 bg-slate-50 dark:bg-slate-900">
            <button
              type="button"
              onClick={replace}
              className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-sm"
            >
              <RotateCcw size={16} /> Reemplazar
            </button>
            <button
              type="button"
              onClick={clear}
              className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-semibold text-sm"
            >
              <Trash2 size={16} /> Quitar
            </button>
          </div>
        </div>
      )}

      {(helper || (file && file.size)) && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {file ? `${file.name} • ${formatBytes(file.size)}` : helper}
        </p>
      )}
    </div>
  )
}
