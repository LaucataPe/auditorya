import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertOctagon, Plus, Pencil, Trash2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { Textarea } from '../../ui/Textarea'
import { api } from '../../../lib/api'
import { cn } from '../../../lib/cn'

type NivelRiesgo = 'alto' | 'medio' | 'bajo'
type EstadoSeguimiento = 'pendiente' | 'en_proceso' | 'implementado' | 'aceptado_riesgo'

type HallazgoAI = {
  id: string
  programaId: string | null
  titulo: string
  condicion: string
  criterio: string
  causa: string
  efecto: string
  nivelRiesgo: NivelRiesgo
  recomendacion: string
  respuestaAdministracion: string | null
  responsableGestion: string | null
  fechaCompromiso: string | null
  estadoSeguimiento: EstadoSeguimiento
}

type ProgramaAI = { id: string; area: string }

const NIVEL_BADGE: Record<NivelRiesgo, string> = {
  alto: 'bg-red-100 text-red-700',
  medio: 'bg-amber-100 text-amber-700',
  bajo: 'bg-green-100 text-green-700',
}

const SEGUIMIENTO_BADGE: Record<EstadoSeguimiento, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  en_proceso: 'bg-amber-50 text-amber-700',
  implementado: 'bg-emerald-50 text-emerald-700',
  aceptado_riesgo: 'bg-blue-50 text-blue-700',
}

const SEGUIMIENTO_LABEL: Record<EstadoSeguimiento, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  implementado: 'Implementado',
  aceptado_riesgo: 'Riesgo aceptado',
}

export function HallazgosTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<HallazgoAI | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [respuestaId, setRespuestaId] = useState<string | null>(null)

  const { data: hallazgos = [], isLoading } = useQuery<HallazgoAI[]>({
    queryKey: ['hallazgos-ai', auditoriaId],
    queryFn: () => api.get(`/auditorias/${auditoriaId}/ai/hallazgos`),
  })

  const { data: rawProgramas = [] } = useQuery<{ programa: ProgramaAI }[]>({
    queryKey: ['programas-ai', auditoriaId],
    queryFn: () => api.get(`/auditorias/${auditoriaId}/ai/programas`),
  })
  const programas = rawProgramas.map((r) => r.programa)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auditorias/${auditoriaId}/ai/hallazgos/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hallazgos-ai', auditoriaId] }),
  })

  const respuestaMutation = useMutation({
    mutationFn: ({ id, respuesta, estadoSeguimiento }: { id: string; respuesta: string; estadoSeguimiento: EstadoSeguimiento }) =>
      api.put(`/auditorias/${auditoriaId}/ai/hallazgos/${id}`, { respuestaAdministracion: respuesta, estadoSeguimiento }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hallazgos-ai', auditoriaId] })
      setRespuestaId(null)
    },
  })

  const altoCount = hallazgos.filter((h) => h.nivelRiesgo === 'alto').length
  const medioCount = hallazgos.filter((h) => h.nivelRiesgo === 'medio').length
  const bajoCount = hallazgos.filter((h) => h.nivelRiesgo === 'bajo').length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Hallazgos de auditoría</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Documenta cada hallazgo con la estructura IIA: condición, criterio, causa, efecto y recomendación.
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setEditando(null); setModalOpen(true) }}>
          <Plus size={14} /> Nuevo hallazgo
        </Button>
      </div>

      {/* Resumen */}
      {hallazgos.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Alto', count: altoCount, cls: 'bg-red-50 border-red-100 text-red-700' },
            { label: 'Medio', count: medioCount, cls: 'bg-amber-50 border-amber-100 text-amber-700' },
            { label: 'Bajo', count: bajoCount, cls: 'bg-green-50 border-green-100 text-green-700' },
          ].map(({ label, count, cls }) => (
            <div key={label} className={cn('rounded-xl border px-4 py-3 text-center', cls)}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs font-medium mt-0.5">Riesgo {label}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
        </div>
      ) : hallazgos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <AlertOctagon size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Sin hallazgos registrados</p>
          <p className="text-xs text-gray-400 mt-1 max-w-xs">
            Documenta los hallazgos identificados durante el trabajo de campo.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>Registrar hallazgo</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {hallazgos.map((h) => {
            const abierto = expandido === h.id
            const enRespuesta = respuestaId === h.id
            const programa = programas.find((p) => p.id === h.programaId)
            return (
              <div key={h.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-start justify-between px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', NIVEL_BADGE[h.nivelRiesgo])}>
                        Riesgo {h.nivelRiesgo}
                      </span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', SEGUIMIENTO_BADGE[h.estadoSeguimiento])}>
                        {SEGUIMIENTO_LABEL[h.estadoSeguimiento]}
                      </span>
                      {programa && (
                        <span className="text-xs text-gray-400">{programa.area}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{h.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{h.condicion}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-3">
                    <button
                      title="Respuesta de administración"
                      onClick={() => setRespuestaId(enRespuesta ? null : h.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                    >
                      <MessageSquare size={14} />
                    </button>
                    <button
                      onClick={() => { setEditando(h); setModalOpen(true) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(h.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => setExpandido(abierto ? null : h.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {abierto && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                    <IIAField label="Condición" value={h.condicion} />
                    <IIAField label="Criterio" value={h.criterio} />
                    <IIAField label="Causa" value={h.causa} />
                    <IIAField label="Efecto" value={h.efecto} />
                    <IIAField label="Recomendación" value={h.recomendacion} highlight />
                    {h.respuestaAdministracion && (
                      <IIAField label="Respuesta de administración" value={h.respuestaAdministracion} />
                    )}
                    {h.responsableGestion && (
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>Responsable: <strong className="text-gray-700">{h.responsableGestion}</strong></span>
                        {h.fechaCompromiso && (
                          <span>Fecha compromiso: <strong className="text-gray-700">{new Date(h.fechaCompromiso).toLocaleDateString('es-CO')}</strong></span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {enRespuesta && (
                  <RespuestaForm
                    hallazgo={h}
                    onSave={(respuesta, estadoSeguimiento) =>
                      respuestaMutation.mutate({ id: h.id, respuesta, estadoSeguimiento })
                    }
                    onClose={() => setRespuestaId(null)}
                    loading={respuestaMutation.isPending}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <HallazgoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        auditoriaId={auditoriaId}
        hallazgo={editando}
        programas={programas}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['hallazgos-ai', auditoriaId] })
          setModalOpen(false)
        }}
      />
    </div>
  )
}

function IIAField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={cn('text-sm mt-1 whitespace-pre-wrap', highlight ? 'text-purple-800 font-medium' : 'text-gray-700')}>
        {value}
      </p>
    </div>
  )
}

function RespuestaForm({
  hallazgo, onSave, onClose, loading,
}: {
  hallazgo: HallazgoAI
  onSave: (respuesta: string, estadoSeguimiento: EstadoSeguimiento) => void
  onClose: () => void
  loading: boolean
}) {
  const [respuesta, setRespuesta] = useState(hallazgo.respuestaAdministracion ?? '')
  const [estado, setEstado] = useState<EstadoSeguimiento>(hallazgo.estadoSeguimiento)

  return (
    <div className="border-t border-purple-100 bg-purple-50/40 px-5 py-4 space-y-3">
      <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Respuesta de administración</p>
      <Textarea
        id={`resp-${hallazgo.id}`}
        label=""
        placeholder="Plan de acción y compromisos de la administración..."
        value={respuesta}
        rows={3}
        onChange={(e) => setRespuesta(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <Select
          id={`seg-${hallazgo.id}`}
          label=""
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoSeguimiento)}
          options={[
            { value: 'pendiente', label: 'Pendiente' },
            { value: 'en_proceso', label: 'En proceso' },
            { value: 'implementado', label: 'Implementado' },
            { value: 'aceptado_riesgo', label: 'Riesgo aceptado' },
          ]}
        />
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button size="sm" loading={loading} onClick={() => onSave(respuesta, estado)}>Guardar</Button>
        </div>
      </div>
    </div>
  )
}

function HallazgoModal({
  open, onClose, auditoriaId, hallazgo, programas, onSuccess,
}: {
  open: boolean
  onClose: () => void
  auditoriaId: string
  hallazgo: HallazgoAI | null
  programas: ProgramaAI[]
  onSuccess: () => void
}) {
  const isEdit = !!hallazgo
  const [form, setForm] = useState({
    titulo: hallazgo?.titulo ?? '',
    programaId: hallazgo?.programaId ?? '',
    condicion: hallazgo?.condicion ?? '',
    criterio: hallazgo?.criterio ?? '',
    causa: hallazgo?.causa ?? '',
    efecto: hallazgo?.efecto ?? '',
    nivelRiesgo: (hallazgo?.nivelRiesgo ?? 'medio') as NivelRiesgo,
    recomendacion: hallazgo?.recomendacion ?? '',
    responsableGestion: hallazgo?.responsableGestion ?? '',
    estadoSeguimiento: (hallazgo?.estadoSeguimiento ?? 'pendiente') as EstadoSeguimiento,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        programaId: form.programaId || null,
        responsableGestion: form.responsableGestion || undefined,
      }
      return isEdit
        ? api.put(`/auditorias/${auditoriaId}/ai/hallazgos/${hallazgo.id}`, payload)
        : api.post(`/auditorias/${auditoriaId}/ai/hallazgos`, payload)
    },
    onSuccess,
  })

  const programaOpts = [
    { value: '', label: 'Sin programa asociado' },
    ...programas.map((p) => ({ value: p.id, label: p.area })),
  ]

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value })

  const valido = form.titulo.trim() && form.condicion.trim() && form.criterio.trim()
    && form.causa.trim() && form.efecto.trim() && form.recomendacion.trim()

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar hallazgo' : 'Nuevo hallazgo'}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (valido) mutation.mutate() }}
        className="space-y-4 max-h-[70vh] overflow-y-auto pr-1"
      >
        <Input id="h-titulo" label="Título del hallazgo" placeholder="Nombre descriptivo del hallazgo" value={form.titulo} onChange={f('titulo')} />
        <div className="grid grid-cols-2 gap-3">
          <Select id="h-nivel" label="Nivel de riesgo" value={form.nivelRiesgo} onChange={f('nivelRiesgo')}
            options={[{ value: 'alto', label: 'Alto' }, { value: 'medio', label: 'Medio' }, { value: 'bajo', label: 'Bajo' }]}
          />
          <Select id="h-programa" label="Programa asociado" value={form.programaId} onChange={f('programaId')} options={programaOpts} />
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Estructura IIA</p>
          <div className="space-y-3">
            <Textarea id="h-cond" label="Condición" placeholder="¿Qué encontramos?" value={form.condicion} rows={2} onChange={f('condicion')} />
            <Textarea id="h-crit" label="Criterio" placeholder="¿Cuál es la norma, política o estándar aplicable?" value={form.criterio} rows={2} onChange={f('criterio')} />
            <Textarea id="h-causa" label="Causa" placeholder="¿Por qué ocurrió?" value={form.causa} rows={2} onChange={f('causa')} />
            <Textarea id="h-efecto" label="Efecto / Riesgo" placeholder="¿Cuál es el impacto real o potencial?" value={form.efecto} rows={2} onChange={f('efecto')} />
            <Textarea id="h-rec" label="Recomendación" placeholder="¿Qué debe hacer la administración?" value={form.recomendacion} rows={2} onChange={f('recomendacion')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input id="h-resp" label="Responsable de gestión" placeholder="Nombre o cargo" value={form.responsableGestion} onChange={f('responsableGestion')} />
          <Select id="h-seg" label="Estado de seguimiento" value={form.estadoSeguimiento} onChange={f('estadoSeguimiento')}
            options={[
              { value: 'pendiente', label: 'Pendiente' },
              { value: 'en_proceso', label: 'En proceso' },
              { value: 'implementado', label: 'Implementado' },
              { value: 'aceptado_riesgo', label: 'Riesgo aceptado' },
            ]}
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {mutation.error instanceof Error ? mutation.error.message : 'Error al guardar'}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending} disabled={!valido}>
            {isEdit ? 'Guardar cambios' : 'Registrar hallazgo'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
