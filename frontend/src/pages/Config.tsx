import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getConfig, updateConfig } from '../api'
import { useAuthStore } from '../store/auth'
import { Button } from '../components/ui/Button'
import { TableSkeleton } from '../components/ui/Skeleton'
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">Parámetros del motor de cálculo</p>
      </div>

      {toast && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Parámetro</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Descripción</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Valor</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {params.map((p: ConfigParam) => {
                const isEditingRow = p.key in editing
                const isWeight = WEIGHT_KEYS.includes(p.key)
                return (
                  <tr key={p.key} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.key}</td>
                    <td className="px-4 py-3 text-gray-500">{p.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      {isEditingRow ? (
                        <div className="space-y-1">
                          <input
                            type="number"
                            step="0.01"
                            value={editing[p.key]}
                            onChange={(e) => setEditing((ev) => ({ ...ev, [p.key]: e.target.value }))}
                            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {p.key === 'target_margin' && (
                            <p className="text-xs text-gray-400">Entre 0.01 y 0.99</p>
                          )}
                          {isWeight && (
                            <p className={`text-xs ${Math.abs(weightSum - 1) < 0.001 ? 'text-emerald-600' : 'text-red-500'}`}>
                              Suma pesos: {weightSum.toFixed(2)} {Math.abs(weightSum - 1) < 0.001 ? '✓' : '≠ 1.0'}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium">{p.value}</span>
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
    </div>
  )
}
