import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPin, Pencil, Plus, UserCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { CalidadTab } from '../components/firma/CalidadTab'
import { cn } from '../lib/cn'

type Miembro = {
  id: string
  nombre: string
  email: string
  rol: string
  createdAt: string
}

const tabs = ['Información', 'Equipo', 'Control de calidad'] as const
type Tab = (typeof tabs)[number]

const ROL_LABEL: Record<string, string> = {
  socio: 'Socio',
  gerente: 'Gerente',
  senior: 'Senior',
  asistente: 'Asistente',
}

const ROL_BADGE: Record<string, string> = {
  socio: 'bg-indigo-50 text-indigo-700',
  gerente: 'bg-violet-50 text-violet-700',
  senior: 'bg-amber-50 text-amber-700',
  asistente: 'bg-gray-100 text-gray-600',
}

export function FirmaPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Información')
  const { firma } = useAuthStore()

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Firma</h1>
        <p className="text-gray-500 mt-1 text-sm">Gestiona la información, equipo y calidad de la firma.</p>
      </div>

      {/* Firm identity card */}
      <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-xl shrink-0">
          {firma?.nombre.charAt(0) ?? '?'}
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-gray-900 text-lg leading-tight">{firma?.nombre ?? '—'}</h2>
          <p className="text-sm text-gray-500">NIT: {firma?.nit ?? '—'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'Información' && <InfoTab />}
      {activeTab === 'Equipo' && <EquipoTab />}
      {activeTab === 'Control de calidad' && <CalidadTab />}
    </div>
  )
}

function InfoTab() {
  const { firma, user } = useAuthStore()
  const [editOpen, setEditOpen] = useState(false)
  const queryClient = useQueryClient()

  const editMutation = useMutation({
    mutationFn: (body: { nombre: string; nit: string; ciudad: string }) =>
      api.put('/firmas/mia', body),
    onSuccess: () => {
      // Refresca la sesión para que el store refleje los nuevos datos
      queryClient.invalidateQueries({ queryKey: ['firma'] })
      useAuthStore.getState().checkSession()
      setEditOpen(false)
    },
  })

  const canEdit = user?.rol === 'socio'

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm font-medium text-gray-700">Datos de la firma</p>
          {canEdit && (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
              <Pencil size={13} /> Editar
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-5 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Razón social</p>
            <div className="flex items-center gap-2 text-gray-700">
              <Building2 size={14} className="text-gray-400" />
              {firma?.nombre ?? '—'}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">NIT</p>
            <p className="text-gray-700">{firma?.nit ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Ciudad</p>
            <div className="flex items-center gap-2 text-gray-700">
              <MapPin size={14} className="text-gray-400" />
              {firma?.ciudad ?? '—'}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Miembro desde</p>
            <p className="text-gray-700">
              {firma?.createdAt ? new Date(firma.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'long' }) : '—'}
            </p>
          </div>
        </div>
      </div>

      {firma && editOpen && (
        <EditarFirmaModal
          firma={firma}
          onClose={() => setEditOpen(false)}
          onSubmit={(body) => editMutation.mutate(body)}
          loading={editMutation.isPending}
          error={editMutation.error instanceof Error ? editMutation.error.message : null}
        />
      )}
    </>
  )
}

function EditarFirmaModal({
  firma, onClose, onSubmit, loading, error,
}: {
  firma: { nombre: string; nit: string; ciudad: string }
  onClose: () => void
  onSubmit: (data: { nombre: string; nit: string; ciudad: string }) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({ nombre: firma.nombre, nit: firma.nit, ciudad: firma.ciudad })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const next: Record<string, string> = {}
    if (!form.nombre.trim()) next.nombre = 'La razón social es requerida'
    if (!form.nit.trim()) next.nit = 'El NIT es requerido'
    if (!form.ciudad.trim()) next.ciudad = 'La ciudad es requerida'
    return next
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = validate()
    if (Object.keys(next).length > 0) { setErrors(next); return }
    onSubmit(form)
  }

  function clearError(field: string) {
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  return (
    <Modal open onClose={onClose} title="Editar información de la firma">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Input
            id="f-nombre"
            label="Razón social"
            value={form.nombre}
            onChange={(e) => { setForm({ ...form, nombre: e.target.value }); clearError('nombre') }}
          />
          {errors.nombre && <p className="text-xs text-red-600">{errors.nombre}</p>}
        </div>
        <div className="space-y-1">
          <Input
            id="f-nit"
            label="NIT"
            placeholder="900.123.456-7"
            value={form.nit}
            onChange={(e) => { setForm({ ...form, nit: e.target.value }); clearError('nit') }}
          />
          {errors.nit && <p className="text-xs text-red-600">{errors.nit}</p>}
        </div>
        <div className="space-y-1">
          <Input
            id="f-ciudad"
            label="Ciudad"
            placeholder="Bogotá"
            value={form.ciudad}
            onChange={(e) => { setForm({ ...form, ciudad: e.target.value }); clearError('ciudad') }}
          />
          {errors.ciudad && <p className="text-xs text-red-600">{errors.ciudad}</p>}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Guardar cambios</Button>
        </div>
      </form>
    </Modal>
  )
}

function EquipoTab() {
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Miembro | null>(null)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: miembros = [], isLoading } = useQuery<Miembro[]>({
    queryKey: ['equipo'],
    queryFn: () => api.get<Miembro[]>('/firmas/mia/usuarios'),
  })

  const addMutation = useMutation({
    mutationFn: (body: { nombre: string; email: string; password: string; rol: string }) =>
      api.post('/firmas/mia/usuarios', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo'] })
      setAddOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { nombre: string; rol: string } }) =>
      api.put(`/firmas/mia/usuarios/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo'] })
      setEditTarget(null)
    },
  })

  const canManage = user?.rol === 'socio' || user?.rol === 'gerente'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {isLoading ? '...' : `${miembros.length} miembro${miembros.length !== 1 ? 's' : ''}`}
        </p>
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Añadir miembro
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : (
          miembros.map((m) => (
            <div key={m.id} className="flex items-center gap-4 px-5 py-4 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold text-sm shrink-0">
                {m.nombre.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {m.nombre}
                  {m.id === user?.id && <span className="ml-2 text-xs text-gray-400">(tú)</span>}
                </p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <UserCheck size={13} className="text-indigo-500" />
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', ROL_BADGE[m.rol] ?? 'bg-gray-100 text-gray-600')}>
                    {ROL_LABEL[m.rol] ?? m.rol}
                  </span>
                </div>
                {canManage && m.id !== user?.id && (
                  <button
                    onClick={() => setEditTarget(m)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="Editar miembro"
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <AnadirMiembroModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={(data) => addMutation.mutate(data)}
        loading={addMutation.isPending}
        error={addMutation.error instanceof Error ? addMutation.error.message : null}
      />

      {editTarget && (
        <EditarMiembroModal
          miembro={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(body) => editMutation.mutate({ id: editTarget.id, body })}
          loading={editMutation.isPending}
          error={editMutation.error instanceof Error ? editMutation.error.message : null}
        />
      )}
    </div>
  )
}

function EditarMiembroModal({
  miembro, onClose, onSubmit, loading, error,
}: {
  miembro: Miembro
  onClose: () => void
  onSubmit: (data: { nombre: string; rol: string }) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({ nombre: miembro.nombre, rol: miembro.rol })
  const [nombreError, setNombreError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { setNombreError('El nombre es requerido'); return }
    setNombreError(null)
    onSubmit(form)
  }

  return (
    <Modal open onClose={onClose} title="Editar miembro">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Input
            id="e-nombre"
            label="Nombre completo"
            value={form.nombre}
            onChange={(e) => { setForm({ ...form, nombre: e.target.value }); setNombreError(null) }}
          />
          {nombreError && <p className="text-xs text-red-600">{nombreError}</p>}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Correo electrónico</p>
          <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{miembro.email}</p>
          <p className="text-xs text-gray-400 mt-1">El correo no se puede cambiar.</p>
        </div>
        <Select
          id="e-rol"
          label="Rol"
          value={form.rol}
          onChange={(e) => setForm({ ...form, rol: e.target.value })}
          options={[
            { value: 'gerente', label: 'Gerente' },
            { value: 'senior', label: 'Senior' },
            { value: 'asistente', label: 'Asistente' },
          ]}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Guardar cambios</Button>
        </div>
      </form>
    </Modal>
  )
}

function AnadirMiembroModal({
  open, onClose, onSubmit, loading, error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { nombre: string; email: string; password: string; rol: string }) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'asistente' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const next: Record<string, string> = {}
    if (!form.nombre.trim()) next.nombre = 'El nombre es requerido'
    if (!form.email.trim()) next.email = 'El correo es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Ingresa un correo válido'
    if (form.password.length < 8) next.password = 'La contraseña debe tener al menos 8 caracteres'
    return next
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = validate()
    if (Object.keys(next).length > 0) { setErrors(next); return }
    setErrors({})
    onSubmit(form)
  }

  function clearError(field: string) {
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  return (
    <Modal open={open} onClose={onClose} title="Añadir miembro al equipo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <Input
            id="m-nombre"
            label="Nombre completo"
            placeholder="María García"
            value={form.nombre}
            onChange={(e) => { setForm({ ...form, nombre: e.target.value }); clearError('nombre') }}
          />
          {errors.nombre && <p className="text-xs text-red-600">{errors.nombre}</p>}
        </div>
        <div className="space-y-1">
          <Input
            id="m-email"
            label="Correo electrónico"
            type="email"
            placeholder="maria@firma.co"
            value={form.email}
            onChange={(e) => { setForm({ ...form, email: e.target.value }); clearError('email') }}
          />
          {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}
        </div>
        <div className="space-y-1">
          <Input
            id="m-password"
            label="Contraseña temporal"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={form.password}
            onChange={(e) => { setForm({ ...form, password: e.target.value }); clearError('password') }}
          />
          {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}
        </div>
        <Select
          id="m-rol"
          label="Rol"
          value={form.rol}
          onChange={(e) => setForm({ ...form, rol: e.target.value })}
          options={[
            { value: 'gerente', label: 'Gerente' },
            { value: 'senior', label: 'Senior' },
            { value: 'asistente', label: 'Asistente' },
          ]}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Añadir miembro</Button>
        </div>
      </form>
    </Modal>
  )
}
