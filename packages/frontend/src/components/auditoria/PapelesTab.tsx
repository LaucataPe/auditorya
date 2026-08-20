import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import {
  FileText, Plus, CheckCircle, Trash2, ShieldCheck, Paperclip, Link2,
  Sparkles, Upload, Download, Inbox, Check, X, Clock, MessageSquare,
  Target, Flag, RefreshCw, AlertTriangle, Send, ArrowRightCircle, ListTodo, Pencil,
} from 'lucide-react'
import { BloqueoMaterialidad } from './BloqueoMaterialidad'
import {
  ESTADO_PBC_LABEL, PROGRAMA_AUDITORIA, COBERTURA_OBJETIVO_DEFECTO,
  TIPO_HALLAZGO_LABEL, SEVERIDAD_HALLAZGO_LABEL, ESTADO_HALLAZGO_LABEL,
  proyectarError, VEREDICTO_ERROR_LABEL,
  type EstadoPbc, type SolicitudPbcConPapel, type NotaRevision,
  type MuestraConItems, type ResultadoCompletitud,
  type Hallazgo, type TipoHallazgo, type SeveridadHallazgo,
  type Tarea, type EstadoTarea, type AnalisisBalance, type CuentaAnalizada, type MuestraItem,
} from '@auditorya/types'
import { PbcArchivo } from './pbc-archivo'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { DataTable } from '../ui/DataTable'
import { api, BASE_URL } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { toast } from '../../store/toast.store'
import { cn } from '../../lib/cn'
import { useAreas } from '../../hooks/useAreas'
import { CrearCicloInline } from './CrearCicloInline'

// Clave de área: catálogo base o ciclo propio de la firma (ver useAreas).
type Area = string
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
  pasosEstado: Record<string, { hecho: boolean; nota: string | null }>
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
  const { areaLabel } = useAreas()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { id: empresaId } = useParams<{ id: string }>()
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Papel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Papel | null>(null)
  const [filtro, setFiltro] = useState<EstadoPapel | 'todos'>('todos')
  const irAlPapel = (papelId: string) => navigate(`/empresas/${empresaId}/encargos/${auditoriaId}/papeles/${papelId}`)

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

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { area: Area; titulo: string } }) =>
      api.put(`/papeles/${id}`, body),
    onSuccess: (_d, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['papel', id] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/papeles/${id}`),
    onSuccess: () => {
      // El borrado quita evidencia/PBC/notas/muestra y desvincula tareas y hallazgos.
      queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['completitud', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['tareas', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['hallazgos', auditoriaId] })
      setDeleteTarget(null)
    },
  })

  if (!materialidadAprobada) {
    return (
      <BloqueoMaterialidad
        titulo="Ejecución bloqueada"
        descripcion="Aprueba la materialidad en planificación para habilitar los papeles de trabajo."
      />
    )
  }

  const filtrados = filtro === 'todos' ? papeles : papeles.filter((p) => p.estado === filtro)

  return (
    <div className="space-y-5">

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(['todos', 'borrador', 'en_revision', 'aprobado'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtro === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50',
              )}
            >
              {f === 'todos'
                ? `Todos (${papeles.length})`
                : `${ESTADO_LABEL[f]} (${papeles.filter((p) => p.estado === f).length})`}
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setNuevoOpen(true)}>
          <Plus size={14} /> Nuevo papel
        </Button>
      </div>

      <CompletitudPanel auditoriaId={auditoriaId} onAbrirPapel={irAlPapel} />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <FileText size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">
            {papeles.length === 0 ? 'Aún no hay papeles de trabajo' : 'Sin papeles en este filtro'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map((p) => (
            <div
              key={p.id}
              onClick={() => irAlPapel(p.id)}
              className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-gray-400 font-medium">{areaLabel(p.area)}</span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ESTADO_BADGE[p.estado])}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900">{p.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Responsable: <span className={cn('font-medium', p.asignadoA ? 'text-gray-700' : 'text-amber-600')}>{p.asignadoA ? nombre(p.asignadoA) : 'sin asignar'}</span>
                    <span className="text-gray-300"> · </span>Preparado por {nombre(p.preparadoPor)}
                  </p>
                </div>
                {p.estado === 'aprobado' ? (
                  <CheckCircle size={16} className="text-emerald-500 mt-1 shrink-0" />
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditTarget(p) }}
                      className="p-1 rounded-lg text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Editar papel"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                      className="p-1 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Eliminar papel"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
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

      <EditarPapelModal
        papel={editTarget}
        onClose={() => { setEditTarget(null); editMutation.reset() }}
        loading={editMutation.isPending}
        error={editMutation.error instanceof Error ? editMutation.error.message : null}
        onSave={(body) => editTarget && editMutation.mutate({ id: editTarget.id, body })}
      />

      <EliminarPapelModal
        papel={deleteTarget}
        onClose={() => { setDeleteTarget(null); deleteMutation.reset() }}
        loading={deleteMutation.isPending}
        error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
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
  const { opciones } = useAreas()
  const [form, setForm] = useState({ area: 'bancos' as Area, titulo: '' })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.titulo.trim().length < 3) return
    onCreate(form)
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo papel de trabajo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Select
            id="np-area"
            label="Área / Ciclo"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
            options={opciones}
          />
          <CrearCicloInline onCreado={(clave) => setForm((f) => ({ ...f, area: clave }))} />
        </div>
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

function EditarPapelModal({
  papel, onClose, onSave, loading, error,
}: {
  papel: Papel | null
  onClose: () => void
  loading: boolean
  error: string | null
  onSave: (b: { area: Area; titulo: string }) => void
}) {
  const { opciones } = useAreas()
  const [form, setForm] = useState({ area: 'bancos' as Area, titulo: '' })

  useEffect(() => {
    if (papel) setForm({ area: papel.area, titulo: papel.titulo })
  }, [papel])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.titulo.trim().length < 3) return
    onSave({ area: form.area, titulo: form.titulo.trim() })
  }

  return (
    <Modal open={!!papel} onClose={onClose} title="Editar papel de trabajo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          id="ep-area"
          label="Área / Ciclo"
          value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
          options={opciones}
        />
        <Input
          id="ep-titulo"
          label="Título del papel"
          placeholder="Ej: Confirmación de saldos bancarios"
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
        <p className="text-xs text-gray-400">
          El procedimiento, alcance, hallazgos y conclusión se editan dentro del papel.
        </p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={form.titulo.trim().length < 3}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EliminarPapelModal({
  papel, onClose, onConfirm, loading, error,
}: {
  papel: Papel | null
  onClose: () => void
  loading: boolean
  error: string | null
  onConfirm: () => void
}) {
  const { areaLabel } = useAreas()
  return (
    <Modal open={!!papel} onClose={onClose} title="Eliminar papel de trabajo">
      <div className="space-y-4">
        {papel && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">{areaLabel(papel.area)}</p>
            <p className="text-sm font-medium text-gray-800">{papel.titulo}</p>
          </div>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            Esta acción es <strong>irreversible</strong>. Se eliminará el papel junto con su
            evidencia, documentos solicitados (PBC), notas de revisión y la muestra asociada.
          </p>
        </div>

        <p className="text-sm text-gray-600">
          Las <strong>tareas</strong> y los <strong>hallazgos</strong> vinculados no se pierden: quedan
          sueltos (desvinculados del papel).
        </p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" variant="danger" loading={loading} onClick={onConfirm}>
            Eliminar papel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const TAREA_ESTADO_LABEL: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente', en_progreso: 'En progreso', completada: 'Completada',
}

function TareasSeccion({
  papelId, auditoriaId, area, aprobado,
}: {
  papelId: string
  auditoriaId: string
  area: Area
  aprobado: boolean
}) {
  const queryClient = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [asignadoA, setAsignadoA] = useState('')

  const { data: tareas = [] } = useQuery<Tarea[]>({
    queryKey: ['papel-tareas', papelId],
    queryFn: () => api.get<Tarea[]>(`/papeles/${papelId}/tareas`),
  })
  const { data: usuarios = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<{ id: string; nombre: string }[]>(`/firmas/mia/usuarios`),
  })

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['papel-tareas', papelId] })

  const crear = useMutation({
    mutationFn: () =>
      api.post(`/auditorias/${auditoriaId}/tareas`, { area, titulo: titulo.trim(), asignadoA, papelTrabajoId: papelId }),
    onSuccess: () => { setTitulo(''); refetch() },
  })
  const cambiar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoTarea }) => api.put(`/tareas/${id}`, { estado }),
    onSuccess: refetch,
  })
  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/tareas/${id}`),
    onSuccess: refetch,
  })

  const nombre = (uid: string) => usuarios.find((u) => u.id === uid)?.nombre ?? '—'
  const puedeCrear = titulo.trim().length >= 3 && !!asignadoA

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <ListTodo size={14} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-800">Tareas / asignaciones ({tareas.length})</h4>
      </div>

      {tareas.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {tareas.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 truncate">{t.titulo}</p>
                <p className="text-[11px] text-gray-400">{nombre(t.asignadoA)}</p>
              </div>
              <select
                className="rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 focus:outline-none disabled:bg-gray-50"
                value={t.estado}
                disabled={aprobado || cambiar.isPending}
                onChange={(e) => cambiar.mutate({ id: t.id, estado: e.target.value as EstadoTarea })}
              >
                {(Object.keys(TAREA_ESTADO_LABEL) as EstadoTarea[]).map((k) => (
                  <option key={k} value={k}>{TAREA_ESTADO_LABEL[k]}</option>
                ))}
              </select>
              {!aprobado && (
                <button onClick={() => eliminar.mutate(t.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Eliminar">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!aprobado && (
        <div className="flex gap-2 flex-wrap">
          <input
            className="flex-1 min-w-[160px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Nueva asignación (ej: circularizar clientes A–M)"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
          <select
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none"
            value={asignadoA}
            onChange={(e) => setAsignadoA(e.target.value)}
          >
            <option value="">— Responsable</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <Button size="sm" variant="secondary" className="gap-1.5" loading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>
            <Plus size={13} /> Asignar
          </Button>
        </div>
      )}
    </div>
  )
}

const HALLAZGO_ESTADO_BADGE: Record<string, string> = {
  abierto: 'bg-gray-100 text-gray-600',
  comunicado: 'bg-blue-50 text-blue-700',
  corregido: 'bg-emerald-50 text-emerald-700',
  no_corregido: 'bg-amber-50 text-amber-700',
}

type HallazgoForm = {
  descripcion: string; criterio: string; causa: string; efecto: string
  recomendacion: string; tipo: TipoHallazgo; severidad: SeveridadHallazgo; monto: string; cuentaCodigo: string
}
const HALLAZGO_FORM_VACIO: HallazgoForm = {
  descripcion: '', criterio: '', causa: '', efecto: '', recomendacion: '',
  tipo: 'incorreccion', severidad: 'media', monto: '', cuentaCodigo: '',
}
const hallazgoAForm = (h: Hallazgo): HallazgoForm => ({
  descripcion: h.descripcion, criterio: h.criterio ?? '', causa: h.causa ?? '', efecto: h.efecto ?? '',
  recomendacion: h.recomendacion ?? '', tipo: h.tipo, severidad: h.severidad,
  monto: h.monto != null ? String(Number(h.monto)) : '', cuentaCodigo: h.cuentaCodigo ?? '',
})
// Payload común para crear/editar (envía cadenas concretas: '' → null en el backend).
const bodyHallazgo = (f: HallazgoForm) => ({
  descripcion: f.descripcion.trim(),
  criterio: f.criterio.trim(),
  causa: f.causa.trim(),
  efecto: f.efecto.trim(),
  recomendacion: f.recomendacion.trim(),
  tipo: f.tipo,
  severidad: f.severidad,
  cuentaCodigo: f.cuentaCodigo.trim(),
  monto: f.tipo === 'incorreccion' && f.monto !== '' ? Number(f.monto) : null,
})

// Los cinco atributos del hallazgo (condición/criterio/causa/efecto + recomendación) como plantilla guiada.
const CAMPOS_HALLAZGO: { key: 'descripcion' | 'criterio' | 'causa' | 'efecto' | 'recomendacion'; label: string; placeholder: string }[] = [
  { key: 'descripcion', label: 'Condición — situación encontrada', placeholder: 'Qué observaste (el hecho concreto, con datos)' },
  { key: 'criterio', label: 'Criterio — lo que debería ser', placeholder: 'Norma, política o marco aplicable que se incumple' },
  { key: 'causa', label: 'Causa — por qué ocurrió', placeholder: 'Origen o razón de la desviación' },
  { key: 'efecto', label: 'Efecto — consecuencia / impacto', placeholder: 'Impacto en las cifras o el riesgo que genera' },
  { key: 'recomendacion', label: 'Recomendación', placeholder: 'Qué debe hacer la administración para corregir' },
]

function CamposHallazgo({ form, onChange }: { form: HallazgoForm; onChange: (patch: Partial<HallazgoForm>) => void }) {
  return (
    <div className="space-y-2">
      {CAMPOS_HALLAZGO.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="text-[11px] font-medium text-gray-500 block mb-0.5">
            {label}{key === 'descripcion' && <span className="text-red-400"> *</span>}
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder={placeholder}
            value={form[key]}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </div>
      ))}
      <div className="flex gap-2 flex-wrap items-center">
        <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none"
          value={form.tipo} onChange={(e) => onChange({ tipo: e.target.value as TipoHallazgo })}>
          {(Object.keys(TIPO_HALLAZGO_LABEL) as TipoHallazgo[]).map((k) => <option key={k} value={k}>{TIPO_HALLAZGO_LABEL[k]}</option>)}
        </select>
        <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none"
          value={form.severidad} onChange={(e) => onChange({ severidad: e.target.value as SeveridadHallazgo })}>
          {(Object.keys(SEVERIDAD_HALLAZGO_LABEL) as SeveridadHallazgo[]).map((k) => <option key={k} value={k}>{SEVERIDAD_HALLAZGO_LABEL[k]}</option>)}
        </select>
        {form.tipo === 'incorreccion' && (
          <>
            <input type="number" className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Monto $" value={form.monto} onChange={(e) => onChange({ monto: e.target.value })} />
            <input className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Cuenta" value={form.cuentaCodigo} onChange={(e) => onChange({ cuentaCodigo: e.target.value.replace(/[^0-9]/g, '') })} />
          </>
        )}
      </div>
    </div>
  )
}

function HallazgosSeccion({
  papelId, auditoriaId, aprobado, onCambio,
}: {
  papelId: string
  auditoriaId: string
  aprobado: boolean
  onCambio: () => void
}) {
  const queryClient = useQueryClient()
  const [abrir, setAbrir] = useState(false)
  const [form, setForm] = useState<HallazgoForm>(HALLAZGO_FORM_VACIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<HallazgoForm>(HALLAZGO_FORM_VACIO)

  const { data: lista = [] } = useQuery<Hallazgo[]>({
    queryKey: ['hallazgos-papel', papelId],
    queryFn: () => api.get<Hallazgo[]>(`/papeles/${papelId}/hallazgos`),
  })

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['hallazgos-papel', papelId] })
    queryClient.invalidateQueries({ queryKey: ['hallazgos', auditoriaId] })
    queryClient.invalidateQueries({ queryKey: ['ajustes', auditoriaId] })
    onCambio()
  }

  const crear = useMutation({
    mutationFn: () => api.post(`/papeles/${papelId}/hallazgos`, bodyHallazgo(form)),
    onSuccess: () => {
      setForm(HALLAZGO_FORM_VACIO)
      setAbrir(false)
      refrescar()
    },
  })
  const editar = useMutation({
    mutationFn: () => api.put(`/hallazgos/${editId}`, bodyHallazgo(editForm)),
    onSuccess: () => { setEditId(null); refrescar() },
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) => api.put(`/hallazgos/${id}`, { estado }),
    onSuccess: refrescar,
  })
  const llevarAAjuste = useMutation({
    mutationFn: (id: string) => api.post(`/hallazgos/${id}/llevar-a-ajuste`, {}),
    onSuccess: refrescar,
  })
  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/hallazgos/${id}`),
    onSuccess: refrescar,
  })

  const abrirEdicion = (h: Hallazgo) => { setEditForm(hallazgoAForm(h)); setEditId(h.id) }
  const sinResolver = lista.filter((h) => h.estado === 'abierto' || h.estado === 'comunicado').length

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <AlertTriangle size={14} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-800">Hallazgos ({lista.length})</h4>
        {sinResolver > 0 && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{sinResolver} sin resolver</span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-2">
        Estructura cada hallazgo como condición · criterio · causa · efecto + recomendación. Lo que no se corrige se lleva a la
        hoja de ajustes (incorrecciones) o a la carta de control interno (deficiencias).
      </p>

      {lista.length > 0 && (
        <div className="space-y-2 mb-3">
          {lista.map((h) => {
            const estructurado = !!(h.criterio || h.causa || h.efecto)
            if (editId === h.id) {
              return (
                <div key={h.id} className="rounded-lg border border-indigo-200 bg-white p-3 space-y-2">
                  <CamposHallazgo form={editForm} onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))} />
                  <div className="flex gap-2">
                    <Button size="sm" loading={editar.isPending} disabled={editForm.descripcion.trim().length < 2} onClick={() => editar.mutate()}>Guardar</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditId(null)}>Cancelar</Button>
                  </div>
                </div>
              )
            }
            return (
              <div key={h.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', HALLAZGO_ESTADO_BADGE[h.estado])}>
                        {ESTADO_HALLAZGO_LABEL[h.estado]}
                      </span>
                      <span className="text-[10px] text-gray-400">{TIPO_HALLAZGO_LABEL[h.tipo]}</span>
                      <span className="text-[10px] text-gray-400">· {SEVERIDAD_HALLAZGO_LABEL[h.severidad]}</span>
                      {h.monto && <span className="text-[10px] text-gray-500">{cop(Number(h.monto))}</span>}
                      {h.ajusteId && <span className="text-[10px] text-indigo-600">→ en ajustes</span>}
                    </div>
                    <p className="text-sm text-gray-800 mt-0.5">{h.descripcion}</p>
                    {estructurado && (
                      <div className="mt-1 space-y-0.5">
                        {h.criterio && <p className="text-xs text-gray-500"><span className="text-gray-400 font-medium">Criterio:</span> {h.criterio}</p>}
                        {h.causa && <p className="text-xs text-gray-500"><span className="text-gray-400 font-medium">Causa:</span> {h.causa}</p>}
                        {h.efecto && <p className="text-xs text-gray-500"><span className="text-gray-400 font-medium">Efecto:</span> {h.efecto}</p>}
                      </div>
                    )}
                    {h.recomendacion && <p className="text-xs text-gray-500 mt-0.5"><span className="text-gray-400 font-medium">Recomendación:</span> {h.recomendacion}</p>}
                  </div>
                  {!aprobado && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => abrirEdicion(h)} className="text-gray-300 hover:text-indigo-500" title={estructurado ? 'Editar' : 'Estructurar (criterio · causa · efecto)'}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => eliminar.mutate(h.id)} className="text-gray-300 hover:text-red-500" title="Eliminar">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                {!aprobado && !estructurado && (
                  <button onClick={() => abrirEdicion(h)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
                    <Plus size={11} /> Estructurar (criterio · causa · efecto)
                  </button>
                )}
                {!aprobado && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {h.estado === 'abierto' && (
                      <button onClick={() => cambiarEstado.mutate({ id: h.id, estado: 'comunicado' })}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 rounded px-2 py-1">
                        <Send size={11} /> Comunicar
                      </button>
                    )}
                    {h.estado === 'comunicado' && (
                      <>
                        <button onClick={() => cambiarEstado.mutate({ id: h.id, estado: 'corregido' })}
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded px-2 py-1">
                          <Check size={11} /> Corregido
                        </button>
                        <button onClick={() => cambiarEstado.mutate({ id: h.id, estado: 'no_corregido' })}
                          className="inline-flex items-center gap-1 text-xs text-amber-600 hover:bg-amber-50 rounded px-2 py-1">
                          <X size={11} /> No corregido
                        </button>
                      </>
                    )}
                    {h.estado === 'no_corregido' && h.tipo === 'incorreccion' && !h.ajusteId && (
                      <button onClick={() => llevarAAjuste.mutate(h.id)} disabled={llevarAAjuste.isPending}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded px-2 py-1">
                        <ArrowRightCircle size={11} /> Llevar a ajustes
                      </button>
                    )}
                    {h.estado === 'no_corregido' && h.tipo === 'deficiencia' && (
                      <span className="text-[11px] text-gray-400">→ va a la carta de control interno (NIA 265)</span>
                    )}
                    {h.estado === 'corregido' && (
                      <button onClick={() => cambiarEstado.mutate({ id: h.id, estado: 'comunicado' })}
                        className="text-xs text-gray-400 hover:bg-gray-100 rounded px-2 py-1">Reabrir</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {llevarAAjuste.isError && (
        <p className="text-xs text-red-600 mb-2">
          {llevarAAjuste.error instanceof Error ? llevarAAjuste.error.message : 'No se pudo crear el ajuste'}
        </p>
      )}

      {!aprobado && (
        abrir ? (
          <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
            <CamposHallazgo form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
            <div className="flex gap-2">
              <Button size="sm" loading={crear.isPending} disabled={form.descripcion.trim().length < 2} onClick={() => crear.mutate()}>Guardar hallazgo</Button>
              <Button size="sm" variant="secondary" onClick={() => { setAbrir(false); setForm(HALLAZGO_FORM_VACIO) }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAbrir(true)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline">
            <Plus size={12} /> Registrar hallazgo
          </button>
        )
      )}
    </div>
  )
}

// Pestaña "Cuentas": el balance del área del papel (por cuenta y por tercero),
// con acciones rápidas para agregar terceros a la muestra o registrar hallazgos.
function CuentasSeccion({
  papelId, auditoriaId, area, aprobado,
}: {
  papelId: string
  auditoriaId: string
  area: Area
  aprobado: boolean
}) {
  const { areaLabel } = useAreas()
  const queryClient = useQueryClient()
  const prefijo = AREA_CUENTA[area] ?? ''
  const [terceroDe, setTerceroDe] = useState<string | null>(null)
  const [hallazgoDe, setHallazgoDe] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState<'todas' | 'significativas' | 'anomalias'>('todas')

  const { data: analisis, isLoading } = useQuery<AnalisisBalance>({
    queryKey: ['balance', auditoriaId],
    queryFn: () => api.get<AnalisisBalance>(`/auditorias/${auditoriaId}/balance`),
  })
  const { data: muestra } = useQuery<MuestraConItems | null>({
    queryKey: ['muestra', papelId],
    queryFn: () => api.get<MuestraConItems | null>(`/papeles/${papelId}/muestra`),
  })

  const cuentas = useMemo(() => {
    const delArea = (analisis?.cuentas ?? []).filter((c) => (prefijo ? c.codigo.startsWith(prefijo) : true))
    // Solo cuentas hoja con detalle por tercero (nivel 8): las que se pueden abrir.
    // Se descartan los agregados padre (una cuenta más profunda con terceros existe debajo).
    const hojas = delArea.filter((c) =>
      c.tieneTerceros && !delArea.some((d) => d.codigo !== c.codigo && d.codigo.startsWith(c.codigo)),
    )
    if (mostrar === 'significativas') return hojas.filter((c) => c.significativa)
    if (mostrar === 'anomalias') return hojas.filter((c) => c.anomalia)
    return hojas
  }, [analisis, prefijo, mostrar])

  const columns = useMemo<ColumnDef<CuentaAnalizada, any>[]>(() => [
    {
      accessorKey: 'codigo',
      header: 'Cuenta',
      cell: ({ getValue }) => <span className="tabular-nums text-gray-500">{getValue<string>()}</span>,
    },
    {
      accessorKey: 'nombre',
      header: 'Nombre',
      cell: ({ getValue }) => <span className="text-gray-800">{getValue<string | null>() ?? '—'}</span>,
    },
    {
      accessorKey: 'saldoActual',
      header: 'Saldo actual',
      meta: { align: 'right', className: 'tabular-nums whitespace-nowrap text-gray-700' },
      cell: ({ getValue }) => cop(getValue<number>()),
    },
    {
      accessorKey: 'saldoInicial',
      header: 'Inicial',
      meta: { align: 'right', className: 'tabular-nums whitespace-nowrap text-gray-500' },
      cell: ({ getValue }) => cop(getValue<number>()),
    },
    {
      id: 'variacion',
      accessorFn: (c) => c.variacionPct ?? undefined,
      sortUndefined: 'last',
      header: 'Var.',
      meta: { align: 'right', className: 'tabular-nums whitespace-nowrap' },
      cell: ({ row }) => {
        const pct = row.original.variacionPct
        return (
          <span className={cn(row.original.anomalia ? 'text-amber-700 font-medium' : 'text-gray-500')}>
            {row.original.baseVariacion === null ? '—' : pct == null ? 'nuevo' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`}
          </span>
        )
      },
    },
    {
      id: 'marcas',
      header: 'Marcas',
      enableSorting: false,
      meta: { align: 'center' },
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          {row.original.significativa && (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
              <Flag size={9} /> Significativa
            </span>
          )}
          {row.original.anomalia && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              <AlertTriangle size={9} /> Anomalía
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      meta: { align: 'right', className: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <>
          {row.original.tieneTerceros && (
            <button
              onClick={() => { setHallazgoDe(null); setTerceroDe(terceroDe === row.original.codigo ? null : row.original.codigo) }}
              className={cn('text-[11px] hover:underline mr-2', terceroDe === row.original.codigo ? 'text-indigo-800 font-medium' : 'text-indigo-600')}
            >
              Terceros
            </button>
          )}
          {!aprobado && (
            <button
              onClick={() => { setTerceroDe(null); setHallazgoDe(hallazgoDe === row.original.codigo ? null : row.original.codigo) }}
              className={cn('text-[11px] hover:underline', hallazgoDe === row.original.codigo ? 'text-amber-800 font-medium' : 'text-amber-600')}
            >
              + hallazgo
            </button>
          )}
        </>
      ),
    },
  ], [aprobado, terceroDe, hallazgoDe])

  if (isLoading) return <p className="text-xs text-gray-400">Cargando cuentas…</p>
  if ((analisis?.cuentas ?? []).length === 0) {
    return (
      <p className="text-xs text-gray-400">
        Aún no hay balance cargado. Cárgalo en la planificación para ver aquí las cuentas del área.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Cuentas de detalle de {areaLabel(area)}{prefijo ? ` (PUC ${prefijo}…)` : ''} con movimiento por tercero. Abre "Terceros" para agregarlos a la muestra, o registra un hallazgo desde la cuenta.
      </p>

      <DataTable
        columns={columns}
        data={cuentas}
        searchPlaceholder="Buscar cuenta o nombre…"
        pageSize={20}
        emptyMessage="No se encontraron cuentas del área en el balance."
        toolbar={
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Mostrar
            <select
              value={mostrar}
              onChange={(e) => setMostrar(e.target.value as typeof mostrar)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="todas">Todas</option>
              <option value="significativas">Significativas</option>
              <option value="anomalias">Con anomalía</option>
            </select>
          </label>
        }
        subRow={(c) =>
          hallazgoDe === c.codigo && !aprobado ? (
            <HallazgoInline
              papelId={papelId} auditoriaId={auditoriaId} cuentaCodigo={c.codigo} saldo={c.saldoActual}
              onListo={() => setHallazgoDe(null)}
            />
          ) : terceroDe === c.codigo ? (
            <TercerosDeCuenta
              auditoriaId={auditoriaId} codigo={c.codigo} muestraId={muestra?.id ?? null} aprobado={aprobado}
              onAgregado={() => queryClient.invalidateQueries({ queryKey: ['muestra', papelId] })}
            />
          ) : null
        }
      />
    </div>
  )
}

function HallazgoInline({
  papelId, auditoriaId, cuentaCodigo, saldo, onListo,
}: {
  papelId: string
  auditoriaId: string
  cuentaCodigo: string
  saldo: number
  onListo: () => void
}) {
  const queryClient = useQueryClient()
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState(String(Math.abs(Math.round(saldo))))

  const crear = useMutation({
    mutationFn: () =>
      api.post(`/papeles/${papelId}/hallazgos`, {
        descripcion: descripcion.trim(),
        cuentaCodigo,
        tipo: 'incorreccion',
        monto: monto !== '' ? Number(monto) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hallazgos-papel', papelId] })
      queryClient.invalidateQueries({ queryKey: ['hallazgos', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
      onListo()
    },
  })

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <input
        className="flex-1 min-w-[180px] rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder={`Hallazgo en la cuenta ${cuentaCodigo}`}
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <input
        type="number"
        className="w-32 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
        placeholder="Monto $"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
      />
      <Button size="sm" variant="secondary" loading={crear.isPending} disabled={descripcion.trim().length < 2} onClick={() => crear.mutate()}>
        Registrar hallazgo
      </Button>
    </div>
  )
}

function TercerosDeCuenta({
  auditoriaId, codigo, muestraId, aprobado, onAgregado,
}: {
  auditoriaId: string
  codigo: string
  muestraId: string | null
  aprobado: boolean
  onAgregado: () => void
}) {
  const [agregados, setAgregados] = useState<Set<string>>(new Set())

  const { data: filas = [], isLoading } = useQuery<TerceroFila[]>({
    queryKey: ['balance-terceros', auditoriaId, codigo],
    queryFn: () => api.get<TerceroFila[]>(`/auditorias/${auditoriaId}/balance/terceros?codigo=${codigo}`),
  })

  const agregar = useMutation({
    mutationFn: (t: TerceroFila) =>
      api.post(`/muestras/${muestraId}/items`, { tercero: t.tercero, terceroNombre: t.terceroNombre, saldo: Number(t.saldoActual), cuentaCodigo: codigo }),
    onSuccess: (_d, t) => { setAgregados((prev) => new Set(prev).add(t.id)); onAgregado() },
  })

  if (isLoading) return <p className="text-xs text-gray-400">Cargando terceros…</p>
  if (filas.length === 0) return <p className="text-xs text-gray-400">Esta cuenta no tiene detalle por tercero.</p>

  const orden = [...filas].sort((a, b) => Math.abs(Number(b.saldoActual)) - Math.abs(Number(a.saldoActual))).slice(0, 50)

  return (
    <div className="space-y-1 max-h-56 overflow-y-auto">
      {orden.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2 rounded border border-gray-100 bg-white px-2.5 py-1.5">
          <span className="truncate text-xs text-gray-700">
            {f.terceroNombre ?? f.tercero ?? '—'}
            {f.tercero && <span className="text-[10px] text-gray-400 ml-1">{f.tercero}</span>}
          </span>
          <span className="text-xs text-gray-500 whitespace-nowrap">{cop(Number(f.saldoActual))}</span>
          {!aprobado && (
            muestraId ? (
              agregados.has(f.id) ? (
                <span className="text-[10px] text-emerald-600 whitespace-nowrap">✓ en muestra</span>
              ) : (
                <button onClick={() => agregar.mutate(f)} className="text-[11px] text-indigo-600 hover:underline whitespace-nowrap">+ muestra</button>
              )
            ) : (
              <span className="text-[10px] text-gray-400 whitespace-nowrap" title="Genera la muestra en la pestaña Prueba">sin muestra</span>
            )
          )}
        </div>
      ))}
    </div>
  )
}

function CompletitudPanel({
  auditoriaId, onAbrirPapel,
}: {
  auditoriaId: string
  onAbrirPapel: (papelId: string) => void
}) {
  const { data } = useQuery<ResultadoCompletitud>({
    queryKey: ['completitud', auditoriaId],
    queryFn: () => api.get<ResultadoCompletitud>(`/auditorias/${auditoriaId}/completitud`),
  })

  if (!data) return null

  if (data.huecos.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
        <ShieldCheck size={14} className="shrink-0" />
        Sin huecos de completitud: los riesgos altos tienen prueba y los papeles tienen evidencia.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-100">
        <AlertTriangle size={15} className="text-amber-500" />
        <p className="text-sm font-semibold text-gray-800">Revisión de completitud</p>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{data.huecos.length}</span>
      </div>
      <div className="divide-y divide-amber-100/70">
        {data.huecos.map((h, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', h.severidad === 'alta' ? 'bg-red-500' : 'bg-amber-400')} />
                <span className="text-xs font-medium text-gray-700">{h.titulo}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate" title={h.detalle}>{h.detalle}</p>
            </div>
            {h.tipo === 'papel_sin_evidencia' ? (
              <button onClick={() => onAbrirPapel(h.refId)} className="text-xs text-indigo-600 hover:underline shrink-0">
                Abrir papel
              </button>
            ) : (
              <span className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">Diseña la prueba en Riesgos</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

type PapelTab = 'prueba' | 'cuentas' | 'muestra' | 'documentos' | 'hallazgos' | 'revision'
const PAPEL_TABS: { id: PapelTab; label: string }[] = [
  { id: 'prueba', label: 'Prueba' },
  { id: 'cuentas', label: 'Cuentas' },
  { id: 'muestra', label: 'Muestra' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'hallazgos', label: 'Hallazgos' },
  { id: 'revision', label: 'Revisión' },
]

export function PapelPanel({
  papelId, auditoriaId,
}: {
  papelId: string
  auditoriaId: string
}) {
  const { areaLabel } = useAreas()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const esSocio = user?.rol === 'socio'
  const [tab, setTab] = useState<PapelTab>('prueba')

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
    queryClient.invalidateQueries({ queryKey: ['completitud', auditoriaId] })
    queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
  }

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/papeles/${papelId}`, form),
    onSuccess: () => {
      invalidate()
      toast.success('Papel de trabajo guardado')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar el papel'),
  })
  // Aplica la conclusión sugerida por la proyección del muestreo al campo del papel.
  // Persiste solo `conclusion` (no pisa procedimiento/alcance) y actualiza la caché
  // sin refetch para no descartar ediciones en curso de otros campos.
  const aplicarConclusion = useMutation({
    mutationFn: (texto: string) => api.put(`/papeles/${papelId}`, { conclusion: texto }),
    onSuccess: (_d, texto) => {
      setForm((f) => ({ ...f, conclusion: texto }))
      queryClient.setQueryData<PapelDetalle>(['papel', papelId], (old) => (old ? { ...old, conclusion: texto } : old))
      queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['completitud', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
    },
  })
  const aprobarMutation = useMutation({
    mutationFn: () => api.post(`/papeles/${papelId}/aprobar`, {}),
    onSuccess: () => {
      invalidate()
      toast.success('Papel aprobado')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo aprobar el papel'),
  })
  const reabrirMutation = useMutation({
    mutationFn: () => api.post(`/papeles/${papelId}/reabrir`, {}),
    onSuccess: invalidate,
  })
  // Ciclo NIA 220: borrador → en revisión (avisa al socio) → aprobado.
  const cambiarEstado = useMutation({
    mutationFn: (estado: 'borrador' | 'en_revision') => api.put(`/papeles/${papelId}`, { estado }),
    onSuccess: (_d, estado) => {
      invalidate()
      toast.success(estado === 'en_revision' ? 'Papel enviado a revisión' : 'Papel devuelto a borrador')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el estado'),
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
  const nombreU = (uid: string | null) => (uid ? usuarios.find((u) => u.id === uid)?.nombre ?? '—' : '—')

  const programar = useMutation({
    mutationFn: (patch: { fechaInicio?: string; fechaFin?: string; asignadoA?: string }) =>
      api.put(`/papeles/${papelId}`, patch),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['cronograma', auditoriaId] })
    },
  })

  const aprobado = papel?.estado === 'aprobado'

  // Cambios sin guardar en los campos de texto del papel (procedimiento/alcance/hallazgos/conclusión).
  const dirty =
    !!papel &&
    (form.procedimiento !== (papel.procedimiento ?? '') ||
      form.alcance !== (papel.alcance ?? '') ||
      form.hallazgos !== (papel.hallazgos ?? '') ||
      form.conclusion !== (papel.conclusion ?? ''))

  // Evita perder trabajo al recargar o cerrar la pestaña con cambios pendientes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  if (isLoading || !papel) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="w-full pb-12">
      {/* Encabezado */}
      <div className="border-b border-gray-100 py-3 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-400">{areaLabel(papel.area)}</p>
          <h2 className="text-base font-semibold text-gray-900 truncate">{papel.titulo}</h2>
        </div>
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ESTADO_BADGE[papel.estado])}>
          {ESTADO_LABEL[papel.estado]}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!aprobado && dirty && (
            <span className="text-[11px] font-medium text-amber-600">● Cambios sin guardar</span>
          )}
          {!aprobado && (
            <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Guardar</Button>
          )}
          {papel.estado === 'borrador' && (
            <Button
              size="sm" variant="secondary" className="gap-1.5"
              disabled={dirty || cambiarEstado.isPending}
              loading={cambiarEstado.isPending}
              title={dirty ? 'Guarda los cambios antes de enviar a revisión' : undefined}
              onClick={() => cambiarEstado.mutate('en_revision')}
            >
              <Send size={14} /> Enviar a revisión
            </Button>
          )}
          {papel.estado === 'en_revision' && (
            <>
              <Button
                size="sm" variant="secondary"
                disabled={cambiarEstado.isPending}
                onClick={() => cambiarEstado.mutate('borrador')}
              >
                Volver a borrador
              </Button>
              <Button
                size="sm" variant="secondary" className="gap-1.5"
                disabled={!esSocio || aprobarMutation.isPending}
                loading={aprobarMutation.isPending}
                title={!esSocio ? 'Solo el socio responsable puede aprobar' : undefined}
                onClick={() => aprobarMutation.mutate()}
              >
                <ShieldCheck size={14} /> Aprobar
              </Button>
            </>
          )}
          {aprobado && esSocio && (
            <Button size="sm" variant="secondary" loading={reabrirMutation.isPending} onClick={() => reabrirMutation.mutate()}>
              Reabrir
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 mt-5">
        {/* Columna principal con sub-pestañas */}
        <div className="min-w-0">
          <div className="flex gap-1 mb-4 border-b border-gray-100">
            {PAPEL_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
                  tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                {t.label}
                {t.id === 'documentos' && papel.evidencias.length > 0 && (
                  <span className="ml-1 text-xs text-gray-400">· {papel.evidencias.length}</span>
                )}
              </button>
            ))}
          </div>

          {tab === 'prueba' && (
            <div className="space-y-5">
              {(
                [
                  { campo: 'procedimiento', label: 'Procedimiento aplicado', rows: 3, placeholder: 'Describe el procedimiento ejecutado' },
                  { campo: 'alcance', label: 'Alcance / Muestra', rows: 2, placeholder: 'Tamaño y criterio de la muestra' },
                  { campo: 'hallazgos', label: 'Hallazgos (narrativa)', rows: 3, placeholder: 'Errores, diferencias o excepciones encontradas' },
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
              {saveMutation.isError && (
                <p className="text-xs text-red-600">
                  {saveMutation.error instanceof Error ? saveMutation.error.message : 'Error al guardar'}
                </p>
              )}

              <TareasSeccion papelId={papelId} auditoriaId={auditoriaId} area={papel.area} aprobado={aprobado} />
            </div>
          )}

          {tab === 'cuentas' && (
            <CuentasSeccion papelId={papelId} auditoriaId={auditoriaId} area={papel.area} aprobado={aprobado} />
          )}

          {tab === 'muestra' && (
            <MuestraSeccion
              papelId={papelId} area={papel.area} auditoriaId={auditoriaId} aprobado={aprobado} onCambio={invalidate}
              onAplicarConclusion={aprobado ? undefined : (t) => aplicarConclusion.mutate(t)}
              aplicandoConclusion={aplicarConclusion.isPending}
            />
          )}

          {tab === 'documentos' && (
            <div className="space-y-5">
              <PbcSeccion papelId={papelId} auditoriaId={auditoriaId} aprobado={aprobado} onCambio={invalidate} />
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <Paperclip size={14} className="text-gray-400" />
                  <h4 className="text-sm font-semibold text-gray-800">Evidencia ({papel.evidencias.length})</h4>
                </div>
                {papel.evidencias.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {papel.evidencias.map((ev) => (
                      <EvidenciaRow key={ev.id} evidencia={ev} aprobado={aprobado} onEliminar={() => delEvidencia.mutate(ev.id)} onCambio={invalidate} />
                    ))}
                  </div>
                )}
                {!aprobado && <NuevaEvidenciaForm onAdd={(b) => addEvidencia.mutate(b)} loading={addEvidencia.isPending} />}
              </div>
            </div>
          )}

          {tab === 'hallazgos' && (
            <div className="space-y-5">
              <HallazgosSeccion papelId={papelId} auditoriaId={auditoriaId} aprobado={aprobado} onCambio={invalidate} />
            </div>
          )}

          {tab === 'revision' && (
            <div className="space-y-5">
              {aprobado && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                  <CheckCircle size={15} />
                  <span>
                    Aprobado por {nombreU(papel.aprobadoPor)}
                    {papel.aprobadoAt ? ` el ${new Date(papel.aprobadoAt).toLocaleDateString('es-CO')}` : ''}.
                  </span>
                </div>
              )}
              <NotasRevisionSeccion papelId={papelId} auditoriaId={auditoriaId} />
              {!aprobado && !esSocio && (
                <p className="text-xs text-gray-400">La aprobación del papel la realiza el socio responsable desde el botón de arriba.</p>
              )}
              {(aprobarMutation.isError || reabrirMutation.isError) && (
                <p className="text-xs text-red-600">No se pudo cambiar el estado.</p>
              )}
            </div>
          )}
        </div>

        {/* Barra lateral: metadatos + avance */}
        <aside className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div>
              <p className="text-[10px] text-gray-400 mb-1">Responsable del papel</p>
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
              <p className="text-[10px] text-gray-400">Preparado por</p>
              <p className="text-xs text-gray-700">{nombreU(papel.preparadoPor)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Inicio</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
                  value={papel.fechaInicio ? papel.fechaInicio.slice(0, 10) : ''}
                  disabled={aprobado}
                  onChange={(e) => programar.mutate({ fechaInicio: e.target.value ? new Date(`${e.target.value}T00:00:00Z`).toISOString() : '' })}
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Fin</label>
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

          {(() => {
            const guia = (PROGRAMA_AUDITORIA[papel.area] ?? []).find((p) => p.titulo === papel.titulo)?.guia ?? []
            const pasosHechos = guia.filter((_, i) => papel.pasosEstado?.[String(i)]?.hecho).length
            return (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[10px] text-gray-400 mb-2">Avance</p>
                {guia.length > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-500 py-1">
                    <span>Pasos de la guía</span>
                    <span className={cn('font-medium', pasosHechos === guia.length ? 'text-emerald-600' : 'text-gray-800')}>
                      {pasosHechos}/{guia.length}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500 py-1">
                  <span>Evidencia</span><span className="text-gray-800 font-medium">{papel.evidencias.length}</span>
                </div>
              </div>
            )
          })()}

          {/* Programa de la prueba (guía + documentos) como card lateral fija */}
          <GuiaPrograma
            area={papel.area} titulo={papel.titulo} papelId={papelId} auditoriaId={auditoriaId}
            aprobado={aprobado} pasosEstado={papel.pasosEstado ?? {}} onCambio={invalidate}
          />
        </aside>
      </div>
    </div>
  )
}

// Guía de pasos + documentos del programa (cuando el papel proviene de una prueba estándar).
function GuiaPrograma({
  area, titulo, papelId, auditoriaId, aprobado, pasosEstado, onCambio,
}: {
  area: Area
  titulo: string
  papelId: string
  auditoriaId: string
  aprobado: boolean
  pasosEstado: Record<string, { hecho: boolean; nota: string | null }>
  onCambio: () => void
}) {
  const queryClient = useQueryClient()
  const prueba = (PROGRAMA_AUDITORIA[area] ?? []).find((p) => p.titulo === titulo)

  const { data: todas = [] } = useQuery<SolicitudPbcConPapel[]>({
    queryKey: ['pbc', auditoriaId],
    queryFn: () => api.get<SolicitudPbcConPapel[]>(`/auditorias/${auditoriaId}/pbc`),
    enabled: !!prueba,
  })

  const togglePaso = useMutation({
    mutationFn: (b: { indice: number; hecho?: boolean; nota?: string }) =>
      api.patch(`/papeles/${papelId}/pasos`, b),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papel', papelId] })
      onCambio()
    },
  })

  const solicitar = useMutation({
    mutationFn: (descripcion: string) =>
      api.post(`/auditorias/${auditoriaId}/pbc`, { papelTrabajoId: papelId, descripcion }),
    onSuccess: onCambio,
  })

  const totalPasos = prueba?.guia.length ?? 0
  const hechos = prueba ? prueba.guia.filter((_, i) => pasosEstado[String(i)]?.hecho).length : 0

  if (!prueba) return null

  const yaSolicitados = new Set(todas.filter((s) => s.papelTrabajoId === papelId).map((s) => s.descripcion))

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 space-y-3">
      <p className="text-sm font-medium text-indigo-800">Programa · {prueba.titulo}</p>

      {prueba.guia.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-gray-600">Guía del procedimiento (NIA 330/500)</p>
            <span className={cn('text-[10px] font-medium', hechos === totalPasos ? 'text-emerald-600' : 'text-gray-400')}>
              {hechos}/{totalPasos}
            </span>
          </div>
          {totalPasos > 0 && (
            <div className="h-1 w-full rounded-full bg-gray-200 mb-2 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', hechos === totalPasos ? 'bg-emerald-500' : 'bg-indigo-500')}
                style={{ width: `${(hechos / totalPasos) * 100}%` }}
              />
            </div>
          )}
          <ul className="space-y-1.5">
            {prueba.guia.map((paso, i) => {
              const estado = pasosEstado[String(i)]
              const hecho = estado?.hecho ?? false
              return (
                <li key={i} className="rounded-lg bg-white border border-gray-100 px-2.5 py-1.5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 accent-indigo-600"
                      checked={hecho}
                      disabled={aprobado || togglePaso.isPending}
                      onChange={(e) => togglePaso.mutate({ indice: i, hecho: e.target.checked })}
                    />
                    <span className={cn('text-xs leading-snug', hecho ? 'text-gray-400 line-through' : 'text-gray-700')}>
                      {paso}
                    </span>
                  </label>
                  {!aprobado && (
                    <input
                      className="mt-1 ml-6 w-[calc(100%-1.5rem)] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-gray-500 placeholder:text-gray-300 hover:border-gray-200 focus:border-indigo-300 focus:bg-white focus:outline-none"
                      placeholder="+ nota / referencia del paso…"
                      defaultValue={estado?.nota ?? ''}
                      onBlur={(e) => {
                        const nota = e.target.value.trim()
                        if (nota !== (estado?.nota ?? '')) togglePaso.mutate({ indice: i, nota })
                      }}
                    />
                  )}
                  {aprobado && estado?.nota && <p className="mt-0.5 ml-6 text-[11px] text-gray-500">{estado.nota}</p>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {prueba.documentosRequeridos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Documentos a solicitar al cliente (PBC)</p>
          <div className="space-y-1">
            {prueba.documentosRequeridos.map((doc, i) => {
              const solicitado = yaSolicitados.has(doc)
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white border border-gray-100 px-3 py-1.5">
                  <span className="text-xs text-gray-700">{doc}</span>
                  {solicitado ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0"><Check size={12} /> Solicitado</span>
                  ) : (
                    <button
                      type="button"
                      disabled={aprobado || solicitar.isPending}
                      onClick={() => solicitar.mutate(doc)}
                      className="text-xs text-indigo-600 hover:underline disabled:text-gray-300 shrink-0"
                    >
                      + Solicitar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
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

// Código PUC sugerido como población para el muestreo, según el área del papel.
const AREA_CUENTA: Record<Area, string> = {
  efectivo: '11', cartera: '13', inventarios: '14', propiedad_planta_equipo: '15',
  proveedores: '22', nomina: '25', impuestos: '24', ingresos: '4', gastos: '5',
  patrimonio: '3', otro: '',
}

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    isFinite(n) ? n : 0,
  )

type TerceroFila = { id: string; codigo: string; tercero: string | null; terceroNombre: string | null; saldoActual: string }

function MuestraSeccion({
  papelId, area, auditoriaId, aprobado, onCambio, onAplicarConclusion, aplicandoConclusion,
}: {
  papelId: string
  area: Area
  auditoriaId: string
  aprobado: boolean
  onCambio: () => void
  onAplicarConclusion?: (texto: string) => void
  aplicandoConclusion?: boolean
}) {
  const queryClient = useQueryClient()
  const [codigo, setCodigo] = useState(AREA_CUENTA[area] ?? '')
  const [cobertura, setCobertura] = useState(Math.round(COBERTURA_OBJETIVO_DEFECTO * 100))
  const [addOpen, setAddOpen] = useState(false)

  const { data: muestra, isLoading } = useQuery<MuestraConItems | null>({
    queryKey: ['muestra', papelId],
    queryFn: () => api.get<MuestraConItems | null>(`/papeles/${papelId}/muestra`),
  })

  const setMuestra = (m: MuestraConItems) => queryClient.setQueryData(['muestra', papelId], m)

  const generar = useMutation({
    mutationFn: () =>
      api.post<MuestraConItems>(`/papeles/${papelId}/muestra/generar`, {
        codigoCuenta: codigo.trim(),
        coberturaObjetivo: cobertura / 100,
      }),
    onSuccess: (m) => { setMuestra(m); onCambio() },
  })

  const patchItem = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch<MuestraConItems>(`/muestra-items/${id}`, patch),
    onSuccess: (m) => { setMuestra(m); onCambio() },
  })

  const addItem = useMutation({
    mutationFn: (t: TerceroFila) =>
      api.post<MuestraConItems>(`/muestras/${muestra!.id}/items`, {
        tercero: t.tercero, terceroNombre: t.terceroNombre, saldo: Number(t.saldoActual), cuentaCodigo: muestra!.codigoCuenta,
      }),
    onSuccess: (m) => { setMuestra(m); onCambio() },
  })

  const removeItem = useMutation({
    mutationFn: (id: string) => api.delete<MuestraConItems>(`/muestra-items/${id}`),
    onSuccess: (m) => { setMuestra(m); onCambio() },
  })

  const patchMutate = patchItem.mutate
  const patchPending = patchItem.isPending
  const removeMutate = removeItem.mutate
  const codigoCuentaMuestra = muestra?.codigoCuenta ?? null

  const columnasMuestra = useMemo<ColumnDef<MuestraItem, any>[]>(() => [
    {
      id: 'cuenta',
      accessorFn: (it) => it.cuentaCodigo ?? codigoCuentaMuestra ?? '',
      header: 'Cuenta',
      meta: { className: 'text-gray-500 whitespace-nowrap tabular-nums' },
      cell: ({ getValue }) => getValue<string>() || '—',
    },
    {
      accessorKey: 'tercero',
      header: 'NIT',
      meta: { className: 'text-gray-500 whitespace-nowrap tabular-nums' },
      cell: ({ getValue }) => getValue<string | null>() ?? '—',
    },
    {
      accessorKey: 'terceroNombre',
      header: 'Nombre del tercero',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.esClave && <Flag size={10} className="text-indigo-500 shrink-0" />}
          <span className="text-gray-800 truncate max-w-[220px]" title={row.original.terceroNombre ?? row.original.tercero ?? ''}>
            {row.original.terceroNombre ?? row.original.tercero ?? '—'}
          </span>
        </div>
      ),
    },
    {
      id: 'saldo',
      accessorFn: (it) => Number(it.saldo),
      header: 'Valor',
      meta: { align: 'right', className: 'tabular-nums whitespace-nowrap text-gray-700' },
      cell: ({ getValue }) => cop(getValue<number>()),
    },
    {
      accessorKey: 'incluido',
      header: 'Incl.',
      meta: { align: 'center' },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.original.incluido}
          disabled={aprobado || patchPending}
          onChange={(e) => patchMutate({ id: row.original.id, patch: { incluido: e.target.checked } })}
        />
      ),
    },
    {
      accessorKey: 'resultado',
      header: 'Resultado',
      meta: { className: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const it = row.original
        const deshabilitado = aprobado || !it.incluido
        return (
          <div className="flex items-center gap-1">
            <button
              disabled={deshabilitado}
              title={it.resultado === 'sin_diferencia' ? 'Clic para volver a pendiente' : 'Marcar sin diferencia'}
              onClick={() =>
                patchMutate({
                  id: it.id,
                  patch: it.resultado === 'sin_diferencia'
                    ? { resultado: 'pendiente' }
                    : { resultado: 'sin_diferencia', diferencia: null },
                })
              }
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                it.resultado === 'sin_diferencia'
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-emerald-400 hover:text-emerald-600',
              )}
            >
              <Check size={10} /> OK
            </button>
            <button
              disabled={deshabilitado}
              title={it.resultado === 'con_diferencia' ? 'Clic para volver a pendiente' : 'Marcar con diferencia'}
              onClick={() =>
                patchMutate({
                  id: it.id,
                  patch: it.resultado === 'con_diferencia'
                    ? { resultado: 'pendiente', diferencia: null }
                    : { resultado: 'con_diferencia' },
                })
              }
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                it.resultado === 'con_diferencia'
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-amber-400 hover:text-amber-600',
              )}
            >
              <AlertTriangle size={10} /> Dif.
            </button>
            {it.resultado === 'con_diferencia' && (
              <input
                type="number"
                autoFocus={it.diferencia == null}
                className="w-24 rounded-lg border border-amber-300 px-2 py-0.5 text-[11px] tabular-nums focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                placeholder="Dif. $"
                defaultValue={it.diferencia ?? ''}
                disabled={aprobado}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                onBlur={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  if (v !== (it.diferencia == null ? null : Number(it.diferencia))) {
                    patchMutate({ id: it.id, patch: { diferencia: v } })
                  }
                }}
              />
            )}
          </div>
        )
      },
    },
    ...(!aprobado
      ? [{
          id: 'acciones',
          header: '',
          enableSorting: false,
          meta: { align: 'right' },
          cell: ({ row }) => (
            <button
              onClick={() => removeMutate(row.original.id)}
              className="text-gray-300 hover:text-red-500"
              title="Quitar de la muestra"
            >
              <Trash2 size={12} />
            </button>
          ),
        } satisfies ColumnDef<MuestraItem, any>]
      : []),
  ], [aprobado, patchMutate, patchPending, removeMutate, codigoCuentaMuestra])

  const r = muestra?.resumen

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Target size={14} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-800">Muestra (NIA 530)</h4>
        {r && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
            {r.numMuestra} de {r.numPoblacion} · {r.coberturaPct.toFixed(0)}%
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Selecciona a quién revisar desde el balance por tercero: partidas clave (saldo ≥ materialidad) más los mayores
        saldos hasta cubrir el % objetivo.
      </p>

      {/* Controles de generación / regeneración */}
      {!aprobado && (
        <div className="flex items-end gap-2 mb-3 flex-wrap">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Cuenta (PUC)</label>
            <input
              className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="13"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Cobertura {cobertura}%</label>
            <input
              type="range" min={0} max={100} step={5}
              value={cobertura}
              onChange={(e) => setCobertura(Number(e.target.value))}
              className="w-32 align-middle"
            />
          </div>
          <Button
            size="sm" variant="secondary" className="gap-1.5"
            loading={generar.isPending}
            disabled={codigo.trim().length === 0}
            onClick={() => generar.mutate()}
          >
            <RefreshCw size={13} /> {muestra ? 'Recalcular' : 'Generar muestra'}
          </Button>
        </div>
      )}

      {generar.isError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
          {generar.error instanceof Error ? generar.error.message : 'No se pudo generar la muestra'}
        </p>
      )}

      {isLoading ? (
        <p className="text-xs text-gray-400">Cargando muestra…</p>
      ) : !muestra ? (
        <p className="text-xs text-gray-400 italic">Aún no hay muestra. Indica la cuenta y genera la selección.</p>
      ) : (
        <>
          {/* Resumen */}
          {r && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: 'Terceros', value: `${r.numMuestra}/${r.numPoblacion}` },
                { label: 'Cobertura', value: `${r.coberturaPct.toFixed(0)}%` },
                { label: 'Saldo muestra', value: cop(r.saldoMuestra) },
                { label: 'Partidas clave', value: r.numClave },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                  <p className="text-sm font-semibold text-gray-800">{s.value}</p>
                  <p className="text-[10px] text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Ítems */}
          <DataTable
            columns={columnasMuestra}
            data={muestra.items}
            searchPlaceholder="Buscar tercero…"
            pageSize={500}
            maxHeight={520}
            minWidth={620}
            emptyMessage="La muestra no tiene ítems."
            rowClassName={(it) => (!it.incluido ? 'opacity-40' : undefined)}
          />

          {/* Proyección del error a la población (NIA 530) */}
          {r && (
            <ProyeccionErrorPanel
              items={muestra.items} saldoPoblacion={r.saldoPoblacion} materialidad={muestra.materialidad}
              onAplicarConclusion={onAplicarConclusion} aplicando={aplicandoConclusion}
            />
          )}

          {/* Añadir tercero a mano */}
          {!aprobado && (
            <div className="mt-2">
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
              >
                <Plus size={12} /> Añadir tercero a la muestra
              </button>
              {addOpen && (
                <PickerTerceros
                  auditoriaId={auditoriaId}
                  codigo={muestra.codigoCuenta}
                  yaIncluidos={muestra.items.map((i) => i.tercero)}
                  onElegir={(t) => addItem.mutate(t)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const VEREDICTO_STYLE: Record<string, { box: string; badge: string; icon: typeof CheckCircle }> = {
  aceptable: { box: 'border-emerald-200 bg-emerald-50/50', badge: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  cercano: { box: 'border-amber-200 bg-amber-50/50', badge: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  excede: { box: 'border-red-200 bg-red-50/50', badge: 'bg-red-100 text-red-700', icon: AlertTriangle },
  sin_materialidad: { box: 'border-gray-200 bg-gray-50', badge: 'bg-gray-100 text-gray-600', icon: Target },
}

// Proyección del error de la muestra a la población y comparación con la materialidad (NIA 530).
function ProyeccionErrorPanel({
  items, saldoPoblacion, materialidad, onAplicarConclusion, aplicando,
}: {
  items: MuestraConItems['items']
  saldoPoblacion: number
  materialidad: string | null
  onAplicarConclusion?: (texto: string) => void
  aplicando?: boolean
}) {
  const [aplicado, setAplicado] = useState(false)
  const mat = materialidad != null ? Number(materialidad) : null
  const p = proyectarError(
    items.map((i) => ({
      saldo: i.saldo, esClave: i.esClave, incluido: i.incluido, resultado: i.resultado, diferencia: i.diferencia,
    })),
    saldoPoblacion,
    mat,
  )
  const style = VEREDICTO_STYLE[p.veredicto] ?? VEREDICTO_STYLE.sin_materialidad
  const Icon = style.icon

  const conclusionSugerida =
    p.veredicto === 'excede'
      ? `El error proyectado (${cop(p.errorProyectado)}) supera la materialidad de desempeño (${cop(mat ?? 0)}). Se requiere ampliar la muestra, solicitar ajuste a la administración o evaluar el efecto en la opinión.`
      : p.veredicto === 'cercano'
      ? `El error proyectado (${cop(p.errorProyectado)}) se acerca a la materialidad de desempeño (${cop(mat ?? 0)}). Conviene documentar el análisis y considerar procedimientos adicionales.`
      : p.veredicto === 'aceptable'
      ? `El error proyectado (${cop(p.errorProyectado)}) está por debajo de la materialidad de desempeño (${cop(mat ?? 0)}). El saldo se considera razonable sin ajustes adicionales por este procedimiento.`
      : 'Aún no hay materialidad calculada. Calcúlala en la planificación para comparar el error proyectado.'

  // Si cambia la proyección (editan la muestra), la confirmación previa deja de aplicar.
  useEffect(() => { setAplicado(false) }, [conclusionSugerida])

  return (
    <div className={cn('mt-3 rounded-xl border px-4 py-3', style.box)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-gray-500 shrink-0" />
        <p className="text-sm font-semibold text-gray-800">Proyección del error (NIA 530)</p>
        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', style.badge)}>
          {VEREDICTO_ERROR_LABEL[p.veredicto]}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        {[
          { label: 'Error conocido', value: cop(p.errorConocido), hint: 'diferencias halladas' },
          { label: 'Error proyectado', value: cop(p.errorProyectado), hint: 'extrapolado a la población' },
          { label: 'Materialidad', value: mat != null ? cop(mat) : '—', hint: 'de desempeño' },
          { label: 'Con diferencia', value: `${p.itemsConDiferencia}`, hint: `${p.itemsEvaluados} evaluados` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-white/70 border border-white px-2.5 py-1.5">
            <p className="text-sm font-semibold text-gray-800">{s.value}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {p.itemsPendientes > 0 && (
        <p className="text-[11px] text-amber-700 mb-1.5">
          ⚠ {p.itemsPendientes} ítem{p.itemsPendientes !== 1 ? 's' : ''} de la muestra sin evaluar — la proyección aún es parcial.
        </p>
      )}

      <p className="text-xs text-gray-600 leading-snug">{conclusionSugerida}</p>

      {onAplicarConclusion && p.veredicto !== 'sin_materialidad' && (
        <div className="flex items-center gap-2 mt-2">
          <Button
            size="sm" variant="secondary" className="gap-1.5"
            loading={aplicando}
            onClick={() => { onAplicarConclusion(conclusionSugerida); setAplicado(true) }}
          >
            <ArrowRightCircle size={13} /> Usar como conclusión del papel
          </Button>
          {aplicado && !aplicando && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <Check size={12} /> Aplicada a la conclusión
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function PickerTerceros({
  auditoriaId, codigo, yaIncluidos, onElegir,
}: {
  auditoriaId: string
  codigo: string
  yaIncluidos: (string | null)[]
  onElegir: (t: TerceroFila) => void
}) {
  const { data: filas = [], isLoading } = useQuery<TerceroFila[]>({
    queryKey: ['muestra-poblacion', auditoriaId, codigo],
    queryFn: () => api.get<TerceroFila[]>(`/auditorias/${auditoriaId}/balance/terceros?codigo=${codigo}`),
  })
  const incluidos = new Set(yaIncluidos)
  const disponibles = filas
    .filter((f) => !incluidos.has(f.tercero))
    .sort((a, b) => Math.abs(Number(b.saldoActual)) - Math.abs(Number(a.saldoActual)))
    .slice(0, 50)

  if (isLoading) return <p className="text-xs text-gray-400 mt-2">Cargando terceros…</p>
  if (disponibles.length === 0) return <p className="text-xs text-gray-400 mt-2">No hay más terceros disponibles.</p>

  return (
    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
      {disponibles.map((f) => (
        <button
          key={f.id}
          onClick={() => onElegir(f)}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs hover:bg-indigo-50 text-left"
        >
          <span className="truncate">
            <span className="text-gray-800">{f.terceroNombre ?? f.tercero ?? '—'}</span>
            {f.tercero && <span className="text-[10px] text-gray-400 ml-1">{f.tercero}</span>}
          </span>
          <span className="text-gray-500 whitespace-nowrap">{cop(Number(f.saldoActual))}</span>
        </button>
      ))}
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

  const inputCls = 'w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400'
  const labelCls = 'block text-[11px] font-medium text-gray-500 mb-1'

  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Plus size={13} className="text-gray-400" />
        <h5 className="text-xs font-semibold text-gray-700">Nueva evidencia</h5>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-2">
          <label htmlFor="ev-nombre" className={labelCls}>Nombre del soporte</label>
          <input id="ev-nombre" className={inputCls}
            placeholder={archivo ? archivo.name : 'Ej. Conciliación bancaria octubre'}
            value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ev-tipo" className={labelCls}>Tipo</label>
          <select id="ev-tipo" className={inputCls}
            value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoEvidencia })}>
            {TIPO_EVIDENCIA_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-2.5">
        <label htmlFor="ev-desc" className={labelCls}>Descripción <span className="text-gray-300 font-normal">· opcional</span></label>
        <input id="ev-desc" className={inputCls} placeholder="Qué contiene o cómo respalda la prueba"
          value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
      </div>

      {/* Soporte: archivo adjunto o enlace externo (nombre se toma del archivo si está vacío) */}
      <div className="mt-2.5">
        <span className={labelCls}>Soporte <span className="text-gray-300 font-normal">· archivo o enlace</span></span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors shrink-0"
          >
            <Upload size={13} /> {archivo ? 'Cambiar' : 'Adjuntar archivo'}
          </button>
          {archivo ? (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 min-w-0">
              <Paperclip size={11} className="text-gray-400 shrink-0" />
              <span className="truncate max-w-[160px]">{archivo.name}</span>
              <button onClick={() => setArchivo(null)} className="text-gray-300 hover:text-red-500 shrink-0" title="Quitar">
                <X size={12} />
              </button>
            </span>
          ) : (
            <>
              <span className="text-[11px] text-gray-300">o</span>
              <input id="ev-enlace" className={cn(inputCls, 'flex-1 min-w-[160px]')} placeholder="https://enlace-al-soporte"
                value={form.enlaceExterno} onChange={(e) => setForm({ ...form, enlaceExterno: e.target.value })} />
            </>
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
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="secondary" className="gap-1.5" loading={loading}
          disabled={nombreFinal.length < 2} onClick={handleAdd}>
          <Plus size={13} /> Agregar evidencia
        </Button>
      </div>
    </div>
  )
}
