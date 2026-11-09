import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { parsearFecha } from '../../lib/fechas'

type Props = {
  /** 'YYYY-MM-DD' o '' si no hay fecha. */
  value: string
  onChange: (valor: string) => void
  /** Mes en que abre el calendario cuando el campo está vacío ('YYYY-MM-DD'); con valor abre en su mes. */
  mesInicial?: string
  /** Última fecha elegible ('YYYY-MM-DD'); los días posteriores quedan deshabilitados. */
  max?: string
  disabled?: boolean
  error?: boolean
  id?: string
  className?: string
}

const ALTO_CALENDARIO = 330
const ANCHO_CALENDARIO = 290

const aTexto = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Selector de fecha que abre el calendario en el mes que la persona está
 * trabajando (no en hoy, como el campo nativo). El calendario va en un portal
 * con posición fija para que no lo recorte el scroll de un modal.
 */
export function CampoFecha({ value, onChange, mesInicial, max, disabled, error, id, className }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const seleccionada = value ? parsearFecha(value) : undefined
  const mes = seleccionada ?? (mesInicial ? parsearFecha(mesInicial) : new Date())

  useLayoutEffect(() => {
    if (!abierto || !boton.current) return
    const r = boton.current.getBoundingClientRect()
    // Abajo del campo; si no cabe, arriba. Siempre dentro del ancho de la ventana.
    const abajo = r.bottom + 4 + ALTO_CALENDARIO <= window.innerHeight
    setPos({
      top: abajo ? r.bottom + 4 : Math.max(8, r.top - 4 - ALTO_CALENDARIO),
      left: Math.max(8, Math.min(r.left, window.innerWidth - ANCHO_CALENDARIO - 8)),
    })
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !boton.current?.contains(t)) setAbierto(false)
    }
    // En captura y deteniendo la propagación: Escape cierra solo el calendario, no el modal que lo contiene.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setAbierto(false)
      boton.current?.focus()
    }
    document.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [abierto])

  return (
    <>
      <button
        ref={boton}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-invalid={error ? true : undefined}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-gray-300 px-2.5 py-1.5 text-left text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400',
          error && 'border-red-500',
          className,
        )}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {seleccionada
            ? seleccionada.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'dd/mm/aaaa'}
        </span>
        <CalendarDays size={14} className="shrink-0 text-gray-400" />
      </button>

      {abierto &&
        pos &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Elegir fecha"
            style={{ top: pos.top, left: pos.left, width: ANCHO_CALENDARIO }}
            className="campo-fecha fixed z-[60] rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
          >
            <DayPicker
              mode="single"
              locale={es}
              weekStartsOn={1}
              defaultMonth={mes}
              selected={seleccionada}
              disabled={max ? { after: parsearFecha(max) } : undefined}
              onSelect={(d) => {
                if (!d) return
                onChange(aTexto(d))
                setAbierto(false)
                boton.current?.focus()
              }}
              autoFocus
            />
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setAbierto(false)
                }}
                className="mt-1 flex items-center gap-1 px-2 pb-1 text-xs text-gray-500 hover:text-red-600"
              >
                <X size={12} /> Quitar fecha
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
