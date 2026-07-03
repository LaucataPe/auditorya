import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '../../ui/Button'
import { api } from '../../../lib/api'
import { cn } from '../../../lib/cn'

type ProgramaAI = { id: string; area: string; estado: string }

const AREAS_SUGERIDAS = [
  { area: 'Nómina y Recursos Humanos', descripcion: 'Liquidación, pagos, contratación y desvinculación' },
  { area: 'Tesorería y Efectivo', descripcion: 'Conciliaciones bancarias, pagos, custodia de fondos' },
  { area: 'Compras y Proveedores', descripcion: 'Proceso de selección, órdenes de compra, pagos' },
  { area: 'Inventarios y Activos Fijos', descripcion: 'Conteo físico, baja de activos, depreciación' },
  { area: 'Tecnología de la Información', descripcion: 'Controles de acceso, backups, seguridad IT' },
  { area: 'Ventas e Ingresos', descripcion: 'Facturación, cobros, descuentos y devoluciones' },
  { area: 'Contabilidad y Reportes', descripcion: 'Cierres, estimaciones, revelaciones financieras' },
  { area: 'Cumplimiento Regulatorio', descripcion: 'Obligaciones legales, tributarias y sectoriales' },
  { area: 'Contratos y Licitaciones', descripcion: 'Proceso de contratación, modificaciones, otrosíes' },
  { area: 'Gestión de Riesgos', descripcion: 'Identificación, evaluación y respuesta a riesgos' },
]

export function AlcanceTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [areaPersonalizada, setAreaPersonalizada] = useState('')

  const { data: programas = [], isLoading } = useQuery<ProgramaAI[]>({
    queryKey: ['programas-ai', auditoriaId],
    queryFn: () =>
      api.get<{ programa: ProgramaAI }[]>(`/auditorias/${auditoriaId}/ai/programas`).then((r) =>
        r.map((x) => x.programa),
      ),
  })

  const areasEnPlan = new Set(programas.map((p) => p.area))

  const addMutation = useMutation({
    mutationFn: (area: string) =>
      api.post(`/auditorias/${auditoriaId}/ai/programas`, { area }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programas-ai', auditoriaId] })
      setSeleccionadas(new Set())
      setAreaPersonalizada('')
    },
  })

  function toggleArea(area: string) {
    const s = new Set(seleccionadas)
    if (s.has(area)) s.delete(area)
    else s.add(area)
    setSeleccionadas(s)
  }

  async function agregarSeleccionadas() {
    const nuevas = [...seleccionadas].filter((a) => !areasEnPlan.has(a))
    for (const area of nuevas) {
      await addMutation.mutateAsync(area)
    }
  }

  async function agregarPersonalizada() {
    const area = areaPersonalizada.trim()
    if (!area || areasEnPlan.has(area)) return
    await addMutation.mutateAsync(area)
  }

  return (
    <div className="space-y-6">

      {/* Áreas ya en el plan */}
      {programas.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Áreas en el plan ({programas.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {programas.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-purple-100 text-purple-800"
              >
                <CheckCircle2 size={12} /> {p.area}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Selector de áreas estándar */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Áreas estándar de Auditoría Interna
        </p>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {AREAS_SUGERIDAS.map(({ area, descripcion }) => {
              const enPlan = areasEnPlan.has(area)
              const marcada = seleccionadas.has(area)
              return (
                <button
                  key={area}
                  disabled={enPlan}
                  onClick={() => toggleArea(area)}
                  className={cn(
                    'text-left px-4 py-3 rounded-xl border transition-all',
                    enPlan
                      ? 'border-purple-200 bg-purple-50 opacity-60 cursor-not-allowed'
                      : marcada
                      ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-300'
                      : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/50',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                        enPlan
                          ? 'border-purple-400 bg-purple-400'
                          : marcada
                          ? 'border-purple-600 bg-purple-600'
                          : 'border-gray-300',
                      )}
                    >
                      {(enPlan || marcada) && (
                        <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="none">
                          <path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{area}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{descripcion}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {seleccionadas.size > 0 && (
          <Button
            size="sm"
            className="mt-4 gap-2"
            loading={addMutation.isPending}
            onClick={agregarSeleccionadas}
          >
            <Plus size={14} />
            Agregar {seleccionadas.size} área{seleccionadas.size !== 1 ? 's' : ''} al plan
          </Button>
        )}
      </div>

      {/* Área personalizada */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Área personalizada
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nombre del área o proceso a auditar..."
            value={areaPersonalizada}
            onChange={(e) => setAreaPersonalizada(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && agregarPersonalizada()}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!areaPersonalizada.trim() || areasEnPlan.has(areaPersonalizada.trim())}
            loading={addMutation.isPending}
            onClick={agregarPersonalizada}
          >
            <Target size={14} />
            Agregar
          </Button>
        </div>
      </div>
    </div>
  )
}
