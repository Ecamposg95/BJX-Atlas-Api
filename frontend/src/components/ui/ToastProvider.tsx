import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Toast, type ToastItem, type ToastVariant } from './Toast'

interface ToastOptions {
  description?: string
  duration?: number
}

type ToastFn = (message: string, opts?: ToastOptions) => string

interface ToastApi {
  success: ToastFn
  error: ToastFn
  warning: ToastFn
  info: ToastFn
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION = 4000

let counter = 0
const genId = (): string => {
  counter += 1
  return `t-${Date.now().toString(36)}-${counter}`
}

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (variant: ToastVariant, message: string, opts?: ToastOptions): string => {
      const id = genId()
      const duration = opts?.duration ?? DEFAULT_DURATION
      const item: ToastItem = {
        id,
        variant,
        message,
        description: opts?.description,
        duration,
      }
      setToasts((prev) => [...prev, item])
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration)
        timersRef.current.set(id, timer)
      }
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, opts) => push('success', message, opts),
      error: (message, opts) => push('error', message, opts),
      warning: (message, opts) => push('warning', message, opts),
      info: (message, opts) => push('info', message, opts),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          right: '1rem',
          bottom: '1rem',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <Toast toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return ctx
}
