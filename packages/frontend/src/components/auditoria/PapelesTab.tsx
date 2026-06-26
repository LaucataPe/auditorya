import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Lock, CheckCircle, Trash2, ShieldCheck, Paperclip, Link2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
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
    <div className="space-y-5 max-w-3xl">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Papeles de trabajo — NIA 230</p>
        <p className="text-xs text-indigo-500 mt-1">
          Documenta cada procedimiento: qué se hizo, sobre qué muestra, qué se encontró y qué se concluyó.
          Adjunta la evidencia que respalda cada conclusión. Solo el socio puede aprobarlos.
        </p>
      </div>

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

  const [form, setForm] = useState({
    procedimiento: '', alcance: '', hallazgos: '', conclusion: '',
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
    mutationFn: (b: { nombre: string; descripcion?: string; tipo: TipoEvidencia; enlaceExterno?: string }) =>
      api.post(`/papeles/${papelId}/evidencias`, b),
    onSuccess: invalidate,
  })
  const delEvidencia = useMutation({
    mutationFn: (evidenciaId: string) => api.delete(`/papeles/${papelId}/evidencias/${evidenciaId}`),
    onSuccess: invalidate,
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

          <Textarea
            id="pt-proc" label="Procedimiento aplicado" rows={3}
            placeholder="Describe el procedimiento ejecutado"
            value={form.procedimiento} disabled={aprobado}
            onChange={(e) => setForm({ ...form, procedimiento: e.target.value })}
          />
          <Textarea
            id="pt-alc" label="Alcance / Muestra" rows={2}
            placeholder="Tamaño y criterio de la muestra"
            value={form.alcance} disabled={aprobado}
            onChange={(e) => setForm({ ...form, alcance: e.target.value })}
          />
          <Textarea
            id="pt-hall" label="Hallazgos" rows={3}
            placeholder="Errores, diferencias o excepciones encontradas"
            value={form.hallazgos} disabled={aprobado}
            onChange={(e) => setForm({ ...form, hallazgos: e.target.value })}
          />
          <Textarea
            id="pt-conc" label="Conclusión" rows={2}
            placeholder="Conclusión del procedimiento"
            value={form.conclusion} disabled={aprobado}
            onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
          />

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

          {/* Evidencias */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Paperclip size={14} className="text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-800">Evidencia ({papel.evidencias.length})</h4>
            </div>
            {papel.evidencias.length > 0 && (
              <div className="space-y-2 mb-3">
                {papel.evidencias.map((ev) => (
                  <div key={ev.id} className="flex items-start justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{ev.nombre}</span>
                        <span className="text-xs text-gray-400 capitalize">{ev.tipo}</span>
                      </div>
                      {ev.descripcion && <p className="text-xs text-gray-500">{ev.descripcion}</p>}
                      {ev.enlaceExterno && (
                        <a href={ev.enlaceExterno} target="_blank" rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5">
                          <Link2 size={11} /> Ver soporte
                        </a>
                      )}
                    </div>
                    {!aprobado && (
                      <button onClick={() => delEvidencia.mutate(ev.id)} className="text-gray-300 hover:text-red-500 shrink-0" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
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

function NuevaEvidenciaForm({
  onAdd, loading,
}: {
  onAdd: (b: { nombre: string; descripcion?: string; tipo: TipoEvidencia; enlaceExterno?: string }) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    nombre: '', descripcion: '', tipo: 'documento' as TipoEvidencia, enlaceExterno: '',
  })

  function handleAdd() {
    if (form.nombre.trim().length < 2) return
    onAdd({
      nombre: form.nombre,
      descripcion: form.descripcion || undefined,
      tipo: form.tipo,
      enlaceExterno: form.enlaceExterno || undefined,
    })
    setForm({ nombre: '', descripcion: '', tipo: 'documento', enlaceExterno: '' })
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
      <Input id="ev-enlace" placeholder="Enlace externo (opcional, https://...)" value={form.enlaceExterno}
        onChange={(e) => setForm({ ...form, enlaceExterno: e.target.value })} />
      <Button size="sm" variant="secondary" className="gap-1.5" loading={loading}
        disabled={form.nombre.trim().length < 2} onClick={handleAdd}>
        <Plus size={13} /> Agregar evidencia
      </Button>
    </div>
  )
}
