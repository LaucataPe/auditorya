import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore, type Toast } from '../../store/toast.store'

const ESTILOS: Record<Toast['tipo'], { caja: string; icono: React.ReactNode }> = {
  success: {
    caja: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icono: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />,
  },
  error: {
    caja: 'border-red-200 bg-red-50 text-red-800',
    icono: <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />,
  },
  info: {
    caja: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    icono: <Info className="h-4 w-4 shrink-0 text-indigo-600" />,
  },
}

/** Pila de notificaciones global. Montar una sola vez, junto a las rutas. */
export function Toaster() {
  const { toasts, dismiss } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => {
        const s = ESTILOS[t.tipo]
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-card ${s.caja}`}
          >
            {s.icono}
            <p className="flex-1 leading-snug">{t.mensaje}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar notificación"
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
