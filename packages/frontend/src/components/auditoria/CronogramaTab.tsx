import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ListTodo, FileText, CalendarClock, AlertTriangle } from 'lucide-react'
import type { ItemCronograma, EstadoCronograma } from '@auditorya/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Usuario = { id: string; nombre: string }

const AREA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', cartera: 'Cartera', inventarios: 'Inventarios',
  propiedad_planta_equipo: 'PP&E', proveedores: 'Proveedores', nomina: 'Nómina',
  impuestos: 'Impuestos', ingresos: 'Ingresos', gastos: 'Gastos',
  patrimonio: 'Patrimonio', otro: 'Otro',
}

const ESTADO_LABEL: Record<EstadoCronograma, string> = {
  pendiente: 'Pendiente', en_progreso: 'En progreso', completado: 'Completado',
}
const ESTADO_BARRA: Record<EstadoCronograma, string> = {
  pendiente: 'bg-indigo-400', en_progreso: 'bg-amber-400', completado: 'bg-emerald-500',
}

const DIA = 86_400_000

function toInputDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}
function fromInputDate(d: string): string {
  return d ? new Date(`${d}T00:00:00Z`).toISOString() : ''
}
function fmtCorto(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
}
function estaVencido(item: ItemCronograma): boolean {
  return !!item.fechaFin && item.estado !== 'completado' && new Date(item.fechaFin).getTime() < Date.now()
}

// El cronograma es un paso de PLANIFICACIÓN (NIA 300 — oportunidad): no se bloquea
// por materialidad. Antes de la ejecución simplemente estará vacío.
export function CronogramaTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()

  const { data: items = [], isLoading } = useQuery<ItemCronograma[]>({
    queryKey: ['cronograma', auditoriaId],
    queryFn: () => api.get<ItemCronograma[]>(`/auditorias/${auditoriaId}/cronograma`),
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>(`/firmas/mia/usuarios`),
  })

  const guardar = useMutation({
    mutationFn: ({ item, campo, valor }: { item: ItemCronograma; campo: 'fechaInicio' | 'fechaFin' | 'responsable'; valor: string }) => {
      const endpoint = item.tipo === 'tarea' ? `/tareas/${item.id}` : `/papeles/${item.id}`
      const body: Record<string, string> = {}
      if (campo === 'fechaInicio') body.fechaInicio = fromInputDate(valor)
      else if (campo === 'fechaFin') body[item.tipo === 'tarea' ? 'vencimiento' : 'fechaFin'] = fromInputDate(valor)
      else body.asignadoA = valor
      return api.put(endpoint, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cronograma', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['tareas', auditoriaId] })
    },
  })

  const agendados = items.filter((i) => i.fechaInicio && i.fechaFin)
  const sinAgendar = items.filter((i) => !i.fechaInicio || !i.fechaFin)
  const vencidos = items.filter(estaVencido).length

  // Rango del timeline
  const { min, span, meses } = useMemo(() => {
    if (agendados.length === 0) return { min: 0, span: 1, meses: [] as { label: string; pct: number }[] }
    const starts = agendados.map((i) => new Date(i.fechaInicio!).getTime())
    const ends = agendados.map((i) => new Date(i.fechaFin!).getTime())
    const min = Math.min(...starts) - 2 * DIA
    const max = Math.max(...ends) + 2 * DIA
    const span = Math.max(max - min, DIA)
    // Marcas de inicio de mes dentro del rango
    const meses: { label: string; pct: number }[] = []
    const d = new Date(min)
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    while (d.getTime() < max) {
      meses.push({
        label: d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }),
        pct: ((d.getTime() - min) / span) * 100,
      })
      d.setMonth(d.getMonth() + 1)
    }
    return { min, span, meses }
  }, [agendados])

  return (
    <div className="space-y-5">

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <ResumenCard label="Agendados" valor={agendados.length} color="text-indigo-600" />
        <ResumenCard label="Sin fecha" valor={sinAgendar.length} color="text-gray-500" />
        <ResumenCard label="Vencidos" valor={vencidos} color="text-red-600" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <CalendarClock size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Aún no hay tareas ni pruebas</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">
            Crea tareas y pruebas en Ejecución (o pruebas desde un riesgo) y agéndalas aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Timeline visual */}
          {agendados.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 overflow-hidden">
              {/* Cabecera de meses */}
              <div className="relative ml-48 h-4 mb-1 border-b border-gray-100">
                {meses.map((m, i) => (
                  <span key={i} className="absolute -top-0.5 text-[10px] text-gray-400 -translate-x-1/2" style={{ left: `${m.pct}%` }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="space-y-1.5">
                {agendados.map((it) => {
                  const start = new Date(it.fechaInicio!).getTime()
                  const end = new Date(it.fechaFin!).getTime()
                  const left = ((start - min) / span) * 100
                  const width = Math.max(((end - start) / span) * 100, 1.5)
                  const vencido = estaVencido(it)
                  return (
                    <div key={`${it.tipo}-${it.id}`} className="flex items-center gap-2">
                      <div className="w-48 shrink-0 flex items-center gap-1.5 min-w-0">
                        {it.tipo === 'tarea' ? <ListTodo size={12} className="text-amber-500 shrink-0" /> : <FileText size={12} className="text-indigo-500 shrink-0" />}
                        <span className="text-xs text-gray-700 truncate" title={it.titulo}>{it.titulo}</span>
                      </div>
                      <div className="relative flex-1 h-5">
                        {/* gridlines de meses */}
                        {meses.map((m, i) => (
                          <span key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: `${m.pct}%` }} />
                        ))}
                        <div
                          className={cn('absolute top-0.5 h-4 rounded-md', vencido ? 'bg-red-400' : ESTADO_BARRA[it.estado])}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${fmtCorto(it.fechaInicio)} → ${fmtCorto(it.fechaFin)} · ${ESTADO_LABEL[it.estado]}${vencido ? ' · vencido' : ''}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Tabla editable */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400 text-left">
                  <th className="px-3 py-2 font-medium">Actividad</th>
                  <th className="px-3 py-2 font-medium">Responsable</th>
                  <th className="px-3 py-2 font-medium">Inicio</th>
                  <th className="px-3 py-2 font-medium">Fin</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const vencido = estaVencido(it)
                  return (
                    <tr key={`${it.tipo}-${it.id}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {it.tipo === 'tarea' ? <ListTodo size={13} className="text-amber-500 shrink-0" /> : <FileText size={13} className="text-indigo-500 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-gray-800 truncate">{it.titulo}</p>
                            <p className="text-[11px] text-gray-400">
                              {AREA_LABEL[it.area] ?? it.area} · {ESTADO_LABEL[it.estado]}
                              {vencido && <span className="text-red-500 inline-flex items-center gap-0.5 ml-1"><AlertTriangle size={10} /> vencido</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                          value={it.responsable ?? ''}
                          onChange={(e) => guardar.mutate({ item: it, campo: 'responsable', valor: e.target.value })}
                        >
                          {it.tipo === 'prueba' && <option value="">— Sin asignar</option>}
                          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                          value={toInputDate(it.fechaInicio)}
                          onChange={(e) => guardar.mutate({ item: it, campo: 'fechaInicio', valor: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          className={cn('rounded-md border px-2 py-1 text-xs focus:outline-none', vencido ? 'border-red-300 text-red-600' : 'border-gray-200 focus:border-indigo-400')}
                          value={toInputDate(it.fechaFin)}
                          onChange={(e) => guardar.mutate({ item: it, campo: 'fechaFin', valor: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            Las fechas y responsables también se pueden fijar desde cada tarea y papel de trabajo.
          </p>
        </>
      )}
    </div>
  )
}

function ResumenCard({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className={cn('text-2xl font-bold', color)}>{valor}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
