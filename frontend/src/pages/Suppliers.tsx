import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSuppliers, getSupplierPrices } from '../api'
import type { Supplier, SupplierPrice } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCurrency = (val: number) =>
  '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const fmtDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// ── Skeleton Cards ────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-28 rounded-lg" />
    </div>
  )
}

// ── Prices Table ──────────────────────────────────────────────────────────────
function PricesTable({ supplierId }: { supplierId: string }) {
  const pricesQuery = useQuery({
    queryKey: ['supplier-prices', supplierId],
    queryFn: () => getSupplierPrices(supplierId),
  })

  const prices: SupplierPrice[] = pricesQuery.data ?? []

  if (pricesQuery.isLoading) {
    return (
      <div className="mt-4 space-y-2 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (pricesQuery.isError) {
    return (
      <p className="mt-3 text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
        Error cargando precios
      </p>
    )
  }

  if (prices.length === 0) {
    return (
      <p className="mt-3 text-sm text-gray-400 italic">Sin precios registrados</p>
    )
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500 border-b border-gray-100">
            <th className="px-4 py-2">Modelo ID</th>
            <th className="px-4 py-2">Servicio ID</th>
            <th className="px-4 py-2 text-right">Costo Ref</th>
            <th className="px-4 py-2 text-right">Precio Total</th>
            <th className="px-4 py-2 text-center">Fecha</th>
            <th className="px-4 py-2 text-center">Vigente</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {prices.map((price) => (
            <tr key={price.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-2 font-mono text-gray-600 truncate max-w-[120px]" title={price.model_id}>
                {price.model_id.slice(0, 8)}…
              </td>
              <td className="px-4 py-2 font-mono text-gray-600 truncate max-w-[120px]" title={price.service_id}>
                {price.service_id.slice(0, 8)}…
              </td>
              <td className="px-4 py-2 text-right text-gray-700">{fmtCurrency(price.ref_cost)}</td>
              <td className="px-4 py-2 text-right font-medium text-gray-900">
                {fmtCurrency(price.total_price)}
              </td>
              <td className="px-4 py-2 text-center text-gray-500">{fmtDate(price.price_date)}</td>
              <td className="px-4 py-2 text-center">
                {price.is_current ? (
                  <Badge variant="ok">Vigente</Badge>
                ) : (
                  <Badge variant="cancelled">Expirado</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Supplier Card ─────────────────────────────────────────────────────────────
function SupplierCard({ supplier }: { supplier: Supplier }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-gray-900">{supplier.name}</p>
          {supplier.contact_name && (
            <p className="mt-0.5 text-xs text-gray-400">{supplier.contact_name}</p>
          )}
          {supplier.contact_email && (
            <p className="text-xs text-gray-400">{supplier.contact_email}</p>
          )}
        </div>
        <Badge variant={supplier.active ? 'ok' : 'cancelled'}>
          {supplier.active ? 'Activo' : 'Inactivo'}
        </Badge>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">Lead Time</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {supplier.lead_time_days}d
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">Garantía</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {supplier.warranty_days}d
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500">Precios</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{supplier.price_count}</p>
        </div>
      </div>

      {/* Coverage */}
      <div className="flex gap-4 text-xs text-gray-500">
        <span>
          Modelos:{' '}
          <span className="font-medium text-gray-700">{supplier.model_coverage}</span>
        </span>
        <span>
          Servicios:{' '}
          <span className="font-medium text-gray-700">{supplier.service_coverage}</span>
        </span>
        {supplier.avg_price_index != null && (
          <span>
            Índice precio:{' '}
            <span className="font-medium text-gray-700">
              {supplier.avg_price_index.toFixed(2)}
            </span>
          </span>
        )}
      </div>

      {/* Expand button */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? 'Ocultar precios' : 'Ver precios'}
      </Button>

      {/* Prices panel */}
      {expanded && <PricesTable supplierId={supplier.id} />}
    </div>
  )
}

// ── Suppliers Page ────────────────────────────────────────────────────────────
export function SuppliersPage() {
  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: getSuppliers,
  })

  const suppliers = suppliersQuery.data ?? []
  const isLoading = suppliersQuery.isLoading

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestión de proveedores y precios de refacciones
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-gray-400">
            {suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Error */}
      {suppliersQuery.isError && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          Error cargando proveedores. Intenta de nuevo.
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
          : suppliers.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
      </div>

      {!isLoading && suppliers.length === 0 && !suppliersQuery.isError && (
        <p className="text-center text-sm text-gray-400 py-12">
          No hay proveedores registrados
        </p>
      )}
    </div>
  )
}
