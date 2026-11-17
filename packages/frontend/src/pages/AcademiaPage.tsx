import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Flag, FlaskConical, GraduationCap, Lock, PenLine } from 'lucide-react'
import {
  CONCEPTOS_BASE, GLOSARIO, INTRO_CURSO, MODULOS_CURSO, NORMAS_COLOMBIA, checkpointAprobado, checkpointDisponible,
  estadoBloqueo, leccionCompleta, leccionPorId, practicaHecha, rutaCheckpoint, siguientePaso,
  type ModuloCurso, type ProgresoAcademia,
} from '@auditorya/types'
import { cn } from '../lib/cn'
import { useProgresoAcademia, useReiniciarCurso } from '../hooks/useAcademia'
import { BarraAvance } from '../components/academia/IndiceCurso'
import { CtaVersionCompleta } from '../components/academia/AcademiaLayout'
import { etiquetaPaso, pasosDe, rutaRetomar } from '../components/academia/PasosLeccion'
import { confirmar } from '../store/confirm.store'

type EstadoFase = 'hecha' | 'actual' | 'bloqueada'

/** Una fase está hecha con su checkpoint aprobado (o, sin checkpoint, con todas sus lecciones). */
function estadoFase(m: ModuloCurso, progreso: ProgresoAcademia): EstadoFase {
  const hecha = m.checkpoint
    ? checkpointAprobado(progreso.repasos[m.id])
    : m.lecciones.every((l) => leccionCompleta(l, progreso))
  if (hecha) return 'hecha'
  return estadoBloqueo(m.lecciones[0].id, progreso).desbloqueada ? 'actual' : 'bloqueada'
}

/** Destino al tocar una fase: la primera lección pendiente, su checkpoint si falta, o su inicio. */
function destinoFase(m: ModuloCurso, progreso: ProgresoAcademia): string {
  const pendiente = m.lecciones.find((l) => !leccionCompleta(l, progreso) && estadoBloqueo(l.id, progreso).desbloqueada)
  if (pendiente) return rutaRetomar(pendiente, progreso)
  if (checkpointDisponible(m, progreso) && !checkpointAprobado(progreso.repasos[m.id])) return rutaCheckpoint(m)
  return `/academia/${m.lecciones[0].id}`
}

/** Tarjeta de «continúa donde quedaste»: lección, paso pendiente y cuánto le falta a la fase. */
function Retomar({ progreso }: { progreso: ProgresoAcademia }) {
  const siguiente = siguientePaso(progreso)
  if (!siguiente) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <CheckCircle2 size={22} className="shrink-0 text-emerald-600" />
        <p className="min-w-0 flex-1 font-semibold text-emerald-900">Terminaste el curso completo. Puedes repasar cualquier lección.</p>
      </div>
    )
  }

  const modulo = siguiente.tipo === 'leccion' ? leccionPorId(siguiente.leccion.id)!.modulo : siguiente.modulo
  const completas = modulo.lecciones.filter((l) => leccionCompleta(l, progreso)).length
  let titulo: string
  let pendiente: string
  let to: string
  if (siguiente.tipo === 'leccion') {
    const l = siguiente.leccion
    const leida = progreso.leidas.includes(l.id)
    const falta = leida && pasosDe(l).includes('hazlo') && !practicaHecha(l, progreso) ? 'hazlo' : 'entender'
    titulo = `${l.id} ${l.titulo}`
    pendiente = `Te falta: ${etiquetaPaso(l, falta)}`
    to = rutaRetomar(l, progreso)
  } else {
    titulo = `Checkpoint de la ${modulo.ref}`
    pendiente = `Quiz de ${modulo.checkpoint!.preguntas.length} preguntas para abrir la fase siguiente`
    to = rutaCheckpoint(modulo)
  }

  return (
    <Link
      to={to}
      className="group grid gap-4 rounded-2xl border border-violet-200 bg-white p-5 hover:border-violet-400 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6"
    >
      <span className="min-w-0 space-y-1">
        <span className="block text-sm font-semibold text-violet-700">Continúa donde quedaste</span>
        <span className="block text-lg font-bold text-slate-900 sm:text-xl">{titulo}</span>
        <span className="block text-sm text-slate-600">
          {pendiente} · {modulo.corto}: {completas} de {modulo.lecciones.length} lecciones
        </span>
      </span>
      <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white group-hover:bg-violet-700">
        Seguir <ArrowRight size={15} />
      </span>
    </Link>
  )
}

/** Ruta del curso: una tarjeta por fase con su estado en la franja superior. */
function RutaCurso({ progreso }: { progreso: ProgresoAcademia }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {MODULOS_CURSO.map((m, i) => {
        const estado = estadoFase(m, progreso)
        const completas = m.lecciones.filter((l) => leccionCompleta(l, progreso)).length
        const conPractica = m.lecciones.filter((l) => l.practica).length
        const conEjercicio = m.lecciones.filter((l) => l.ejercicio).length
        const anterior = MODULOS_CURSO[i - 1]
        const contenido = (
          <>
            <span
              className={cn(
                'h-1 rounded-t-xl',
                estado === 'hecha' && 'bg-emerald-500',
                estado === 'actual' && 'bg-violet-600',
                estado === 'bloqueada' && 'bg-slate-200',
              )}
            />
            <span className="flex flex-1 flex-col gap-1.5 p-4">
              <span className="flex items-center justify-between text-xs font-medium text-slate-500">
                {m.ref}
                {estado === 'hecha' && <CheckCircle2 size={14} className="text-emerald-500" aria-label="Fase aprobada" />}
                {estado === 'bloqueada' && <Lock size={12} className="text-slate-400" aria-label="Bloqueada" />}
              </span>
              <span className={cn('font-semibold', estado === 'bloqueada' ? 'text-slate-500' : 'text-slate-900')}>{m.corto}</span>
              <span className="text-xs text-slate-500">{m.lecciones.length} lecciones · {m.duracion}</span>
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                {conPractica > 0 && <span className="inline-flex items-center gap-1"><FlaskConical size={11} /> {conPractica} en AuditorYa</span>}
                {conEjercicio > 0 && <span className="inline-flex items-center gap-1"><PenLine size={11} /> {conEjercicio} del caso</span>}
                {m.checkpoint && <span className="inline-flex items-center gap-1"><Flag size={11} /> Quiz</span>}
              </span>
              <span className={cn('mt-auto pt-3 text-xs font-medium', estado === 'actual' ? 'text-violet-700' : 'text-slate-500')}>
                {estado === 'bloqueada'
                  ? `Se abre al terminar ${anterior?.corto ?? 'la fase anterior'}`
                  : `${completas} de ${m.lecciones.length} completas`}
              </span>
            </span>
          </>
        )
        const clase = cn(
          'flex h-full flex-col rounded-xl border bg-white',
          estado === 'actual' ? 'border-violet-300' : 'border-slate-200',
        )
        return (
          <li key={m.id}>
            {estado === 'bloqueada' ? (
              <div className={clase} aria-disabled="true">{contenido}</div>
            ) : (
              <Link to={destinoFase(m, progreso)} className={cn(clase, 'hover:border-violet-400')}>{contenido}</Link>
            )}
          </li>
        )
      })}
    </ol>
  )
}

type Consulta = 'conceptos' | 'normas' | 'glosario'

const PESTANAS_CONSULTA: { id: Consulta; label: string }[] = [
  { id: 'conceptos', label: 'Conceptos base' },
  { id: 'normas', label: 'Marco normativo' },
  { id: 'glosario', label: 'Glosario' },
]

/** Material de referencia del curso: se consulta cuando hace falta, no se lee de corrido. */
function MaterialConsulta() {
  const [pestana, setPestana] = useState<Consulta>('conceptos')
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Material de consulta</h2>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist">
          {PESTANAS_CONSULTA.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium',
                pestana === p.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {pestana === 'conceptos' && (
        <div className="grid gap-3 md:grid-cols-2">
          {CONCEPTOS_BASE.map((c) => (
            <div key={c.titulo} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">{c.titulo}</h3>
              <p className="text-sm text-slate-600">{c.texto}</p>
              {c.formula && <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{c.formula}</p>}
            </div>
          ))}
        </div>
      )}

      {pestana === 'normas' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>{NORMAS_COLOMBIA.encabezados.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {NORMAS_COLOMBIA.filas.map((f) => (
                <tr key={f[0]} className="border-t border-slate-100 align-top">
                  {f.map((celda, i) => <td key={i} className={i === 0 ? 'px-4 py-2.5 font-medium text-slate-800' : 'px-4 py-2.5 text-slate-600'}>{celda}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pestana === 'glosario' && (
        <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-[200px_minmax(0,1fr)]">
          {GLOSARIO.map((g) => (
            <div key={g.termino} className="contents">
              <dt className="font-semibold text-slate-800">{g.termino}</dt>
              <dd className="text-sm text-slate-600">{g.definicion}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export function AcademiaPage() {
  const { progreso } = useProgresoAcademia()
  const reiniciarCurso = useReiniciarCurso()

  async function onReiniciarCurso() {
    const ok = await confirmar({
      titulo: 'Empezar el curso de cero',
      descripcion: 'Se borran tu avance y todo lo que hiciste en el encargo de práctica en este navegador.',
      confirmar: 'Empezar de cero',
    })
    if (ok) reiniciarCurso.mutate()
  }
  const empezado = progreso.leidas.length > 0 || progreso.practicadas.length > 0 || progreso.ejercicios.length > 0
  const primera = MODULOS_CURSO[0].lecciones[0]

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:p-8">
      {/* Encabezado */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-violet-700">
            <GraduationCap size={16} /> AuditorYa Academia
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Curso básico de auditoría financiera</h1>
          <p className="mt-3 max-w-2xl text-slate-600">{INTRO_CURSO.intro}</p>
          {/* Presentación solo para quien llega: a quien ya empezó le importa retomar. */}
          {!empezado && (
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Gratis y sin contraseña: aprendes cada fase bajo NIA y la practicas en la interfaz real de AuditorYa,
              sobre un encargo de práctica. Tu avance se guarda en este navegador.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {INTRO_CURSO.normas.map((n) => (
              <span key={n} className="rounded-full border border-violet-200 bg-white px-2.5 py-0.5 text-xs text-violet-700">{n}</span>
            ))}
          </div>
          {!empezado && (
            <Link
              to={`/academia/${primera.id}`}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              Empezar el curso <ArrowRight size={15} />
            </Link>
          )}
        </div>
        {empezado && (
          <div className="space-y-2">
            <BarraAvance progreso={progreso} />
            <button type="button" onClick={onReiniciarCurso} className="text-xs text-slate-400 hover:text-slate-600">
              Empezar el curso de cero
            </button>
          </div>
        )}
      </div>

      {empezado && <Retomar progreso={progreso} />}

      {/* Ruta */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">La ruta del curso</h2>
        <RutaCurso progreso={progreso} />
      </section>

      {/* Caso */}
      <section className="space-y-2 rounded-2xl bg-violet-50 p-5 sm:p-6">
        <p className="text-sm font-semibold text-violet-800">El caso que acompaña el curso</p>
        <p className="text-slate-700">{INTRO_CURSO.caso}</p>
      </section>

      <CtaVersionCompleta
        ubicacion="inicio_curso"
        titulo="¿Tu firma ya audita bajo NIA? Hazlo en un solo lugar."
        texto="Lo que practicas aquí es AuditorYa: planeación, riesgos, papeles de trabajo, evidencia e informes de revisoría fiscal para firmas colombianas."
      />

      <MaterialConsulta />
    </div>
  )
}
