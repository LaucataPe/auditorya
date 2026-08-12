import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PROGRAMA_AUDITORIA, TIPO_PRUEBA_LABEL } from '@auditorya/types'
import { Pencil, Plus, Sparkles, Trash2, ShieldAlert, TableProperties, ArrowRightCircle, FileText, CheckCircle } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { SugerenciasIAModal } from './SugerenciasIAModal'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useAreas } from '../../hooks/useAreas'
import { CrearCicloInline } from './CrearCicloInline'

type Nivel = 'bajo' | 'medio' | 'alto'
// Clave de área: catálogo base o ciclo propio de la firma (ver useAreas).
type Area = string

type Riesgo = {
  id: string
  area: Area
  descripcion: string
  riesgoInherente: Nivel
  riesgoControl: Nivel
  riesgoCombinado: Nivel
  respuestaPlaneada: string | null
  origen: 'manual' | 'sugerido' | 'analitico'
}

type Candidato = {
  codigo: string
  cuentaNombre: string | null
  area: Area
  descripcion: string
  riesgoInherente: Nivel
  respuestaPlaneada: string
  motivo: 'significativa' | 'anomalia' | 'ambas'
}


const NIVEL_OPTS = [
  { value: 'bajo', label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto', label: 'Alto' },
]

const NIVEL_BADGE: Record<Nivel, string> = {
  bajo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medio: 'bg-amber-50 text-amber-700 border-amber-200',
  alto: 'bg-red-50 text-red-700 border-red-200',
}

function NivelChip({ nivel }: { nivel: Nivel }) {
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border capitalize', NIVEL_BADGE[nivel])}>
      {nivel}
    </span>
  )
}

type RespuestasMap = Record<string, { papeles: number }>

export function RiesgosTab({
  auditoriaId, sector, materialidadAprobada = false,
}: {
  auditoriaId: string
  sector?: string
  materialidadAprobada?: boolean
}) {
  const { areaLabel } = useAreas()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [iaOpen, setIaOpen] = useState(false)
  const [responder, setResponder] = useState<Riesgo | null>(null)
  const [editTarget, setEditTarget] = useState<Riesgo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Riesgo | null>(null)

  const { data: riesgos = [], isLoading } = useQuery<Riesgo[]>({
    queryKey: ['riesgos', auditoriaId],
    queryFn: () => api.get<Riesgo[]>(`/auditorias/${auditoriaId}/riesgos`),
  })

  const { data: respuestas = {} } = useQuery<RespuestasMap>({
    queryKey: ['riesgos-respuestas', auditoriaId],
    queryFn: () => api.get<RespuestasMap>(`/auditorias/${auditoriaId}/riesgos-respuestas`),
  })


  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['riesgos', auditoriaId] })

  const createMutation = useMutation({
    mutationFn: (body: {
      area: Area; descripcion: string; riesgoInherente: Nivel; riesgoControl: Nivel; respuestaPlaneada?: string
    }) => api.post(`/auditorias/${auditoriaId}/riesgos`, body),
    onSuccess: () => { invalidate(); setModalOpen(false) },
  })

  const updateNivel = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Riesgo, 'riesgoInherente' | 'riesgoControl'>> }) =>
      api.put(`/auditorias/${auditoriaId}/riesgos/${id}`, patch),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EditarRiesgoBody }) =>
      api.put(`/auditorias/${auditoriaId}/riesgos/${id}`, body),
    onSuccess: () => { invalidate(); setEditTarget(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auditorias/${auditoriaId}/riesgos/${id}`),
    onSuccess: () => {
      invalidate()
      // El borrado en cascada afecta papeles, tareas y respuestas del riesgo.
      queryClient.invalidateQueries({ queryKey: ['riesgos-respuestas', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['tareas', auditoriaId] })
      setDeleteTarget(null)
    },
  })

  return (
    <div className="space-y-5">
      {/* Marco normativo */}
      {/* Acciones */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {riesgos.length} riesgo{riesgos.length !== 1 ? 's' : ''} identificado{riesgos.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => setBalanceOpen(true)}
          >
            <TableProperties size={14} /> Desde el balance
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => setIaOpen(true)}
          >
            <Sparkles size={14} /> Sugerir riesgos (IA)
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> Agregar
          </Button>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : riesgos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <ShieldAlert size={34} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Aún no hay riesgos identificados</p>
          <p className="text-xs text-gray-400 mt-1">
            Usa “Sugerir riesgos” para partir del catálogo típico del sector{sector ? ` (${sector})` : ''}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {riesgos.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-900">{areaLabel(r.area)}</span>
                    {r.origen === 'sugerido' && (
                      <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Sparkles size={10} /> IA
                      </span>
                    )}
                    {r.origen === 'analitico' && (
                      <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <TableProperties size={10} /> Balance
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{r.descripcion}</p>
                  {r.respuestaPlaneada && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      <span className="font-medium text-gray-600">Respuesta:</span> {r.respuestaPlaneada}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditTarget(r)}
                    className="text-gray-300 hover:text-indigo-500 transition-colors"
                    title="Editar riesgo"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(r)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="Eliminar riesgo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Niveles */}
              <div className="flex flex-wrap items-end gap-4 mt-3 pt-3 border-t border-gray-50">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Inherente</label>
                  <select
                    value={r.riesgoInherente}
                    onChange={(e) => updateNivel.mutate({ id: r.id, patch: { riesgoInherente: e.target.value as Nivel } })}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {NIVEL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Control</label>
                  <select
                    value={r.riesgoControl}
                    onChange={(e) => updateNivel.mutate({ id: r.id, patch: { riesgoControl: e.target.value as Nivel } })}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {NIVEL_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="ml-auto text-right">
                  <span className="text-xs text-gray-400 block mb-1">Riesgo combinado</span>
                  <NivelChip nivel={r.riesgoCombinado} />
                </div>
              </div>

              {/* Respuesta al riesgo */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                <p className="text-xs text-gray-500">
                  {respuestas[r.id] && respuestas[r.id].papeles > 0
                    ? `${respuestas[r.id].papeles} prueba(s) diseñada(s)`
                    : 'Aún sin prueba diseñada'}
                </p>
                <div className="flex flex-col items-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={!materialidadAprobada}
                    onClick={() => setResponder(r)}
                  >
                    <ArrowRightCircle size={13} /> Responder
                  </Button>
                  {!materialidadAprobada && <span className="text-xs text-gray-400 mt-0.5">Requiere materialidad aprobada</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NuevoRiesgoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
        onCreate={(body) => createMutation.mutate(body)}
      />

      <EditarRiesgoModal
        riesgo={editTarget}
        onClose={() => { setEditTarget(null); updateMutation.reset() }}
        loading={updateMutation.isPending}
        error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
        onSave={(body) => editTarget && updateMutation.mutate({ id: editTarget.id, body })}
      />

      <EliminarRiesgoModal
        riesgo={deleteTarget}
        onClose={() => { setDeleteTarget(null); deleteMutation.reset() }}
        loading={deleteMutation.isPending}
        error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      {balanceOpen && (
        <CandidatosModal
          auditoriaId={auditoriaId}
          onClose={() => setBalanceOpen(false)}
          onAgregados={() => { invalidate(); setBalanceOpen(false) }}
        />
      )}

      {iaOpen && (
        <SugerenciasIAModal
          auditoriaId={auditoriaId}
          onClose={() => setIaOpen(false)}
          onAgregados={() => { invalidate(); setIaOpen(false) }}
        />
      )}

      {responder && (
        <ResponderRiesgoModal
          auditoriaId={auditoriaId}
          riesgo={responder}
          onClose={() => setResponder(null)}
          onCambio={() => {
            queryClient.invalidateQueries({ queryKey: ['riesgos-respuestas', auditoriaId] })
            queryClient.invalidateQueries({ queryKey: ['tareas', auditoriaId] })
            queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
          }}
        />
      )}
    </div>
  )
}

function ResponderRiesgoModal({
  auditoriaId, riesgo, onClose, onCambio,
}: {
  auditoriaId: string
  riesgo: Riesgo
  onClose: () => void
  onCambio: () => void
}) {
  const { areaLabel } = useAreas()
  const queryClient = useQueryClient()

  const [titulo, setTitulo] = useState(`Respuesta al riesgo de ${areaLabel(riesgo.area)}`)
  const pruebas = PROGRAMA_AUDITORIA[riesgo.area] ?? []
  const [selPruebas, setSelPruebas] = useState<Set<number>>(new Set())
  const togglePrueba = (i: number) =>
    setSelPruebas((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  const { data: resp, isLoading } = useQuery<{ papeles: { id: string; titulo: string; estado: string; numTareas: number }[] }>({
    queryKey: ['riesgo-respuestas', riesgo.id],
    queryFn: () => api.get(`/riesgos/${riesgo.id}/respuestas`),
  })

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['riesgo-respuestas', riesgo.id] })
    queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
    onCambio()
  }

  // Títulos de pruebas que ya tienen papel: se bloquean para no duplicar.
  const yaCreadas = new Set((resp?.papeles ?? []).map((p) => p.titulo))

  const crearPapel = useMutation({
    mutationFn: () =>
      api.post(`/auditorias/${auditoriaId}/papeles`, {
        area: riesgo.area,
        titulo,
        procedimiento: riesgo.respuestaPlaneada ?? undefined,
        riesgoId: riesgo.id,
      }),
    onSuccess: refetch,
  })

  const crearPruebas = useMutation({
    mutationFn: async () => {
      for (const i of selPruebas) {
        const p = pruebas[i]
        if (yaCreadas.has(p.titulo)) continue
        const guiaTexto = p.guia.length > 0 ? `\n\nPasos:\n${p.guia.map((g) => `• ${g}`).join('\n')}` : ''
        await api.post(`/auditorias/${auditoriaId}/papeles`, {
          area: riesgo.area,
          titulo: p.titulo,
          procedimiento: `Aserción(es): ${p.aserciones.join(', ')}.\n\n${p.procedimiento}${guiaTexto}`,
          riesgoId: riesgo.id,
          documentosRequeridos: p.documentosRequeridos,
        })
      }
    },
    onSuccess: () => { setSelPruebas(new Set()); refetch() },
  })

  const eliminarPapel = useMutation({
    mutationFn: (papelId: string) => api.delete(`/papeles/${papelId}`),
    onSuccess: refetch,
  })

  const err = crearPapel.error || crearPruebas.error || eliminarPapel.error

  return (
    <Modal open onClose={onClose} title="Responder al riesgo" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">{areaLabel(riesgo.area)}</p>
          <p className="text-sm text-gray-700">{riesgo.descripcion}</p>
          {riesgo.respuestaPlaneada && (
            <p className="text-xs text-gray-500 mt-1"><span className="font-medium text-gray-600">Respuesta planeada:</span> {riesgo.respuestaPlaneada}</p>
          )}
        </div>

        {/* Respuestas existentes */}
        {isLoading ? (
          <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
        ) : (resp && resp.papeles.length > 0) ? (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">Pruebas (papeles) que responden al riesgo</p>
            {resp.papeles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-gray-700 rounded-lg border border-gray-100 px-3 py-1.5">
                <FileText size={13} className="text-indigo-500 shrink-0" />
                <span className="truncate">{p.titulo}</span>
                {p.numTareas > 0 && <span className="text-[10px] text-gray-400">· {p.numTareas} tarea(s)</span>}
                <span className="ml-auto text-xs text-gray-400 capitalize">{p.estado}</span>
                {p.estado === 'borrador' && (
                  <button
                    onClick={() => eliminarPapel.mutate(p.id)}
                    disabled={eliminarPapel.isPending}
                    className="text-gray-300 hover:text-red-500 shrink-0"
                    title="Eliminar papel (solo en borrador)"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">Aún no has diseñado pruebas para este riesgo.</p>
        )}

        {/* Programa de auditoría — pruebas estándar del área */}
        {pruebas.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-2">
              Programa de {areaLabel(riesgo.area)} — selecciona las pruebas que aplican. Se crea un
              papel por prueba (con su guía) y se genera la lista de documentos a solicitar al cliente. Las tareas se
              asignan dentro de cada papel.
            </p>
            <div className="space-y-1.5">
              {pruebas.map((p, i) => {
                const creado = yaCreadas.has(p.titulo)
                return (
                  <label
                    key={i}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                      creado
                        ? 'border-emerald-100 bg-emerald-50/40 opacity-70 cursor-default'
                        : selPruebas.has(i)
                          ? 'border-indigo-300 bg-indigo-50/40 cursor-pointer'
                          : 'border-gray-200 hover:border-gray-300 cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={creado || selPruebas.has(i)}
                      disabled={creado}
                      onChange={() => togglePrueba(i)}
                      className="h-4 w-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{p.titulo}</span>
                        <span className="text-xs text-gray-400">{TIPO_PRUEBA_LABEL[p.tipo]}</span>
                        {creado && <span className="text-[10px] text-emerald-600">✓ ya creado</span>}
                      </div>
                      <p className="text-xs text-gray-500">{p.procedimiento}</p>
                      <p className="text-xs text-indigo-500 mt-0.5">Aserciones: {p.aserciones.join(', ')}</p>
                      {p.documentosRequeridos.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="font-medium text-gray-600">Documentos:</span> {p.documentosRequeridos.join(' · ')}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
            <Button
              size="sm"
              className="gap-1.5 mt-2"
              loading={crearPruebas.isPending}
              disabled={selPruebas.size === 0}
              onClick={() => crearPruebas.mutate()}
            >
              <FileText size={13} /> Crear papeles de las pruebas {selPruebas.size > 0 ? `(${selPruebas.size})` : ''}
            </Button>
          </div>
        )}

        {/* Otra prueba a la medida (papel) */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs text-gray-500">Otra prueba a la medida</p>
          <Input id="resp-titulo" label="Título del papel de trabajo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          {err && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {err instanceof Error ? err.message : 'Error al crear la prueba'}
            </p>
          )}
          <Button
            size="sm" className="gap-1.5"
            loading={crearPapel.isPending}
            disabled={titulo.trim().length < 3 || yaCreadas.has(titulo.trim())}
            onClick={() => crearPapel.mutate()}
          >
            <FileText size={13} /> Crear papel de trabajo
          </Button>
          {crearPapel.isSuccess && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle size={12} /> Papel creado y enlazado al riesgo. Agrega las tareas dentro del papel.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function CandidatosModal({
  auditoriaId, onClose, onAgregados,
}: {
  auditoriaId: string
  onClose: () => void
  onAgregados: () => void
}) {
  const { areaLabel } = useAreas()
  const { data: candidatos = [], isLoading } = useQuery<Candidato[]>({
    queryKey: ['riesgos-candidatos', auditoriaId],
    queryFn: () => api.get<Candidato[]>(`/auditorias/${auditoriaId}/riesgos/candidatos`),
  })

  const [sel, setSel] = useState<Set<number>>(new Set())
  const todos = candidatos.length > 0 && sel.size === candidatos.length

  function toggle(i: number) {
    setSel((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }

  const agregar = useMutation({
    mutationFn: () =>
      api.post(`/auditorias/${auditoriaId}/riesgos/agregar-candidatos`, {
        candidatos: [...sel].map((i) => ({
          area: candidatos[i].area,
          descripcion: candidatos[i].descripcion,
          riesgoInherente: candidatos[i].riesgoInherente,
          respuestaPlaneada: candidatos[i].respuestaPlaneada,
        })),
      }),
    onSuccess: onAgregados,
  })

  const MOTIVO_LABEL: Record<Candidato['motivo'], string> = {
    significativa: 'Significativa', anomalia: 'Variación inusual', ambas: 'Significativa + inusual',
  }

  return (
    <Modal open onClose={onClose} title="Riesgos candidatos desde el balance" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-xs text-gray-500">
          A partir de las cuentas significativas y las variaciones inusuales del balance. Selecciona los
          que apliquen; entrarán como riesgos para que ajustes el nivel de control y la respuesta.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : candidatos.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">
            No se encontraron cuentas significativas ni variaciones inusuales. Carga el balance y calcula la materialidad para activar esta sugerencia.
          </div>
        ) : (
          <>
            <button
              onClick={() => setSel(todos ? new Set() : new Set(candidatos.map((_, i) => i)))}
              className="text-xs text-indigo-600 hover:underline"
            >
              {todos ? 'Quitar selección' : 'Seleccionar todos'}
            </button>
            <div className="space-y-2">
              {candidatos.map((c, i) => (
                <label
                  key={i}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                    sel.has(i) ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={sel.has(i)}
                    onChange={() => toggle(i)}
                    className="h-4 w-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-gray-900">{areaLabel(c.area)}</span>
                      <span className="text-xs text-gray-400">{MOTIVO_LABEL[c.motivo]}</span>
                      <NivelChip nivel={c.riesgoInherente} />
                    </div>
                    <p className="text-sm text-gray-700">{c.descripcion}</p>
                  </div>
                </label>
              ))}
            </div>

            {agregar.isError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {agregar.error instanceof Error ? agregar.error.message : 'Error al agregar'}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button loading={agregar.isPending} disabled={sel.size === 0} onClick={() => agregar.mutate()}>
                Agregar {sel.size > 0 ? `(${sel.size})` : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function NuevoRiesgoModal({
  open, onClose, onCreate, loading, error,
}: {
  open: boolean
  onClose: () => void
  loading: boolean
  error: string | null
  onCreate: (b: { area: Area; descripcion: string; riesgoInherente: Nivel; riesgoControl: Nivel; respuestaPlaneada?: string }) => void
}) {
  const { opciones } = useAreas()
  const [form, setForm] = useState({
    area: 'ingresos_operacionales' as Area,
    descripcion: '',
    riesgoInherente: 'alto' as Nivel,
    riesgoControl: 'medio' as Nivel,
    respuestaPlaneada: '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.descripcion.trim().length < 3) return
    onCreate({
      area: form.area,
      descripcion: form.descripcion,
      riesgoInherente: form.riesgoInherente,
      riesgoControl: form.riesgoControl,
      respuestaPlaneada: form.respuestaPlaneada || undefined,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo riesgo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Select
            id="r-area"
            label="Área / Ciclo"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
            options={opciones}
          />
          <CrearCicloInline onCreado={(clave) => setForm((f) => ({ ...f, area: clave }))} />
        </div>
        <Input
          id="r-desc"
          label="Descripción del riesgo"
          placeholder="Ej: Reconocimiento de ingresos en período incorrecto"
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="r-inh"
            label="Riesgo inherente"
            value={form.riesgoInherente}
            onChange={(e) => setForm({ ...form, riesgoInherente: e.target.value as Nivel })}
            options={NIVEL_OPTS}
          />
          <Select
            id="r-ctrl"
            label="Riesgo de control"
            value={form.riesgoControl}
            onChange={(e) => setForm({ ...form, riesgoControl: e.target.value as Nivel })}
            options={NIVEL_OPTS}
          />
        </div>
        <Input
          id="r-resp"
          label="Respuesta planeada (opcional)"
          placeholder="Ej: Pruebas de corte y circularización"
          value={form.respuestaPlaneada}
          onChange={(e) => setForm({ ...form, respuestaPlaneada: e.target.value })}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={form.descripcion.trim().length < 3}>
            Agregar riesgo
          </Button>
        </div>
      </form>
    </Modal>
  )
}

type EditarRiesgoBody = {
  area: Area
  descripcion: string
  riesgoInherente: Nivel
  riesgoControl: Nivel
  respuestaPlaneada: string
}

function EditarRiesgoModal({
  riesgo, onClose, onSave, loading, error,
}: {
  riesgo: Riesgo | null
  onClose: () => void
  loading: boolean
  error: string | null
  onSave: (b: EditarRiesgoBody) => void
}) {
  const { opciones } = useAreas()
  const [form, setForm] = useState<EditarRiesgoBody>({
    area: 'ingresos', descripcion: '', riesgoInherente: 'alto', riesgoControl: 'medio', respuestaPlaneada: '',
  })

  useEffect(() => {
    if (riesgo) {
      setForm({
        area: riesgo.area,
        descripcion: riesgo.descripcion,
        riesgoInherente: riesgo.riesgoInherente,
        riesgoControl: riesgo.riesgoControl,
        respuestaPlaneada: riesgo.respuestaPlaneada ?? '',
      })
    }
  }, [riesgo])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.descripcion.trim().length < 3) return
    onSave(form)
  }

  return (
    <Modal open={!!riesgo} onClose={onClose} title="Editar riesgo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          id="er-area"
          label="Área / Ciclo"
          value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
          options={opciones}
        />
        <Input
          id="er-desc"
          label="Descripción del riesgo"
          placeholder="Ej: Reconocimiento de ingresos en período incorrecto"
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="er-inh"
            label="Riesgo inherente"
            value={form.riesgoInherente}
            onChange={(e) => setForm({ ...form, riesgoInherente: e.target.value as Nivel })}
            options={NIVEL_OPTS}
          />
          <Select
            id="er-ctrl"
            label="Riesgo de control"
            value={form.riesgoControl}
            onChange={(e) => setForm({ ...form, riesgoControl: e.target.value as Nivel })}
            options={NIVEL_OPTS}
          />
        </div>
        <Input
          id="er-resp"
          label="Respuesta planeada (opcional)"
          placeholder="Ej: Pruebas de corte y circularización"
          value={form.respuestaPlaneada}
          onChange={(e) => setForm({ ...form, respuestaPlaneada: e.target.value })}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={form.descripcion.trim().length < 3}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EliminarRiesgoModal({
  riesgo, onClose, onConfirm, loading, error,
}: {
  riesgo: Riesgo | null
  onClose: () => void
  loading: boolean
  error: string | null
  onConfirm: () => void
}) {
  const { areaLabel } = useAreas()
  const [texto, setTexto] = useState('')

  useEffect(() => { if (riesgo) setTexto('') }, [riesgo])

  const { data, isLoading } = useQuery<{ papeles: { id: string; titulo: string; estado: string; numTareas: number }[] }>({
    queryKey: ['riesgo-respuestas', riesgo?.id],
    queryFn: () => api.get(`/riesgos/${riesgo!.id}/respuestas`),
    enabled: !!riesgo,
  })

  const papeles = data?.papeles ?? []
  const totalTareas = papeles.reduce((s, p) => s + p.numTareas, 0)
  const tieneCascada = papeles.length > 0
  // Con papeles enlazados exigimos confirmación escrita; sin ellos basta con confirmar.
  const confirmado = !tieneCascada || texto.trim().toUpperCase() === 'ELIMINAR'

  return (
    <Modal open={!!riesgo} onClose={onClose} title="Eliminar riesgo">
      <div className="space-y-4">
        {riesgo && (
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">{areaLabel(riesgo.area)}</p>
            <p className="text-sm text-gray-700">{riesgo.descripcion}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : tieneCascada ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <ShieldAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                Este riesgo tiene <strong>{papeles.length} papel(es) de trabajo</strong> enlazados. Al
                eliminarlo se borrarán también esos papeles, sus tareas
                {totalTareas > 0 ? ` (${totalTareas})` : ''}, evidencia y documentos relacionados. Esta
                acción es <strong>irreversible</strong>.
              </p>
            </div>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-0.5">
              {papeles.map((p) => (
                <li key={p.id}>
                  {p.titulo}
                  <span className="text-xs text-gray-400 capitalize">
                    {' · '}{p.estado}{p.numTareas > 0 ? ` · ${p.numTareas} tarea(s)` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <Input
              id="confirmar-eliminar-riesgo"
              label="Escribe ELIMINAR para confirmar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="ELIMINAR"
              autoComplete="off"
            />
          </>
        ) : (
          <p className="text-sm text-gray-600">
            ¿Seguro que quieres eliminar este riesgo? Esta acción no se puede deshacer.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            type="button"
            variant="danger"
            className="disabled:opacity-50"
            loading={loading}
            disabled={!confirmado}
            onClick={onConfirm}
          >
            {tieneCascada ? 'Eliminar todo' : 'Eliminar riesgo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
