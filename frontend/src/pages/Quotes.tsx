import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getQuotes, getQuote, updateQuoteStatus, exportQuote } from '../api'
import type { Quote, QuoteStatus, QuoteLine } from '../api/types'
import { Badge, MarginBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton, TableSkeleton } from '../components/ui/Skeleton'
import { useAuthStore } from '../store/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-MX')
}

function fmtCurrency(value: number): string {
  return value.toLocaleString('es-MX', { minimumFractionDigits: 2 })
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`
}

const STATUS_TABS: Array<{ label: string; value: QuoteStatus | 'all' }> = [
  { label: 'Todos', value: 'all' },
  { label: 'Borrador', value: 'draft' },
  { label: 'Confirmada', value: 'confirmed' },
  { label: 'Facturada', value: 'invoiced' },
  { label: 'Cancelada', value: 'cancelled' },
]

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  invoiced: 'Facturada',
  cancelled: 'Cancelada',
}


// ── Quote list item ───────────────────────────────────────────────────────────

function QuoteListItem({
  quote,
  selected,
  onClick,
}: {
  quote: Quote
  selected: boolean
  onClick: () => void
}) {
  const displayModel =
    quote.model_name
      ? quote.model_name.length > 24
        ? `${quote.model_name.slice(0, 22)}…`
        : quote.model_name
      : quote.model_id.slice(0, 8)

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 transition-colors"
      style={{
        borderBottom: '1px solid var(--border-dim)',
        borderLeft: selected ? '2px solid var(--primary)' : '2px solid transparent',
        background: selected ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{quote.quote_number}</span>
        <Badge variant={quote.status}>{STATUS_LABELS[quote.status]}</Badge>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{displayModel}</span>
        <span className="text-xs ml-2 shrink-0" style={{ color: 'var(--text-faint)' }}>{fmtDate(quote.created_at)}</span>
      </div>
    </button>
  )
}

// ── Detail skeleton ───────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center gap-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <TableSkeleton rows={4} cols={9} />
    </div>
  )
}

// ── Lines table ───────────────────────────────────────────────────────────────

function LinesTable({ lines }: { lines: QuoteLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="py-4 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>
        Esta cotización no tiene líneas de servicio.
      </p>
    )
  }

  const STATUS_COLORS_MAP = { ok: '#10B981', low: '#F97316', critical: '#EF4444' } as const
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
      <table className="min-w-full text-xs">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left">Servicio</th>
            <th className="px-4 py-3 text-right">Hrs</th>
            <th className="px-4 py-3 text-right">MO</th>
            <th className="px-4 py-3 text-right">Refac.</th>
            <th className="px-4 py-3 text-right">Total BJX</th>
            <th className="px-4 py-3 text-right">Brame</th>
            <th className="px-4 py-3 text-right">Margen $</th>
            <th className="px-4 py-3 text-right">Margen %</th>
            <th className="px-4 py-3 text-center">Estado</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} style={{ borderLeft: `3px solid ${STATUS_COLORS_MAP[line.margin_status]}33` }}>
              <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text)' }}>
                {line.service_name ?? line.service_id.slice(0, 8)}
              </td>
              <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>{line.duration_hrs.toFixed(1)}</td>
              <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>${fmtCurrency(line.labor_cost)}</td>
              <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>${fmtCurrency(line.parts_cost)}</td>
              <td className="px-4 py-3 text-right font-bold" style={{ color: 'var(--text)' }}>
                ${fmtCurrency(line.total_bjx_cost)}
              </td>
              <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>${fmtCurrency(line.brame_price)}</td>
              <td className="px-4 py-3 text-right" style={{ color: 'var(--text-muted)' }}>${fmtCurrency(line.margin_pesos)}</td>
              <td className="px-4 py-3 text-right font-bold" style={{ color: STATUS_COLORS_MAP[line.margin_status] }}>{fmtPct(line.margin_pct)}</td>
              <td className="px-4 py-3 text-center">
                <MarginBadge status={line.margin_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ lines }: { lines: QuoteLine[] }) {
  const totalBjx = lines.reduce((sum, l) => sum + l.total_bjx_cost, 0)
  const totalBrame = lines.reduce((sum, l) => sum + l.brame_price, 0)

  const weightedMarginPct =
    totalBrame > 0
      ? lines.reduce((sum, l) => sum + l.margin_pct * l.brame_price, 0) / totalBrame
      : 0

  return (
    <div className="flex items-center gap-6 rounded-xl px-5 py-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {[
        { label: 'Total BJX', value: `$${fmtCurrency(totalBjx)}` },
        { label: 'Precio Brame', value: `$${fmtCurrency(totalBrame)}` },
        { label: 'Margen promedio', value: fmtPct(weightedMarginPct) },
      ].map((item, i) => (
        <>
          {i > 0 && <div key={`sep-${i}`} className="h-8 w-px" style={{ background: 'var(--border)' }} />}
          <div key={item.label} className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>{item.label}</p>
            <p className="mt-0.5 text-sm font-black" style={{ color: 'var(--text)' }}>{item.value}</p>
          </div>
        </>
      ))}
    </div>
  )
}

// ── Action buttons ────────────────────────────────────────────────────────────

function ActionButtons({
  quote,
  onStatusChange,
  onExport,
  isStatusLoading,
  isExporting,
}: {
  quote: Quote
  onStatusChange: (status: QuoteStatus) => void
  onExport: (format: 'pdf' | 'xlsx') => void
  isStatusLoading: boolean
  isExporting: boolean
}) {
  const { hasRole } = useAuthStore()

  const canConfirm = hasRole(['admin', 'operador'])
  const canInvoice = hasRole(['admin'])
  const canCancel = hasRole(['admin', 'operador'])
  const canExport = hasRole(['admin', 'operador', 'viewer'])

  const showExport = quote.status === 'confirmed' || quote.status === 'invoiced'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quote.status === 'draft' && canConfirm && (
        <Button
          variant="primary"
          size="sm"
          loading={isStatusLoading}
          onClick={() => onStatusChange('confirmed')}
        >
          Confirmar
        </Button>
      )}

      {quote.status === 'confirmed' && canInvoice && (
        <Button
          variant="primary"
          size="sm"
          loading={isStatusLoading}
          onClick={() => onStatusChange('invoiced')}
        >
          Marcar como Facturada
        </Button>
      )}

      {(quote.status === 'draft' || quote.status === 'confirmed') && canCancel && (
        <Button
          variant="danger"
          size="sm"
          loading={isStatusLoading}
          onClick={() => onStatusChange('cancelled')}
        >
          Cancelar
        </Button>
      )}

      {showExport && canExport && (
        <>
          <Button
            variant="secondary"
            size="sm"
            loading={isExporting}
            onClick={() => onExport('pdf')}
          >
            Exportar PDF
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={isExporting}
            onClick={() => onExport('xlsx')}
          >
            Exportar XLSX
          </Button>
        </>
      )}
    </div>
  )
}

// ── Right pane: detail ────────────────────────────────────────────────────────

function QuoteDetail({ quoteId }: { quoteId: string }) {
  const queryClient = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => getQuote(quoteId),
    enabled: Boolean(quoteId),
  })

  const statusMutation = useMutation({
    mutationFn: (status: QuoteStatus) => updateQuoteStatus(quoteId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] })
    },
  })

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    setIsExporting(true)
    try {
      const blob = await exportQuote(quoteId, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cotizacion-${quote?.quote_number ?? quoteId}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // silently ignore — could show a toast in a richer implementation
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) return <DetailSkeleton />

  if (!quote) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
        No se pudo cargar la cotización.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 space-y-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>{quote.quote_number}</h2>
            <Badge variant={quote.status}>{STATUS_LABELS[quote.status]}</Badge>
          </div>
          <ActionButtons
            quote={quote}
            onStatusChange={(status) => statusMutation.mutate(status)}
            onExport={handleExport}
            isStatusLoading={statusMutation.isPending}
            isExporting={isExporting}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
          {[
            { label: 'Creada por', value: quote.created_by },
            { label: 'Fecha', value: fmtDate(quote.created_at) },
            { label: 'Costo técnico/h', value: `$${fmtCurrency(quote.technician_cost_hr)}` },
            { label: 'Margen objetivo', value: fmtPct(quote.target_margin * 100) },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-2">
              <span className="font-bold text-xs uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{label}:</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{value}</span>
            </div>
          ))}
        </div>

        {quote.notes && (
          <p className="text-xs italic pl-3" style={{ color: 'var(--text-muted)', borderLeft: '2px solid var(--primary)' }}>
            {quote.notes}
          </p>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        <LinesTable lines={quote.lines ?? []} />

        {(quote.lines ?? []).length > 0 && <SummaryBar lines={quote.lines ?? []} />}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function QuotesPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<QuoteStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: quotes = [], isLoading: isListLoading } = useQuery({
    queryKey: ['quotes', activeTab],
    queryFn: () =>
      getQuotes(activeTab !== 'all' ? { status: activeTab } : undefined),
  })

  const filteredQuotes = search.trim()
    ? quotes.filter((q) =>
        q.quote_number.toLowerCase().includes(search.trim().toLowerCase())
      )
    : quotes

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left pane ─────────────────────────────────── */}
      <aside className="w-72 shrink-0 flex flex-col" style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
        {/* Tab filter */}
        <div className="flex overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value)
                setSelectedId(null)
              }}
              className="px-3 py-3 text-xs font-bold whitespace-nowrap transition-colors"
              style={{
                borderBottom: activeTab === tab.value ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab.value ? 'var(--primary-dark)' : 'var(--text-muted)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <input
            type="text"
            placeholder="Buscar por folio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isListLoading ? (
            <div className="px-4 py-3 space-y-3">
              <TableSkeleton rows={6} cols={2} />
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
              <svg className="mb-3 h-14 w-14" style={{ color: 'var(--text-faint)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {search ? (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sin resultados para la búsqueda.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>No hay cotizaciones aquí todavía.</p>
                  <button
                    onClick={() => navigate('/calculator')}
                    className="rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors"
                    style={{ background: 'linear-gradient(135deg, var(--primary-dark), var(--primary))' }}
                  >
                    Crear primera cotización
                  </button>
                </>
              )}
            </div>
          ) : (
            filteredQuotes.map((quote) => (
              <QuoteListItem
                key={quote.id}
                quote={quote}
                selected={selectedId === quote.id}
                onClick={() => setSelectedId(quote.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Right pane ────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>
        {selectedId ? (
          <QuoteDetail quoteId={selectedId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-faint)' }}>
            <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Selecciona una cotización para ver el detalle</p>
          </div>
        )}
      </main>
    </div>
  )
}
