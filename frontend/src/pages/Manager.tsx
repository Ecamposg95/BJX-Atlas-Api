import { Construction } from 'lucide-react'
import { PageShell } from '../components/ui/PageShell'

/**
 * Manager — home del gerente_sede. Stub Ola 4.
 *
 * Cuando se implemente: dashboard de sucursal con KPIs cacheados
 * (cycle time, margen, on-time delivery), aprobacion de service
 * proposals, override de validacion de nivel, configuracion de bahias.
 */
export function ManagerPage() {
  return (
    <PageShell>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--text-faint)' }}>
          Gerente de sede
        </p>
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--text)' }}>
          Panel de sucursal
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
          KPIs de sucursal, aprobacion de proposals y configuracion de bahias se publican en la proxima ola.
          Mientras tanto, usa el dashboard operativo.
        </p>
      </div>
    </PageShell>
  )
}
