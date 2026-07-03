import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Lock, CheckCircle, Trash2, ShieldCheck, Paperclip, Link2,
  Sparkles, Upload, Download, Inbox, Check, X, Clock, CalendarClock, MessageSquare,
} from 'lucide-react'
import { ESTADO_PBC_LABEL, type EstadoPbc, type SolicitudPbcConPapel, type NotaRevision } from '@auditorya/types'
import { PbcArchivo } from './pbc-archivo'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { api, BASE_URL } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { cn } from '../../lib/cn'

type Area =
  | 'efectivo' | 'cartera' | 'inventarios' | 'propiedad_planta_equipo' | 'proveedores'
  | 'nomina' | 'impuestos' | 'ingresos' | 'gastos' | 'patrimonio' | 'otro'
type EstadoPapel = 'borrador' | 'en_revision' | 'aprobado'
type TipoEvidencia = 'documento' | 'confirmacion' | 'conciliacion' | 'calculo' | 'foto' | 'otro'

type Evidencia = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: TipoEvidencia
  enlaceExterno: string | null
  archivoNombre: string | null
  archivoTamano: number | null
}

type Papel = {
  id: string
  area: Area
  titulo: string
  procedimiento: string | null
  alcance: string | null
  hallazgos: string | null
  conclusion: string | null
  estado: EstadoPapel
  fechaInicio: string | null
  fechaFin: string | null
  asignadoA: string | null
  preparadoPor: string
  aprobadoPor: string | null
  aprobadoAt: string | null
}

type PapelDetalle = Papel & { evidencias: Evidencia[] }
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

const ESTADO_BADGE: Record<EstadoPapel, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  en_revision: 'bg-amber-50 text-amber-700',
  aprobado: 'bg-emerald-50 text-emerald-700',
}
const ESTADO_LABEL: Record<EstadoPapel, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
}

const TIPO_EVIDENCIA_OPTS = [
  { value: 'documento', label: 'Documento' },
  { value: 'confirmacion', label: 'Confirmación' },
  { value: 'conciliacion', label: 'Conciliación' },
  { value: 'calculo', label: 'Cálculo / recálculo' },
  { value: 'foto', label: 'Foto / registro físico' },
  { value: 'otro', label: 'Otro' },
]

export function PapelesTab({
  auditoriaId,
  materialidadAprobada,
}: {
  auditoriaId: string
  materialidadAprobada: boolean
}) {
  const queryClient = useQueryClient()
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [papelAbierto, setPapelAbierto] = useState<string | null>(null)

  const { data: papeles = [], isLoading } = useQuery<Papel[]>({
    queryKey: ['papeles', auditoriaId],
    queryFn: () => api.get<Papel[]>(`/auditorias/${auditoriaId}/papeles`),
    enabled: materialidadAprobada,
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>(`/firmas/mia/usuarios`),
  })
  const nombre = (uid: string | null) => (uid ? usuarios.find((u) => u.id === uid)?.nombre ?? '—' : '—')

  const createMutation = useMutation({
    mutationFn: (body: { area: Area; titulo: string }) =>
      api.post(`/auditorias/${auditoriaId}/papeles`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
      setNuevoOpen(false)
    },
  })

  if (!materialidadAprobada) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center max-w-2xl">
        <Lock size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Ejecución bloqueada</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm">
          Aprueba la materialidad en la pestaña de planificación para habilitar los papeles de trabajo.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {papeles.length} papel{papeles.length !== 1 ? 'es' : ''} de trabajo
        </p>
        <Button size="sm" className="gap-1.5" onClick={() => setNuevoOpen(true)}>
          <Plus size={14} /> Nuevo papel
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : papeles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <FileText size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Aún no hay papeles de trabajo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {papeles.map((p) => (
            <div
              key={p.id}
              onClick={() => setPapelAbierto(p.id)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-400 font-medium">{AREA_LABEL[p.area]}</span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ESTADO_BADGE[p.estado])}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900">{p.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Preparado por {nombre(p.preparadoPor)}</p>
                </div>
                {p.estado === 'aprobado' && <CheckCircle size={16} className="text-emerald-500 mt-1" />}
              </div>
            </div>
          ))}
        </div>
      )}

      <NuevoPapelModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
        onCreate={(body) => createMutation.mutate(body)}
      />

      {papelAbierto && (
        <PapelDetalleModal
          papelId={papelAbierto}
          auditoriaId={auditoriaId}
          onClose={() => setPapelAbierto(null)}
          nombreUsuario={nombre}
        />
      )}
    </div>
  )
}

function NuevoPapelModal({
  open, onClose, onCreate, loading, error,
}: {
  open: boolean
  onClose: () => void
  loading: boolean
  error: string | null
  onCreate: (b: { area: Area; titulo: string }) => void
}) {
  const [form, setForm] = useState({ area: 'efectivo' as Area, titulo: '' })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.titulo.trim().length < 3) return
    onCreate(form)
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo papel de trabajo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          id="np-area"
          label="Área / Ciclo"
          value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
          options={AREA_OPTS}
        />
        <Input
          id="np-titulo"
          label="Título del papel"
          placeholder="Ej: Confirmación de saldos bancarios"
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={form.titulo.trim().length < 3}>
            Crear papel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function PapelDetalleModal({
  papelId, auditoriaId, onClose, nombreUsuario,
}: {
  papelId: string
  auditoriaId: string
  onClose: () => void
  nombreUsuario: (uid: string | null) => string
}) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const esSocio = user?.rol === 'socio'

  const { data: papel, isLoading } = useQuery<PapelDetalle>({
    queryKey: ['papel', papelId],
    queryFn: () => api.get<PapelDetalle>(`/papeles/${papelId}`),
  })

  const { data: ia } = useQuery<{ disponible: boolean }>({
    queryKey: ['ia-estado'],
    queryFn: () => api.get('/ia/estado'),
    staleTime: 5 * 60 * 1000,
  })

  const [form, setForm] = useState({
    procedimiento: '', alcance: '', hallazgos: '', conclusion: '',
  })
  const [campoIA, setCampoIA] = useState<keyof typeof form | null>(null)

  const redactarIA = useMutation({
    mutationFn: (campo: keyof typeof form) =>
      api.post<{ texto: string }>(`/papeles/${papelId}/ia/redactar`, { campo }),
    onMutate: (campo) => setCampoIA(campo),
    onSuccess: ({ texto }, campo) => setForm((f) => ({ ...f, [campo]: texto })),
    onSettled: () => setCampoIA(null),
  })

  useEffect(() => {
    if (papel) {
      setForm({
        procedimiento: papel.procedimiento ?? '',
        alcance: papel.alcance ?? '',
        hallazgos: papel.hallazgos ?? '',
        conclusion: papel.conclusion ?? '',
      })
    }
  }, [papel])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['papel', papelId] })
    queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
    queryClient.invalidateQueries({ queryKey: ['pbc', auditoriaId] })
  }

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/papeles/${papelId}`, form),
    onSuccess: invalidate,
  })
  const aprobarMutation = useMutation({
    mutationFn: () => api.post(`/papeles/${papelId}/aprobar`, {}),
    onSuccess: invalidate,
  })
  const reabrirMutation = useMutation({
    mutationFn: () => api.post(`/papeles/${papelId}/reabrir`, {}),
    onSuccess: invalidate,
  })
  const addEvidencia = useMutation({
    mutationFn: async (b: { nombre: string; descripcion?: string; tipo: TipoEvidencia; enlaceExterno?: string; archivo?: File }) => {
      const ev = await api.post<{ id: string }>(`/papeles/${papelId}/evidencias`, {
        nombre: b.nombre, descripcion: b.descripcion, tipo: b.tipo, enlaceExterno: b.enlaceExterno,
      })
      // Si el usuario adjuntó un archivo, lo sube a la evidencia recién creada (un solo paso).
      if (b.archivo) {
        const fd = new FormData()
        fd.append('archivo', b.archivo)
        await api.upload(`/evidencias/${ev.id}/archivo`, fd)
      }
      return ev
    },
    onSuccess: invalidate,
  })
  const delEvidencia = useMutation({
    mutationFn: (evidenciaId: string) => api.delete(`/papeles/${papelId}/evidencias/${evidenciaId}`),
    onSuccess: invalidate,
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>(`/firmas/mia/usuarios`),
  })

  const programar = useMutation({
    mutationFn: (patch: { fechaInicio?: string; fechaFin?: string; asignadoA?: string }) =>
      api.put(`/papeles/${papelId}`, patch),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['cronograma', auditoriaId] })
    },
  })

  const aprobado = papel?.estado === 'aprobado'

  return (
    <Modal open onClose={onClose} title={papel?.titulo ?? 'Papel de trabajo'} size="lg">
      {isLoading || !papel ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ESTADO_BADGE[papel.estado])}>
              {ESTADO_LABEL[papel.estado]}
            </span>
            <span className="text-xs text-gray-400">{AREA_LABEL[papel.area]}</span>
          </div>

          {aprobado && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              <CheckCircle size={15} />
              <span>
                Aprobado por {nombreUsuario(papel.aprobadoPor)}
                {papel.aprobadoAt ? ` el ${new Date(papel.aprobadoAt).toLocaleDateString('es-CO')}` : ''}.
              </span>
            </div>
          )}

          {(
            [
              { campo: 'procedimiento', label: 'Procedimiento aplicado', rows: 3, placeholder: 'Describe el procedimiento ejecutado' },
              { campo: 'alcance', label: 'Alcance / Muestra', rows: 2, placeholder: 'Tamaño y criterio de la muestra' },
              { campo: 'hallazgos', label: 'Hallazgos', rows: 3, placeholder: 'Errores, diferencias o excepciones encontradas' },
              { campo: 'conclusion', label: 'Conclusión', rows: 2, placeholder: 'Conclusión del procedimiento' },
            ] as const
          ).map(({ campo, label, rows, placeholder }) => (
            <div key={campo}>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor={`pt-${campo}`} className="text-sm font-medium text-gray-700">{label}</label>
                {!aprobado && ia?.disponible && (
                  <button
                    type="button"
                    onClick={() => redactarIA.mutate(campo)}
                    disabled={redactarIA.isPending}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50 disabled:text-gray-300 transition-colors"
                    title="Genera un borrador con IA a partir del contexto del papel"
                  >
                    {campoIA === campo ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-indigo-500 border-t-transparent" />
                    ) : (
                      <Sparkles size={11} />
                    )}
                    Redactar con IA
                  </button>
                )}
              </div>
              <Textarea
                id={`pt-${campo}`} rows={rows}
                placeholder={placeholder}
                value={form[campo]} disabled={aprobado}
                onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
              />
            </div>
          ))}
          {redactarIA.isError && (
            <p className="text-xs text-red-600">
              {redactarIA.error instanceof Error ? redactarIA.error.message : 'No se pudo generar el borrador'}
            </p>
          )}

          {!aprobado && (
            <div>
              <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                Guardar cambios
              </Button>
              {saveMutation.isError && (
                <p className="text-xs text-red-600 mt-1">
                  {saveMutation.error instanceof Error ? saveMutation.error.message : 'Error al guardar'}
                </p>
              )}
            </div>
          )}

          {/* Cronograma: responsable + fechas planeadas */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <CalendarClock size={14} className="text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-800">Planeación (cronograma)</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Responsable</label>
                <select
                  className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
                  value={papel.asignadoA ?? ''}
                  disabled={aprobado}
                  onChange={(e) => programar.mutate({ asignadoA: e.target.value })}
                >
                  <option value="">— Sin asignar</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Inicio</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
                  value={papel.fechaInicio ? papel.fechaInicio.slice(0, 10) : ''}
                  disabled={aprobado}
                  onChange={(e) => programar.mutate({ fechaInicio: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : '' })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Fin</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
                  value={papel.fechaFin ? papel.fechaFin.slice(0, 10) : ''}
                  disabled={aprobado}
                  onChange={(e) => programar.mutate({ fechaFin: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : '' })}
                />
              </div>
            </div>
          </div>

          {/* Documentos requeridos (PBC) */}
          <PbcSeccion papelId={papelId} auditoriaId={auditoriaId} aprobado={aprobado} onCambio={invalidate} />

          {/* Notas de revisión (NIA 220) */}
          <NotasRevisionSeccion papelId={papelId} auditoriaId={auditoriaId} />

          {/* Evidencias */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Paperclip size={14} className="text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-800">Evidencia ({papel.evidencias.length})</h4>
            </div>
            {papel.evidencias.length > 0 && (
              <div className="space-y-2 mb-3">
                {papel.evidencias.map((ev) => (
                  <EvidenciaRow
                    key={ev.id}
                    evidencia={ev}
                    aprobado={aprobado}
                    onEliminar={() => delEvidencia.mutate(ev.id)}
                    onCambio={invalidate}
                  />
                ))}
              </div>
            )}
            {!aprobado && <NuevaEvidenciaForm onAdd={(b) => addEvidencia.mutate(b)} loading={addEvidencia.isPending} />}
          </div>

          {/* Acciones de estado */}
          <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
            {!aprobado ? (
              <div className="flex flex-col items-start gap-1">
                <Button
                  size="sm" variant="secondary" className="gap-1.5"
                  disabled={!esSocio || aprobarMutation.isPending}
                  loading={aprobarMutation.isPending}
                  onClick={() => aprobarMutation.mutate()}
                >
                  <ShieldCheck size={14} /> Aprobar papel
                </Button>
                {!esSocio && <p className="text-xs text-gray-400">Solo el socio responsable puede aprobar</p>}
              </div>
            ) : (
              esSocio && (
                <Button size="sm" variant="secondary" loading={reabrirMutation.isPending} onClick={() => reabrirMutation.mutate()}>
                  Reabrir papel
                </Button>
              )
            )}
            {(aprobarMutation.isError || reabrirMutation.isError) && (
              <p className="text-xs text-red-600">No se pudo cambiar el estado.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

const PBC_BADGE: Record<EstadoPbc, string> = {
  solicitado: 'bg-amber-50 text-amber-700',
  recibido: 'bg-emerald-50 text-emerald-700',
  no_aplica: 'bg-gray-100 text-gray-500',
}

function PbcSeccion({
  papelId, auditoriaId, aprobado, onCambio,
}: {
  papelId: string
  auditoriaId: string
  aprobado: boolean
  onCambio: () => void
}) {
  const [nuevo, setNuevo] = useState('')

  const { data: todas = [] } = useQuery<SolicitudPbcConPapel[]>({
    queryKey: ['pbc', auditoriaId],
    queryFn: () => api.get<SolicitudPbcConPapel[]>(`/auditorias/${auditoriaId}/pbc`),
  })
  const items = todas.filter((s) => s.papelTrabajoId === papelId)

  const agregar = useMutation({
    mutationFn: (descripcion: string) =>
      api.post(`/auditorias/${auditoriaId}/pbc`, { papelTrabajoId: papelId, descripcion }),
    onSuccess: () => { setNuevo(''); onCambio() },
  })
  const recibir = useMutation({
    mutationFn: (id: string) => api.post(`/pbc/${id}/recibir`, {}),
    onSuccess: onCambio,
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoPbc }) => api.put(`/pbc/${id}`, { estado }),
    onSuccess: onCambio,
  })
  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/pbc/${id}`),
    onSuccess: onCambio,
  })

  const pendientes = items.filter((s) => s.estado === 'solicitado').length

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Inbox size={14} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-800">Documentos requeridos ({items.length})</h4>
        {pendientes > 0 && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2">
        Documentos que el cliente debe entregar para esta prueba. Al marcarlos "Recibido" se registran como evidencia del papel.
      </p>

      {items.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {items.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', PBC_BADGE[s.estado])}>
                    {ESTADO_PBC_LABEL[s.estado]}
                  </span>
                  <span className="text-sm text-gray-800">{s.descripcion}</span>
                </div>
                {s.estado === 'recibido' && s.evidenciaId && (
                  <div className="mt-1">
                    <PbcArchivo
                      evidenciaId={s.evidenciaId}
                      archivoNombre={s.evidenciaArchivoNombre}
                      archivoTamano={s.evidenciaArchivoTamano}
                      disabled={aprobado}
                      onCambio={onCambio}
                    />
                  </div>
                )}
              </div>
              {!aprobado && (
                <div className="flex items-center gap-1 shrink-0">
                  {s.estado === 'solicitado' && (
                    <>
                      <button
                        onClick={() => recibir.mutate(s.id)}
                        disabled={recibir.isPending}
                        className="text-emerald-600 hover:bg-emerald-50 rounded p-1 transition-colors"
                        title="Marcar recibido"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => cambiarEstado.mutate({ id: s.id, estado: 'no_aplica' })}
                        disabled={cambiarEstado.isPending}
                        className="text-gray-400 hover:bg-gray-100 rounded p-1 transition-colors"
                        title="No aplica"
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                  {s.estado !== 'solicitado' && (
                    <button
                      onClick={() => cambiarEstado.mutate({ id: s.id, estado: 'solicitado' })}
                      disabled={cambiarEstado.isPending}
                      className="text-gray-400 hover:bg-gray-100 rounded p-1 transition-colors"
                      title="Volver a solicitado"
                    >
                      <Clock size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => eliminar.mutate(s.id)}
                    disabled={eliminar.isPending}
                    className="text-gray-300 hover:text-red-500 rounded p-1"
                    title="Eliminar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!aprobado && (
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Agregar documento a solicitar…"
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nuevo.trim().length >= 2) agregar.mutate(nuevo.trim()) }}
          />
          <Button size="sm" variant="secondary" className="gap-1.5" loading={agregar.isPending}
            disabled={nuevo.trim().length < 2} onClick={() => agregar.mutate(nuevo.trim())}>
            <Plus size={13} /> Agregar
          </Button>
        </div>
      )}
    </div>
  )
}

function NotasRevisionSeccion({ papelId, auditoriaId }: { papelId: string; auditoriaId: string }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [nuevo, setNuevo] = useState('')

  const { data: todas = [] } = useQuery<NotaRevision[]>({
    queryKey: ['notas-revision', auditoriaId],
    queryFn: () => api.get<NotaRevision[]>(`/auditorias/${auditoriaId}/notas-revision`),
  })
  const items = todas.filter((n) => n.papelTrabajoId === papelId)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notas-revision', auditoriaId] })

  const agregar = useMutation({
    mutationFn: (texto: string) => api.post(`/papeles/${papelId}/notas-revision`, { texto }),
    onSuccess: () => { setNuevo(''); invalidate() },
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: 'abierta' | 'resuelta' }) => api.put(`/notas-revision/${id}`, { estado }),
    onSuccess: invalidate,
  })
  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/notas-revision/${id}`),
    onSuccess: invalidate,
  })

  const abiertas = items.filter((n) => n.estado === 'abierta').length

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare size={14} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-800">Notas de revisión ({items.length})</h4>
        {abiertas > 0 && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {abiertas} abierta{abiertas !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2">
        Observaciones de la revisión (NIA 220). El revisor las deja y el preparador las resuelve.
      </p>

      {items.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {items.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', n.estado === 'resuelta' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                    {n.estado === 'resuelta' ? 'Resuelta' : 'Abierta'}
                  </span>
                  <span className="text-sm text-gray-800">{n.texto}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {n.estado === 'abierta' ? (
                  <button onClick={() => cambiarEstado.mutate({ id: n.id, estado: 'resuelta' })} disabled={cambiarEstado.isPending}
                    className="text-emerald-600 hover:bg-emerald-50 rounded p-1 transition-colors" title="Marcar resuelta">
                    <Check size={14} />
                  </button>
                ) : (
                  <button onClick={() => cambiarEstado.mutate({ id: n.id, estado: 'abierta' })} disabled={cambiarEstado.isPending}
                    className="text-gray-400 hover:bg-gray-100 rounded p-1 transition-colors" title="Reabrir">
                    <Clock size={14} />
                  </button>
                )}
                {user?.rol === 'socio' && (
                  <button onClick={() => eliminar.mutate(n.id)} disabled={eliminar.isPending}
                    className="text-gray-300 hover:text-red-500 rounded p-1" title="Eliminar">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Agregar nota de revisión…"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && nuevo.trim().length >= 2) agregar.mutate(nuevo.trim()) }}
        />
        <Button size="sm" variant="secondary" className="gap-1.5" loading={agregar.isPending}
          disabled={nuevo.trim().length < 2} onClick={() => agregar.mutate(nuevo.trim())}>
          <Plus size={13} /> Agregar
        </Button>
      </div>
    </div>
  )
}

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function EvidenciaRow({
  evidencia: ev, aprobado, onEliminar, onCambio,
}: {
  evidencia: Evidencia
  aprobado: boolean
  onEliminar: () => void
  onCambio: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const subir = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('archivo', file)
      return api.upload(`/evidencias/${ev.id}/archivo`, fd)
    },
    onSuccess: onCambio,
  })

  const descargar = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/evidencias/${ev.id}/descarga`),
    onSuccess: ({ url }) => window.open(`${BASE_URL}${url}`, '_blank'),
  })

  return (
    <div className="flex items-start justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{ev.nombre}</span>
          <span className="text-xs text-gray-400 capitalize">{ev.tipo}</span>
        </div>
        {ev.descripcion && <p className="text-xs text-gray-500">{ev.descripcion}</p>}
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          {ev.enlaceExterno && (
            <a href={ev.enlaceExterno} target="_blank" rel="noreferrer"
              className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1">
              <Link2 size={11} /> Ver soporte
            </a>
          )}
          {ev.archivoNombre ? (
            <button
              onClick={() => descargar.mutate()}
              disabled={descargar.isPending}
              className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
              title="Descarga con enlace firmado (15 min)"
            >
              <Download size={11} />
              {ev.archivoNombre}
              {ev.archivoTamano != null && <span className="text-gray-400">({formatoTamano(ev.archivoTamano)})</span>}
            </button>
          ) : (
            !aprobado && (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={subir.isPending}
                className="text-xs text-gray-500 hover:text-indigo-600 inline-flex items-center gap-1 transition-colors"
              >
                {subir.isPending ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-indigo-500 border-t-transparent" />
                ) : (
                  <Upload size={11} />
                )}
                Adjuntar archivo
              </button>
            )
          )}
        </div>
        {(subir.isError || descargar.isError) && (
          <p className="mt-0.5 text-xs text-red-600">
            {subir.error instanceof Error ? subir.error.message
              : descargar.error instanceof Error ? descargar.error.message
              : 'Error con el archivo'}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) subir.mutate(f)
          }}
        />
      </div>
      {!aprobado && (
        <button onClick={onEliminar} className="text-gray-300 hover:text-red-500 shrink-0" title="Eliminar">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function NuevaEvidenciaForm({
  onAdd, loading,
}: {
  onAdd: (b: { nombre: string; descripcion?: string; tipo: TipoEvidencia; enlaceExterno?: string; archivo?: File }) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    nombre: '', descripcion: '', tipo: 'documento' as TipoEvidencia, enlaceExterno: '',
  })
  const [archivo, setArchivo] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // El nombre puede tomarse del archivo si no se escribió uno.
  const nombreFinal = form.nombre.trim() || (archivo?.name ?? '')

  function handleAdd() {
    if (nombreFinal.length < 2) return
    onAdd({
      nombre: nombreFinal,
      descripcion: form.descripcion || undefined,
      tipo: form.tipo,
      enlaceExterno: form.enlaceExterno || undefined,
      archivo: archivo ?? undefined,
    })
    setForm({ nombre: '', descripcion: '', tipo: 'documento', enlaceExterno: '' })
    setArchivo(null)
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-200 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input id="ev-nombre" placeholder="Nombre del soporte" value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <Select id="ev-tipo" value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoEvidencia })}
          options={TIPO_EVIDENCIA_OPTS} />
      </div>
      <Input id="ev-desc" placeholder="Descripción (opcional)" value={form.descripcion}
        onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />

      {/* Adjuntar archivo (opcional) — nombre se toma del archivo si está vacío */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
        >
          <Upload size={13} /> {archivo ? 'Cambiar archivo' : 'Adjuntar archivo'}
        </button>
        {archivo && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 min-w-0">
            <span className="truncate max-w-[180px]">{archivo.name}</span>
            <button onClick={() => setArchivo(null)} className="text-gray-300 hover:text-red-500 shrink-0" title="Quitar">
              <X size={12} />
            </button>
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) setArchivo(f)
          }}
        />
      </div>

      <Input id="ev-enlace" placeholder="O enlace externo (opcional, https://...)" value={form.enlaceExterno}
        onChange={(e) => setForm({ ...form, enlaceExterno: e.target.value })} />
      <Button size="sm" variant="secondary" className="gap-1.5" loading={loading}
        disabled={nombreFinal.length < 2} onClick={handleAdd}>
        <Plus size={13} /> Agregar evidencia
      </Button>
    </div>
  )
}
