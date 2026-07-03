import type { GuiaItem } from '@auditorya/types'
import { Check, Circle, CircleDot, BookMarked, Lightbulb } from 'lucide-react'
import { CATALOGO_ETAPAS } from '../../lib/catalogo-etapas'
import { cn } from '../../lib/cn'

export function PanelDerecho({
  faseLabel,
  items,
  onIr,
  pasoActivo,
  pasoLabel,
}: {
  faseLabel: string
  items: GuiaItem[]
  onIr: (tab: string) => void
  pasoActivo: string
  pasoLabel: string
}) {
  const info = CATALOGO_ETAPAS[pasoActivo]
  const faltan = items.filter((i) => i.requerido && !i.hecho).length

  return (
    <aside className="w-80 shrink-0 space-y-4">
      {/* Card 1 · Checklist de la etapa */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Checklist · {faseLabel}</h3>
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            faltan === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700',
          )}>
            {faltan === 0 ? 'Completa' : `Faltan ${faltan}`}
          </span>
        </div>
        <div className="space-y-1">
          {items.map((it, idx) => (
            <button
              key={idx}
              onClick={() => onIr(it.tab)}
              className="w-full flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 transition-colors"
            >
              {it.hecho ? (
                <Check size={15} className="text-emerald-500 shrink-0 mt-0.5" />
              ) : it.requerido ? (
                <CircleDot size={15} className="text-indigo-400 shrink-0 mt-0.5" />
              ) : (
                <Circle size={13} className="text-gray-300 shrink-0 mt-1" />
              )}
              <span className={cn('text-sm flex-1 leading-snug', it.hecho ? 'text-gray-400' : 'text-gray-700')}>
                {it.label}
                {!it.requerido && <span className="text-xs text-gray-400"> · opcional</span>}
              </span>
              {it.hint && <span className="text-xs text-gray-400 shrink-0 mt-0.5">{it.hint}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Card 2 · Normativa y tips del paso activo */}
      {info && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <BookMarked size={15} className="text-indigo-500 shrink-0" />
              <h3 className="text-sm font-semibold text-gray-900">Normativa · {pasoLabel}</h3>
            </div>
            <div className="space-y-2">
              {info.normas.map((n) => (
                <div key={n.codigo} className="rounded-lg bg-indigo-50/60 px-3 py-2">
                  <p className="text-xs font-semibold text-indigo-700">{n.codigo}</p>
                  <p className="text-xs text-gray-600 leading-snug mt-0.5">{n.titulo}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={15} className="text-amber-500 shrink-0" />
              <h4 className="text-sm font-semibold text-gray-900">Tips</h4>
            </div>
            <ul className="space-y-2">
              {info.tips.map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-600 leading-snug">
                  <span className="text-amber-400 shrink-0">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  )
}
