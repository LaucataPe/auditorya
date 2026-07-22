import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Modal } from '../ui/Modal'
import { cn } from '../../lib/cn'

type Nivel = 'socio' | 'gerente' | 'senior' | 'asistente'

type Rol = {
  id: string
  nombre: string
  nivel: Nivel
  esSistema: boolean
  permisos: string[]
  miembros: number
}

type PermisoCatalogo = {
  clave: string
  grupo: string
  label: string
  descripcion: string
  orden: number
}

const NIVEL_LABEL: Record<Nivel, string> = {
  socio: 'Socio',
  gerente: 'Gerente',
  senior: 'Senior',
  asistente: 'Asistente',
}

const NIVEL_BADGE: Record<Nivel, string> = {
  socio: 'bg-indigo-50 text-indigo-700',
  gerente: 'bg-violet-50 text-violet-700',
  senior: 'bg-amber-50 text-amber-700',
  asistente: 'bg-gray-100 text-gray-600',
}

const NIVEL_OPTS = (Object.keys(NIVEL_LABEL) as Nivel[]).map((n) => ({ value: n, label: NIVEL_LABEL[n] }))

export function RolesTab() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Rol | null>(null)

  const puedeGestionar = user?.rol === 'socio'

  const { data: roles = [], isLoading } = useQuery<Rol[]>({
    queryKey: ['roles'],
    queryFn: () => api.get<Rol[]>('/firmas/mia/roles'),
  })

  const { data: catalogo = [] } = useQuery<PermisoCatalogo[]>({
    queryKey: ['permisos-catalogo'],
    queryFn: () => api.get<PermisoCatalogo[]>('/firmas/mia/permisos'),
  })

  const createMutation = useMutation({
    mutationFn: (body: { nombre: string; nivel: Nivel; permisos: string[] }) =>
      api.post('/firmas/mia/roles', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { nombre?: string; nivel?: Nivel; permisos?: string[] } }) =>
      api.put(`/firmas/mia/roles/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/firmas/mia/roles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
    onError: (e) => alert(e instanceof Error ? e.message : 'No se pudo eliminar'),
  })

  function handleDelete(rol: Rol) {
    if (confirm(`¿Eliminar el rol "${rol.nombre}"?`)) deleteMutation.mutate(rol.id)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Define roles con nombre propio y asígnales los permisos que necesite tu equipo.
        </p>
        {puedeGestionar && (
          <Button size="sm" className="gap-2 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Nuevo rol
          </Button>
        )}
      </div>

      {!puedeGestionar && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Solo el socio puede crear o modificar roles.
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((rol) => (
            <div key={rol.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{rol.nombre}</p>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', NIVEL_BADGE[rol.nivel])}>
                      {NIVEL_LABEL[rol.nivel]}
                    </span>
                    {rol.esSistema && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Lock size={11} /> Sistema
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={12} /> {rol.permisos.length} permisos
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} /> {rol.miembros} {rol.miembros === 1 ? 'miembro' : 'miembros'}
                    </span>
                  </div>
                </div>
                {puedeGestionar && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditTarget(rol)}
                      className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                      title="Editar rol"
                    >
                      <Pencil size={14} />
                    </button>
                    {!rol.esSistema && (
                      <button
                        onClick={() => handleDelete(rol)}
                        className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        title="Eliminar rol"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <RolModal
          catalogo={catalogo}
          onClose={() => setCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          loading={createMutation.isPending}
          error={createMutation.error instanceof Error ? createMutation.error.message : null}
        />
      )}

      {editTarget && (
        <RolModal
          rol={editTarget}
          catalogo={catalogo}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) => editMutation.mutate({ id: editTarget.id, body: data })}
          loading={editMutation.isPending}
          error={editMutation.error instanceof Error ? editMutation.error.message : null}
        />
      )}
    </div>
  )
}

function RolModal({
  rol, catalogo, onClose, onSubmit, loading, error,
}: {
  rol?: Rol
  catalogo: PermisoCatalogo[]
  onClose: () => void
  onSubmit: (data: { nombre: string; nivel: Nivel; permisos: string[] }) => void
  loading: boolean
  error: string | null
}) {
  const editando = !!rol
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [nivel, setNivel] = useState<Nivel>(rol?.nivel ?? 'asistente')
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set(rol?.permisos ?? []))

  // Agrupar catálogo por grupo preservando orden
  const grupos = catalogo.reduce<Record<string, PermisoCatalogo[]>>((acc, p) => {
    ;(acc[p.grupo] ??= []).push(p)
    return acc
  }, {})

  function toggle(clave: string) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      next.has(clave) ? next.delete(clave) : next.add(clave)
      return next
    })
  }

  function toggleGrupo(items: PermisoCatalogo[], marcar: boolean) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      items.forEach((p) => (marcar ? next.add(p.clave) : next.delete(p.clave)))
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    onSubmit({ nombre: nombre.trim(), nivel, permisos: [...seleccion] })
  }

  return (
    <Modal open onClose={onClose} title={editando ? 'Editar rol' : 'Nuevo rol'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="rol-nombre"
            label="Nombre del rol"
            placeholder="Auditor Senior de Impuestos"
            value={nombre}
            disabled={rol?.esSistema}
            onChange={(e) => setNombre(e.target.value)}
          />
          <Select
            id="rol-nivel"
            label="Nivel base"
            value={nivel}
            disabled={rol?.esSistema}
            onChange={(e) => setNivel(e.target.value as Nivel)}
            options={NIVEL_OPTS}
          />
        </div>

        {rol?.esSistema && (
          <p className="text-xs text-gray-400 -mt-1">
            El nombre y el nivel de un rol de sistema están bloqueados. Puedes ajustar sus permisos.
          </p>
        )}

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Permisos</p>
          <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
            {Object.entries(grupos).map(([grupo, items]) => {
              const todos = items.every((p) => seleccion.has(p.clave))
              return (
                <div key={grupo}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{grupo}</p>
                    <button
                      type="button"
                      onClick={() => toggleGrupo(items, !todos)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      {todos ? 'Quitar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {items.map((p) => (
                      <label
                        key={p.clave}
                        className="flex items-start gap-3 rounded-lg border border-gray-100 px-3 py-2 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={seleccion.has(p.clave)}
                          onChange={() => toggle(p.clave)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-gray-800">{p.label}</span>
                          <span className="block text-xs text-gray-400">{p.descripcion}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>{editando ? 'Guardar' : 'Crear rol'}</Button>
        </div>
      </form>
    </Modal>
  )
}
