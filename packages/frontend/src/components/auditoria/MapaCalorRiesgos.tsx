import { nivelCombinado, type NivelRiesgo } from '@auditorya/types'
import { cn } from '../../lib/cn'

type RiesgoNivel = { riesgoInherente: NivelRiesgo; riesgoControl: NivelRiesgo }

const NIVEL_LABEL: Record<NivelRiesgo, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }

// Colores por nivel combinado: tono suave si la celda está vacía, saturado si tiene riesgos.
const COLOR: Record<NivelRiesgo, { vacia: string; llena: string }> = {
  bajo: { vacia: 'bg-emerald-50 text-emerald-300', llena: 'bg-emerald-500 text-white' },
  medio: { vacia: 'bg-amber-50 text-amber-300', llena: 'bg-amber-400 text-white' },
  alto: { vacia: 'bg-red-50 text-red-300', llena: 'bg-red-500 text-white' },
}

// Ejes: inherente de alto (arriba) a bajo (abajo); control de bajo a alto (izq. a der.).
const FILAS: NivelRiesgo[] = ['alto', 'medio', 'bajo']
const COLS: NivelRiesgo[] = ['bajo', 'medio', 'alto']

export function MapaCalorRiesgos({
  riesgos,
  onCeldaClick,
}: {
  riesgos: RiesgoNivel[]
  onCeldaClick?: (inherente: NivelRiesgo, control: NivelRiesgo) => void
}) {
  const conteo = (inh: NivelRiesgo, ctrl: NivelRiesgo) =>
    riesgos.filter((r) => r.riesgoInherente === inh && r.riesgoControl === ctrl).length

  return (
    <div>
      <div className="flex">
        {/* Etiqueta vertical del eje Y */}
        <div className="flex items-center">
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 [writing-mode:vertical-rl] rotate-180">
            Riesgo inherente
          </span>
        </div>

        <div className="flex-1">
          {/* Cuadrícula 3×3 */}
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-1">
            {FILAS.map((inh) => (
              <FilaCelda
                key={inh}
                inh={inh}
                conteo={conteo}
                onCeldaClick={onCeldaClick}
              />
            ))}
            {/* Fila de etiquetas del eje X */}
            <div />
            {COLS.map((ctrl) => (
              <div key={ctrl} className="text-center text-[11px] text-gray-500 pt-1">
                {NIVEL_LABEL[ctrl]}
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] font-medium uppercase tracking-wide text-gray-400 mt-1">
            Riesgo de control
          </p>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center justify-center gap-4 mt-3">
        {(['bajo', 'medio', 'alto'] as NivelRiesgo[]).map((n) => (
          <div key={n} className="flex items-center gap-1.5">
            <span className={cn('h-3 w-3 rounded-sm', COLOR[n].llena)} />
            <span className="text-xs text-gray-500">{NIVEL_LABEL[n]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FilaCelda({
  inh,
  conteo,
  onCeldaClick,
}: {
  inh: NivelRiesgo
  conteo: (inh: NivelRiesgo, ctrl: NivelRiesgo) => number
  onCeldaClick?: (inherente: NivelRiesgo, control: NivelRiesgo) => void
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-1 text-[11px] text-gray-500">{NIVEL_LABEL[inh]}</div>
      {COLS.map((ctrl) => {
        const n = conteo(inh, ctrl)
        const nivel = nivelCombinado(inh, ctrl)
        const color = n > 0 ? COLOR[nivel].llena : COLOR[nivel].vacia
        const clickable = !!onCeldaClick && n > 0
        return (
          <button
            key={ctrl}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onCeldaClick!(inh, ctrl)}
            className={cn(
              'aspect-square rounded-lg flex items-center justify-center text-lg font-bold transition-all',
              color,
              clickable ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300' : 'cursor-default',
            )}
            title={`Inherente ${NIVEL_LABEL[inh]} · Control ${NIVEL_LABEL[ctrl]} → ${nivel} (${n})`}
          >
            {n > 0 ? n : ''}
          </button>
        )
      })}
    </>
  )
}
