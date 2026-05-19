import { Link } from 'react-router-dom'
import { Construction, ArrowRight } from 'lucide-react'
import { PageShell } from '../components/ui/PageShell'

/**
 * Workshop — home del jefe_taller. Stub Ola 4.
 *
 * Cuando se implemente: vista cabeza del piso con bahias en vivo,
 * cola de asignaciones, findings pendientes de aprobar y QA pass/fail.
 *
 * Mientras tanto el jefe usa /workshop/board (kanban) que ya existe.
 */
export function WorkshopPage() {
  return (
    <PageShell>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-faint)' }}>
          Jefe de taller
        </p>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text)' }}>
          Mando del taller
        </h1>
      </header>

      <div
        className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed py-16 px-6 text-center"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <Construction size={36} style={{ color: 'var(--color-brand-yellow)' }} />
        <p className="text-base font-bold" style={{ color: 'var(--text)' }}>
          En construccion — Ola 4
        </p>
        <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
          Pronto: bahias en vivo, cola de asignaciones, findings y QA. Por ahora usa el tablero kanban.
        </p>
        <Link
          to="/workshop/board"
          className="inline-flex items-center gap-2 mt-2 rounded-lg px-4 py-2 text-sm font-bold"
          style={{ background: 'var(--color-brand-yellow)', color: 'var(--color-brand-navy)' }}
        >
          Ir al tablero
          <ArrowRight size={16} />
        </Link>
      </div>
    </PageShell>
  )
}
