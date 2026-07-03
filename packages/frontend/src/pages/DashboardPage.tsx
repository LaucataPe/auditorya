import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, Building2, ClipboardList, FileSearch, FileText, Plus, TrendingUp,
} from 'lucide-react'
import { useAuthStore } from '../store/auth.store'
import { Button } from '../components/ui/Button'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

type Resumen = {
  empresas: number
  encargosPendientes: number
  auditoriasActivas: number
  informesAprobados: number
  auditoriasRecientes: {
    id: string
    estado: string
    periodo: string
    tipoServicio: string
    empresaId: string
    empresaNombre: string
  }[]
}

const ESTADO_LABEL: Record<string, string> = {
  planificacion: 'Planificación',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizada: 'Finalizada',
}

const ESTADO_BADGE: Record<string, string> = {
  planificacion: 'bg-indigo-50 text-indigo-700',
  ejecucion: 'bg-amber-50 text-amber-700',
  revision: 'bg-violet-50 text-violet-700',
  finalizada: 'bg-emerald-50 text-emerald-700',
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: resumen, isLoading } = useQuery<Resumen>({
    queryKey: ['firma-resumen'],
    queryFn: () => api.get<Resumen>('/firmas/mia/resumen'),
  })

  const stats = [
    { label: 'Empresas clientes', value: resumen?.empresas ?? 0, icon: Building2, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Auditorías activas', value: resumen?.auditoriasActivas ?? 0, icon: ClipboardList, color: 'bg-amber-50 text-amber-600' },
    { label: 'Encargos pendientes', value: resumen?.encargosPendientes ?? 0, icon: FileSearch, color: 'bg-rose-50 text-rose-600' },
    { label: 'Informes aprobados', value: resumen?.informesAprobados ?? 0, icon: FileText, color: 'bg-emerald-50 text-emerald-600' },
  ]

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hola, {user?.nombre?.split(' ')[0]}</h1>
          <p className="text-sm text-slate-500 mt-1">Aquí tienes el resumen de tu práctica auditora.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => navigate('/empresas')}>
          <Plus size={14} /> Nueva empresa
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-card p-5">
              <div className={cn('inline-flex p-2 rounded-lg mb-3', s.color)}>
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-slate-100" /> : s.value}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Auditorías recientes */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <TrendingUp size={16} className="text-indigo-600" />
          <h2 className="font-semibold text-slate-900">Auditorías recientes</h2>
        </div>

        {isLoading ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-50" />
            ))}
          </div>
        ) : !resumen || resumen.auditoriasRecientes.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <ClipboardList size={30} className="mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Aún no tienes auditorías</p>
            <p className="mt-1 max-w-sm text-xs text-slate-400">
              Crea una empresa cliente, acepta el encargo y arranca la primera auditoría. La plataforma
              te guía fase por fase.
            </p>
            <Button size="sm" variant="secondary" className="mt-4 gap-1" onClick={() => navigate('/empresas')}>
              Ir a clientes <ArrowRight size={13} />
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {resumen.auditoriasRecientes.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => navigate(`/empresas/${a.empresaId}/encargos/${a.id}`)}
                  className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{a.empresaNombre}</p>
                    <p className="text-xs text-slate-400">
                      {a.tipoServicio === 'auditoria_interna' ? 'Auditoría interna' : 'Revisoría fiscal'} · Período {a.periodo}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ESTADO_BADGE[a.estado] ?? 'bg-slate-100 text-slate-600')}>
                    {ESTADO_LABEL[a.estado] ?? a.estado}
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-slate-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
