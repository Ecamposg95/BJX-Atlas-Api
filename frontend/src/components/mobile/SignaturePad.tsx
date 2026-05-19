import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import SignaturePadLib from 'signature_pad'
import { Eraser, Check } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  /** Llamado al hacer click en "Guardar" con base64 PNG. */
  onSign?: (base64: string) => void
  /** Helper opcional. */
  label?: string
  className?: string
}

export interface SignaturePadHandle {
  isEmpty: () => boolean
  toDataURL: () => string
  clear: () => void
}

/**
 * Canvas táctil con `signature_pad`. Mobile: h-48, desktop: h-64.
 * Usa device-pixel-ratio para nitidez. Touch targets ≥48.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { onSign, label = 'Firma del cliente', className },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const padRef = useRef<SignaturePadLib | null>(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(ratio, ratio)
      padRef.current?.clear()
      setEmpty(true)
    }

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgba(255,255,255,1)',
      penColor: '#0f172a',
      minWidth: 1.2,
      maxWidth: 2.8,
    })
    padRef.current = pad
    pad.addEventListener('endStroke', () => setEmpty(pad.isEmpty()))

    resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      pad.off()
      padRef.current = null
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL('image/png') ?? '',
      clear: () => {
        padRef.current?.clear()
        setEmpty(true)
      },
    }),
    [],
  )

  const handleClear = () => {
    padRef.current?.clear()
    setEmpty(true)
  }

  const handleSave = () => {
    if (!padRef.current || padRef.current.isEmpty()) return
    const data = padRef.current.toDataURL('image/png')
    onSign?.(data)
  }

  return (
    <div className={clsx('signature-pad flex flex-col gap-2', className)}>
      <div
        className="rounded-xl border-2 overflow-hidden bg-white"
        style={{ borderColor: 'var(--border)' }}
      >
        <canvas
          ref={canvasRef}
          aria-label={label}
          className="block w-full h-48 lg:h-64 touch-none"
        />
      </div>

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-sm"
        >
          <Eraser size={16} /> Limpiar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={empty}
          className={clsx(
            'flex-1 min-h-12 inline-flex items-center justify-center gap-2 rounded-xl font-bold text-sm',
            empty
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              : 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 active:scale-[0.98]',
          )}
        >
          <Check size={16} /> Guardar firma
        </button>
      </div>
    </div>
  )
})
