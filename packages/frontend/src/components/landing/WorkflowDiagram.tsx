import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { Celda, Etapa } from './contenido'
import { Pill } from './Tipografia'

/**
 * Hilo dorado riesgo → prueba → evidencia → conclusión como pestañas accesibles: clic, flechas
 * del teclado (← →, Inicio, Fin) y botones anterior/siguiente. Cada etapa muestra una tabla de
 * ejemplo de cómo se ve en la plataforma.
 */
export function WorkflowDiagram({ etapas }: { etapas: Etapa[] }) {
  const [activa, setActiva] = useState(0)
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])
  const ultima = etapas.length - 1

  const ir = (i: number, foco = false) => {
    setActiva(i)
    if (foco) tabsRef.current[i]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const destino =
      e.key === 'ArrowRight' ? (i + 1) % etapas.length
      : e.key === 'ArrowLeft' ? (i - 1 + etapas.length) % etapas.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? ultima
      : null
    if (destino === null) return
    e.preventDefault()
    ir(destino, true)
  }

  const etapa = etapas[activa]
  const avance = `${(75 * activa) / ultima}%`

  return (
    <div>
      <div role="tablist" aria-label="Etapas del encargo" className="relative mx-auto mb-9 grid max-w-[900px] grid-cols-4">
        <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[22px] h-[3px] rounded-full bg-[#dcd3f7] sm:top-[26px]" />
        <span
          aria-hidden="true"
          style={{ width: avance }}
          className="absolute left-[12.5%] top-[22px] h-[3px] rounded-full bg-gradient-to-r from-marca-800 to-marca-500 motion-safe:transition-[width] motion-safe:duration-300 sm:top-[26px]"
        />
        {etapas.map((e, i) => {
          const seleccionada = i === activa
          return (
            <button
              key={e.titulo}
              ref={(el) => (tabsRef.current[i] = el)}
              type="button"
              role="tab"
              id={`etapa-tab-${i}`}
              aria-selected={seleccionada}
              aria-controls={`etapa-panel-${i}`}
              tabIndex={seleccionada ? 0 : -1}
              onClick={() => ir(i)}
              onKeyDown={(ev) => onKeyDown(ev, i)}
              className={cn(
                'group relative flex flex-col items-center gap-2.5 rounded-xl text-xs font-semibold focus:outline-none sm:text-[15px]',
                seleccionada ? 'text-marca-tinta' : 'text-marca-suave hover:text-marca-tinta',
              )}
            >
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-bold transition group-focus-visible:ring-[3px] group-focus-visible:ring-marca-300 group-focus-visible:ring-offset-2 sm:h-[54px] sm:w-[54px] sm:text-[15px]',
                  i <= activa
                    ? 'border-transparent bg-gradient-to-br from-marca-800 to-marca-600 text-white shadow-[0_10px_22px_-8px_rgba(91,33,182,0.7)]'
                    : 'border-[#dcd3f7] bg-white text-marca-suave',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              {e.titulo}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`etapa-panel-${activa}`}
        aria-labelledby={`etapa-tab-${activa}`}
        className="grid grid-cols-1 items-center gap-8 rounded-[22px] border border-marca-linea bg-white p-5 shadow-[0_30px_60px_-40px_rgba(46,16,101,0.55)] sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-10"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-marca-700">
            Etapa {String(activa + 1).padStart(2, '0')} de {String(etapas.length).padStart(2, '0')} · {etapa.normas}
          </p>
          <h3 className="mt-2 text-3xl font-extrabold tracking-tight text-marca-tinta">{etapa.titulo}</h3>
          <p className="mt-2.5 leading-relaxed text-marca-suave">{etapa.texto}</p>
          <div className="mt-6 flex gap-2.5">
            <button
              type="button"
              onClick={() => ir(activa - 1, true)}
              disabled={activa === 0}
              aria-label="Etapa anterior"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-marca-linea bg-white text-marca-tinta transition hover:bg-marca-fondo focus:outline-none focus-visible:ring-[3px] focus-visible:ring-marca-300 disabled:cursor-default disabled:opacity-35"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => ir(activa + 1, true)}
              disabled={activa === ultima}
              aria-label="Etapa siguiente"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-marca-600 text-white transition hover:bg-marca-700 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-marca-300 disabled:cursor-default disabled:opacity-35"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <TablaEjemplo tabla={etapa.tabla} />
      </div>
    </div>
  )
}

function TablaEjemplo({ tabla }: { tabla: Etapa['tabla'] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-marca-linea text-[13px]">
      <div className="flex items-center justify-between gap-3 border-b border-marca-linea bg-[#faf8ff] px-4 py-3 font-bold text-marca-tinta">
        {tabla.titulo}
        <Pill tono="marca">{tabla.etiqueta}</Pill>
      </div>
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse', tabla.columnas.length > 2 && 'min-w-[480px]')}>
          <caption className="sr-only">{tabla.titulo} (ejemplo)</caption>
          <thead>
            <tr>
              {tabla.columnas.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="border-b border-marca-linea px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-marca-suave"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((fila, i) => (
              <tr key={i} className="border-b border-[#f1edfc] last:border-0">
                {fila.map((celda, j) => (
                  <td key={j} className="px-4 py-3 text-marca-tinta">
                    <CeldaTabla celda={celda} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabla.pie && (
        <p className="border-t border-marca-linea bg-[#faf8ff] px-4 py-2.5 text-xs text-marca-suave">{tabla.pie}</p>
      )}
    </div>
  )
}

function CeldaTabla({ celda }: { celda: Celda }) {
  return typeof celda === 'string' ? <>{celda}</> : <Pill tono={celda.tono}>{celda.pill}</Pill>
}
