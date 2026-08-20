import { useState } from 'react'
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, CircleDot, Circle, Lock, LogOut, Minus, LayoutDashboard, ChevronDown } from 'lucide-react'
import { construirGuia, type SignalsProgreso } from '@auditorya/types'
import {
  tabsPorServicio, FASES_ORDEN, TIPO_LABEL, SERVICIO_LABEL,
  type FaseNombre, type SubTab,
} from '../../lib/etapas-encargo'
import { estadoPaso } from '../../lib/progreso-pasos'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../store/auth.store'
import { NotificacionesBell } from '../notificaciones/NotificacionesBell'

type Empresa = { id: string; nombre: string }

type Auditoria = {
  id: string
  fechaInicio: string
  fechaFin: string
  tipoServicio: string
  tipo: string | null
  materialidadAprobada: boolean
}

export function EmpresaSidebarEncargo({ empresa, auditoriaId }: { empresa: Empresa; auditoriaId: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { logout } = useAuthStore()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const { data: auditoria } = useQuery<Auditoria>({
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

  const esAI = auditoria?.tipoServicio === 'auditoria_interna'
  const tabs = tabsPorServicio(auditoria?.tipoServicio)
  const materialidadAprobada = auditoria?.materialidadAprobada ?? false

  // Dentro de un papel de trabajo el paso activo es "papeles" y navegar
  // a otro paso implica volver a la página del encargo.
  const enPapel = !!useMatch('/empresas/:id/encargos/:auditoriaId/papeles/:papelId')

  const pasoParam = searchParams.get('paso') as SubTab | null
  const pasoActivo: SubTab = enPapel
    ? 'papeles'
    : pasoParam === 'resumen'
      ? 'resumen'
      : tabs.find((t) => t.id === pasoParam) ? pasoParam! : 'resumen'

  const guia = signals ? construirGuia(signals) : null

  const irA = (paso: SubTab) => {
    if (enPapel) {
      navigate(`/empresas/${empresa.id}/encargos/${auditoriaId}?paso=${paso}`)
      return
    }
    const next = new URLSearchParams(searchParams)
    next.set('paso', paso)
    setSearchParams(next, { replace: true })
  }

  const grupos = FASES_ORDEN
    .map((fase) => ({ fase, pasos: tabs.filter((t) => t.grupo === fase) }))
    .filter((g) => g.pasos.length > 0)

  const faseBloqueada = (fase: FaseNombre) => !esAI && fase !== 'Planificación' && !materialidadAprobada
  const progresoFase = (fasePasos: typeof tabs) => {
    if (!signals) return 0
    return fasePasos.filter((p) => estadoPaso(p.id, signals) === 'done').length / fasePasos.length
  }

  // Acordeón: por defecto se abre la fase del paso activo; el usuario puede alternar cada una.
  const faseDelPasoActivo = tabs.find((t) => t.id === pasoActivo)?.grupo
  const [override, setOverride] = useState<Record<string, boolean>>({})
  const faseAbierta = (fase: FaseNombre) => override[fase] ?? fase === faseDelPasoActivo
  const toggleFase = (fase: FaseNombre) =>
    setOverride((o) => ({ ...o, [fase]: !(o[fase] ?? fase === faseDelPasoActivo) }))

  const titulo = auditoria?.tipo
    ? TIPO_LABEL[auditoria.tipo] ?? SERVICIO_LABEL[auditoria.tipoServicio]
    : SERVICIO_LABEL[auditoria?.tipoServicio ?? 'revisoria_fiscal']

  return (
    <aside className="flex h-screen w-56 flex-col bg-white border-r border-gray-200 shrink-0">
      {/* Volver a la lista de encargos */}
      <button
        onClick={() => navigate(`/empresas/${empresa.id}/encargos`)}
        className="flex items-center gap-2 px-4 py-3 text-xs text-gray-400 hover:text-indigo-600 hover:bg-gray-50 transition-colors border-b border-gray-100"
      >
        <ArrowLeft size={13} />
        Encargos
      </button>

      {/* Identidad del encargo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{titulo}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {empresa.nombre}{auditoria ? ` · ${new Date(auditoria.fechaInicio + 'T00:00:00').getFullYear()}` : ''}
        </p>
      </div>

      {/* Resumen (dashboard del encargo) */}
      <div className="px-3 pt-3">
        <button
          onClick={() => irA('resumen')}
          className={cn(
            'w-full flex items-center gap-2.5 rounded-lg pl-3 pr-2 py-2 text-left text-sm transition-colors',
            pasoActivo === 'resumen'
              ? 'bg-indigo-50 text-indigo-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
          )}
        >
          <LayoutDashboard size={15} className="shrink-0" />
          <span className="truncate flex-1">Resumen</span>
        </button>
      </div>

      {/* Rail de fases + pasos */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {grupos.map((g) => {
          const bloqueada = faseBloqueada(g.fase)
          const progreso = progresoFase(g.pasos)
          const completa = progreso >= 1
          const done = signals ? g.pasos.filter((p) => estadoPaso(p.id, signals) === 'done').length : 0

          const abierta = faseAbierta(g.fase)
          return (
            <div key={g.fase}>
              <button
                onClick={() => toggleFase(g.fase)}
                className="w-full flex items-center gap-2 px-2 py-1 mb-1 rounded-md hover:bg-gray-50 transition-colors"
              >
                {bloqueada ? (
                  <Lock size={12} className="text-gray-300 shrink-0" />
                ) : completa ? (
                  <Check size={13} className="text-emerald-500 shrink-0" />
                ) : (
                  <CircleDot size={13} className="text-indigo-500 shrink-0" />
                )}
                <span className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide flex-1 text-left',
                  bloqueada ? 'text-gray-300' : 'text-gray-500',
                )}>
                  {g.fase}
                </span>
                <span className="text-[10px] text-gray-400 tabular-nums">{done}/{g.pasos.length}</span>
                <ChevronDown
                  size={13}
                  className={cn('text-gray-400 shrink-0 transition-transform', abierta ? '' : '-rotate-90')}
                />
              </button>

              {abierta && (
              <div className="space-y-0.5">
                {g.pasos.map((p) => {
                  const est = signals ? estadoPaso(p.id, signals) : 'none'
                  const activo = pasoActivo === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => irA(p.id)}
                      className={cn(
                        'w-full flex items-center gap-2.5 rounded-lg pl-3 pr-2 py-2 text-left text-sm transition-colors',
                        activo
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : bloqueada
                            ? 'text-gray-400 hover:bg-gray-50'
                            : est === 'done'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      {bloqueada ? (
                        <Lock size={13} className="text-gray-300 shrink-0" />
                      ) : est === 'done' ? (
                        <Check size={15} className="text-emerald-500 shrink-0" />
                      ) : est === 'partial' ? (
                        <Minus size={15} className="text-amber-500 shrink-0" />
                      ) : (
                        <Circle size={12} className={cn('shrink-0', activo ? 'text-indigo-400' : 'text-gray-300')} />
                      )}
                      <span className="truncate flex-1">{p.label}</span>
                    </button>
                  )
                })}
              </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Progreso global */}
      {guia && (
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">Progreso</span>
            <span className="text-xs font-semibold text-gray-600 tabular-nums">{guia.progresoGlobal}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', guia.completa ? 'bg-emerald-500' : 'bg-indigo-500')}
              style={{ width: `${guia.progresoGlobal}%` }}
            />
          </div>
        </div>
      )}

      {/* Notificaciones + cerrar sesión */}
      <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={13} /> Cerrar sesión
        </button>
        <NotificacionesBell />
      </div>
    </aside>
  )
}
