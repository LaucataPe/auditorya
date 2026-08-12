import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { AreaFirma } from '@auditorya/types'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { toast } from '../../store/toast.store'
import { useAuthStore } from '../../store/auth.store'

/**
 * Enlace "+ Crear ciclo nuevo" para poner bajo un select de área/ciclo.
 * Crea el ciclo propio de la firma y devuelve su clave para seleccionarlo.
 * Solo visible para socio o gerente (la regla que exige el backend).
 */
export function CrearCicloInline({ onCreado }: { onCreado: (clave: string) => void }) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')

  const crear = useMutation({
    mutationFn: () => api.post<AreaFirma>('/firmas/mia/areas', { nombre: nombre.trim() }),
    onSuccess: (area) => {
      toast.success(`Ciclo "${area.nombre}" creado`)
      queryClient.invalidateQueries({ queryKey: ['areas-firma'] })
      onCreado(area.clave)
      setNombre('')
      setAbierto(false)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al crear el ciclo'),
  })

  if (user?.rol !== 'socio' && user?.rol !== 'gerente') return null

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
      >
        <Plus size={12} /> Crear ciclo nuevo
      </button>
    )
  }

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Nombre del ciclo, p. ej. Fiducias"
        className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (nombre.trim().length >= 3 && !crear.isPending) crear.mutate()
          }
        }}
      />
      <Button
        type="button"
        size="sm"
        disabled={nombre.trim().length < 3}
        loading={crear.isPending}
        onClick={() => crear.mutate()}
      >
        Crear
      </Button>
      <button
        type="button"
        onClick={() => { setAbierto(false); setNombre('') }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancelar
      </button>
    </div>
  )
}
