import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Componente =
  | 'ambiente_control' | 'evaluacion_riesgos' | 'actividades_control'
  | 'informacion_comunicacion' | 'supervision'
type Calificacion = 'efectivo' | 'con_deficiencias' | 'deficiente'

type Control = {
  id: string
  componente: Componente
  calificacion: Calificacion
  observaciones: string | null
}

const COMPONENTES: { id: Componente; nombre: string; descripcion: string }[] = [
  { id: 'ambiente_control', nombre: 'Ambiente de control', descripcion: 'Integridad, valores éticos y estructura organizacional; el "tono de la gerencia".' },
  { id: 'evaluacion_riesgos', nombre: 'Evaluación de riesgos', descripcion: 'Identificación y análisis de riesgos relevantes para los objetivos de la entidad.' },
  { id: 'actividades_control', nombre: 'Actividades de control', descripcion: 'Políticas y procedimientos: autorizaciones, segregación de funciones, conciliaciones.' },
  { id: 'informacion_comunicacion', nombre: 'Información y comunicación', descripcion: 'Calidad y flujo de la información relevante hacia dentro y fuera de la entidad.' },
  { id: 'supervision', nombre: 'Supervisión / Monitoreo', descripcion: 'Evaluaciones continuas y separadas del funcionamiento del control interno.' },
]

const CALIF_OPTS: { value: Calificacion; label: string; cls: string }[] = [
  { value: 'efectivo', label: 'Efectivo', cls: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { value: 'con_deficiencias', label: 'Con deficiencias', cls: 'border-amber-400 bg-amber-50 text-amber-700' },
  { value: 'deficiente', label: 'Deficiente', cls: 'border-red-400 bg-red-50 text-red-700' },
]

const CALIF_BADGE: Record<Calificacion, string> = {
  efectivo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  con_deficiencias: 'bg-amber-50 text-amber-700 border-amber-200',
  deficiente: 'bg-red-50 text-red-700 border-red-200',
}

export function ControlInternoTab({
  auditoriaId,
  materialidadAprobada,
}: {
  auditoriaId: string
  materialidadAprobada: boolean
}) {
  const { data: controles = [], isLoading } = useQuery<Control[]>({
    queryKey: ['coso', auditoriaId],
    queryFn: () => api.get<Control[]>(`/auditorias/${auditoriaId}/coso`),
    enabled: materialidadAprobada,
  })

  if (!materialidadAprobada) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center max-w-2xl">
        <Lock size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Ejecución bloqueada</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm">
          Aprueba la materialidad para habilitar la evaluación de control interno.
        </p>
      </div>
    )
  }

  const evaluados = controles.length
  const byId = (id: Componente) => controles.find((c) => c.componente === id)

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Control interno — Modelo COSO</p>
        <p className="text-xs text-indigo-500 mt-1">
          Evalúa los cinco componentes del control interno. El resultado orienta cuánto puedes confiar
          en los controles de la entidad y, por tanto, el alcance de las pruebas sustantivas.
        </p>
      </div>

      <p className="text-sm text-gray-500">{evaluados} de 5 componentes evaluados</p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {COMPONENTES.map((comp) => (
            <ComponenteCard
              key={comp.id}
              auditoriaId={auditoriaId}
              componente={comp}
              control={byId(comp.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ComponenteCard({
  auditoriaId, componente, control,
}: {
  auditoriaId: string
  componente: { id: Componente; nombre: string; descripcion: string }
  control?: Control
}) {
  const queryClient = useQueryClient()
  const [calificacion, setCalificacion] = useState<Calificacion | null>(control?.calificacion ?? null)
  const [observaciones, setObservaciones] = useState(control?.observaciones ?? '')

  useEffect(() => {
    if (control) {
      setCalificacion(control.calificacion)
      setObservaciones(control.observaciones ?? '')
    }
  }, [control])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/auditorias/${auditoriaId}/coso/${componente.id}`, {
        calificacion,
        observaciones: observaciones || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coso', auditoriaId] }),
  })

  const dirty =
    calificacion !== (control?.calificacion ?? null) ||
    observaciones !== (control?.observaciones ?? '')

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-900">{componente.nombre}</p>
          <p className="text-xs text-gray-500 mt-0.5">{componente.descripcion}</p>
        </div>
        {control && (
          <span className={cn('shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border capitalize', CALIF_BADGE[control.calificacion])}>
            {CALIF_OPTS.find((o) => o.value === control.calificacion)?.label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {CALIF_OPTS.map((o) => (
          <button
            key={o.value}
            onClick={() => setCalificacion(o.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all',
              calificacion === o.value ? o.cls : 'border-gray-200 text-gray-500 hover:border-gray-300',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Textarea
        id={`coso-${componente.id}`}
        rows={2}
        placeholder="Observaciones del componente (debilidades detectadas, controles clave...)"
        value={observaciones}
        onChange={(e) => setObservaciones(e.target.value)}
      />

      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!calificacion || !dirty || saveMutation.isPending}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          <ShieldCheck size={13} /> Guardar
        </Button>
        {saveMutation.isSuccess && !dirty && <span className="text-xs text-emerald-600">Guardado</span>}
      </div>
    </div>
  )
}
