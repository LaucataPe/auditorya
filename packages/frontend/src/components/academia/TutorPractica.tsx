import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Circle, Flag, GraduationCap, Crosshair, Lock } from 'lucide-react'
import type { Leccion } from '@auditorya/types'
import { useVerificarPractica } from '../../hooks/useAcademia'
import { useAcademiaStore } from '../../store/academia.store'
import { toast } from '../../store/toast.store'
import { cn } from '../../lib/cn'

const CLASES_RESALTE = ['ring-4', 'ring-violet-400', 'ring-offset-2', 'transition-shadow']

/** Lleva la vista al control de la pestaña y lo resalta unos segundos (data-tour o id). */
export function resaltarAncla(ancla: string) {
  const el =
    document.querySelector<HTMLElement>(`[data-tour="${ancla}"]`) ?? document.getElementById(ancla)
  if (!el) {
    toast.info('Ese elemento no está a la vista: revisa que estés en la pestaña correcta o abre el formulario.')
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add(...CLASES_RESALTE)
  window.setTimeout(() => el.classList.remove(...CLASES_RESALTE), 2600)
}

/**
 * Tutor de la práctica: pasos guiados + checklist calculado sobre el encargo de práctica.
 * Se re-verifica después de cada guardado exitoso en cualquier pestaña, así que el usuario nunca
 * tiene que pulsar «Comprobar». En escritorio es la columna fija del taller; en celular, una hoja
 * inferior plegable.
 */
export type NavegacionTaller = {
  anterior: { to: string; texto: string }
  siguiente: { to: string; texto: string; checkpoint: boolean }
  /** La teoría sin marcar también bloquea el avance, aunque la práctica esté hecha. */
  teoriaPendiente: boolean
  entenderTo: string
}

export function TutorPractica({ leccion, navegacion }: { leccion: Leccion; navegacion: NavegacionTaller }) {
  const practica = leccion.practica!
  const queryClient = useQueryClient()
  const { data: verificacion, refetch } = useVerificarPractica(leccion.id)
  const marcarPracticada = useAcademiaStore((s) => s.marcarPracticada)
  const yaPracticada = useAcademiaStore((s) => s.progreso.practicadas.includes(leccion.id))
  const avisado = useRef(false)
  // Hoja inferior: en teléfonos arranca plegada (una línea) para no tapar la pestaña; se abre al tocarla.
  const [plegado, setPlegado] = useState(() => window.matchMedia('(max-width: 639px)').matches)

  useEffect(() => {
    return queryClient.getMutationCache().subscribe((evento) => {
      if (evento.type === 'updated' && evento.mutation.state.status === 'success') refetch()
    })
  }, [queryClient, refetch])

  const completa = !!verificacion?.completa
  const pendientes = (verificacion?.criterios ?? []).filter((c) => !c.ok).map((c) => c.mensaje)
  useEffect(() => {
    if (!verificacion) return
    marcarPracticada(leccion.id, verificacion.completa)
    if (verificacion.completa && !yaPracticada && !avisado.current) {
      avisado.current = true
      toast.success(`Práctica de la lección ${leccion.id} completada`)
    }
  }, [verificacion, leccion.id, marcarPracticada, yaPracticada])

  return (
    <div
      className={cn(
        'flex flex-col bg-white',
        'fixed inset-x-3 bottom-3 z-40 max-h-[65vh] rounded-2xl border border-violet-200 shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[340px] sm:max-h-[75vh]',
        'lg:static lg:inset-auto lg:z-auto lg:h-full lg:max-h-none lg:w-auto lg:rounded-none lg:border-0 lg:shadow-none',
      )}
    >
      <button
        type="button"
        onClick={() => setPlegado((p) => !p)}
        aria-expanded={!plegado}
        className={cn(
          'flex w-full items-center gap-2 rounded-t-2xl bg-violet-700 px-4 py-3 text-left text-white lg:pointer-events-none lg:rounded-none',
          plegado && 'rounded-b-2xl',
        )}
      >
        <GraduationCap size={16} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-violet-200">
            Tutor · Lección {leccion.id}{completa ? ' · ✓ completada' : plegado ? ' · toca para ver los pasos' : ''}
          </p>
          <p className="text-sm font-semibold truncate">{practica.titulo}</p>
        </div>
        <ChevronDown size={16} className={cn('shrink-0 transition-transform lg:hidden', plegado && 'rotate-180')} />
      </button>

      <div className={cn('flex-1 overflow-y-auto p-4 space-y-4', plegado && 'hidden lg:block')}>
        <p className="text-sm text-slate-600">{practica.objetivo}</p>

        <ol className="space-y-2">
          {practica.pasos.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-slate-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-semibold text-violet-700">
                {i + 1}
              </span>
              <span className="flex-1">
                {p.texto}
                {p.ancla && (
                  <button
                    type="button"
                    onClick={() => resaltarAncla(p.ancla!)}
                    className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline"
                  >
                    <Crosshair size={11} /> Muéstrame
                  </button>
                )}
              </span>
            </li>
          ))}
        </ol>

        <div className={cn('rounded-xl border p-3', completa ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50')}>
          <p className={cn('text-xs font-semibold uppercase tracking-wider mb-2', completa ? 'text-emerald-700' : 'text-slate-500')}>
            {completa ? 'Práctica completada' : 'Lo que el tutor revisa en tu encargo'}
          </p>
          <ul className="space-y-1.5">
            {(verificacion?.criterios ?? []).map((c, i) => (
              <li key={i} className={cn('flex items-start gap-2 text-sm', c.ok ? 'text-emerald-800' : 'text-slate-600')}>
                {c.ok
                  ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                  : <Circle size={15} className="mt-0.5 shrink-0 text-slate-300" />}
                {c.mensaje}
              </li>
            ))}
          </ul>
        </div>

      </div>

      <PieTaller navegacion={navegacion} completa={completa} pendientesPractica={pendientes} oculto={plegado} />
    </div>
  )
}

/**
 * Pie fijo del taller: volver siempre está a mano y «siguiente» se ve aunque esté bloqueado, con lo
 * que falta escrito (en celular no hay tooltips).
 */
function PieTaller({ navegacion, completa, pendientesPractica, oculto }: {
  navegacion: NavegacionTaller
  completa: boolean
  pendientesPractica: string[]
  oculto: boolean
}) {
  const { anterior, siguiente, teoriaPendiente, entenderTo } = navegacion
  const bloqueado = !completa || teoriaPendiente
  const faltan = pendientesPractica.length + (teoriaPendiente ? 1 : 0)

  return (
    <div className={cn('space-y-2.5 border-t border-slate-200 bg-white p-4 lg:block', oculto && 'hidden')}>
      {bloqueado && (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <p className="font-semibold">
            {faltan > 0 ? `Para continuar te ${faltan === 1 ? 'falta 1 punto' : `faltan ${faltan} puntos`}:` : 'El tutor está revisando tu encargo…'}
          </p>
          {faltan > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {teoriaPendiente && (
                <li>
                  Marcar la teoría como entendida en{' '}
                  <Link to={entenderTo} className="font-medium underline">Entender</Link>
                </li>
              )}
              {pendientesPractica.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Link
          to={anterior.to}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:border-violet-300"
        >
          <ArrowLeft size={14} /> {anterior.texto}
        </Link>
        {bloqueado ? (
          <button
            type="button"
            aria-disabled="true"
            onClick={() => toast.info(faltan > 0 ? 'Aún no completas la lección: revisa los puntos pendientes del tutor.' : 'El tutor aún está revisando tu encargo.')}
            className="flex min-w-0 flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400"
          >
            <Lock size={13} className="shrink-0" />
            <span className="truncate">{siguiente.texto}</span>
          </button>
        ) : (
          <Link
            to={siguiente.to}
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            {siguiente.checkpoint && <Flag size={13} className="shrink-0" />}
            <span className="truncate">{siguiente.texto}</span>
            <ArrowRight size={14} className="shrink-0" />
          </Link>
        )}
      </div>
    </div>
  )
}
