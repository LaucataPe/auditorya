import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Calculator, ShieldAlert, Lock, FileText, ClipboardCheck, ListTodo, FileCheck2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { MaterialidadTab } from '../../components/auditoria/MaterialidadTab'
import { RiesgosTab } from '../../components/auditoria/RiesgosTab'
import { TareasTab } from '../../components/auditoria/TareasTab'
import { PapelesTab } from '../../components/auditoria/PapelesTab'
import { ControlInternoTab } from '../../components/auditoria/ControlInternoTab'
import { InformesTab } from '../../components/auditoria/InformesTab'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type FaseAuditoria = 'planificacion' | 'ejecucion' | 'revision' | 'finalizada'
type TipoAuditoria = 'financiera' | 'integral' | 'especial'

type Auditoria = {
  id: string
  periodo: string
  tipo: TipoAuditoria
  estado: FaseAuditoria
  materialidadAprobada: boolean
  empresa: { id: string; nombre: string; sector: string }
}

const TIPO_LABEL: Record<TipoAuditoria, string> = {
  financiera: 'Auditoría financiera',
  integral: 'Auditoría integral',
  especial: 'Auditoría especial',
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

type SubTab = 'materialidad' | 'riesgos' | 'tareas' | 'papeles' | 'control_interno' | 'informes'

export function EmpresaAuditoria() {
  const { id, auditoriaId } = useParams<{ id: string; auditoriaId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<SubTab>('materialidad')

  const { data: auditoria, isLoading, isError } = useQuery<Auditoria>({
    queryKey: ['auditoria', auditoriaId],
    queryFn: () => api.get<Auditoria>(`/auditorias/${auditoriaId}`),
    enabled: !!auditoriaId,
    retry: false,
  })

  const avanzarMutation = useMutation({
    mutationFn: () => api.put(`/auditorias/${auditoriaId}`, { estado: 'ejecucion' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditoria', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['auditorias', id] })
    },
  })

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

  const enPlanificacion = auditoria.estado === 'planificacion'

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {/* Volver */}
      <button
        onClick={() => navigate(`/empresas/${id}/encargos`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={15} /> Encargos
      </button>

      {/* Encabezado */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">Período {auditoria.periodo}</span>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', FASE_BADGE[auditoria.estado])}>
              {FASE_LABEL[auditoria.estado]}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{TIPO_LABEL[auditoria.tipo]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{auditoria.empresa.nombre}</p>
        </div>

        {/* Avanzar a ejecución (Fase 4) — solo si la materialidad está aprobada */}
        {enPlanificacion && (
          <div className="flex flex-col items-end gap-1">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!auditoria.materialidadAprobada || avanzarMutation.isPending}
              loading={avanzarMutation.isPending}
              onClick={() => avanzarMutation.mutate()}
            >
              {auditoria.materialidadAprobada ? <ArrowRight size={14} /> : <Lock size={14} />}
              Pasar a ejecución
            </Button>
            {!auditoria.materialidadAprobada && (
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

      {/* Sub-tabs: planificación + ejecución */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 flex-wrap">
          {([
            { id: 'materialidad', label: 'Materialidad', icon: Calculator, grupo: 'Planificación' },
            { id: 'riesgos', label: 'Riesgos', icon: ShieldAlert, grupo: 'Planificación' },
            { id: 'tareas', label: 'Tareas', icon: ListTodo, grupo: 'Ejecución' },
            { id: 'papeles', label: 'Papeles de trabajo', icon: FileText, grupo: 'Ejecución' },
            { id: 'control_interno', label: 'Control interno', icon: ClipboardCheck, grupo: 'Ejecución' },
            { id: 'informes', label: 'Informes', icon: FileCheck2, grupo: 'Informes' },
          ] as const).map((t) => {
            const Icon = t.icon
            const bloqueado = t.grupo !== 'Planificación' && !auditoria.materialidadAprobada
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  tab === t.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                )}
              >
                {bloqueado ? <Lock size={13} /> : <Icon size={14} />}
                {t.label}
              </button>
            )
          })}
        </nav>
      </div>

      {tab === 'materialidad' && <MaterialidadTab auditoriaId={auditoria.id} />}
      {tab === 'riesgos' && <RiesgosTab auditoriaId={auditoria.id} sector={auditoria.empresa.sector} />}
      {tab === 'tareas' && (
        <TareasTab auditoriaId={auditoria.id} materialidadAprobada={auditoria.materialidadAprobada} />
      )}
      {tab === 'papeles' && (
        <PapelesTab auditoriaId={auditoria.id} materialidadAprobada={auditoria.materialidadAprobada} />
      )}
      {tab === 'control_interno' && (
        <ControlInternoTab auditoriaId={auditoria.id} materialidadAprobada={auditoria.materialidadAprobada} />
      )}
      {tab === 'informes' && (
        <InformesTab
          auditoriaId={auditoria.id}
          materialidadAprobada={auditoria.materialidadAprobada}
          empresaNombre={auditoria.empresa.nombre}
          periodo={auditoria.periodo}
        />
      )}
    </div>
  )
}
