import { useQuery } from '@tanstack/react-query'
import { construirGuia, type SignalsProgreso } from '@auditorya/types'
import { Check, ChevronRight, Circle, CircleDot, Lock, ArrowRight, PartyPopper } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

export function GuiaCabecera({
  auditoriaId,
  onIr,
}: {
  auditoriaId: string
  onIr: (tab: string) => void
}) {
  const { data: signals } = useQuery<SignalsProgreso>({
    queryKey: ['progreso', auditoriaId],
    queryFn: () => api.get<SignalsProgreso>(`/auditorias/${auditoriaId}/progreso`),
  })

  if (!signals) return null

  const guia = construirGuia(signals)
  const faseActual = guia.fases.find((f) => f.estado === 'actual') ?? guia.fases[guia.fases.length - 1]

  return (
    <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
      {/* Stepper de fases */}
      <div className="flex items-center gap-1.5">
        {guia.fases.map((f, i) => (
          <div key={f.id} className="flex items-center gap-1.5 flex-1">
            <div
              className={cn(
                'flex-1 rounded-xl border px-3 py-2.5 transition-colors',
                f.estado === 'actual'
                  ? 'bg-white border-indigo-300'
                  : f.estado === 'completa'
                    ? 'bg-white border-emerald-200'
                    : 'bg-gray-50 border-gray-200 opacity-70',
              )}
            >
              <div className="flex items-center gap-2">
                {f.estado === 'completa' ? (
                  <Check size={15} className="text-emerald-500 shrink-0" />
                ) : f.estado === 'actual' ? (
                  <CircleDot size={15} className="text-indigo-500 shrink-0" />
                ) : (
                  <Lock size={13} className="text-gray-400 shrink-0" />
                )}
                <span className={cn('text-sm font-medium truncate',
                  f.estado === 'pendiente' ? 'text-gray-500' : 'text-gray-900')}>
                  {f.label}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn('h-full rounded-full', f.estado === 'completa' ? 'bg-emerald-500' : 'bg-indigo-500')}
                  style={{ width: `${Math.round(f.progreso * 100)}%` }}
                />
              </div>
            </div>
            {i < guia.fases.length - 1 && <ChevronRight size={14} className="text-gray-300 shrink-0" />}
          </div>
        ))}
      </div>

      {/* Siguiente paso */}
      {guia.siguientePaso ? (
        <button
          onClick={() => onIr(guia.siguientePaso!.tab)}
          className="w-full flex items-center justify-between gap-3 rounded-xl bg-indigo-600 px-4 py-3 text-left hover:bg-indigo-700 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <ArrowRight size={20} className="text-indigo-200 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-indigo-200">Tu siguiente paso</p>
              <p className="text-sm font-semibold text-white truncate">{guia.siguientePaso.label}</p>
            </div>
          </div>
          <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/15 text-white shrink-0">Ir ahora</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
          <PartyPopper size={18} className="text-emerald-500 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">
            Completaste todos los pasos requeridos. La auditoría está lista.
          </p>
        </div>
      )}

      {/* Checklist de la fase actual */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5 px-1">
          {faseActual.estado === 'completa' ? 'Todo listo en' : 'Para completar'}: {faseActual.label}
        </p>
        <div className="space-y-1.5">
          {faseActual.items.map((it, idx) => (
            <button
              key={idx}
              onClick={() => onIr(it.tab)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                it.hecho ? 'bg-white border-gray-100' : 'bg-white border-indigo-100 hover:border-indigo-200',
              )}
            >
              {it.hecho ? (
                <Check size={16} className="text-emerald-500 shrink-0" />
              ) : it.requerido ? (
                <CircleDot size={16} className="text-indigo-400 shrink-0" />
              ) : (
                <Circle size={16} className="text-gray-300 shrink-0" />
              )}
              <span className={cn('text-sm flex-1', it.hecho ? 'text-gray-500' : 'text-gray-800')}>
                {it.label}
                {!it.requerido && <span className="text-xs text-gray-400"> · opcional</span>}
              </span>
              {it.hint && <span className="text-xs text-gray-400 shrink-0">{it.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
