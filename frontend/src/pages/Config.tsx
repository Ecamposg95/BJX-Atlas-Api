import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getConfig, updateConfig } from '../api'
import { useAuthStore } from '../store/auth'
import { Button } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/Skeleton'
import { PageShell } from '../components/ui/PageShell'
import { PageHeader } from '../components/ui/PageHeader'
import type { ConfigParam } from '../api/types'

const WEIGHT_KEYS = ['scoring_weight_price', 'scoring_weight_time', 'scoring_weight_tc']

export function ConfigPage() {
  const { hasRole } = useAuthStore()
  const isAdmin = hasRole(['admin'])
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [toast, setToast] = useState('')

  const { data: params = [], isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: getConfig,
  })

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateConfig(key, value),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ['config'] })
      setEditing((e) => { const n = { ...e }; delete n[key]; return n })
      setToast('Guardado correctamente')
      setTimeout(() => setToast(''), 3000)
    },
  })

  const weightSum = WEIGHT_KEYS.reduce((sum, k) => {
    const editVal = editing[k]
    const param = params.find((p) => p.key === k)
    return sum + parseFloat(editVal ?? param?.value ?? '0')
  }, 0)

  return (
    <PageShell narrow>
      <PageHeader
        eyebrow="Configuración"
        title="Parámetros del motor"
        description="Constantes globales del motor de cálculo."
      />

      {toast && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            background: 'rgba(16,185,129,0.10)',
            border: '1px solid rgba(16,185,129,0.30)',
            color: '#6ee7b7',
          }}
        >
          {toast}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <table className="min-w-full text-sm">
            <thead style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Parámetro</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Descripción</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--text-muted)' }}>Valor</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {params.map((p: ConfigParam) => {
                const isEditingRow = p.key in editing
                const isWeight = WEIGHT_KEYS.includes(p.key)
                return (
                  <tr key={p.key} style={{ borderTop: '1px solid var(--border-dim)' }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--text)' }}>{p.key}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{p.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      {isEditingRow ? (
                        <div className="space-y-1">
                          <input
                            type="number"
                            step="0.01"
                            value={editing[p.key]}
                            onChange={(e) => setEditing((ev) => ({ ...ev, [p.key]: e.target.value }))}
                            className="w-32 rounded px-2 py-1 text-sm focus:outline-none"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                          />
                          {p.key === 'target_margin' && (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Entre 0.01 y 0.99</p>
                          )}
                          {isWeight && (
                            <p className="text-xs" style={{ color: Math.abs(weightSum - 1) < 0.001 ? '#34d399' : '#fb7185' }}>
                              Suma pesos: {weightSum.toFixed(2)} {Math.abs(weightSum - 1) < 0.001 ? '✓' : '≠ 1.0'}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium" style={{ color: 'var(--text)' }}>{p.value}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {isEditingRow ? (
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              loading={mutation.isPending}
                              onClick={() => mutation.mutate({ key: p.key, value: editing[p.key] })}
                            >
                              Guardar
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditing((e) => { const n = { ...e }; delete n[p.key]; return n })}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing((e) => ({ ...e, [p.key]: p.value }))}
                          >
                            Editar
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  )
}
