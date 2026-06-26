import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, Plus, Trash2, CalendarClock, User } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Area =
  | 'efectivo' | 'cartera' | 'inventarios' | 'propiedad_planta_equipo' | 'proveedores'
  | 'nomina' | 'impuestos' | 'ingresos' | 'gastos' | 'patrimonio' | 'otro'
type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada'

type Tarea = {
  id: string
  area: Area
  titulo: string
  descripcion: string | null
  asignadoA: string
  estado: EstadoTarea
  vencimiento: string | null
}
type Usuario = { id: string; nombre: string }

const AREA_LABEL: Record<Area, string> = {
  efectivo: 'Efectivo y equivalentes',
  cartera: 'Cartera / Clientes',
  inventarios: 'Inventarios',
  propiedad_planta_equipo: 'Propiedad, planta y equipo',
  proveedores: 'Proveedores',
  nomina: 'Nómina',
  impuestos: 'Impuestos',
  ingresos: 'Ingresos',
  gastos: 'Gastos',
  patrimonio: 'Patrimonio',
  otro: 'Otro',
}
const AREA_OPTS = (Object.keys(AREA_LABEL) as Area[]).map((a) => ({ value: a, label: AREA_LABEL[a] }))

const ESTADO_OPTS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'completada', label: 'Completada' },
]
const ESTADO_BADGE: Record<EstadoTarea, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  en_progreso: 'bg-amber-50 text-amber-700',
  completada: 'bg-emerald-50 text-emerald-700',
}

export function TareasTab({
  auditoriaId,
  materialidadAprobada,
}: {
  auditoriaId: string
  materialidadAprobada: boolean
}) {
  const queryClient = useQueryClient()
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [filtro, setFiltro] = useState<EstadoTarea | 'todas'>('todas')

  const { data: tareas = [], isLoading } = useQuery<Tarea[]>({
    queryKey: ['tareas', auditoriaId],
    queryFn: () => api.get<Tarea[]>(`/auditorias/${auditoriaId}/tareas`),
    enabled: materialidadAprobada,
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>(`/firmas/mia/usuarios`),
  })
  const nombre = (uid: string) => usuarios.find((u) => u.id === uid)?.nombre ?? '—'

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tareas', auditoriaId] })

  const createMutation = useMutation({
    mutationFn: (body: { area: Area; titulo: string; descripcion?: string; asignadoA: string; vencimiento?: string }) =>
      api.post(`/auditorias/${auditoriaId}/tareas`, body),
    onSuccess: () => { invalidate(); setNuevoOpen(false) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Tarea, 'estado' | 'asignadoA'>> }) =>
      api.put(`/tareas/${id}`, patch),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tareas/${id}`),
    onSuccess: invalidate,
  })

  if (!materialidadAprobada) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center max-w-2xl">
        <Lock size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Ejecución bloqueada</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm">
          Aprueba la materialidad en planificación para habilitar la asignación de tareas.
        </p>
      </div>
    )
  }

  const filtradas = filtro === 'todas' ? tareas : tareas.filter((t) => t.estado === filtro)

  function venceTexto(v: string | null) {
    if (!v) return null
    const fecha = new Date(v)
    const hoy = new Date()
    const vencida = fecha < hoy
    return { texto: fecha.toLocaleDateString('es-CO'), vencida }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Tareas por área</p>
        <p className="text-xs text-indigo-500 mt-1">
          Asigna el trabajo del encargo al equipo por área o ciclo, con responsable y fecha límite, y
          sigue su avance hasta completarlo.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['todas', 'pendiente', 'en_progreso', 'completada'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtro === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50',
              )}
            >
              {f === 'todas' ? 'Todas' : ESTADO_OPTS.find((o) => o.value === f)?.label}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setNuevoOpen(true)}>
          <Plus size={14} /> Nueva tarea
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <User size={30} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Sin tareas en este filtro</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map((t) => {
            const vence = venceTexto(t.vencimiento)
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-gray-400 font-medium">{AREA_LABEL[t.area]}</span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ESTADO_BADGE[t.estado])}>
                        {ESTADO_OPTS.find((o) => o.value === t.estado)?.label}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900">{t.titulo}</p>
                    {t.descripcion && <p className="text-xs text-gray-500 mt-0.5">{t.descripcion}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><User size={11} /> {nombre(t.asignadoA)}</span>
                      {vence && (
                        <span className={cn('flex items-center gap-1', vence.vencida && t.estado !== 'completada' ? 'text-red-500' : '')}>
                          <CalendarClock size={11} /> {vence.texto}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    title="Eliminar tarea"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-gray-50">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Estado</label>
                    <select
                      value={t.estado}
                      onChange={(e) => updateMutation.mutate({ id: t.id, patch: { estado: e.target.value as EstadoTarea } })}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      {ESTADO_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Responsable</label>
                    <select
                      value={t.asignadoA}
                      onChange={(e) => updateMutation.mutate({ id: t.id, patch: { asignadoA: e.target.value } })}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    >
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NuevaTareaModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        usuarios={usuarios}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
        onCreate={(body) => createMutation.mutate(body)}
      />
    </div>
  )
}

function NuevaTareaModal({
  open, onClose, onCreate, usuarios, loading, error,
}: {
  open: boolean
  onClose: () => void
  usuarios: Usuario[]
  loading: boolean
  error: string | null
  onCreate: (b: { area: Area; titulo: string; descripcion?: string; asignadoA: string; vencimiento?: string }) => void
}) {
  const [form, setForm] = useState({
    area: 'efectivo' as Area,
    titulo: '',
    descripcion: '',
    asignadoA: '',
    vencimiento: '',
  })

  const asignadoA = form.asignadoA || usuarios[0]?.id || ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.titulo.trim().length < 3 || !asignadoA) return
    onCreate({
      area: form.area,
      titulo: form.titulo,
      descripcion: form.descripcion || undefined,
      asignadoA,
      // input type=date da 'YYYY-MM-DD'; lo pasamos a ISO datetime
      vencimiento: form.vencimiento ? new Date(form.vencimiento).toISOString() : undefined,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva tarea">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="nt-titulo"
          label="Título"
          placeholder="Ej: Circularizar a los 10 clientes principales"
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="nt-area"
            label="Área / Ciclo"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
            options={AREA_OPTS}
          />
          <Select
            id="nt-asignado"
            label="Responsable"
            value={asignadoA}
            onChange={(e) => setForm({ ...form, asignadoA: e.target.value })}
            options={usuarios.length > 0 ? usuarios.map((u) => ({ value: u.id, label: u.nombre })) : [{ value: '', label: 'Sin usuarios' }]}
          />
        </div>
        <Textarea
          id="nt-desc"
          label="Descripción (opcional)"
          rows={2}
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
        <Input
          id="nt-vence"
          label="Fecha límite (opcional)"
          type="date"
          value={form.vencimiento}
          onChange={(e) => setForm({ ...form, vencimiento: e.target.value })}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={form.titulo.trim().length < 3 || !asignadoA}>
            Crear tarea
          </Button>
        </div>
      </form>
    </Modal>
  )
}
