import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Sparkles, Trash2, ShieldAlert } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Nivel = 'bajo' | 'medio' | 'alto'
type Area =
  | 'efectivo' | 'cartera' | 'inventarios' | 'propiedad_planta_equipo' | 'proveedores'
  | 'nomina' | 'impuestos' | 'ingresos' | 'gastos' | 'patrimonio' | 'otro'

type Riesgo = {
  id: string
  area: Area
  descripcion: string
  riesgoInherente: Nivel
  riesgoControl: Nivel
  riesgoCombinado: Nivel
  respuestaPlaneada: string | null
  origen: 'manual' | 'sugerido'
}

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

export function RiesgosTab({ auditoriaId, sector }: { auditoriaId: string; sector?: string }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)

  const { data: riesgos = [], isLoading } = useQuery<Riesgo[]>({
    queryKey: ['riesgos', auditoriaId],
    queryFn: () => api.get<Riesgo[]>(`/auditorias/${auditoriaId}/riesgos`),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['riesgos', auditoriaId] })

  const sugerirMutation = useMutation({
    mutationFn: () => api.post(`/auditorias/${auditoriaId}/riesgos/sugerir`, {}),
    onSuccess: invalidate,
  })

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auditorias/${auditoriaId}/riesgos/${id}`),
    onSuccess: invalidate,
  })

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Marco normativo */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Identificación de riesgos — NIA 315</p>
        <p className="text-xs text-indigo-500 mt-1">
          Identifica los riesgos de error material por área. El riesgo combinado se calcula a partir del
          riesgo inherente y el de control, y orienta el alcance de las pruebas en la ejecución.
        </p>
      </div>

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
            loading={sugerirMutation.isPending}
            onClick={() => sugerirMutation.mutate()}
          >
            <Sparkles size={14} /> Sugerir riesgos (IA)
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> Agregar
          </Button>
        </div>
      </div>

      {sugerirMutation.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {sugerirMutation.error instanceof Error ? sugerirMutation.error.message : 'Error al sugerir riesgos'}
        </p>
      )}

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
                    <span className="text-xs font-medium text-gray-900">{AREA_LABEL[r.area]}</span>
                    {r.origen === 'sugerido' && (
                      <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Sparkles size={10} /> IA
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
                <button
                  onClick={() => deleteMutation.mutate(r.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                  title="Eliminar riesgo"
                >
                  <Trash2 size={15} />
                </button>
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
    </div>
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
  const [form, setForm] = useState({
    area: 'ingresos' as Area,
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
        <Select
          id="r-area"
          label="Área / Ciclo"
          value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value as Area })}
          options={AREA_OPTS}
        />
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
