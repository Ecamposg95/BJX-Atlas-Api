import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Plus, Edit2 } from 'lucide-react'
import api from '../api/client'
import { listBranches } from '../api'
import type { Branch } from '../api/types'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { TableSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/Modal'
import { FormField } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import { useToast } from '../components/ui/ToastProvider'
import { useAuthStore } from '../store/auth'

// Branch CRUD endpoints (not exposed in api/index.ts public surface)
const createBranchApi = (data: BranchPayload) =>
  api.post<Branch>('/branches', data).then(r => r.data)

const updateBranchApi = (id: string, data: Partial<BranchPayload>) =>
  api.put<Branch>(`/branches/${id}`, data).then(r => r.data)

interface BranchPayload {
  code: string
  name: string
  address?: string
  city?: string
  state?: string
  timezone?: string
  phone?: string
  active?: boolean
}

export function BranchesPage() {
  const user = useAuthStore((s) => s.user)
  const allowed = user && (user.role === 'admin' || user.role === 'director')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: listBranches,
    enabled: !!allowed,
  })

  if (!allowed) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <EmptyState
          icon={<Building2 size={28} />}
          title="Acceso restringido"
          description="Solo administradores y directores pueden gestionar sucursales."
        />
      </div>
    )
  }

  const branches = branchesQuery.data ?? []

  return (
    <PageShell>
      <PageHeader
        eyebrow="Gestión"
        title="Sucursales"
        description="Administra las sucursales de la organización"
        actions={
          <Button onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus size={14} /> Nueva sucursal
          </Button>
        }
      />

      <section className="executive-panel">
        {branchesQuery.isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : branches.length === 0 ? (
          <EmptyState icon={<Building2 size={28} />} title="Sin sucursales" description="Crea la primera sucursal para iniciar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Código</th>
                  <th className="text-left">Nombre</th>
                  <th className="text-left">Ciudad</th>
                  <th className="text-left">Estado</th>
                  <th className="text-left">Timezone</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{b.code}</td>
                    <td className="font-semibold" style={{ color: 'var(--text)' }}>{b.name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{b.city ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{b.state ?? '—'}</td>
                    <td className="text-xs" style={{ color: 'var(--text-faint)' }}>{b.timezone}</td>
                    <td>
                      <Badge variant={b.active ? 'ok' : 'cancelled'}>{b.active ? 'Activa' : 'Inactiva'}</Badge>
                    </td>
                    <td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(b); setModalOpen(true) }}>
                        <Edit2 size={12} /> Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <BranchModal
          branch={editing}
          onClose={() => { setModalOpen(false); setEditing(null) }}
        />
      )}
    </PageShell>
  )
}

function BranchModal({ branch, onClose }: { branch: Branch | null; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const isEdit = !!branch

  const [form, setForm] = useState<BranchPayload>({
    code: branch?.code ?? '',
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    state: branch?.state ?? '',
    timezone: branch?.timezone ?? 'America/Mexico_City',
    phone: branch?.phone ?? '',
    active: branch?.active ?? true,
  })

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? updateBranchApi(branch!.id, form)
      : createBranchApi(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Sucursal actualizada' : 'Sucursal creada')
      qc.invalidateQueries({ queryKey: ['branches'] })
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar sucursal' : 'Nueva sucursal'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="code" label="Código" required
            value={form.code}
            onChange={(v) => setForm(f => ({ ...f, code: v }))}
          />
          <FormField
            name="name" label="Nombre" required
            value={form.name}
            onChange={(v) => setForm(f => ({ ...f, name: v }))}
          />
        </div>
        <FormField
          name="address" label="Dirección"
          value={form.address ?? ''}
          onChange={(v) => setForm(f => ({ ...f, address: v }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="city" label="Ciudad"
            value={form.city ?? ''}
            onChange={(v) => setForm(f => ({ ...f, city: v }))}
          />
          <FormField
            name="state" label="Estado"
            value={form.state ?? ''}
            onChange={(v) => setForm(f => ({ ...f, state: v }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="timezone" label="Timezone"
            value={form.timezone ?? ''}
            onChange={(v) => setForm(f => ({ ...f, timezone: v }))}
          />
          <FormField
            name="phone" label="Teléfono"
            value={form.phone ?? ''}
            onChange={(v) => setForm(f => ({ ...f, phone: v }))}
          />
        </div>
        {isEdit && (
          <FormField
            name="active" label="Status" type="select"
            value={form.active ? 'true' : 'false'}
            onChange={(v) => setForm(f => ({ ...f, active: v === 'true' }))}
            options={[
              { value: 'true', label: 'Activa' },
              { value: 'false', label: 'Inactiva' },
            ]}
          />
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>{isEdit ? 'Guardar' : 'Crear'}</Button>
        </div>
      </form>
    </Modal>
  )
}
