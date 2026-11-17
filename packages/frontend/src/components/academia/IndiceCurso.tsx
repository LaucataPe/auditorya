import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle2, ChevronDown, Flag, FlaskConical, Lock } from 'lucide-react'
import {
  LECCIONES_CURSO, MODULOS_CURSO, avanceCurso, checkpointAprobado, checkpointDisponible, estadoBloqueo, leccionCompleta, leccionPorId, practicaHecha,
  rutaCheckpoint, type ModuloCurso, type ProgresoAcademia,
} from '@auditorya/types'
import { cn } from '../../lib/cn'

/** Marca de una lección: leída y su práctica (playground o ejercicio del caso) hecha. */
function Marcas({ leida, practica, practicada }: { leida: boolean; practica: boolean; practicada: boolean }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <BookOpen size={12} className={leida ? 'text-emerald-500' : 'text-slate-300'} aria-label={leida ? 'Leída' : 'Sin leer'} />
      {practica && (
        <FlaskConical size={12} className={practicada ? 'text-emerald-500' : 'text-slate-300'} aria-label={practicada ? 'Práctica hecha' : 'Práctica pendiente'} />
      )}
    </span>
  )
}

export function BarraAvance({ progreso, compacta = false }: { progreso: ProgresoAcademia; compacta?: boolean }) {
  // El % pondera lectura, práctica y checkpoints; el texto cuenta lecciones, que es lo que el estudiante reconoce.
  const { pct } = avanceCurso(progreso)
  const completas = LECCIONES_CURSO.filter((l) => leccionCompleta(l, progreso)).length
  return (
    <div className={cn('rounded-xl bg-violet-50', compacta ? 'p-3' : 'p-4')}>
      <div className="flex items-baseline justify-between">
        <span className={cn('font-bold text-violet-900', compacta ? 'text-lg' : 'text-2xl')}>{pct}%</span>
        <span className="text-xs text-violet-700">{completas} de {LECCIONES_CURSO.length} lecciones</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-violet-100">
        <div className="h-2 rounded-full bg-violet-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** `actual` es la lección abierta; `checkpointActual`, el id de la fase cuyo checkpoint está abierto. */
export function IndiceCurso({ progreso, actual, checkpointActual }: { progreso: ProgresoAcademia; actual?: string; checkpointActual?: string }) {
  // Acordeón: abre la fase de la lección actual; el usuario puede abrir o cerrar cualquiera.
  const faseActual = checkpointActual ?? (actual ? leccionPorId(actual)?.modulo.id : undefined)
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(faseActual ? [faseActual] : []))
  useEffect(() => {
    if (faseActual) setAbiertas((prev) => (prev.has(faseActual) ? prev : new Set(prev).add(faseActual)))
  }, [faseActual])

  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <nav className="space-y-5">
      <BarraAvance progreso={progreso} compacta />
      <p className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1"><BookOpen size={11} /> leída</span>
        <span className="inline-flex items-center gap-1"><FlaskConical size={11} /> práctica hecha</span>
        <span className="inline-flex items-center gap-1"><Flag size={11} /> checkpoint</span>
      </p>
      <div className="space-y-1">
        {MODULOS_CURSO.map((m) => (
          <FaseIndice
            key={m.id}
            modulo={m}
            progreso={progreso}
            actual={actual}
            checkpointActual={checkpointActual}
            abierta={abiertas.has(m.id)}
            onAlternar={() => alternar(m.id)}
          />
        ))}
      </div>
    </nav>
  )
}

function FaseIndice({ modulo: m, progreso, actual, checkpointActual, abierta, onAlternar }: {
  modulo: ModuloCurso
  progreso: ProgresoAcademia
  actual?: string
  checkpointActual?: string
  abierta: boolean
  onAlternar: () => void
}) {
  const completas = m.lecciones.filter((l) => leccionCompleta(l, progreso)).length
  const faseDisponible = estadoBloqueo(m.lecciones[0].id, progreso).desbloqueada

  return (
    <div className={cn('rounded-lg', abierta && 'bg-slate-50')}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-600">{m.ref}</p>
          <p className={cn('truncate text-sm font-semibold', faseDisponible ? 'text-slate-800' : 'text-slate-400')}>{m.corto}</p>
        </div>
        {checkpointAprobado(progreso.repasos[m.id]) ? (
          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" aria-label="Fase aprobada" />
        ) : faseDisponible ? (
          <span className="shrink-0 font-mono text-[11px] text-slate-400">{completas}/{m.lecciones.length}</span>
        ) : (
          <Lock size={12} className="shrink-0 text-slate-300" aria-label="Fase bloqueada" />
        )}
        <ChevronDown size={14} className={cn('shrink-0 text-slate-400 transition-transform', abierta && 'rotate-180')} />
      </button>

      {abierta && (
        <ul className="pb-1.5">
          {m.lecciones.map((l) => {
            const disponible = estadoBloqueo(l.id, progreso).desbloqueada
            const contenido = (
              <>
                <span className="w-7 shrink-0 font-mono text-[11px] text-slate-400">{l.id}</span>
                <span className="truncate">{l.titulo}</span>
                {disponible ? (
                  <Marcas
                    leida={progreso.leidas.includes(l.id)}
                    practica={!!(l.practica || l.ejercicio)}
                    practicada={practicaHecha(l, progreso)}
                  />
                ) : (
                  <Lock size={11} className="ml-auto shrink-0 text-slate-300" aria-label="Bloqueada" />
                )}
              </>
            )
            return (
              <li key={l.id}>
                {disponible ? (
                  <Link
                    to={`/academia/${l.id}`}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]',
                      l.id === actual ? 'bg-violet-100 font-semibold text-violet-900' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    {contenido}
                  </Link>
                ) : (
                  <span className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-400">
                    {contenido}
                  </span>
                )}
              </li>
            )
          })}
          {m.checkpoint && <FilaCheckpoint modulo={m} progreso={progreso} actual={checkpointActual === m.id} />}
        </ul>
      )}
    </div>
  )
}

function FilaCheckpoint({ modulo, progreso, actual }: { modulo: ModuloCurso; progreso: ProgresoAcademia; actual: boolean }) {
  const disponible = checkpointDisponible(modulo, progreso)
  const contenido = (
    <>
      <span className="w-7 shrink-0"><Flag size={12} /></span>
      <span className="truncate">Checkpoint · quiz de {modulo.checkpoint!.preguntas.length}</span>
      {!disponible ? (
        <Lock size={11} className="ml-auto shrink-0 text-slate-300" aria-label="Bloqueado" />
      ) : checkpointAprobado(progreso.repasos[modulo.id]) ? (
        <CheckCircle2 size={12} className="ml-auto shrink-0 text-emerald-500" aria-label="Aprobado" />
      ) : null}
    </>
  )
  return (
    <li>
      {disponible ? (
        <Link
          to={rutaCheckpoint(modulo)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium',
            actual ? 'bg-violet-100 text-violet-900' : 'text-violet-700 hover:bg-slate-100',
          )}
        >
          {contenido}
        </Link>
      ) : (
        <span className="flex cursor-not-allowed items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-slate-400">{contenido}</span>
      )}
    </li>
  )
}
