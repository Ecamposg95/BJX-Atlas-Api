import { type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

type Side = 'right' | 'left'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_WIDTH: Record<Size, string> = {
  sm: '360px',
  md: '460px',
  lg: '620px',
  xl: '820px',
}

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  side?: Side
  size?: Size
  footer?: ReactNode
  children: ReactNode
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  side = 'right',
  size = 'md',
  footer,
  children,
}: DrawerProps) {
  const isRight = side === 'right'
  const positionStyle: React.CSSProperties = isRight
    ? { right: 0, top: 0, bottom: 0, borderLeft: '1px solid var(--border)' }
    : { left: 0, top: 0, bottom: 0, borderRight: '1px solid var(--border)' }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{
            background: 'rgba(2, 6, 23, 0.5)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'drawerOverlayIn var(--duration-base) var(--ease-premium)',
          }}
        />
        <Dialog.Content
          className={clsx(
            'fixed z-50 flex w-full flex-col overflow-hidden focus:outline-none'
          )}
          style={{
            ...positionStyle,
            maxWidth: SIZE_WIDTH[size],
            background: 'color-mix(in srgb, var(--surface) 96%, transparent)',
            boxShadow: 'var(--shadow-lg)',
            animation: `${isRight ? 'drawerSlideInRight' : 'drawerSlideInLeft'} var(--duration-base) var(--ease-premium)`,
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
              {description && (
                <Dialog.Description
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {description}
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
        @keyframes drawerOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes drawerSlideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes drawerSlideInLeft {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </Dialog.Root>
  )
}
