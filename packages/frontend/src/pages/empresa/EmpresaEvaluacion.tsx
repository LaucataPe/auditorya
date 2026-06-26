import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Empresa = {
  id: string
  nombre: string
  estadoEncargo: 'pendiente' | 'aceptado' | 'rechazado'
}

const PREGUNTAS = [
  {
    id: 'independencia',
    label: '¿Existe alguna relación financiera o familiar entre la firma y la empresa cliente?',
    riesgo: true,
  },
  {
    id: 'conflicto',
    label: '¿Existe algún conflicto de interés conocido con la empresa cliente?',
    riesgo: true,
  },
  {
    id: 'servicios_previos',
    label: '¿La firma prestó servicios de contabilidad o preparación de estados financieros a esta empresa en el período a auditar?',
    riesgo: true,
  },
  {
    id: 'honorarios',
    label: '¿Los honorarios de este encargo representan más del 15% de los ingresos totales de la firma?',
    riesgo: true,
  },
]

export function EmpresaEvaluacion() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: empresa, isLoading } = useQuery<Empresa>({
    queryKey: ['empresa', id],
    queryFn: () => api.get<Empresa>(`/empresas/${id}`),
    enabled: !!id,
  })

  const [respuestas, setRespuestas] = useState<Record<string, 'si' | 'no' | null>>(
    Object.fromEntries(PREGUNTAS.map((p) => [p.id, null])),
  )

  const mutation = useMutation({
    mutationFn: (decision: 'aceptado' | 'rechazado') =>
      api.post(`/empresas/${id}/evaluacion`, {
        respuestas: Object.fromEntries(
          Object.entries(respuestas).filter(([, v]) => v !== null),
        ),
        decision,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa', id] })
      queryClient.invalidateQueries({ queryKey: ['empresas'] })
      queryClient.invalidateQueries({ queryKey: ['evaluacion', id] })
    },
  })

  const allAnswered = Object.values(respuestas).every((v) => v !== null)
  const hayRiesgo = Object.entries(respuestas).some(([key, val]) => {
    const pregunta = PREGUNTAS.find((p) => p.id === key)
    return pregunta?.riesgo && val === 'si'
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (empresa?.estadoEncargo === 'aceptado') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Evaluación de aceptación</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 py-16 text-center">
          <CheckCircle size={40} className="text-emerald-500 mb-3" />
          <p className="text-lg font-semibold text-emerald-800">Encargo aceptado</p>
          <p className="text-sm text-emerald-600 mt-1 max-w-sm">
            La evaluación de independencia fue completada satisfactoriamente. Ya puedes crear encargos de auditoría.
          </p>
        </div>
      </div>
    )
  }

  if (empresa?.estadoEncargo === 'rechazado') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Evaluación de aceptación</h1>
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16 text-center">
          <XCircle size={40} className="text-red-400 mb-3" />
          <p className="text-lg font-semibold text-red-800">Encargo rechazado</p>
          <p className="text-sm text-red-600 mt-1 max-w-sm">
            La evaluación identificó amenazas que impiden aceptar el encargo con esta empresa.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Evaluación de aceptación</h1>
        <p className="text-sm text-gray-500 mt-1">
          Evalúa la independencia del equipo auditor frente a <strong>{empresa?.nombre}</strong>.
        </p>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Marco normativo — NIA 200 / NICC 1 (ISQM 1)</p>
        <p className="text-xs text-indigo-500 mt-1">
          Responde cada pregunta con honestidad. Una respuesta positiva no implica necesariamente rechazo, pero debe ser evaluada con cuidado.
        </p>
      </div>

      <div className="space-y-3">
        {PREGUNTAS.map((pregunta, idx) => (
          <div key={pregunta.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
            <p className="text-xs text-gray-400 mb-1">Pregunta {idx + 1}</p>
            <p className="text-sm text-gray-800 mb-3">{pregunta.label}</p>
            <div className="flex gap-2">
              {(['no', 'si'] as const).map((val) => (
                <button
                  key={val}
                  onClick={() => setRespuestas((prev) => ({ ...prev, [pregunta.id]: val }))}
                  className={cn(
                    'px-5 py-1.5 rounded-lg text-sm font-medium border-2 transition-all',
                    respuestas[pregunta.id] === val
                      ? val === 'no'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300',
                  )}
                >
                  {val === 'si' ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {allAnswered && hayRiesgo && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Se identificaron posibles amenazas</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Revisa cada respuesta antes de tomar una decisión. Considera si las salvaguardas disponibles son suficientes.
            </p>
          </div>
        </div>
      )}

      {mutation.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {mutation.error instanceof Error ? mutation.error.message : 'Error al guardar la evaluación'}
        </p>
      )}

      {allAnswered && (
        <div className="flex gap-3">
          <Button
            variant="danger"
            size="sm"
            loading={mutation.isPending && mutation.variables === 'rechazado'}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('rechazado')}
          >
            Rechazar encargo
          </Button>
          <Button
            size="sm"
            loading={mutation.isPending && mutation.variables === 'aceptado'}
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('aceptado')}
          >
            Aceptar encargo
          </Button>
        </div>
      )}
    </div>
  )
}
