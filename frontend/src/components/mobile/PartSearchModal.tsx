/**
 * Modal mobile-first para buscar refacciones y crear inventory requests.
 *
 * Flujo: el mecánico escribe búsqueda → consulta /inventory/parts → elige
 * filas con cantidad → "Solicitar (N)" lanza POST /inventory/requests por
 * cada item. Pensado para uso desde MechanicTaskDetail.
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Minus, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/ToastProvider'
import { listParts, createInventoryRequest } from '@/api'
import type { Part, InventoryRequest } from '@/api/types'

interface Props {
  open: boolean
  workOrderId: string
  onClose: () => void
  onSubmitted: (requests: InventoryRequest[]) => void
}

interface SelectedItem {
  part: Part
  qty: number
}

function stockBadge(stock: number | undefined): { label: string; cls: string } {
  const n = stock ?? 0
  if (n >= 10)
    return { label: `Disponible · ${n}`, cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200' }
  if (n >= 5)
    return { label: `Bajo · ${n}`, cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' }
  return { label: `Crítico · ${n}`, cls: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' }
}

export function PartSearchModal({ open, workOrderId, onClose, onSubmitted }: Props) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<Part[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<SelectedItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebounced('')
      setResults([])
      setSelected([])
    }
  }, [open])

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  // Fetch results
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const page = await listParts({
          q: debounced || undefined,
          only_active: true,
          page: 1,
          page_size: 20,
        })
        if (!cancelled) setResults(Array.isArray(page?.items) ? page.items : [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [debounced, open])

  const totalQty = useMemo(() => selected.reduce((acc, s) => acc + s.qty, 0), [selected])

  function addPart(part: Part) {
    setSelected((prev) => {
      const existing = prev.find((s) => s.part.id === part.id)
      if (existing) {
        return prev.map((s) => (s.part.id === part.id ? { ...s, qty: s.qty + 1 } : s))
      }
      return [...prev, { part, qty: 1 }]
    })
  }

  function changeQty(partId: string, delta: number) {
    setSelected((prev) =>
      prev
        .map((s) => (s.part.id === partId ? { ...s, qty: Math.max(0, s.qty + delta) } : s))
        .filter((s) => s.qty > 0),
    )
  }

  function removePart(partId: string) {
    setSelected((prev) => prev.filter((s) => s.part.id !== partId))
  }

  async function handleSubmit() {
    if (selected.length === 0) return
    setSubmitting(true)
    try {
      const created: InventoryRequest[] = []
      for (const item of selected) {
        const r = await createInventoryRequest({
          work_order_id: workOrderId,
          part_id: item.part.id,
          quantity: item.qty,
          priority: 'normal',
        })
        created.push(r)
      }
      toast.success(`${created.length} solicitud${created.length === 1 ? '' : 'es'} creada${created.length === 1 ? '' : 's'}`)
      onSubmitted(created)
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo crear la solicitud'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Solicitar refacción"
      description="Busca por nombre o SKU y agrega cantidades."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            loading={submitting}
            disabled={selected.length === 0 || submitting}
          >
            Solicitar ({totalQty})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Search input */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-faint)' }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar refacción o código..."
            className="w-full min-h-12 pl-10 pr-3 py-2 rounded-xl border-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            autoFocus
          />
        </div>

        {/* Selected items summary */}
        {selected.length > 0 && (
          <section
            className="rounded-xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-400/10 p-3 flex flex-col gap-2"
          >
            <h3 className="text-[0.7rem] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Seleccionadas ({selected.length})
            </h3>
            <ul className="flex flex-col gap-2">
              {selected.map((s) => (
                <li
                  key={s.part.id}
                  className="flex items-center gap-2 rounded-lg p-2 bg-white dark:bg-slate-900"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {s.part.name}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--text-faint)' }}>
                      {s.part.sku}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => changeQty(s.part.id, -1)}
                      className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      aria-label="Disminuir"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="tabular-nums font-extrabold text-sm w-6 text-center" style={{ color: 'var(--text)' }}>
                      {s.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeQty(s.part.id, 1)}
                      className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                      aria-label="Aumentar"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePart(s.part.id)}
                      className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                      aria-label="Quitar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Results */}
        <div className="flex flex-col gap-2">
          <h3 className="text-[0.7rem] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Resultados
          </h3>
          {loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
              {debounced ? 'Sin resultados para esa búsqueda.' : 'Escribe para buscar refacciones.'}
            </div>
          )}
          {!loading && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((p) => {
                const stock = p.total_available ?? p.total_quantity ?? 0
                const badge = stockBadge(stock)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addPart(p)}
                      className={clsx(
                        'w-full text-left rounded-xl border p-3',
                        'flex items-center justify-between gap-3',
                        'hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10',
                        'active:scale-[0.99] transition-all',
                      )}
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {p.name}
                        </p>
                        <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-faint)' }}>
                          {p.sku}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold whitespace-nowrap',
                          badge.cls,
                        )}
                      >
                        {badge.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
