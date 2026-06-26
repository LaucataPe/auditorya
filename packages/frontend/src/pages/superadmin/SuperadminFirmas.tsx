import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronDown, ChevronUp, Plus, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'

type FirmaRow = {
  id: string
  nombre: string
  nit: string
  ciudad: string
  createdAt: string
  totalUsuarios: number
}

type UsuarioRow = {
  id: string
  nombre: string
  email: string
  rol: string
  createdAt: string
}

const ROL_BADGE: Record<string, string> = {
  socio: 'bg-indigo-50 text-indigo-700',
  gerente: 'bg-violet-50 text-violet-700',
  senior: 'bg-amber-50 text-amber-700',
  asistente: 'bg-gray-100 text-gray-600',
}

export function SuperadminFirmas() {
  const [modalOpen, setModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: firmas = [], isLoading } = useQuery<FirmaRow[]>({
    queryKey: ['superadmin', 'firmas'],
    queryFn: () => api.get<FirmaRow[]>('/superadmin/firmas'),
  })

  const { data: usuarios = [] } = useQuery<UsuarioRow[]>({
    queryKey: ['superadmin', 'firmas', expandedId, 'usuarios'],
    queryFn: () => api.get<UsuarioRow[]>(`/superadmin/firmas/${expandedId}/usuarios`),
    enabled: !!expandedId,
  })

  const createMutation = useMutation({
    mutationFn: (body: { firma: object; usuario: object }) =>
      api.post('/superadmin/firmas', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'firmas'] })
      setModalOpen(false)
    },
  })

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="p-8 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Firmas registradas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {firmas.length} firma{firmas.length !== 1 ? 's' : ''} en el sistema
          </p>
        </div>
        <Button className="gap-2" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Nueva firma
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Firmas totales', value: firmas.length, icon: Building2, color: 'text-violet-600 bg-violet-50' },
          { label: 'Usuarios totales', value: firmas.reduce((s, f) => s + f.totalUsuarios, 0), icon: Users, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'Promedio usuarios/firma', value: firmas.length ? (firmas.reduce((s, f) => s + f.totalUsuarios, 0) / firmas.length).toFixed(1) : 0, icon: Users, color: 'text-emerald-600 bg-emerald-50' },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className={cn('inline-flex p-2 rounded-lg mb-3', s.color)}>
                <Icon size={16} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : firmas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Building2 size={36} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No hay firmas registradas aún.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {firmas.map((firma) => {
            const isExpanded = expandedId === firma.id
            const firmUsuarios = isExpanded ? usuarios : []

            return (
              <div key={firma.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Row */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(firma.id)}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700 font-bold text-sm shrink-0">
                    {firma.nombre.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{firma.nombre}</p>
                    <p className="text-xs text-gray-400">NIT {firma.nit} · {firma.ciudad}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{firma.totalUsuarios}</p>
                      <p className="text-xs text-gray-400">usuarios</p>
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(firma.createdAt).toLocaleDateString('es-CO')}
                    </p>
                    {isExpanded ? (
                      <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded usuarios */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {firmUsuarios.length === 0 ? (
                      <p className="text-sm text-gray-400 px-5 py-4">Cargando usuarios...</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {firmUsuarios.map((u) => (
                          <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold shrink-0">
                              {u.nombre.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{u.nombre}</p>
                              <p className="text-xs text-gray-400">{u.email}</p>
                            </div>
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', ROL_BADGE[u.rol] ?? 'bg-gray-100 text-gray-600')}>
                              {u.rol}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NuevaFirmaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
      />
    </div>
  )
}

function NuevaFirmaModal({
  open, onClose, onSubmit, loading, error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { firma: object; usuario: object }) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({
    firma: { nombre: '', nit: '', ciudad: '' },
    usuario: { nombre: '', email: '', password: '' },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  const setFirma = (k: string, v: string) => setForm((f) => ({ ...f, firma: { ...f.firma, [k]: v } }))
  const setUsuario = (k: string, v: string) => setForm((f) => ({ ...f, usuario: { ...f.usuario, [k]: v } }))

  return (
    <Modal open={open} onClose={onClose} title="Nueva firma auditora" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Firma */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Datos de la firma</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input id="sa-firma-nombre" label="Razón social" placeholder="García & Asociados S.A.S"
                value={form.firma.nombre} onChange={(e) => setFirma('nombre', e.target.value)} />
            </div>
            <Input id="sa-firma-nit" label="NIT" placeholder="900.123.456-7"
              value={form.firma.nit} onChange={(e) => setFirma('nit', e.target.value)} />
            <Input id="sa-firma-ciudad" label="Ciudad" placeholder="Bogotá"
              value={form.firma.ciudad} onChange={(e) => setFirma('ciudad', e.target.value)} />
          </div>
        </div>

        {/* Separador */}
        <div className="border-t border-gray-100" />

        {/* Usuario */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Socio responsable (primer usuario)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input id="sa-usuario-nombre" label="Nombre completo" placeholder="Carlos García"
                value={form.usuario.nombre} onChange={(e) => setUsuario('nombre', e.target.value)} />
            </div>
            <Input id="sa-usuario-email" label="Correo electrónico" type="email" placeholder="carlos@garcia.co"
              value={form.usuario.email} onChange={(e) => setUsuario('email', e.target.value)} />
            <Input id="sa-usuario-password" label="Contraseña temporal" type="password" placeholder="Mínimo 8 caracteres"
              value={form.usuario.password} onChange={(e) => setUsuario('password', e.target.value)} />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Crear firma</Button>
        </div>
      </form>
    </Modal>
  )
}
