import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

const LINE_ROW_BG: Record<'ok' | 'low' | 'critical', string> = {
  ok: 'bg-emerald-50',
  low: 'bg-orange-50',
  critical: 'bg-red-50',
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
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors ${
        selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900 text-sm">{quote.quote_number}</span>
        <Badge variant={quote.status}>{STATUS_LABELS[quote.status]}</Badge>
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-500 truncate">{displayModel}</span>
        <span className="text-xs text-gray-400 ml-2 shrink-0">{fmtDate(quote.created_at)}</span>
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
      <p className="text-sm text-gray-400 italic py-4 text-center">
        Esta cotización no tiene líneas de servicio.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase text-[11px] tracking-wide">
            <th className="px-3 py-2 text-left font-medium">Servicio</th>
            <th className="px-3 py-2 text-right font-medium">Duración (h)</th>
            <th className="px-3 py-2 text-right font-medium">Mano de obra</th>
            <th className="px-3 py-2 text-right font-medium">Refacciones</th>
            <th className="px-3 py-2 text-right font-medium">Total BJX</th>
            <th className="px-3 py-2 text-right font-medium">Precio Brame</th>
            <th className="px-3 py-2 text-right font-medium">Margen $</th>
            <th className="px-3 py-2 text-right font-medium">Margen %</th>
            <th className="px-3 py-2 text-center font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {lines.map((line) => (
            <tr key={line.id} className={LINE_ROW_BG[line.margin_status]}>
              <td className="px-3 py-2 font-medium text-gray-800">
                {line.service_name ?? line.service_id.slice(0, 8)}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">{line.duration_hrs.toFixed(1)}</td>
              <td className="px-3 py-2 text-right text-gray-700">${fmtCurrency(line.labor_cost)}</td>
              <td className="px-3 py-2 text-right text-gray-700">${fmtCurrency(line.parts_cost)}</td>
              <td className="px-3 py-2 text-right font-semibold text-gray-800">
                ${fmtCurrency(line.total_bjx_cost)}
              </td>
              <td className="px-3 py-2 text-right text-gray-700">${fmtCurrency(line.brame_price)}</td>
              <td className="px-3 py-2 text-right text-gray-700">${fmtCurrency(line.margin_pesos)}</td>
              <td className="px-3 py-2 text-right text-gray-700">{fmtPct(line.margin_pct)}</td>
              <td className="px-3 py-2 text-center">
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
    <div className="flex items-center gap-6 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
      <div className="text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Total BJX</p>
        <p className="text-sm font-bold text-gray-900">${fmtCurrency(totalBjx)}</p>
      </div>
      <div className="h-8 w-px bg-gray-200" />
      <div className="text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Brame</p>
        <p className="text-sm font-bold text-gray-900">${fmtCurrency(totalBrame)}</p>
      </div>
      <div className="h-8 w-px bg-gray-200" />
      <div className="text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Margen promedio</p>
        <p className="text-sm font-bold text-gray-900">{fmtPct(weightedMarginPct)}</p>
      </div>
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
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No se pudo cargar la cotización.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">{quote.quote_number}</h2>
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

        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div className="flex gap-2 text-gray-500">
            <span className="font-medium text-gray-700">Creada por:</span>
            <span>{quote.created_by}</span>
          </div>
          <div className="flex gap-2 text-gray-500">
            <span className="font-medium text-gray-700">Fecha:</span>
            <span>{fmtDate(quote.created_at)}</span>
          </div>
          <div className="flex gap-2 text-gray-500">
            <span className="font-medium text-gray-700">Costo técnico/h:</span>
            <span>${fmtCurrency(quote.technician_cost_hr)}</span>
          </div>
          <div className="flex gap-2 text-gray-500">
            <span className="font-medium text-gray-700">Margen objetivo:</span>
            <span>{fmtPct(quote.target_margin * 100)}</span>
          </div>
        </div>

        {quote.notes && (
          <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">
            {quote.notes}
          </p>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        <LinesTable lines={quote.lines ?? []} />

        {(quote.lines ?? []).length > 0 && <SummaryBar lines={quote.lines ?? []} />}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function QuotesPage() {
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
      <aside className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        {/* Tab filter */}
        <div className="flex overflow-x-auto border-b border-gray-200 shrink-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value)
                setSelectedId(null)
              }}
              className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.value
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100 shrink-0">
          <input
            type="text"
            placeholder="Buscar por folio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isListLoading ? (
            <div className="px-4 py-3 space-y-3">
              <TableSkeleton rows={6} cols={2} />
            </div>
          ) : filteredQuotes.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {search ? 'Sin resultados para la búsqueda.' : 'No hay cotizaciones en esta categoría.'}
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
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {selectedId ? (
          <QuoteDetail quoteId={selectedId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">Selecciona una cotización para ver el detalle</p>
          </div>
        )}
      </main>
    </div>
  )
}
