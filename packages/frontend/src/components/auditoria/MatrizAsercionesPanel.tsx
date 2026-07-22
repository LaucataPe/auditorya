import { useQuery } from '@tanstack/react-query'
import { Check, Minus, X } from 'lucide-react'
import {
  construirMatrizAserciones, ASERCION_ABBR, ASERCION_LABEL,
  type EstadoCobertura, type NivelRiesgo,
} from '@auditorya/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { SubTab } from '../../lib/etapas-encargo'

type PapelFila = { area: string; titulo: string; estado: 'borrador' | 'en_revision' | 'aprobado' }
type RiesgoFila = { area: string; riesgoCombinado: NivelRiesgo }

const AREA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', cartera: 'Cartera', inventarios: 'Inventarios',
  propiedad_planta_equipo: 'Propiedad, planta y equipo', proveedores: 'Proveedores',
  nomina: 'Nómina', impuestos: 'Impuestos', ingresos: 'Ingresos', gastos: 'Gastos',
  patrimonio: 'Patrimonio', otro: 'Otro',
}

const NIVEL_DOT: Record<NivelRiesgo, string> = {
  alto: 'bg-red-500', medio: 'bg-amber-400', bajo: 'bg-emerald-400',
}

const CELDA: Record<EstadoCobertura, { icon: typeof Check; clase: string; titulo: string }> = {
  cubierta: { icon: Check, clase: 'text-emerald-600', titulo: 'Cubierta (papel aprobado)' },
  en_proceso: { icon: Minus, clase: 'text-amber-500', titulo: 'En proceso (papel sin aprobar)' },
  descubierta: { icon: X, clase: 'text-red-500', titulo: 'Sin prueba (hueco)' },
}

// Matriz de cobertura de aserciones (NIA 315/330) — vista transversal del encargo.
export function MatrizAsercionesPanel({
  auditoriaId, onIr,
}: {
  auditoriaId: string
  onIr: (paso: SubTab) => void
}) {
  const { data: papeles = [] } = useQuery<PapelFila[]>({
    queryKey: ['papeles', auditoriaId],
    queryFn: () => api.get<PapelFila[]>(`/auditorias/${auditoriaId}/papeles`),
  })
  const { data: riesgos = [] } = useQuery<RiesgoFila[]>({
    queryKey: ['riesgos', auditoriaId],
    queryFn: () => api.get<RiesgoFila[]>(`/auditorias/${auditoriaId}/riesgos`),
  })

  const m = construirMatrizAserciones(
    papeles.map((p) => ({ area: p.area as never, titulo: p.titulo, estado: p.estado })),
    riesgos.map((r) => ({ area: r.area as never, riesgoCombinado: r.riesgoCombinado })),
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Cobertura de aserciones</h3>
        <span className="text-xs text-gray-400">NIA 315/330</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Qué aserciones relevantes de cada área tienen prueba. Los huecos señalan cuentas sobre las que aún no se puede concluir.
      </p>

      {m.filas.length === 0 ? (
        <p className="text-xs text-gray-400 py-6 text-center">
          Identifica riesgos o crea papeles de trabajo para ver la cobertura por área.
        </p>
      ) : (
        <>
          {/* Resumen */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { label: 'Relevantes', value: m.resumen.relevantes, clase: 'text-gray-800' },
              { label: 'Cubiertas', value: m.resumen.cubiertas, clase: 'text-emerald-600' },
              { label: 'En proceso', value: m.resumen.enProceso, clase: 'text-amber-600' },
              { label: 'Sin prueba', value: m.resumen.descubiertas, clase: 'text-red-600' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 min-w-[72px]">
                <p className={cn('text-sm font-semibold tabular-nums', s.clase)}>{s.value}</p>
                <p className="text-[10px] text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Matriz */}
          <div className="overflow-x-auto">
            <table className="text-xs border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-2 py-1.5 text-left font-medium text-gray-500">Área</th>
                  {m.columnas.map((a) => (
                    <th key={a} className="px-2 py-1.5 font-medium text-gray-500 text-center whitespace-nowrap" title={ASERCION_LABEL[a] ?? a}>
                      {ASERCION_ABBR[a] ?? a}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.filas.map((f) => (
                  <tr key={f.area} className="hover:bg-gray-50/60">
                    <td className="sticky left-0 bg-white px-2 py-1.5 whitespace-nowrap">
                      <button onClick={() => onIr('papeles')} className="flex items-center gap-1.5 hover:text-indigo-600 text-gray-700">
                        {f.nivelMax && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', NIVEL_DOT[f.nivelMax])} title={`Riesgo ${f.nivelMax}`} />}
                        <span className="truncate max-w-[160px]">{AREA_LABEL[f.area] ?? f.area}</span>
                      </button>
                    </td>
                    {m.columnas.map((a) => {
                      const estado = f.celdas[a]
                      if (!estado) return <td key={a} className="px-2 py-1.5 text-center text-gray-200">·</td>
                      const { icon: Icon, clase, titulo } = CELDA[estado]
                      return (
                        <td key={a} className="px-2 py-1.5 text-center" title={`${ASERCION_LABEL[a] ?? a} — ${titulo}`}>
                          <Icon size={13} className={cn('inline', clase)} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-gray-400">
            <span className="flex items-center gap-1"><Check size={12} className="text-emerald-600" /> cubierta</span>
            <span className="flex items-center gap-1"><Minus size={12} className="text-amber-500" /> en proceso</span>
            <span className="flex items-center gap-1"><X size={12} className="text-red-500" /> sin prueba</span>
            <span className="text-gray-300">· cobertura derivada del catálogo de pruebas</span>
          </div>
        </>
      )}
    </div>
  )
}
