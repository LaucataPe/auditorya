import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Inbox } from 'lucide-react'
import type { Notificacion } from '@auditorya/types'
import { cn } from '../../lib/cn'
import { haceCuanto } from '../../lib/fechas'
import { useNotificaciones } from '../../hooks/useNotificaciones'

/**
 * Campanita de notificaciones. El disparador vive en el pie de los sidebars
 * (variante clara u oscura); el panel se renderiza como overlay fijo junto al
 * sidebar para no quedar recortado por el layout.
 */
export function NotificacionesBell({ oscuro = false }: { oscuro?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const { items, noLeidas, marcarLeida, marcarTodas } = useNotificaciones()
  const navigate = useNavigate()

  function abrir(n: Notificacion) {
    if (!n.leidaAt) marcarLeida.mutate(n.id)
    setAbierto(false)
    if (n.tipo === 'obligacion_asignada' && n.empresaId) {
      navigate(`/empresas/${n.empresaId}/tributario`)
    } else if (n.empresaId && n.auditoriaId && n.papelTrabajoId) {
      navigate(`/empresas/${n.empresaId}/encargos/${n.auditoriaId}/papeles/${n.papelTrabajoId}`)
    } else if (n.empresaId && n.auditoriaId) {
      navigate(`/empresas/${n.empresaId}/encargos/${n.auditoriaId}`)
    } else if (n.empresaId) {
      navigate(`/empresas/${n.empresaId}`)
    }
  }

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        title="Notificaciones"
        className={cn(
          'relative rounded-lg p-1.5 transition-colors',
          oscuro
            ? 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
            : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600',
        )}
      >
        <Bell size={14} />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-semibold text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <>
          {/* Click afuera cierra el panel */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="fixed bottom-4 left-3 z-50 flex max-h-[70vh] w-[22rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Notificaciones</p>
              <button
                onClick={() => marcarTodas.mutate()}
                disabled={noLeidas === 0 || marcarTodas.isPending}
                className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-gray-300 transition-colors"
              >
                <CheckCheck size={12} /> Marcar todas
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <Inbox size={26} className="mb-2 text-gray-300" />
                <p className="text-xs text-gray-400">
                  Sin notificaciones. Aquí verás asignaciones, papeles en revisión y notas de tu equipo.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => abrir(n)}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50',
                        !n.leidaAt && 'bg-indigo-50/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          n.leidaAt ? 'bg-transparent' : 'bg-indigo-500',
                        )}
                      />
                      <span className="min-w-0">
                        <span className={cn('block text-xs text-slate-700', !n.leidaAt && 'font-medium text-slate-900')}>
                          {n.mensaje}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-gray-400">
                          {n.empresaNombre ? `${n.empresaNombre} · ` : ''}
                          {haceCuanto(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  )
}
