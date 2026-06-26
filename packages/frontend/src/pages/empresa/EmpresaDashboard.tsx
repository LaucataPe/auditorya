import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  FileSearch,
  FileText,
  TrendingUp,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type FaseAuditoria = 'planificacion' | 'ejecucion' | 'revision' | 'finalizada'
type TipoAuditoria = 'financiera' | 'integral' | 'especial'

type Empresa = {
  id: string
  nombre: string
  nit: string
  sector: string
  estadoEncargo: 'pendiente' | 'aceptado' | 'rechazado'
}

type Auditoria = {
  id: string
  periodo: string
  tipo: TipoAuditoria
  estado: FaseAuditoria
  socioId: string
}

type Usuario = { id: string; nombre: string }

const FASE_BADGE: Record<FaseAuditoria, string> = {
  planificacion: 'bg-indigo-50 text-indigo-700',
  ejecucion: 'bg-amber-50 text-amber-700',
  revision: 'bg-violet-50 text-violet-700',
  finalizada: 'bg-emerald-50 text-emerald-700',
}

const FASE_LABEL: Record<FaseAuditoria, string> = {
  planificacion: 'Planificación',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizada: 'Finalizada',
}

const FASE_BAR: Record<FaseAuditoria, string> = {
  planificacion: 'bg-indigo-600',
  ejecucion: 'bg-amber-500',
  revision: 'bg-violet-600',
  finalizada: 'bg-emerald-500',
}

const FASE_ORDER: Record<FaseAuditoria, number> = {
  planificacion: 1,
  ejecucion: 2,
  revision: 3,
  finalizada: 4,
}

const TIPO_LABEL: Record<TipoAuditoria, string> = {
  financiera: 'Auditoría financiera',
  integral: 'Auditoría integral',
  especial: 'Auditoría especial',
}

const FASES = ['planificacion', 'ejecucion', 'revision', 'finalizada'] as FaseAuditoria[]

export function EmpresaDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: empresa } = useQuery<Empresa>({
    queryKey: ['empresa', id],
    queryFn: () => api.get<Empresa>(`/empresas/${id}`),
    enabled: !!id,
  })

  const { data: auditorias = [] } = useQuery<Auditoria[]>({
    queryKey: ['auditorias', id],
    queryFn: () => api.get<Auditoria[]>(`/empresas/${id}/auditorias`),
    enabled: !!id,
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>(`/firmas/mia/usuarios`),
  })

  const nombrePorId = (uid: string) => usuarios.find((u) => u.id === uid)?.nombre ?? '—'

  if (!empresa) return null

  const stats = [
    { label: 'Encargos totales', value: auditorias.length, icon: ClipboardList, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'En curso', value: auditorias.filter((e) => e.estado !== 'finalizada').length, icon: FileSearch, color: 'bg-amber-50 text-amber-600' },
    { label: 'Finalizados', value: auditorias.filter((e) => e.estado === 'finalizada').length, icon: FileText, color: 'bg-emerald-50 text-emerald-600' },
  ]

  const encargoPendiente = empresa.estadoEncargo === 'pendiente'
  const encargoRechazado = empresa.estadoEncargo === 'rechazado'

  return (
    <div className="p-8 space-y-7 max-w-4xl">
      {/* Header */}
      <div>
        <p className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-1">
          Panel de empresa
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{empresa.nombre}</h1>
        <p className="text-sm text-gray-500 mt-1">NIT {empresa.nit} · {empresa.sector}</p>
      </div>

      {/* Alerta evaluación pendiente */}
      {encargoPendiente && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Evaluación de aceptación pendiente</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Completa la evaluación de independencia para poder crear encargos de auditoría.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/empresas/${id}/evaluacion`)}>
            Ir a evaluación
          </Button>
        </div>
      )}

      {encargoRechazado && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Encargo rechazado</p>
            <p className="text-xs text-red-600 mt-0.5">
              La evaluación de independencia no fue satisfactoria. No es posible crear auditorías con esta empresa.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className={cn('inline-flex p-2 rounded-lg mb-3', s.color)}>
                <Icon size={16} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Encargos recientes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-indigo-500" />
            <h2 className="font-semibold text-gray-900">Encargos de auditoría</h2>
          </div>
          <button
            onClick={() => navigate(`/empresas/${id}/encargos`)}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            Ver todos <ChevronRight size={12} />
          </button>
        </div>

        {auditorias.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center">
            <ClipboardList size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aún no hay encargos registrados.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {auditorias.map((auditoria) => {
              const faseIdx = FASE_ORDER[auditoria.estado] - 1
              return (
                <div
                  key={auditoria.id}
                  onClick={() => navigate(`/empresas/${id}/encargos/${auditoria.id}`)}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs text-gray-400">Período {auditoria.periodo}</span>
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', FASE_BADGE[auditoria.estado])}>
                          {FASE_LABEL[auditoria.estado]}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900">{TIPO_LABEL[auditoria.tipo]}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Socio: {nombrePorId(auditoria.socioId)}</p>
                    </div>
                    <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  {/* Pipeline */}
                  <div className="flex gap-1">
                    {FASES.map((fase, idx) => (
                      <div key={fase} className="flex-1">
                        <div className={cn('h-1.5 rounded-full', idx <= faseIdx ? FASE_BAR[auditoria.estado] : 'bg-gray-100')} />
                        <p className={cn('text-xs mt-1', idx === faseIdx ? 'text-gray-700 font-medium' : 'text-gray-300')}>
                          {FASE_LABEL[fase]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Estado encargo */}
      {empresa.estadoEncargo === 'aceptado' && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <CheckCircle size={15} />
          <span>Encargo aceptado — la firma puede realizar auditorías a esta empresa.</span>
        </div>
      )}
    </div>
  )
}
