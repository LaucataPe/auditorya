import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Sparkles, TableProperties } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Nivel = 'bajo' | 'medio' | 'alto'
type Area =
  | 'efectivo' | 'cartera' | 'inventarios' | 'propiedad_planta_equipo' | 'proveedores'
  | 'nomina' | 'impuestos' | 'ingresos' | 'gastos' | 'patrimonio' | 'otro'

type Sugerencia = {
  area: Area
  descripcion: string
  riesgoInherente: Nivel
  respuestaPlaneada?: string
}

type RespuestaIA = { fuente: 'ia' | 'catalogo'; riesgos: Sugerencia[] }

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

const NIVEL_BADGE: Record<Nivel, string> = {
  bajo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medio: 'bg-amber-50 text-amber-700 border-amber-200',
  alto: 'bg-red-50 text-red-700 border-red-200',
}

/**
 * Sugerencias de riesgos (NIA 315) generadas por Claude con el contexto real
 * del encargo (sector, entendimiento, balance). El auditor revisa y elige
 * cuáles entran a la matriz — la IA propone, el auditor decide.
 */
export function SugerenciasIAModal({
  auditoriaId, onClose, onAgregados,
}: {
  auditoriaId: string
  onClose: () => void
  onAgregados: () => void
}) {
  const { data, isLoading, isError, error } = useQuery<RespuestaIA>({
    queryKey: ['ia-sugerencias', auditoriaId],
    queryFn: () => api.post<RespuestaIA>(`/auditorias/${auditoriaId}/ia/sugerir-riesgos`, {}),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })

  const sugerencias = data?.riesgos ?? []
  const [sel, setSel] = useState<Set<number>>(new Set())
  const todos = sugerencias.length > 0 && sel.size === sugerencias.length

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
          area: sugerencias[i].area,
          descripcion: sugerencias[i].descripcion,
          riesgoInherente: sugerencias[i].riesgoInherente,
          respuestaPlaneada: sugerencias[i].respuestaPlaneada,
        })),
        origen: 'sugerido',
      }),
    onSuccess: onAgregados,
  })

  return (
    <Modal open onClose={onClose} title="Riesgos sugeridos" size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="text-xs text-slate-400">
              Analizando el sector, el entendimiento y el balance del encargo…
            </p>
          </div>
        ) : isError ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error instanceof Error ? error.message : 'No se pudieron generar sugerencias'}
          </p>
        ) : (
          <>
            <div
              className={cn(
                'flex items-start gap-2 rounded-xl border px-4 py-3',
                data?.fuente === 'ia'
                  ? 'border-indigo-100 bg-indigo-50'
                  : 'border-amber-100 bg-amber-50',
              )}
            >
              {data?.fuente === 'ia' ? (
                <Sparkles size={15} className="mt-0.5 shrink-0 text-indigo-500" />
              ) : (
                <TableProperties size={15} className="mt-0.5 shrink-0 text-amber-500" />
              )}
              <p className={cn('text-xs', data?.fuente === 'ia' ? 'text-indigo-700' : 'text-amber-700')}>
                {data?.fuente === 'ia'
                  ? 'Generados por IA con el contexto real de este encargo (sector, entendimiento y balance). Revisa cada uno con juicio profesional antes de agregarlo.'
                  : 'La IA no está disponible: estos riesgos vienen del catálogo típico del sector. Configura la API key para sugerencias con el contexto del encargo.'}
              </p>
            </div>

            <button
              onClick={() => setSel(todos ? new Set() : new Set(sugerencias.map((_, i) => i)))}
              className="text-xs text-indigo-600 hover:underline"
            >
              {todos ? 'Quitar selección' : 'Seleccionar todos'}
            </button>

            <div className="space-y-2">
              {sugerencias.map((s, i) => (
                <label
                  key={i}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                    sel.has(i) ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={sel.has(i)}
                    onChange={() => toggle(i)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="min-w-0">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-900">{AREA_LABEL[s.area]}</span>
                      <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold capitalize', NIVEL_BADGE[s.riesgoInherente])}>
                        {s.riesgoInherente}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{s.descripcion}</p>
                    {s.respuestaPlaneada && (
                      <p className="mt-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Respuesta propuesta:</span> {s.respuestaPlaneada}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {agregar.isError && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                {agregar.error instanceof Error ? agregar.error.message : 'Error al agregar'}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button loading={agregar.isPending} disabled={sel.size === 0} onClick={() => agregar.mutate()}>
                Agregar a la matriz {sel.size > 0 ? `(${sel.size})` : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
