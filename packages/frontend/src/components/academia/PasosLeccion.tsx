import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Flag, Lock } from 'lucide-react'
import {
  LECCIONES_CURSO, checkpointAprobado, estadoBloqueo, leccionCompleta, leccionPorId, practicaHecha, rutaCheckpoint,
  type Leccion, type ProgresoAcademia,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { toast } from '../../store/toast.store'

/**
 * Una lección se recorre en pasos: Entender (por qué y qué) → En el caso (cómo, aplicado) → Hazlo.
 * «En el caso» se omite cuando la lección no trae caso ni procedimiento (Clase 0). «Hazlo» es el taller (/practica) si hay playground, o el ejercicio
 * del caso dentro de la página de la lección.
 */
export type PasoLeccion = 'entender' | 'caso' | 'hazlo'

export function pasosDe(leccion: Leccion): PasoLeccion[] {
  const pasos: PasoLeccion[] = ['entender']
  if (leccion.enElCaso || leccion.comoHacerlo || leccion.errorFrecuente) pasos.push('caso')
  if (leccion.practica || leccion.ejercicio) pasos.push('hazlo')
  return pasos
}

export function etiquetaPaso(leccion: Leccion, paso: PasoLeccion): string {
  if (paso === 'entender') return 'Entender'
  if (paso === 'caso') return 'En el caso'
  return leccion.practica ? 'Hazlo en AuditorYa' : 'Resuelve el ejercicio'
}

export function rutaPaso(leccion: Leccion, paso: PasoLeccion): string {
  if (paso === 'entender') return `/academia/${leccion.id}`
  if (paso === 'hazlo' && leccion.practica) return `/academia/${leccion.id}/practica`
  return `/academia/${leccion.id}?paso=${paso}`
}

/** Dónde retomar una lección: la teoría si falta leerla; si no, la práctica pendiente. */
export function rutaRetomar(leccion: Leccion, progreso: ProgresoAcademia): string {
  const leida = progreso.leidas.includes(leccion.id)
  const pasos = pasosDe(leccion)
  if (leida && pasos.includes('hazlo') && !practicaHecha(leccion, progreso)) return rutaPaso(leccion, 'hazlo')
  return rutaPaso(leccion, 'entender')
}

function pasoHecho(leccion: Leccion, paso: PasoLeccion, actual: PasoLeccion, progreso: ProgresoAcademia): boolean {
  const pasos = pasosDe(leccion)
  if (paso === 'entender') return progreso.leidas.includes(leccion.id)
  if (paso === 'hazlo') return practicaHecha(leccion, progreso)
  // «En el caso» no se registra: cuenta como visto al pasar más allá o al tener la práctica hecha.
  return pasos.indexOf(actual) > pasos.indexOf('caso') || practicaHecha(leccion, progreso)
}

/** Lo que viene después de la lección: la siguiente, el checkpoint de la fase o el fin del curso. */
export function destinoSiguiente(leccionId: string, progreso: ProgresoAcademia): {
  to: string
  texto: string
  corto: string
  abierto: boolean
  checkpoint: boolean
} {
  const { modulo, leccion, indice } = leccionPorId(leccionId)!
  const ultimaDeFase = modulo.lecciones[modulo.lecciones.length - 1].id === leccion.id
  if (ultimaDeFase && modulo.checkpoint) {
    const aprobado = checkpointAprobado(progreso.repasos[modulo.id])
    return {
      to: rutaCheckpoint(modulo),
      texto: `Checkpoint de la ${modulo.ref}${aprobado ? ' ✓' : ''}`,
      corto: 'Checkpoint',
      abierto: leccionCompleta(leccion, progreso),
      checkpoint: true,
    }
  }
  const siguiente = LECCIONES_CURSO[indice + 1]
  if (!siguiente) return { to: '/academia', texto: 'Volver al curso', corto: 'Volver al curso', abierto: true, checkpoint: false }
  return {
    to: `/academia/${siguiente.id}`,
    texto: `${siguiente.id} ${siguiente.titulo}`,
    corto: `Siguiente ${siguiente.id}`,
    abierto: estadoBloqueo(siguiente.id, progreso).desbloqueada,
    checkpoint: false,
  }
}

/** Stepper de la lección, con el mismo lenguaje que el workspace del encargo. */
export function PasosLeccion({
  leccion, paso, progreso, className,
}: {
  leccion: Leccion
  paso: PasoLeccion
  progreso: ProgresoAcademia
  className?: string
}) {
  const pasos = pasosDe(leccion)
  return (
    <ol className={cn('flex overflow-x-auto border-b border-slate-200', className)}>
      {pasos.map((p, i) => {
        const hecho = pasoHecho(leccion, p, paso, progreso)
        const activo = p === paso
        return (
          <li key={p} className="shrink-0">
            <Link
              to={rutaPaso(leccion, p)}
              aria-current={activo ? 'step' : undefined}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium sm:px-4',
                activo ? 'border-violet-600 text-violet-800' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  activo ? 'bg-violet-600 text-white' : hecho ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                )}
              >
                {hecho && !activo ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              {p === 'hazlo' ? (
                <>
                  <span className="sm:hidden">{leccion.practica ? 'Hazlo' : 'Resuelve'}</span>
                  <span className="hidden sm:inline">{etiquetaPaso(leccion, p)}</span>
                </>
              ) : etiquetaPaso(leccion, p)}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

type Accion =
  | { tipo: 'link'; to: string; texto: string; corto?: string; icono?: 'flag' }
  | { tipo: 'boton'; onClick: () => void; texto: string; corto?: string }
  | { tipo: 'bloqueado'; texto: string; corto?: string; motivo: string }

function Etiqueta({ texto, corto }: { texto: string; corto?: string }) {
  if (!corto) return <span className="truncate">{texto}</span>
  return (
    <span className="truncate">
      <span className="sm:hidden">{corto}</span>
      <span className="hidden sm:inline">{texto}</span>
    </span>
  )
}

/**
 * Navegación de la lección: anterior y acción principal del paso. En celular queda fija abajo
 * (la página reserva el espacio con pb-24); en escritorio va al final del contenido.
 */
export function BarraPasos({ anterior, principal }: { anterior?: { to: string; texto: string; corto?: string }; principal: Accion }) {
  const clasePrincipal = 'ml-auto flex min-w-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium'
  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur',
        'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
        'lg:static lg:z-auto lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-5 lg:backdrop-blur-none',
      )}
    >
      {anterior && (
        <Link
          to={anterior.to}
          className="flex min-w-0 shrink items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm hover:border-violet-300 sm:px-4"
        >
          <ArrowLeft size={14} className="shrink-0" />
          <Etiqueta texto={anterior.texto} corto={anterior.corto} />
        </Link>
      )}
      {principal.tipo === 'link' && (
        <Link to={principal.to} className={cn(clasePrincipal, 'bg-violet-600 text-white hover:bg-violet-700')}>
          {principal.icono === 'flag' && <Flag size={14} className="shrink-0" />}
          <Etiqueta texto={principal.texto} corto={principal.corto} />
          <ArrowRight size={14} className="shrink-0" />
        </Link>
      )}
      {principal.tipo === 'boton' && (
        <button type="button" onClick={principal.onClick} className={cn(clasePrincipal, 'bg-violet-600 text-white hover:bg-violet-700')}>
          <Etiqueta texto={principal.texto} corto={principal.corto} />
          <ArrowRight size={14} className="shrink-0" />
        </button>
      )}
      {principal.tipo === 'bloqueado' && (
        // Botón y no tooltip: en celular un title no se ve, el aviso sí.
        <button
          type="button"
          aria-disabled="true"
          title={principal.motivo}
          onClick={() => toast.info(principal.motivo)}
          className={cn(clasePrincipal, 'cursor-not-allowed border border-dashed border-slate-300 text-slate-400')}
        >
          <Lock size={13} className="shrink-0" />
          <Etiqueta texto={principal.texto} corto={principal.corto} />
        </button>
      )}
    </nav>
  )
}
