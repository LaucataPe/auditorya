import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Briefcase, CheckCircle2, Flag, GraduationCap, ListTree, Lock, Sparkles } from 'lucide-react'
import {
  MODULOS_CURSO, checkpointAprobado, checkpointDisponible, estadoBloqueo, moduloPorId, siguientePaso, type ModuloCurso,
} from '@auditorya/types'
import { useProgresoAcademia } from '../hooks/useAcademia'
import { IndiceCurso } from '../components/academia/IndiceCurso'
import { QuizCheckpoint } from '../components/academia/QuizCheckpoint'
import { CtaVersionCompleta } from '../components/academia/AcademiaLayout'
import { Modal } from '../components/ui/Modal'
import { cn } from '../lib/cn'

function CheckpointBloqueado({ modulo, irA }: { modulo: ModuloCurso; irA: string }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6 sm:py-24">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
        <Lock size={20} className="text-violet-600" />
      </div>
      <p className="mt-4 font-mono text-xs uppercase tracking-wider text-slate-500">{modulo.ref} · Checkpoint</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{modulo.corto}</h1>
      <p className="mt-3 text-slate-600">El checkpoint se abre cuando completes todas las lecciones de la fase.</p>
      <Link
        to={irA}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        Ir a donde quedé <ArrowRight size={15} />
      </Link>
    </div>
  )
}

export function AcademiaCheckpointPage() {
  const { moduloId = '' } = useParams<{ moduloId: string }>()
  const { progreso } = useProgresoAcademia()
  const [indiceAbierto, setIndiceAbierto] = useState(false)
  useEffect(() => setIndiceAbierto(false), [moduloId])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [moduloId])

  const modulo = moduloPorId(moduloId)
  if (!modulo?.checkpoint) return <Navigate to="/academia" replace />

  if (!checkpointDisponible(modulo, progreso)) {
    const paso = siguientePaso(progreso)
    return <CheckpointBloqueado modulo={modulo} irA={paso?.tipo === 'leccion' ? `/academia/${paso.leccion.id}` : '/academia'} />
  }

  const { aprendido, caso } = modulo.checkpoint
  const aprobado = checkpointAprobado(progreso.repasos[modulo.id])
  const ultima = modulo.lecciones[modulo.lecciones.length - 1]
  const siguienteModulo = MODULOS_CURSO[MODULOS_CURSO.indexOf(modulo) + 1]
  const primeraSiguiente = siguienteModulo?.lecciones[0]
  const siguienteAbierta = primeraSiguiente ? estadoBloqueo(primeraSiguiente.id, progreso).desbloqueada : false

  return (
    <div className="flex">
      <aside className="hidden xl:block w-72 shrink-0 border-r border-slate-200 bg-white p-5 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <Link to="/academia" className="mb-4 flex items-center gap-2 text-sm font-semibold text-violet-700">
          <GraduationCap size={15} /> Academia
        </Link>
        <IndiceCurso progreso={progreso} checkpointActual={modulo.id} />
      </aside>

      <Modal open={indiceAbierto} onClose={() => setIndiceAbierto(false)} title="Índice del curso">
        <IndiceCurso progreso={progreso} checkpointActual={modulo.id} />
      </Modal>

      <div className="flex-1 min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <div className="mx-auto max-w-7xl space-y-8 sm:space-y-10">
          {/* Encabezado */}
          <header className="space-y-3 border-b border-slate-200 pb-6">
            <p className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs uppercase tracking-wider text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Flag size={12} className="text-violet-600" /> {modulo.ref} · Checkpoint</span>
              <button
                type="button"
                onClick={() => setIndiceAbierto(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 font-sans text-xs normal-case tracking-normal text-violet-700 xl:hidden"
              >
                <ListTree size={13} /> Índice
              </button>
            </p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Cerraste {modulo.corto}</h1>
            <p className="max-w-4xl text-base text-slate-700 sm:text-lg">
              Antes de pasar a la siguiente fase, repasa lo esencial, mira cómo quedó el encargo y demuestra lo que
              aprendiste en el quiz.
            </p>
            <ol className="flex flex-wrap gap-2 text-xs">
              {['Lo que aprendiste', 'Cómo va el caso', `Quiz de ${modulo.checkpoint.preguntas.length} preguntas`].map((t, i) => (
                <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-0.5 text-violet-700">
                  <span className="font-mono">{i + 1}</span> {t}
                </li>
              ))}
            </ol>
          </header>

          {/* Resumen + caso */}
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Sparkles size={13} /> Lo que aprendiste
              </h2>
              <ol className="space-y-2">
                {aprendido.map((a, i) => (
                  <li key={a} className="flex gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-700">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 font-mono text-xs font-semibold text-violet-700">{i + 1}</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
              {modulo.entregables.length > 0 && (
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Entregables de la fase</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {modulo.entregables.map((e) => (
                      <span key={e} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700">{e}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Briefcase size={13} /> Cómo va el caso
              </h2>
              <div className="overflow-hidden rounded-2xl border-2 border-violet-300 bg-white">
                <div className="bg-violet-950 px-4 py-3 text-white sm:px-5">
                  <p className="text-[11px] uppercase tracking-wider text-violet-300">Comercializadora Ejemplo S.A.S. · Revisoría fiscal 2026</p>
                  <p className="mt-0.5 text-sm font-semibold">{caso.resumen}</p>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <dl className="grid grid-cols-2 gap-2">
                    {caso.cifras.map((c) => (
                      <div key={c.etiqueta} className="rounded-lg bg-violet-50 px-3 py-2">
                        <dt className="text-[11px] text-violet-700">{c.etiqueta}</dt>
                        <dd className="font-mono text-base font-semibold tabular-nums text-violet-950">{c.valor}</dd>
                      </div>
                    ))}
                  </dl>
                  <ul className="space-y-2">
                    {caso.hitos.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="rounded-lg border-l-4 border-violet-500 bg-violet-50 px-3 py-2 text-sm text-slate-800">
                    <b>Lo que viene:</b> {caso.siguiente}
                  </p>
                </div>
              </div>
            </section>
          </div>

          {modulo.casosReales.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-slate-900">Casos reales que explican esta fase</h2>
              <div className={cn('grid gap-3 md:grid-cols-2', modulo.casosReales.length >= 3 && 'xl:grid-cols-3')}>
                {modulo.casosReales.map((c) => (
                  <article key={c.titulo} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{c.contexto}</p>
                    <h3 className="font-semibold text-slate-900">{c.titulo}</h3>
                    <p className="text-sm text-slate-600">{c.hechos}</p>
                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-slate-700"><b>Lección:</b> {c.leccion}</p>
                    <p className="font-mono text-xs text-violet-700">{c.normas}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Quiz y, al aprobar, el cierre de la fase con la invitación comercial (solo aquí, no junto al quiz). */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <QuizCheckpoint key={modulo.id} modulo={modulo} />
            {aprobado && (
              <div className="space-y-4 lg:sticky lg:top-20">
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 size={16} /> {modulo.ref} aprobada
                  </p>
                  {primeraSiguiente && siguienteModulo ? (
                    <Link
                      to={`/academia/${primeraSiguiente.id}`}
                      className="flex items-center gap-3 rounded-xl bg-violet-600 p-4 text-white hover:bg-violet-700"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-violet-200">Sigue con la {siguienteModulo.ref}</span>
                        <span className="block font-semibold">{siguienteModulo.corto}</span>
                      </span>
                      <ArrowRight size={18} className="shrink-0" />
                    </Link>
                  ) : (
                    <p className="text-sm text-emerald-900">Terminaste el curso completo.</p>
                  )}
                </div>
                <CtaVersionCompleta
                  ubicacion={`checkpoint_${modulo.id}`}
                  titulo={siguienteModulo ? `Terminaste ${modulo.corto}. Así se ve con tus clientes reales.` : 'Terminaste el curso. Ahora audita con AuditorYa.'}
                  texto="En AuditorYa la planeación, los riesgos, la evidencia y los informes de tus encargos viven en un solo lugar, con la guía NIA que acabas de practicar. Únete al programa fundador."
                />
              </div>
            )}
          </div>

          {/* Navegación */}
          <nav className="flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <Link to={`/academia/${ultima.id}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:border-violet-300 sm:px-4">
              <ArrowLeft size={14} className="shrink-0" />
              <span className="truncate"><span className="sm:hidden">Anterior</span><span className="hidden sm:inline">{ultima.id} {ultima.titulo}</span></span>
            </Link>
            {primeraSiguiente ? (
              siguienteAbierta ? (
                <Link to={`/academia/${primeraSiguiente.id}`} className="ml-auto flex min-w-0 items-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-sm text-white hover:bg-violet-700 sm:px-4">
                  <span className="truncate"><span className="sm:hidden">Siguiente {primeraSiguiente.id}</span><span className="hidden sm:inline">{primeraSiguiente.id} {primeraSiguiente.titulo}</span></span>
                  <ArrowRight size={14} className="shrink-0" />
                </Link>
              ) : (
                <span className="ml-auto flex min-w-0 cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-400 sm:px-4" title="Aprueba el quiz para continuar">
                  <Lock size={13} className="shrink-0" />
                  <span className="truncate"><span className="sm:hidden">Siguiente {primeraSiguiente.id}</span><span className="hidden sm:inline">{primeraSiguiente.id} {primeraSiguiente.titulo}</span></span>
                </span>
              )
            ) : (
              <Link to="/academia" className="ml-auto flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm text-white hover:bg-violet-700">
                Volver al curso <ArrowRight size={14} />
              </Link>
            )}
          </nav>
        </div>
      </div>
    </div>
  )
}
