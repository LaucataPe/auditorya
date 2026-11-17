import { useState } from 'react'
import { ArrowRight, CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { checkpointAprobado, type ModuloCurso } from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { useAcademiaStore } from '../../store/academia.store'

/**
 * Quiz del checkpoint de una fase, de a una pregunta: al elegir se ve de inmediato si acertó y por
 * qué. Se califica en el navegador y guarda el mejor resultado al terminar.
 */
export function QuizCheckpoint({ modulo }: { modulo: ModuloCurso }) {
  const preguntas = modulo.checkpoint!.preguntas
  const guardarRepaso = useAcademiaStore((s) => s.guardarRepaso)
  const mejor = useAcademiaStore((s) => s.progreso.repasos[modulo.id])
  const [elegidas, setElegidas] = useState<(number | null)[]>(() => preguntas.map(() => null))
  const [actual, setActual] = useState(0)
  const [terminado, setTerminado] = useState(false)

  const aciertos = elegidas.filter((e, i) => e === preguntas[i].correcta).length
  const minimo = Math.ceil(preguntas.length * 0.8)
  const aprobadoAhora = checkpointAprobado({ aciertos, total: preguntas.length })
  const p = preguntas[actual]
  const elegida = elegidas[actual]
  const respondida = elegida !== null
  const esUltima = actual === preguntas.length - 1

  function elegir(oi: number) {
    if (respondida) return
    setElegidas((prev) => prev.map((e, i) => (i === actual ? oi : e)))
  }

  function avanzar() {
    if (!esUltima) {
      setActual((n) => n + 1)
      return
    }
    setTerminado(true)
    guardarRepaso(modulo.id, aciertos, preguntas.length)
  }

  function otraVez() {
    setElegidas(preguntas.map(() => null))
    setActual(0)
    setTerminado(false)
  }

  return (
    <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-700">Quiz de la {modulo.ref}</p>
          <p className="text-sm text-slate-500">{preguntas.length} preguntas · necesitas {minimo} correctas</p>
        </div>
        {checkpointAprobado(mejor) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={13} /> Aprobado · {mejor!.aciertos}/{mejor!.total}
          </span>
        )}
      </div>

      {/* Un segmento por pregunta: verde acertada, rojo fallada, violeta la actual. */}
      <ol className="flex gap-1.5" aria-label="Avance del quiz">
        {preguntas.map((q, i) => {
          const e = elegidas[i]
          const estado = e === null ? (i === actual && !terminado ? 'actual' : 'pendiente') : e === q.correcta ? 'bien' : 'mal'
          return (
            <li
              key={i}
              aria-label={`Pregunta ${i + 1}: ${estado}`}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                estado === 'bien' && 'bg-emerald-500',
                estado === 'mal' && 'bg-rose-400',
                estado === 'actual' && 'bg-violet-500',
                estado === 'pendiente' && 'bg-slate-200',
              )}
            />
          )
        })}
      </ol>

      {terminado ? (
        <div className={cn('space-y-3 rounded-xl px-4 py-5 text-center', aprobadoAhora ? 'bg-emerald-50' : 'bg-amber-50')}>
          {aprobadoAhora
            ? <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
            : <XCircle size={28} className="mx-auto text-amber-500" />}
          <p className={cn('text-lg font-semibold', aprobadoAhora ? 'text-emerald-900' : 'text-amber-900')}>
            {aciertos} de {preguntas.length} correctas
          </p>
          <p className={cn('text-sm', aprobadoAhora ? 'text-emerald-800' : 'text-amber-900')}>
            {aprobadoAhora
              ? 'Checkpoint aprobado: la siguiente fase quedó abierta.'
              : `Te faltan ${minimo - aciertos} para aprobar. Repasa las explicaciones e inténtalo de nuevo.`}
          </p>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={otraVez}>
            <RotateCcw size={13} /> Intentar de nuevo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-mono text-xs text-slate-500">Pregunta {actual + 1} de {preguntas.length}</p>
          <p className="text-[15px] font-semibold text-slate-900">{p.pregunta}</p>
          <div className="space-y-2" role="radiogroup" aria-label={p.pregunta}>
            {p.opciones.map((o, oi) => {
              const estado = !respondida ? null : oi === p.correcta ? 'bien' : oi === elegida ? 'mal' : null
              return (
                <button
                  key={oi}
                  type="button"
                  role="radio"
                  aria-checked={elegida === oi}
                  disabled={respondida}
                  onClick={() => elegir(oi)}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    estado === 'bien' && 'border-emerald-300 bg-emerald-50 text-emerald-900',
                    estado === 'mal' && 'border-rose-300 bg-rose-50 text-rose-900',
                    !estado && 'border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/40 disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-transparent',
                  )}
                >
                  <span className="flex-1">{o}</span>
                  {estado === 'bien' && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />}
                  {estado === 'mal' && <XCircle size={16} className="mt-0.5 shrink-0 text-rose-500" />}
                </button>
              )
            })}
          </div>

          {respondida && (
            <div className="space-y-3">
              <p className={cn('rounded-lg px-3 py-2.5 text-sm', elegida === p.correcta ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900')}>
                <b>{elegida === p.correcta ? 'Correcto.' : 'No es esa.'}</b> {p.explicacion}
              </p>
              <div className="flex justify-end">
                <Button size="sm" className="gap-1.5" onClick={avanzar}>
                  {esUltima ? 'Ver resultado' : 'Siguiente pregunta'} <ArrowRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
