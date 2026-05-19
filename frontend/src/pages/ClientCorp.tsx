import { Construction } from 'lucide-react'
import { PageShell } from '../components/ui/PageShell'

/**
 * ClientCorp — home del cliente corporativo. Stub Ola 5.
 *
 * Cuando se implemente: dashboard de flota, solo OS cuyo customer_id
 * pertenece al usuario. Sin acceso a costos, margenes ni mecanico
 * asignado.
 */
export function ClientCorpPage() {
  return (
    <PageShell>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-faint)' }}>
          Cliente corporativo
        </p>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text)' }}>
          Panel de flota
        </h1>
      </header>

      <div
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-16 px-6 text-center"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <Construction size={36} style={{ color: 'var(--color-brand-yellow)' }} />
        <p className="text-base font-bold" style={{ color: 'var(--text)' }}>
          En construccion — Ola 5
        </p>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
          Vista de flota corporativa (status, progreso, milestones) en proxima entrega.
        </p>
      </div>
    </PageShell>
  )
}
