import type { PestanaPractica } from '@auditorya/types'
import { confirmar } from '../../store/confirm.store'
import { cn } from '../../lib/cn'
import { useReiniciarPractica } from '../../hooks/useAcademia'
import { PESTANA_LABEL } from './PestanaDemo'

export function SelectorPestanas({
  pestanas, actual, onCambiar,
}: {
  pestanas: PestanaPractica[]
  actual: PestanaPractica
  onCambiar: (p: PestanaPractica) => void
}) {
  if (pestanas.length < 2) return null
  return (
    <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
      {pestanas.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onCambiar(p)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium',
            p === actual ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          {PESTANA_LABEL[p]}
        </button>
      ))}
    </div>
  )
}

export function useReiniciarConConfirmacion(leccionId: string) {
  const reiniciar = useReiniciarPractica(leccionId)
  return {
    pendiente: reiniciar.isPending,
    async ejecutar() {
      const ok = await confirmar({
        titulo: 'Reiniciar el ejercicio',
        descripcion: 'Se borra lo que hiciste en esta práctica dentro del encargo de práctica. Lo de las demás lecciones se conserva.',
        confirmar: 'Reiniciar',
        variante: 'primary',
      })
      if (ok) reiniciar.mutate()
    },
  }
}
