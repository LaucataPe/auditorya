import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'

type Permiso = {
  clave: string
  grupo: string
  label: string
  descripcion: string
  activo: boolean
  orden: number
  createdAt: string
}

type PermisoForm = {
  clave: string
  grupo: string
  label: string
  descripcion: string
  orden: number
}

export function SuperadminPermisos() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Permiso | null>(null)

  const { data: permisos = [], isLoading } = useQuery<Permiso[]>({
    queryKey: ['superadmin', 'permisos'],
    queryFn: () => api.get<Permiso[]>('/superadmin/permisos'),
  })

  const createMutation = useMutation({
    mutationFn: (body: PermisoForm) => api.post('/superadmin/permisos', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'permisos'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ clave, body }: { clave: string; body: Partial<Permiso> }) =>
      api.put(`/superadmin/permisos/${clave}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'permisos'] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (clave: string) => api.delete(`/superadmin/permisos/${clave}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['superadmin', 'permisos'] }),
  })

  function toggleActivo(p: Permiso) {
    editMutation.mutate({ clave: p.clave, body: { activo: !p.activo } })
  }

  function handleDelete(p: Permiso) {
    if (confirm(`¿Eliminar el permiso "${p.label}" (${p.clave})?\n\nSe quitará de todos los roles que lo tengan asignado.`)) {
      deleteMutation.mutate(p.clave)
    }
  }

  // Agrupar por grupo preservando orden
  const grupos = permisos.reduce<Record<string, Permiso[]>>((acc, p) => {
    ;(acc[p.grupo] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permisos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Catálogo global de permisos. Las firmas los asignan a sus roles.
          </p>
        </div>
        <Button className="gap-2" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nuevo permiso
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <KeyRound size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Un permiso nuevo solo surte efecto cuando el backend tiene una verificación que lo use.
          Los permisos sembrados ya están conectados al flujo.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grupos).map(([grupo, items]) => (
            <div key={grupo}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{grupo}</h2>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
                {items.map((p) => (
                  <div key={p.clave} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 text-sm">{p.label}</p>
                        <code className="text-xs text-gray-400 font-mono">{p.clave}</code>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{p.descripcion}</p>
                    </div>
                    <button
                      onClick={() => toggleActivo(p)}
                      className={cn(
                        'text-xs font-medium px-2.5 py-1 rounded-full transition-colors',
                        p.activo ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                      )}
                      title="Activar / desactivar"
                    >
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      onClick={() => setEditTarget(p)}
                      className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PermisoModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
      />

      {editTarget && (
        <PermisoModal
          permiso={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) => editMutation.mutate({ clave: editTarget.clave, body: data })}
          loading={editMutation.isPending}
          error={editMutation.error instanceof Error ? editMutation.error.message : null}
        />
      )}
    </div>
  )
}

function PermisoModal({
  permiso, open = true, onClose, onSubmit, loading, error,
}: {
  permiso?: Permiso
  open?: boolean
  onClose: () => void
  onSubmit: (data: PermisoForm) => void
  loading: boolean
  error: string | null
}) {
  const editando = !!permiso
  const [form, setForm] = useState<PermisoForm>({
    clave: permiso?.clave ?? '',
    grupo: permiso?.grupo ?? '',
    label: permiso?.label ?? '',
    descripcion: permiso?.descripcion ?? '',
    orden: permiso?.orden ?? 0,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.grupo.trim() || !form.label.trim()) return
    if (!editando && !/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(form.clave)) return
    onSubmit(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar permiso' : 'Nuevo permiso'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="perm-clave"
          label="Clave"
          placeholder="recurso.accion — p. ej. empresa.crear"
          value={form.clave}
          disabled={editando}
          onChange={(e) => setForm({ ...form, clave: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="perm-grupo"
            label="Grupo"
            placeholder="Clientes"
            value={form.grupo}
            onChange={(e) => setForm({ ...form, grupo: e.target.value })}
          />
          <Input
            id="perm-orden"
            label="Orden"
            type="number"
            value={String(form.orden)}
            onChange={(e) => setForm({ ...form, orden: Number(e.target.value) || 0 })}
          />
        </div>
        <Input
          id="perm-label"
          label="Nombre visible"
          placeholder="Registrar clientes"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <Textarea
          id="perm-desc"
          label="Descripción"
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>{editando ? 'Guardar' : 'Crear permiso'}</Button>
        </div>
      </form>
    </Modal>
  )
}
