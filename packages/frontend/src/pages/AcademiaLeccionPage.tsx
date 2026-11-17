import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle, GraduationCap, ListTree, Lock, Target } from 'lucide-react'
import {
  LECCIONES_CURSO, estadoBloqueo, leccionCompleta, leccionPorId, practicaHecha, rutaCheckpoint,
  type Leccion, type ProgresoAcademia,
} from '@auditorya/types'
import { useProgresoAcademia } from '../hooks/useAcademia'
import { IndiceCurso } from '../components/academia/IndiceCurso'
import { EjercicioCasoLeccion } from '../components/academia/EjercicioCaso'
import {
  BarraPasos, PasosLeccion, destinoSiguiente, etiquetaPaso, pasosDe, rutaPaso, type PasoLeccion,
} from '../components/academia/PasosLeccion'
import { Modal } from '../components/ui/Modal'
import { cn } from '../lib/cn'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
      {children}
    </section>
  )
}

function Requisito({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={cn('flex items-start gap-2 text-sm', ok ? 'text-emerald-700' : 'text-slate-600')}>
      {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" /> : <Circle size={15} className="mt-0.5 shrink-0 text-slate-300" />}
      {texto}
    </li>
  )
}

/** Lo que falta para cerrar la lección (y abrir la siguiente). */
function EstadoLeccion({ leccion, progreso }: { leccion: Leccion; progreso: ProgresoAcademia }) {
  const leida = progreso.leidas.includes(leccion.id)
  const hecha = practicaHecha(leccion, progreso)
  const completa = leccionCompleta(leccion, progreso)

  return (
    <div className={cn('rounded-xl border p-4', completa ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white')}>
      <p className={cn('text-sm font-semibold', completa ? 'text-emerald-800' : 'text-slate-900')}>
        {completa ? 'Lección completa' : 'Para avanzar'}
      </p>
      <ul className="mt-2.5 space-y-1.5">
        <Requisito ok={leida} texto="Lee la teoría y pulsa «Ya lo entendí»" />
        {leccion.practica && <Requisito ok={hecha} texto="Haz la práctica en AuditorYa" />}
        {leccion.ejercicio && <Requisito ok={hecha} texto="Resuelve el ejercicio del caso" />}
      </ul>
    </div>
  )
}

function FichaEntregable({ leccion }: { leccion: Leccion }) {
  if (!leccion.entregable && !leccion.norma) return null
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      {leccion.entregable && (
        <div>
          <p className="font-semibold text-slate-900">Entregable</p>
          <p className="mt-0.5 text-slate-700">{leccion.entregable}</p>
        </div>
      )}
      {leccion.norma && (
        <div>
          <p className="font-semibold text-slate-900">Norma</p>
          <p className="mt-0.5 font-mono text-xs text-violet-700">{leccion.norma}</p>
        </div>
      )}
    </div>
  )
}

function LeccionBloqueada({ leccion, requiere }: { leccion: Leccion; requiere: { texto: string; to: string } }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6 sm:py-24">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
        <Lock size={20} className="text-violet-600" />
      </div>
      <p className="mt-4 font-mono text-xs uppercase tracking-wider text-slate-500">Lección {leccion.id}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{leccion.titulo}</h1>
      <p className="mt-3 text-slate-600">Esta lección se abre cuando {requiere.texto}.</p>
      <Link
        to={requiere.to}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        Ir a donde quedé <ArrowRight size={15} />
      </Link>
    </div>
  )
}

/** Paso 1: la teoría, en una columna de lectura. Abre con el porqué; el cómo va en «En el caso». */
function PasoEntender({ leccion }: { leccion: Leccion }) {
  return (
    <div className="min-w-0 max-w-3xl space-y-7">
      {leccion.porQue && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Por qué importa</h2>
          <p className="text-[15px] leading-relaxed text-slate-700">{leccion.porQue}</p>
          {leccion.objetivo && (
            <p className="flex gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600">
              <Target size={16} className="mt-0.5 shrink-0 text-violet-600" />
              <span><span className="font-semibold text-slate-800">Al terminar podrás:</span> {leccion.objetivo.charAt(0).toLowerCase() + leccion.objetivo.slice(1)}</span>
            </p>
          )}
        </section>
      )}

      {leccion.narrativa?.map((s) => (
        <Seccion key={s.titulo} titulo={s.titulo}>
          <div className="space-y-2 text-[15px] leading-relaxed text-slate-700">
            {s.parrafos.map((p) => <p key={p}>{p}</p>)}
          </div>
        </Seccion>
      ))}

      {leccion.queHacer && (
        <Seccion titulo="Qué hacer">
          <ul className="list-disc space-y-1.5 pl-5 text-[15px] text-slate-700">
            {leccion.queHacer.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Seccion>
      )}

      {leccion.tabla && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>{leccion.tabla.encabezados.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {leccion.tabla.filas.map((f) => (
                <tr key={f.join('|')} className="border-t border-slate-100">
                  {f.map((c, i) => <td key={i} className={cn('px-4 py-2.5 text-slate-700', /^[\d.]+$/.test(c) && 'font-mono text-right')}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leccion.modelo && (
        <Seccion titulo="Modelo">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[13px] leading-relaxed text-slate-700">
            {leccion.modelo}
          </pre>
        </Seccion>
      )}

      {leccion.exigencias && (
        <Seccion titulo="Lo que exige la norma">
          <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {leccion.exigencias.map((e, i) => (
              <li key={e.norma} className={cn('grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3', i > 0 && 'border-t border-slate-100')}>
                <span className="font-mono text-xs font-medium text-violet-700">{e.norma}</span>
                <span className="text-slate-700">{e.requisito}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  )
}

/** Paso 2: cómo se ve la lección en la Comercializadora, cómo se desarrolla y el error que hay que evitar. */
function PasoCaso({ leccion }: { leccion: Leccion }) {
  return (
    <div className="min-w-0 max-w-3xl space-y-6">
      {leccion.enElCaso && (
        <section className="space-y-2 rounded-2xl bg-violet-50 p-5 sm:p-6">
          <p className="text-sm font-semibold text-violet-800">En la Comercializadora Ejemplo S.A.S.</p>
          <p className="text-[17px] leading-relaxed text-slate-800">{leccion.enElCaso}</p>
        </section>
      )}
      {leccion.comoHacerlo && (
        <Seccion titulo="Cómo desarrollarlo">
          <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-slate-700 marker:text-violet-500">
            {leccion.comoHacerlo.map((x) => <li key={x}>{x}</li>)}
          </ol>
        </Seccion>
      )}
      {leccion.errorFrecuente && (
        <section className="space-y-1.5 rounded-xl border border-rose-200 bg-white p-5">
          <p className="text-sm font-semibold text-rose-700">Error frecuente</p>
          <p className="text-[15px] leading-relaxed text-slate-700">{leccion.errorFrecuente}</p>
        </section>
      )}
      <FichaEntregable leccion={leccion} />
    </div>
  )
}

export function AcademiaLeccionPage() {
  const { leccionId = '' } = useParams<{ leccionId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { progreso, marcarLeida } = useProgresoAcademia()
  // Celular y tablet: el índice del curso vive en un panel (en pantallas grandes es la columna izquierda).
  const [indiceAbierto, setIndiceAbierto] = useState(false)
  useEffect(() => setIndiceAbierto(false), [leccionId])

  const encontrada = leccionPorId(leccionId)
  const bloqueo = estadoBloqueo(leccionId, progreso)
  const pasos = encontrada ? pasosDe(encontrada.leccion) : []
  const pedido = searchParams.get('paso') as PasoLeccion | null
  const paso: PasoLeccion = pedido && pasos.includes(pedido) ? pedido : 'entender'

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [leccionId, paso])

  if (!encontrada) return <Navigate to="/academia" replace />
  const { modulo, leccion, indice } = encontrada

  if (!bloqueo.desbloqueada) {
    const requiere = bloqueo.motivo === 'leccion'
      ? { texto: `completes la lección ${bloqueo.requiere.id} «${bloqueo.requiere.titulo}»`, to: `/academia/${bloqueo.requiere.id}` }
      : { texto: `apruebes el checkpoint de ${bloqueo.requiere.corto}`, to: rutaCheckpoint(bloqueo.requiere) }
    return <LeccionBloqueada leccion={leccion} requiere={requiere} />
  }
  // El paso «Hazlo» con playground es el taller, en su propia página.
  if (paso === 'hazlo' && leccion.practica) return <Navigate to={rutaPaso(leccion, 'hazlo')} replace />

  const leida = progreso.leidas.includes(leccion.id)
  const hecha = practicaHecha(leccion, progreso)
  const posicion = pasos.indexOf(paso)
  const pasoSiguiente = pasos[posicion + 1]
  const pasoAnterior = pasos[posicion - 1]
  const leccionAnterior = LECCIONES_CURSO[indice - 1]

  const anterior = pasoAnterior
    ? { to: rutaPaso(leccion, pasoAnterior), texto: etiquetaPaso(leccion, pasoAnterior), corto: 'Atrás' }
    : leccionAnterior
      ? { to: `/academia/${leccionAnterior.id}`, texto: `${leccionAnterior.id} ${leccionAnterior.titulo}`, corto: 'Anterior' }
      : undefined

  const destino = destinoSiguiente(leccion.id, progreso)
  // Lo que falta para cerrar la lección: se muestra junto al botón bloqueado y en el aviso al tocarlo.
  const pendientes = [
    ...(leida ? [] : ['marcar la teoría como entendida']),
    ...(hecha ? [] : [leccion.practica ? 'hacer la práctica en AuditorYa' : 'resolver el ejercicio del caso']),
  ]
  const principal = (() => {
    if (paso === 'entender' && !leida) {
      return {
        tipo: 'boton' as const,
        texto: 'Ya lo entendí',
        onClick: () => {
          marcarLeida(leccion.id)
          navigate(pasoSiguiente ? rutaPaso(leccion, pasoSiguiente) : destino.to)
        },
      }
    }
    if (pasoSiguiente) return { tipo: 'link' as const, to: rutaPaso(leccion, pasoSiguiente), texto: etiquetaPaso(leccion, pasoSiguiente) }
    if (!destino.abierto) {
      return { tipo: 'bloqueado' as const, texto: destino.texto, corto: destino.corto, motivo: `Aún no completas la lección. Te falta: ${pendientes.join(' y ')}.` }
    }
    return { tipo: 'link' as const, to: destino.to, texto: destino.texto, corto: destino.corto, icono: destino.checkpoint ? ('flag' as const) : undefined }
  })()

  return (
    <div className="flex">
      <aside className="hidden xl:block w-72 shrink-0 border-r border-slate-200 bg-white p-5 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        <Link to="/academia" className="mb-4 flex items-center gap-2 text-sm font-semibold text-violet-700">
          <GraduationCap size={15} /> Academia
        </Link>
        <IndiceCurso progreso={progreso} actual={leccion.id} />
      </aside>

      <Modal open={indiceAbierto} onClose={() => setIndiceAbierto(false)} title="Índice del curso">
        <IndiceCurso progreso={progreso} actual={leccion.id} />
      </Modal>

      {/* pb-24: en celular la barra de pasos queda fija abajo. */}
      <div className="flex-1 min-w-0 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <header className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
                <span className="sm:hidden">{modulo.ref} · Lección {leccion.id}</span>
                <span className="hidden sm:inline">{modulo.ref} · {modulo.titulo} · Lección {leccion.id}</span>
              </p>
              <button
                type="button"
                onClick={() => setIndiceAbierto(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 xl:hidden"
              >
                <ListTree size={14} /> Índice
              </button>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{leccion.titulo}</h1>
            <p className="max-w-3xl text-base text-slate-600 sm:text-lg">{leccion.resumen}</p>
            <PasosLeccion leccion={leccion} paso={paso} progreso={progreso} className="pt-2" />
          </header>

          {paso === 'hazlo' ? (
            <EjercicioCasoLeccion key={leccion.id} leccion={leccion} />
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
              {paso === 'entender' ? <PasoEntender leccion={leccion} /> : <PasoCaso leccion={leccion} />}
              <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
                <EstadoLeccion leccion={leccion} progreso={progreso} />
                {paso === 'entender' && <FichaEntregable leccion={leccion} />}
              </aside>
            </div>
          )}

          {paso === 'hazlo' && !destino.abierto && pendientes.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Para continuar te {pendientes.length === 1 ? 'falta' : 'faltan'}:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {!leida && (
                  <li>
                    Marcar la teoría como entendida en{' '}
                    <Link to={rutaPaso(leccion, 'entender')} className="font-medium underline">Entender</Link>
                  </li>
                )}
                {!hecha && <li>Resolver el ejercicio del caso</li>}
              </ul>
            </div>
          )}

          <div className="lg:border-t lg:border-slate-200">
            <BarraPasos anterior={anterior} principal={principal} />
          </div>
        </div>
      </div>
    </div>
  )
}
