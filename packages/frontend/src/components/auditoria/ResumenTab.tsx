import { useQuery } from '@tanstack/react-query'
import {
  construirGuia, type SignalsProgreso,
  type ItemCronograma, type SolicitudPbcConPapel, type NotaRevisionConPapel, type NivelRiesgo,
} from '@auditorya/types'
import {
  ArrowRight, ShieldAlert, ListTodo, FileText, Inbox, MessageSquare, Calculator,
  BookOpen, AlertOctagon, AlertTriangle, CheckCircle, ChevronRight,
} from 'lucide-react'
import { MapaCalorRiesgos } from './MapaCalorRiesgos'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { SubTab } from '../../lib/etapas-encargo'

type RiesgoNivel = { riesgoInherente: NivelRiesgo; riesgoControl: NivelRiesgo }

export function ResumenTab({
  auditoriaId,
  tipoServicio,
  onIr,
}: {
  auditoriaId: string
  tipoServicio: string
  onIr: (paso: SubTab) => void
}) {
  const esAI = tipoServicio === 'auditoria_interna'

  const { data: signals } = useQuery<SignalsProgreso>({
    queryKey: ['progreso', auditoriaId],
    queryFn: () => api.get<SignalsProgreso>(`/auditorias/${auditoriaId}/progreso`),
  })
  const { data: riesgos = [] } = useQuery<RiesgoNivel[]>({
    queryKey: ['riesgos', auditoriaId],
    queryFn: () => api.get<RiesgoNivel[]>(`/auditorias/${auditoriaId}/riesgos`),
    enabled: !esAI,
  })
  const { data: cronograma = [] } = useQuery<ItemCronograma[]>({
    queryKey: ['cronograma', auditoriaId],
    queryFn: () => api.get<ItemCronograma[]>(`/auditorias/${auditoriaId}/cronograma`),
    enabled: !esAI,
  })
  const { data: pbc = [] } = useQuery<SolicitudPbcConPapel[]>({
    queryKey: ['pbc', auditoriaId],
    queryFn: () => api.get<SolicitudPbcConPapel[]>(`/auditorias/${auditoriaId}/pbc`),
    enabled: !esAI,
  })
  const { data: notas = [] } = useQuery<NotaRevisionConPapel[]>({
    queryKey: ['notas-revision', auditoriaId],
    queryFn: () => api.get<NotaRevisionConPapel[]>(`/auditorias/${auditoriaId}/notas-revision`),
    enabled: !esAI,
  })

  const guia = signals ? construirGuia(signals) : null

  if (!signals || !guia) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const faseActual = guia.fases.find((f) => f.estado === 'actual')
  const vencidos = cronograma.filter((i) => i.fechaFin && i.estado !== 'completado' && new Date(i.fechaFin).getTime() < Date.now()).length
  const pbcPendientes = pbc.filter((s) => s.estado === 'solicitado').length
  const pbcRecibidos = pbc.filter((s) => s.estado === 'recibido').length
  const notasAbiertas = notas.filter((n) => n.estado === 'abierta').length

  // Alertas / pendientes (RF)
  const alertas: { texto: string; paso: SubTab }[] = []
  if (!esAI) {
    if (signals.riesgosAltosSinRespuesta > 0) alertas.push({ texto: `${signals.riesgosAltosSinRespuesta} riesgo(s) alto(s) sin respuesta planeada`, paso: 'riesgos' })
    if (signals.materialidadCalculada && !signals.materialidadAprobada) alertas.push({ texto: 'Materialidad calculada pendiente de aprobación', paso: 'materialidad' })
    if (pbcPendientes > 0) alertas.push({ texto: `${pbcPendientes} documento(s) pendiente(s) del cliente`, paso: 'pbc' })
    if (vencidos > 0) alertas.push({ texto: `${vencidos} actividad(es) del cronograma vencida(s)`, paso: 'cronograma' })
    if (signals.papelesTotal > 0 && signals.papelesAprobados < signals.papelesTotal) alertas.push({ texto: `${signals.papelesTotal - signals.papelesAprobados} papel(es) sin aprobar`, paso: 'papeles' })
    if (notasAbiertas > 0) alertas.push({ texto: `${notasAbiertas} nota(s) de revisión abierta(s)`, paso: 'cierre' })
    if (signals.materialidadAprobada && signals.informes['dictamen'] !== 'aprobado') alertas.push({ texto: 'Dictamen pendiente de generar/aprobar', paso: 'informes' })
  } else {
    if (signals.programasTotal === 0) alertas.push({ texto: 'Aún no hay programas de trabajo definidos', paso: 'alcance' as SubTab })
    if (signals.hallazgosTotal === 0) alertas.push({ texto: 'Aún no se han documentado hallazgos', paso: 'hallazgos' as SubTab })
    if (signals.informes['informe_ai'] !== 'aprobado') alertas.push({ texto: 'Informe de auditoría interna pendiente', paso: 'informe_ai' as SubTab })
  }

  return (
    <div className="space-y-6">
      {/* Progreso global + siguiente paso */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400">Progreso global · {faseActual ? faseActual.label : guia.completa ? 'Completado' : 'En curso'}</p>
            <p className="text-3xl font-bold text-gray-900 tabular-nums mt-0.5">{guia.progresoGlobal}%</p>
          </div>
          {guia.siguientePaso ? (
            <button
              onClick={() => onIr(guia.siguientePaso!.tab as SubTab)}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shrink-0"
            >
              <div className="text-left">
                <span className="block text-[10px] uppercase tracking-wide text-indigo-200">Siguiente paso</span>
                <span className="block">{guia.siguientePaso.label}</span>
              </div>
              <ArrowRight size={16} />
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 shrink-0">
              <CheckCircle size={16} /> Todo al día
            </span>
          )}
        </div>

        {/* Barras por fase */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {guia.fases.map((f) => (
            <div key={f.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">{f.label}</span>
                <span className="text-xs text-gray-400 tabular-nums">{Math.round(f.progreso * 100)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn('h-full rounded-full', f.estado === 'completa' ? 'bg-emerald-500' : f.estado === 'actual' ? 'bg-indigo-500' : 'bg-gray-300')}
                  style={{ width: `${Math.round(f.progreso * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {esAI ? (
          <>
            <Kpi icon={BookOpen} label="Programas" valor={`${signals.programasCompletados}/${signals.programasTotal}`} sub="completados" onClick={() => onIr('programas' as SubTab)} />
            <Kpi icon={AlertOctagon} label="Hallazgos" valor={String(signals.hallazgosTotal)} onClick={() => onIr('hallazgos' as SubTab)} />
            <Kpi icon={FileText} label="Informe" valor={signals.informes['informe_ai'] === 'aprobado' ? 'Aprobado' : signals.informes['informe_ai'] ? 'Borrador' : '—'} onClick={() => onIr('informe_ai' as SubTab)} />
          </>
        ) : (
          <>
            <Kpi icon={ShieldAlert} label="Riesgos" valor={String(signals.riesgosTotal)} sub={`${signals.riesgosAltos} alto(s)`} accent={signals.riesgosAltos > 0 ? 'text-red-600' : undefined} onClick={() => onIr('riesgos')} />
            <Kpi icon={ListTodo} label="Tareas" valor={`${signals.tareasCompletadas}/${signals.tareasTotal}`} sub={vencidos > 0 ? `${vencidos} vencida(s)` : 'al día'} accent={vencidos > 0 ? 'text-red-600' : undefined} onClick={() => onIr('tareas')} />
            <Kpi icon={FileText} label="Papeles" valor={`${signals.papelesAprobados}/${signals.papelesTotal}`} sub="aprobados" onClick={() => onIr('papeles')} />
            <Kpi icon={Inbox} label="Documentos" valor={`${pbcRecibidos}/${pbc.length}`} sub={pbcPendientes > 0 ? `${pbcPendientes} pendiente(s)` : 'recibidos'} accent={pbcPendientes > 0 ? 'text-amber-600' : undefined} onClick={() => onIr('pbc')} />
            <Kpi icon={MessageSquare} label="Notas de revisión" valor={String(notasAbiertas)} sub="abiertas" accent={notasAbiertas > 0 ? 'text-amber-600' : undefined} onClick={() => onIr('cierre')} />
            <Kpi icon={Calculator} label="Materialidad" valor={signals.materialidadAprobada ? 'Aprobada' : signals.materialidadCalculada ? 'Pendiente' : '—'} accent={signals.materialidadAprobada ? 'text-emerald-600' : undefined} onClick={() => onIr('materialidad')} />
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Mapa de calor (solo RF) */}
        {!esAI && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Mapa de calor de riesgos</h3>
              <span className="text-xs text-gray-400">{signals.riesgosTotal} riesgo(s)</span>
            </div>
            {signals.riesgosTotal === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">Identifica riesgos para ver su distribución por nivel.</p>
            ) : (
              <MapaCalorRiesgos riesgos={riesgos} onCeldaClick={() => onIr('riesgos')} />
            )}
          </div>
        )}

        {/* Pendientes / alertas */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Pendientes</h3>
          {alertas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle size={28} className="text-emerald-400 mb-2" />
              <p className="text-sm text-gray-500">Nada pendiente por ahora.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {alertas.map((a, i) => (
                <button
                  key={i}
                  onClick={() => onIr(a.paso)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <span className="text-sm text-gray-700 flex-1">{a.texto}</span>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({
  icon: Icon, label, valor, sub, accent, onClick,
}: {
  icon: React.ElementType
  label: string
  valor: string
  sub?: string
  accent?: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-left hover:border-indigo-200 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        <Icon size={13} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn('text-xl font-bold tabular-nums', accent ?? 'text-gray-900')}>{valor}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </button>
  )
}
