import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ImagePlus, MapPin, Pencil, Plus, Trash2, UserCheck, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { toast } from '../store/toast.store'
import { useAreas } from '../hooks/useAreas'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Modal } from '../components/ui/Modal'
import { CalidadTab } from '../components/firma/CalidadTab'
import { RolesTab } from '../components/firma/RolesTab'
import { cn } from '../lib/cn'

type Miembro = {
  id: string
  nombre: string
  email: string
  rol: string
  rolId: string | null
  rolNombre: string | null
  createdAt: string
}

type RolFirma = {
  id: string
  nombre: string
  nivel: string
}

const tabs = ['Información', 'Equipo', 'Roles', 'Control de calidad', 'Configuración'] as const
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
    <div className="p-8 space-y-6">
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
      {activeTab === 'Roles' && <RolesTab />}
      {activeTab === 'Control de calidad' && <CalidadTab />}
      {activeTab === 'Configuración' && <ConfiguracionTab />}
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

      <MarcaCard />

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

/* ── Configuración de la firma ───────────────────────────────────────────── */

function ConfiguracionTab() {
  return (
    <div className="space-y-6">
      <CiclosCard />
    </div>
  )
}

/* ── Ciclos/áreas de auditoría de la firma ───────────────────────────────── */

function CiclosCard() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const { areas, propias } = useAreas()
  const [nombre, setNombre] = useState('')
  const canManage = user?.rol === 'socio' || user?.rol === 'gerente'

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['areas-firma'] })

  const crear = useMutation({
    mutationFn: () => api.post('/firmas/mia/areas', { nombre: nombre.trim() }),
    onSuccess: () => {
      toast.success('Ciclo creado')
      setNombre('')
      invalidate()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al crear el ciclo'),
  })

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/firmas/mia/areas/${id}`),
    onSuccess: () => { toast.success('Ciclo eliminado'); invalidate() },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al eliminar el ciclo'),
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <p className="text-sm font-medium text-gray-700 mb-1">Ciclos de auditoría</p>
      <p className="text-xs text-gray-400 mb-4">
        Áreas/ciclos disponibles al crear riesgos, papeles y tareas en todos los encargos. Los del
        catálogo base son fijos; tu firma puede añadir ciclos propios.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {areas.map((a) => (
          <span
            key={a.clave}
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full',
              a.propia ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600',
            )}
          >
            {a.nombre}
            {a.propia && canManage && (
              <button
                onClick={() => eliminar.mutate(a.id!)}
                disabled={eliminar.isPending}
                className="text-indigo-300 hover:text-red-500 transition-colors"
                title="Eliminar ciclo (solo si no tiene registros)"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {propias.length === 0 && (
          <span className="text-xs text-gray-400 self-center">— aún sin ciclos propios</span>
        )}
      </div>

      {canManage && (
        <form
          className="mt-4 flex items-end gap-2 max-w-sm"
          onSubmit={(e) => {
            e.preventDefault()
            if (nombre.trim().length >= 3 && !crear.isPending) crear.mutate()
          }}
        >
          <div className="flex-1">
            <Input
              id="ciclo-nombre"
              label="Nuevo ciclo"
              placeholder="p. ej. Fiducias, Cartera hipotecaria…"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" className="gap-1.5" disabled={nombre.trim().length < 3} loading={crear.isPending}>
            <Plus size={13} /> Añadir
          </Button>
        </form>
      )}
    </div>
  )
}

/* ── Identidad de marca de los documentos (PDF/Word) ─────────────────────── */

const COLOR_MARCA_DEFECTO = '#4338CA'
const PRESETS_MARCA = ['#4338CA', '#7C3AED', '#1D4ED8', '#0F766E', '#B91C1C', '#334155']

/** Reduce el logo a tamaño de membrete (PNG, máx. 200 px de alto) para guardarlo como data URI. */
async function procesarLogo(file: File): Promise<string | null> {
  const dataUrl = await new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
  if (!dataUrl) return null

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = dataUrl
  })
  if (!img || !img.naturalHeight) return null

  const escala = Math.min(1, 200 / img.naturalHeight, 600 / img.naturalWidth)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala))
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png') // PNG: conserva transparencia y lo acepta el .docx
}

function MarcaCard() {
  const { firma, user } = useAuthStore()
  const canEdit = user?.rol === 'socio'
  const fileRef = useRef<HTMLInputElement>(null)

  const [color, setColor] = useState(firma?.colorMarca ?? COLOR_MARCA_DEFECTO)
  const [logo, setLogo] = useState<string | null>(firma?.logo ?? null)

  const sinCambios =
    color === (firma?.colorMarca ?? COLOR_MARCA_DEFECTO) && logo === (firma?.logo ?? null)

  const guardar = useMutation({
    mutationFn: () => api.put('/firmas/mia', { colorMarca: color, logo }),
    onSuccess: () => {
      toast.success('Identidad de marca guardada')
      useAuthStore.getState().checkSession()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al guardar la marca'),
  })

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const dataUri = await procesarLogo(file)
    if (!dataUri) {
      toast.error('No se pudo leer la imagen. Usa un PNG o JPG.')
      return
    }
    if (dataUri.length > 400_000) {
      toast.error('El logo sigue siendo muy pesado tras reducirlo. Usa una imagen más simple.')
      return
    }
    setLogo(dataUri)
  }

  const fechaHoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mt-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-gray-700">Identidad de marca</p>
        {canEdit && (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={sinCambios}
            loading={guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            Guardar marca
          </Button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-5">
        El color y el logo se aplican al membrete de todos los documentos que exporta la firma (dictamen,
        cartas, memo, solicitud de documentos), en PDF y Word.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-5">
          {/* Color */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Color de acento</p>
            <div className="flex items-center gap-2">
              {PRESETS_MARCA.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform',
                    color.toUpperCase() === c ? 'border-gray-900 scale-110' : 'border-transparent',
                    canEdit && 'hover:scale-110',
                  )}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <label
                className={cn(
                  'relative h-7 w-7 overflow-hidden rounded-full border border-dashed border-gray-300',
                  canEdit ? 'cursor-pointer' : 'opacity-50',
                )}
                title="Color personalizado"
              >
                <span
                  className="absolute inset-0"
                  style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
                />
                <input
                  type="color"
                  disabled={!canEdit}
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Logo */}
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Logo del membrete</p>
            <div className="flex items-center gap-3">
              {logo ? (
                <img src={logo} alt="Logo de la firma" className="h-10 max-w-[140px] object-contain rounded border border-gray-100 bg-white p-1" />
              ) : (
                <p className="text-xs text-gray-400">Sin logo — el membrete usa solo el nombre.</p>
              )}
              {canEdit && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={13} /> {logo ? 'Cambiar' : 'Subir'}
                  </Button>
                  {logo && (
                    <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setLogo(null)}>
                      <Trash2 size={13} /> Quitar
                    </Button>
                  )}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onArchivo} />
            </div>
          </div>
        </div>

        {/* Vista previa del membrete */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Vista previa</p>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-end justify-between gap-3 pb-2" style={{ borderBottom: `2.5px solid ${color}` }}>
              <div className="flex items-center gap-2.5 min-w-0">
                {logo && <img src={logo} alt="" className="h-8 max-w-[100px] object-contain shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{firma?.nombre ?? 'Mi firma'}</p>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 truncate">
                    NIT {firma?.nit ?? '—'} · {firma?.ciudad ?? '—'}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 whitespace-nowrap">{fechaHoy}</p>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
              Título de sección
            </p>
            <p className="mt-1 text-[11px] text-gray-500 font-serif">
              Así se verá el encabezado de los documentos exportados.
            </p>
          </div>
        </div>
      </div>
    </div>
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

  const { data: roles = [] } = useQuery<RolFirma[]>({
    queryKey: ['roles'],
    queryFn: () => api.get<RolFirma[]>('/firmas/mia/roles'),
  })

  const addMutation = useMutation({
    mutationFn: (body: { nombre: string; email: string; password: string; rolId: string }) =>
      api.post('/firmas/mia/usuarios', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipo'] })
      setAddOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { nombre: string; rolId: string } }) =>
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
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ROL_BADGE[m.rol] ?? 'bg-gray-100 text-gray-600')}>
                    {m.rolNombre ?? ROL_LABEL[m.rol] ?? m.rol}
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
        roles={roles}
        onClose={() => setAddOpen(false)}
        onSubmit={(data) => addMutation.mutate(data)}
        loading={addMutation.isPending}
        error={addMutation.error instanceof Error ? addMutation.error.message : null}
      />

      {editTarget && (
        <EditarMiembroModal
          miembro={editTarget}
          roles={roles}
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
  miembro, roles, onClose, onSubmit, loading, error,
}: {
  miembro: Miembro
  roles: RolFirma[]
  onClose: () => void
  onSubmit: (data: { nombre: string; rolId: string }) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({ nombre: miembro.nombre, rolId: miembro.rolId ?? roles[0]?.id ?? '' })
  const [nombreError, setNombreError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { setNombreError('El nombre es requerido'); return }
    if (!form.rolId) return
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
          value={form.rolId}
          onChange={(e) => setForm({ ...form, rolId: e.target.value })}
          options={roles.map((r) => ({ value: r.id, label: r.nombre }))}
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
  open, roles, onClose, onSubmit, loading, error,
}: {
  open: boolean
  roles: RolFirma[]
  onClose: () => void
  onSubmit: (data: { nombre: string; email: string; password: string; rolId: string }) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rolId: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const rolId = form.rolId || roles[0]?.id || ''

  function validate() {
    const next: Record<string, string> = {}
    if (!form.nombre.trim()) next.nombre = 'El nombre es requerido'
    if (!form.email.trim()) next.email = 'El correo es requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Ingresa un correo válido'
    if (form.password.length < 8) next.password = 'La contraseña debe tener al menos 8 caracteres'
    if (!rolId) next.rol = 'Selecciona un rol'
    return next
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next = validate()
    if (Object.keys(next).length > 0) { setErrors(next); return }
    setErrors({})
    onSubmit({ ...form, rolId })
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
        <div className="space-y-1">
          <Select
            id="m-rol"
            label="Rol"
            value={rolId}
            onChange={(e) => { setForm({ ...form, rolId: e.target.value }); clearError('rol') }}
            options={roles.map((r) => ({ value: r.id, label: r.nombre }))}
          />
          {errors.rol && <p className="text-xs text-red-600">{errors.rol}</p>}
        </div>

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
