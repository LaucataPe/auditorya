import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Hash, RotateCcw, Check, X } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type PrefijoArea = {
  clave: string
  nombre: string
  prefijoDefecto: string
  prefijo: string
  personalizado: boolean
}

export function SuperadminPrefijos() {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: areas = [], isLoading } = useQuery<PrefijoArea[]>({
    queryKey: ['superadmin', 'prefijos-areas'],
    queryFn: () => api.get<PrefijoArea[]>('/superadmin/prefijos-areas'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['superadmin', 'prefijos-areas'] })

  const guardar = useMutation({
    mutationFn: ({ clave, prefijo }: { clave: string; prefijo: string }) =>
      api.put(`/superadmin/prefijos-areas/${clave}`, { prefijo }),
    onSuccess: () => {
      invalidate()
      setEditando(null)
      setError(null)
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'No se pudo guardar'),
  })

  const restaurar = useMutation({
    mutationFn: (clave: string) => api.delete(`/superadmin/prefijos-areas/${clave}`),
    onSuccess: invalidate,
  })

  function abrirEdicion(a: PrefijoArea) {
    setEditando(a.clave)
    setValor(a.prefijo)
    setError(null)
  }

  function confirmar(clave: string) {
    const prefijo = valor.trim().toUpperCase()
    if (!/^[A-Z0-9]{1,4}$/.test(prefijo)) {
      setError('Usa 1 a 4 letras mayúsculas o dígitos')
      return
    }
    guardar.mutate({ clave, prefijo })
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Hash size={18} className="text-violet-600" /> Prefijos de referenciación
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Índices de papeles de trabajo (NIA 230): cada papel se referencia como prefijo del área +
          consecutivo por encargo (ej. C-1). Cambiar un prefijo aplica a <strong>todas las firmas</strong> y
          solo a papeles nuevos: los índices ya asignados no se renumeran.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {areas.map((a) => (
            <div key={a.clave} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800">{a.nombre}</p>
                {a.personalizado && (
                  <p className="text-[11px] text-violet-600">Personalizado (defecto: {a.prefijoDefecto})</p>
                )}
              </div>

              {editando === a.clave ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={valor}
                    onChange={(e) => setValor(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmar(a.clave)
                      if (e.key === 'Escape') setEditando(null)
                    }}
                    maxLength={4}
                    className="w-20 rounded-lg border border-violet-300 px-2 py-1 text-sm font-mono text-center uppercase focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <button
                    onClick={() => confirmar(a.clave)}
                    disabled={guardar.isPending}
                    className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                    title="Guardar"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={() => { setEditando(null); setError(null) }}
                    className="p-1 rounded text-gray-400 hover:bg-gray-100"
                    title="Cancelar"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => abrirEdicion(a)}
                    className={cn(
                      'font-mono text-sm font-semibold px-2 py-0.5 rounded transition-colors',
                      a.personalizado
                        ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                    )}
                    title="Editar prefijo"
                  >
                    {a.prefijo}
                  </button>
                  {a.personalizado && (
                    <button
                      onClick={() => restaurar.mutate(a.clave)}
                      disabled={restaurar.isPending}
                      className="p-1 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50"
                      title={`Restaurar defecto (${a.prefijoDefecto})`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  )
}
