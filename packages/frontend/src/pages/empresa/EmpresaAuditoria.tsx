import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Lock, History, PartyPopper } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { EntendimientoTab } from '../../components/auditoria/EntendimientoTab'
import { BalanceTab } from '../../components/auditoria/BalanceTab'
import { MaterialidadTab } from '../../components/auditoria/MaterialidadTab'
import { RiesgosTab } from '../../components/auditoria/RiesgosTab'
import { TareasTab } from '../../components/auditoria/TareasTab'
import { PapelesTab } from '../../components/auditoria/PapelesTab'
import { PbcTab } from '../../components/auditoria/PbcTab'
import { CronogramaTab } from '../../components/auditoria/CronogramaTab'
import { MemoPlaneacionTab } from '../../components/auditoria/MemoPlaneacionTab'
import { CartaEncargoTab } from '../../components/auditoria/CartaEncargoTab'
import { ControlInternoTab } from '../../components/auditoria/ControlInternoTab'
import { InformesTab } from '../../components/auditoria/InformesTab'
import { CierreTab } from '../../components/auditoria/CierreTab'
import { ResumenTab } from '../../components/auditoria/ResumenTab'
import { AlcanceTab } from '../../components/auditoria/ai/AlcanceTab'
import { ProgramasTab } from '../../components/auditoria/ai/ProgramasTab'
import { HallazgosTab } from '../../components/auditoria/ai/HallazgosTab'
import { InformeAITab } from '../../components/auditoria/ai/InformeAITab'
import { PanelDerecho } from '../../components/auditoria/PanelDerecho'
import { AsistenteIA } from '../../components/auditoria/AsistenteIA'
import { ActividadModal } from '../../components/auditoria/ActividadModal'
import {
  tabsPorServicio, FASE_ID, TIPO_LABEL, SERVICIO_LABEL,
  type SubTab, type FaseNombre,
} from '../../lib/etapas-encargo'
import { construirGuia, type SignalsProgreso } from '@auditorya/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type FaseAuditoria = 'planificacion' | 'ejecucion' | 'revision' | 'finalizada'
type TipoAuditoria = 'financiera' | 'integral' | 'especial'
type TipoServicio = 'revisoria_fiscal' | 'auditoria_interna'

type Auditoria = {
  id: string
  fechaInicio: string
  fechaFin: string
  tipoServicio: TipoServicio
  tipo: TipoAuditoria | null
  estado: FaseAuditoria
  materialidadAprobada: boolean
  empresa: { id: string; nombre: string; sector: string }
}

/** Texto del período del encargo a partir de sus fechas, p. ej. "01 ene. 2025 – 31 dic. 2025". */
function formatearPeriodo(fechaInicio?: string | null, fechaFin?: string | null): string {
  if (!fechaInicio || !fechaFin) return ''
  const f = (d: string) =>
    new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  return `${f(fechaInicio)} – ${f(fechaFin)}`
}

const FASE_LABEL: Record<FaseAuditoria, string> = {
  planificacion: 'Planificación',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizada: 'Finalizada',
}

const FASE_BADGE: Record<FaseAuditoria, string> = {
  planificacion: 'bg-indigo-50 text-indigo-700',
  ejecucion: 'bg-amber-50 text-amber-700',
  revision: 'bg-violet-50 text-violet-700',
  finalizada: 'bg-emerald-50 text-emerald-700',
}

export function EmpresaAuditoria() {
  const { id, auditoriaId } = useParams<{ id: string; auditoriaId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const pasoParam = searchParams.get('paso')
  const [actividadOpen, setActividadOpen] = useState(false)

  const { data: auditoria, isLoading, isError } = useQuery<Auditoria>({
    queryKey: ['auditoria', auditoriaId],
    queryFn: () => api.get<Auditoria>(`/auditorias/${auditoriaId}`),
    enabled: !!auditoriaId,
    retry: false,
  })

  const { data: signals } = useQuery<SignalsProgreso>({
    queryKey: ['progreso', auditoriaId],
    queryFn: () => api.get<SignalsProgreso>(`/auditorias/${auditoriaId}/progreso`),
    enabled: !!auditoriaId,
  })

  const avanzarMutation = useMutation({
    mutationFn: () => api.put(`/auditorias/${auditoriaId}`, { estado: 'ejecucion' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditoria', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['auditorias', id] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
    },
  })

  // Refresca el progreso (sidebar + panel) al cambiar de paso, tras trabajar en uno.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
  }, [pasoParam, queryClient, auditoriaId])

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (isError || !auditoria) {
    return (
      <div className="p-8 text-sm text-gray-500">
        Auditoría no encontrada.{' '}
        <button onClick={() => navigate(`/empresas/${id}/encargos`)} className="text-indigo-600 underline">
          Volver a encargos
        </button>
      </div>
    )
  }

  const esAI = auditoria.tipoServicio === 'auditoria_interna'
  const tabs = tabsPorServicio(auditoria.tipoServicio)
  const enPlanificacion = auditoria.estado === 'planificacion'
  const puedeAvanzar = esAI ? true : auditoria.materialidadAprobada

  // El paso activo vive en la URL (?paso=). Por defecto (o si es inválido) → 'resumen' (dashboard).
  const tabActivo: SubTab = pasoParam === 'resumen'
    ? 'resumen'
    : tabs.find((t) => t.id === pasoParam) ? (pasoParam as SubTab) : 'resumen'
  const setTab = (t: SubTab) => {
    const next = new URLSearchParams(searchParams)
    next.set('paso', t)
    setSearchParams(next, { replace: true })
  }

  const guia = signals ? construirGuia(signals) : null
  const siguiente = guia?.siguientePaso ?? null

  const pasoActual = tabs.find((t) => t.id === tabActivo)
  const PasoIcon = pasoActual?.icon
  const pasoLabel = pasoActual?.label ?? ''
  const faseActiva: FaseNombre = pasoActual?.grupo ?? 'Planificación'
  const faseItems = guia?.fases.find((f) => f.id === FASE_ID[faseActiva])?.items ?? []

  const titulo = auditoria.tipo
    ? TIPO_LABEL[auditoria.tipo]
    : SERVICIO_LABEL[auditoria.tipoServicio ?? 'revisoria_fiscal']

  const periodo = formatearPeriodo(auditoria.fechaInicio, auditoria.fechaFin)

  return (
    <div className="p-8 space-y-6">
      {/* Actividad (pista de auditoría) */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setActividadOpen(true)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          title="Pista de auditoría del encargo"
        >
          <History size={13} /> Actividad
        </button>
      </div>

      {/* Encabezado del encargo */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">Período {periodo}</span>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', FASE_BADGE[auditoria.estado])}>
              {FASE_LABEL[auditoria.estado]}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{auditoria.empresa.nombre}</p>
        </div>

        {enPlanificacion && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!puedeAvanzar || avanzarMutation.isPending}
              loading={avanzarMutation.isPending}
              onClick={() => avanzarMutation.mutate()}
            >
              {puedeAvanzar ? <ArrowRight size={14} /> : <Lock size={14} />}
              Pasar a ejecución
            </Button>
            {!puedeAvanzar && (
              <p className="text-xs text-gray-400">Requiere materialidad aprobada</p>
            )}
          </div>
        )}
      </div>

      {avanzarMutation.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {avanzarMutation.error instanceof Error ? avanzarMutation.error.message : 'Error al avanzar de fase'}
        </p>
      )}

      {/* Vista de inicio (dashboard) o el paso activo */}
      {tabActivo === 'resumen' ? (
        <ResumenTab auditoriaId={auditoria.id} tipoServicio={auditoria.tipoServicio} onIr={setTab} />
      ) : (
      /* Workspace: contenido (centro) + panel de apoyo (derecha) */
      <div className="flex gap-6 items-start">
        <div className="min-w-0 flex-1 space-y-5">
          {/* Siguiente paso sugerido por la guía */}
          {siguiente ? (
            <button
              onClick={() => setTab(siguiente.tab as SubTab)}
              className="w-full flex items-center justify-between gap-3 rounded-xl bg-indigo-600 px-4 py-3 text-left hover:bg-indigo-700 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <ArrowRight size={20} className="text-indigo-200 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-indigo-200">Tu siguiente paso</p>
                  <p className="text-sm font-semibold text-white truncate">{siguiente.label}</p>
                </div>
              </div>
              <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/15 text-white shrink-0">Ir ahora</span>
            </button>
          ) : guia ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <PartyPopper size={18} className="text-emerald-500 shrink-0" />
              <p className="text-sm font-medium text-emerald-800">
                Completaste todos los pasos requeridos. El encargo está listo.
              </p>
            </div>
          ) : null}

          {/* Título del paso activo */}
          <div className="flex items-center gap-2.5">
            {PasoIcon && <PasoIcon size={18} className="text-indigo-500 shrink-0" />}
            <h2 className="text-lg font-semibold text-gray-900">{pasoLabel}</h2>
          </div>

          {/* Contenido RF */}
          {!esAI && tabActivo === 'carta_encargo' && (
            <CartaEncargoTab
              auditoriaId={auditoria.id}
              empresaNombre={auditoria.empresa.nombre}
              periodo={periodo}
            />
          )}
          {!esAI && tabActivo === 'entendimiento' && (
            <EntendimientoTab auditoriaId={auditoria.id} empresaId={auditoria.empresa.id} />
          )}
          {!esAI && tabActivo === 'balance' && <BalanceTab auditoriaId={auditoria.id} />}
          {!esAI && tabActivo === 'materialidad' && <MaterialidadTab auditoriaId={auditoria.id} />}
          {!esAI && tabActivo === 'riesgos' && (
            <RiesgosTab auditoriaId={auditoria.id} sector={auditoria.empresa.sector} materialidadAprobada={auditoria.materialidadAprobada} />
          )}
          {!esAI && tabActivo === 'tareas' && (
            <TareasTab auditoriaId={auditoria.id} materialidadAprobada={auditoria.materialidadAprobada} />
          )}
          {!esAI && tabActivo === 'papeles' && (
            <PapelesTab auditoriaId={auditoria.id} materialidadAprobada={auditoria.materialidadAprobada} />
          )}
          {!esAI && tabActivo === 'pbc' && (
            <PbcTab
              auditoriaId={auditoria.id}
              materialidadAprobada={auditoria.materialidadAprobada}
              empresaNombre={auditoria.empresa.nombre}
              periodo={periodo}
            />
          )}
          {!esAI && tabActivo === 'cronograma' && (
            <CronogramaTab auditoriaId={auditoria.id} />
          )}
          {!esAI && tabActivo === 'memo' && (
            <MemoPlaneacionTab
              auditoriaId={auditoria.id}
              empresaNombre={auditoria.empresa.nombre}
              periodo={periodo}
            />
          )}
          {!esAI && tabActivo === 'control_interno' && (
            <ControlInternoTab auditoriaId={auditoria.id} />
          )}
          {!esAI && tabActivo === 'informes' && (
            <InformesTab
              auditoriaId={auditoria.id}
              materialidadAprobada={auditoria.materialidadAprobada}
              empresaNombre={auditoria.empresa.nombre}
              periodo={periodo}
            />
          )}
          {!esAI && tabActivo === 'cierre' && (
            <CierreTab auditoriaId={auditoria.id} />
          )}

          {/* Contenido AI */}
          {esAI && tabActivo === 'alcance' && <AlcanceTab auditoriaId={auditoria.id} />}
          {esAI && tabActivo === 'programas' && <ProgramasTab auditoriaId={auditoria.id} />}
          {esAI && tabActivo === 'hallazgos' && <HallazgosTab auditoriaId={auditoria.id} />}
          {esAI && tabActivo === 'informe_ai' && (
            <InformeAITab
              auditoriaId={auditoria.id}
              empresaNombre={auditoria.empresa.nombre}
              periodo={periodo}
            />
          )}
        </div>

        {/* Panel de apoyo: checklist de la etapa + normativa/tips (derecha) */}
        <div className="sticky top-8">
          <PanelDerecho
            faseLabel={faseActiva}
            items={faseItems}
            onIr={(t) => setTab(t as SubTab)}
            pasoActivo={tabActivo}
            pasoLabel={pasoLabel}
          />
        </div>
      </div>
      )}

      {actividadOpen && (
        <ActividadModal auditoriaId={auditoria.id} onClose={() => setActividadOpen(false)} />
      )}

      {/* Asistente NIA flotante (solo si la IA está disponible) */}
      <AsistenteIA auditoriaId={auditoria.id} />
    </div>
  )
}
