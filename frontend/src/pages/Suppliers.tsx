import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSuppliers, getSupplierPrices, createSupplier, updateSupplier, deleteSupplier } from '../api'
import type { Supplier, SupplierPrice } from '../api/types'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtCurrency = (val: number) =>
  '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const fmtDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Supplier Modal ────────────────────────────────────────────────────────────
interface SupplierModalProps {
  initial?: Supplier
  onClose: () => void
  onSaved: () => void
}

function SupplierModal({ initial, onClose, onSaved }: SupplierModalProps) {
  const isEdit = !!initial
  const [name, setName]               = useState(initial?.name ?? '')
  const [leadTime, setLeadTime]       = useState(String(initial?.lead_time_days ?? 1))
  const [warranty, setWarranty]       = useState(String(initial?.warranty_days ?? 0))
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '')
  const [active, setActive]           = useState(initial?.active ?? true)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const qc = useQueryClient()

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('El nombre es requerido')
    const lead = parseInt(leadTime)
    const warr = parseInt(warranty)
    if (isNaN(lead) || lead < 1) return setError('Lead time debe ser ≥ 1 día')
    if (isNaN(warr) || warr < 0) return setError('Garantía debe ser ≥ 0 días')
    setLoading(true)
    try {
      const data = {
        name: name.trim(),
        lead_time_days: lead,
        warranty_days: warr,
        contact_name: contactName.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
      }
      if (isEdit) {
        await updateSupplier(initial!.id, { ...data, active })
      } else {
        await createSupplier(data)
      }
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: { type?: string; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={opts?.type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={opts?.placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
      />
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl p-6 space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>
            {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }} className="text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-4">
          {field('Nombre del proveedor', name, setName, { placeholder: 'Ej. Refacciones XYZ' })}
          <div className="grid grid-cols-2 gap-3">
            {field('Lead time (días)', leadTime, setLeadTime, { type: 'number' })}
            {field('Garantía (días)', warranty, setWarranty, { type: 'number' })}
          </div>
          {field('Nombre de contacto', contactName, setContactName, { placeholder: 'Opcional' })}
          {field('Email de contacto', contactEmail, setContactEmail, { type: 'email', placeholder: 'Opcional' })}

          {isEdit && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActive((v) => !v)}
                className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                style={{ background: active ? 'var(--primary)' : 'var(--surface-2)' }}
              >
                <span
                  className="pointer-events-none inline-block h-4 w-4 rounded-full shadow transition duration-200"
                  style={{ background: '#fff', transform: active ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </button>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{active ? 'Activo' : 'Inactivo'}</span>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5' }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={loading}>
            {loading ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear proveedor'}
          </Button>
        </div>
      </div>
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
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    )
  }

  if (pricesQuery.isError) {
    return <p className="mt-3 text-sm rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>Error cargando precios</p>
  }

  if (prices.length === 0) {
    return <p className="mt-3 text-sm italic" style={{ color: 'var(--text-faint)' }}>Sin precios registrados</p>
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left">Modelo ID</th>
            <th className="px-4 py-2 text-left">Servicio ID</th>
            <th className="px-4 py-2 text-right">Costo Ref</th>
            <th className="px-4 py-2 text-right">Precio Total</th>
            <th className="px-4 py-2 text-center">Fecha</th>
            <th className="px-4 py-2 text-center">Vigente</th>
          </tr>
        </thead>
        <tbody>
          {prices.map((price) => (
            <tr key={price.id}>
              <td className="px-4 py-2 font-mono truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }} title={price.model_id}>
                {price.model_id.slice(0, 8)}…
              </td>
              <td className="px-4 py-2 font-mono truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }} title={price.service_id}>
                {price.service_id.slice(0, 8)}…
              </td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--text-muted)' }}>{fmtCurrency(price.ref_cost)}</td>
              <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--text)' }}>{fmtCurrency(price.total_price)}</td>
              <td className="px-4 py-2 text-center" style={{ color: 'var(--text-muted)' }}>{fmtDate(price.price_date)}</td>
              <td className="px-4 py-2 text-center">
                {price.is_current ? <Badge variant="ok">Vigente</Badge> : <Badge variant="cancelled">Expirado</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Supplier Card ─────────────────────────────────────────────────────────────
function SupplierCard({
  supplier,
  onEdit,
  onDelete,
}: {
  supplier: Supplier
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl p-6 space-y-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{supplier.name}</p>
          {supplier.contact_name  && <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>{supplier.contact_name}</p>}
          {supplier.contact_email && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{supplier.contact_email}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={supplier.active ? 'ok' : 'cancelled'}>{supplier.active ? 'Activo' : 'Inactivo'}</Badge>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Lead Time', value: `${supplier.lead_time_days}d` },
          { label: 'Garantía',  value: `${supplier.warranty_days}d` },
          { label: 'Precios',   value: String(supplier.price_count) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg px-3 py-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>{stat.label}</p>
            <p className="mt-1 text-base font-black" style={{ color: 'var(--text)' }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Coverage */}
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Modelos: <span className="font-medium" style={{ color: 'var(--text)' }}>{supplier.model_coverage}</span></span>
        <span>Servicios: <span className="font-medium" style={{ color: 'var(--text)' }}>{supplier.service_coverage}</span></span>
        {supplier.avg_price_index != null && (
          <span>Índice precio: <span className="font-medium" style={{ color: 'var(--text)' }}>{supplier.avg_price_index.toFixed(2)}</span></span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setExpanded((p) => !p)}>
          {expanded ? 'Ocultar precios' : 'Ver precios'}
        </Button>
        <button
          onClick={onEdit}
          className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)', color: 'var(--primary-dark)' }}
        >
          Editar
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
        >
          Eliminar
        </button>
      </div>

      {expanded && <PricesTable supplierId={supplier.id} />}
    </div>
  )
}

// ── Card Skeleton ─────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl p-5 space-y-3 animate-pulse" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
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

// ── Suppliers Page ────────────────────────────────────────────────────────────
export function SuppliersPage() {
  const qc = useQueryClient()
  const [modal, setModal]     = useState<{ supplier?: Supplier } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const suppliersQuery = useQuery({ queryKey: ['suppliers'], queryFn: getSuppliers })
  const suppliers = suppliersQuery.data ?? []
  const isLoading = suppliersQuery.isLoading

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSupplier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Proveedores</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Gestión de proveedores y precios de refacciones
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''}
            </span>
          )}
          <Button variant="primary" size="sm" onClick={() => setModal({})}>
            + Nuevo proveedor
          </Button>
        </div>
      </div>

      {/* Error */}
      {suppliersQuery.isError && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
          Error cargando proveedores. Intenta de nuevo.
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
          : suppliers.map((s) => (
              <SupplierCard
                key={s.id}
                supplier={s}
                onEdit={() => setModal({ supplier: s })}
                onDelete={() => setConfirmId(s.id)}
              />
            ))}
      </div>

      {!isLoading && suppliers.length === 0 && !suppliersQuery.isError && (
        <p className="text-center text-sm py-12" style={{ color: 'var(--text-muted)' }}>
          No hay proveedores registrados
        </p>
      )}

      {/* Create / Edit modal */}
      {modal !== null && (
        <SupplierModal
          initial={modal.supplier}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="font-black text-base" style={{ color: 'var(--text)' }}>Eliminar proveedor</h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              ¿Eliminar este proveedor? Se desactivará y no aparecerá en nuevos cálculos.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>Cancelar</Button>
              <Button variant="danger" size="sm" onClick={() => { deleteMut.mutate(confirmId); setConfirmId(null) }}>
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
