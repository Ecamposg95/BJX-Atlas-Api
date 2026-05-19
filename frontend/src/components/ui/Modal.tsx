import { type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_MAX_WIDTH: Record<Size, string> = {
  sm: '420px',
  md: '560px',
  lg: '760px',
  xl: '980px',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: Size
  footer?: ReactNode
  children: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{
            background: 'rgba(2, 6, 23, 0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            animation: 'modalOverlayIn var(--duration-base) var(--ease-premium)',
          }}
        />
        <Dialog.Content
          className={clsx(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)]',
            'flex-col overflow-hidden focus:outline-none'
          )}
          style={{
            transform: 'translate(-50%, -50%)',
            maxWidth: SIZE_MAX_WIDTH[size],
            background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl)',
            boxShadow: 'var(--shadow-lg)',
            animation: 'modalContentIn var(--duration-base) var(--ease-premium)',
          }}
        >
          <header
            className="flex items-start justify-between gap-4 px-6 pt-5 pb-4"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              <Dialog.Title
                className="text-lg font-extrabold leading-tight"
                style={{ color: 'var(--text)' }}
              >
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  {title}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="flex-shrink-0 rounded-lg p-1.5 transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5" style={{ color: 'var(--text)' }}>
            {children}
          </div>

          {footer && (
            <footer
              className="flex items-center justify-end gap-2 px-6 py-4"
              style={{
                borderTop: '1px solid var(--border)',
                background: 'color-mix(in srgb, var(--surface-2) 60%, transparent)',
              }}
            >
              {footer}
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      <style>{`
        @keyframes modalOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes modalContentIn {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </Dialog.Root>
  )
}
