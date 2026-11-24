import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { POLITICA_DATOS } from '@auditorya/types'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { Button } from '../ui/Button'
import { PoliticaTexto } from './PoliticaTexto'

/**
 * Bloquea la app hasta que el usuario acepte la versión vigente de la política
 * (usuarios invitados, usuarios anteriores a la política y cada cambio de versión).
 * La prueba la guarda el backend en `aceptaciones_politica`.
 */
export function PoliticaGate() {
  const { isAuthenticated, logout } = useAuthStore()
  const queryClient = useQueryClient()
  const [marcada, setMarcada] = useState(false)

  const { data } = useQuery<{ version: string; aceptada: boolean }>({
    queryKey: ['politica-estado'],
    queryFn: () => api.get('/politica/estado'),
    enabled: isAuthenticated,
    staleTime: Infinity,
  })

  const aceptar = useMutation({
    mutationFn: () => api.post('/politica/aceptar', {}),
    onSuccess: () => {
      queryClient.setQueryData(['politica-estado'], { version: POLITICA_DATOS.version, aceptada: true })
      queryClient.invalidateQueries({ queryKey: ['politica-aceptaciones'] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo registrar la aceptación'),
  })

  // Mientras carga no se bloquea; si falla la consulta tampoco (el backend es la fuente de verdad).
  if (!data || data.aceptada) return null

  return (
    <div role="dialog" aria-modal="true" aria-label="Política de tratamiento de datos" className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-900/60 p-4">
      <div className="flex max-h-full w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{POLITICA_DATOS.titulo}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Versión {POLITICA_DATOS.version}. Para seguir usando AuditorYa necesitamos tu aceptación expresa.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <PoliticaTexto />
        </div>
        <div className="space-y-3 border-t border-gray-100 px-6 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
            <input type="checkbox" checked={marcada} onChange={(e) => setMarcada(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600" />
            <span>{POLITICA_DATOS.textoAceptacion}</span>
          </label>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => logout()}>Salir</Button>
            <Button disabled={!marcada} loading={aceptar.isPending} onClick={() => aceptar.mutate()}>
              Aceptar y continuar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
