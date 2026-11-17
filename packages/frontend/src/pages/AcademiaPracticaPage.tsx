import { useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { EMPRESA_CASO, estadoBloqueo, leccionPorId, type PestanaPractica } from '@auditorya/types'
import { usePrepararPractica, useProgresoAcademia } from '../hooks/useAcademia'
import { PestanaDemo } from '../components/academia/PestanaDemo'
import { TutorPractica, type NavegacionTaller } from '../components/academia/TutorPractica'
import { SelectorPestanas, useReiniciarConConfirmacion } from '../components/academia/SelectorPestanas'
import { PasosLeccion, destinoSiguiente, etiquetaPaso, pasosDe, rutaPaso } from '../components/academia/PasosLeccion'

/**
 * Taller: el paso «Hazlo en AuditorYa» de una lección con playground. El tutor es una columna fija
 * (hoja inferior en celular) y la pestaña real ocupa el resto.
 */
export function AcademiaPracticaPage() {
  const { leccionId = '' } = useParams<{ leccionId: string }>()
  const [searchParams] = useSearchParams()
  const encontrada = leccionPorId(leccionId)
  const practica = encontrada?.leccion.practica
  const inicial = searchParams.get('pestana') as PestanaPractica | null
  const [pestana, setPestana] = useState<PestanaPractica | undefined>(
    practica && inicial && practica.pestanas.includes(inicial) ? inicial : practica?.pestanas[0],
  )
  const preparacion = usePrepararPractica(leccionId)
  const reiniciar = useReiniciarConConfirmacion(leccionId)
  const { progreso } = useProgresoAcademia()

  if (!encontrada || !practica || !pestana) return <Navigate to="/academia" replace />
  // Bloqueada: la página de la lección explica qué falta.
  if (!estadoBloqueo(leccionId, progreso).desbloqueada) return <Navigate to={`/academia/${leccionId}`} replace />
  const { modulo, leccion } = encontrada
  const pasos = pasosDe(leccion)
  const pasoAnterior = pasos[pasos.indexOf('hazlo') - 1]
  const destino = destinoSiguiente(leccion.id, progreso)
  const navegacion: NavegacionTaller = {
    anterior: { to: rutaPaso(leccion, pasoAnterior), texto: etiquetaPaso(leccion, pasoAnterior) },
    siguiente: { to: destino.to, texto: destino.checkpoint ? 'Checkpoint' : destino.corto, checkpoint: destino.checkpoint },
    teoriaPendiente: !progreso.leidas.includes(leccion.id),
    entenderTo: rutaPaso(leccion, 'entender'),
  }

  return (
    // Celular y tablet: espacio al final para que la hoja del tutor no tape el contenido.
    // Escritorio: el tutor es una columna fija a la izquierda y nada se superpone.
    <div className="pb-[70vh] sm:pb-40 lg:pb-0">
      <div className="border-b border-slate-200 bg-white px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate font-mono text-xs uppercase tracking-wider text-slate-500">
            <span className="sm:hidden">{modulo.ref} · Lección {leccion.id}</span>
            <span className="hidden sm:inline">{modulo.ref} · Lección {leccion.id} · {leccion.titulo}</span>
          </p>
          <button
            type="button"
            onClick={reiniciar.ejecutar}
            disabled={reiniciar.pendiente}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Reiniciar práctica
          </button>
        </div>
        <PasosLeccion leccion={leccion} paso="hazlo" progreso={progreso} className="border-b-0" />
      </div>

      <div className="lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:self-start lg:border-r lg:border-slate-200">
          <TutorPractica leccion={leccion} navegacion={navegacion} />
        </aside>

        <div className="mx-auto w-full max-w-5xl min-w-0 space-y-5 overflow-x-auto px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-400">Revisoría Fiscal · Período 2026</p>
              <h1 className="text-2xl font-bold text-slate-900">{EMPRESA_CASO.nombre}</h1>
            </div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">ENCARGO DE PRÁCTICA</span>
          </div>
          <SelectorPestanas pestanas={practica.pestanas} actual={pestana} onCambiar={setPestana} />
          {preparacion.isSuccess && <PestanaDemo pestana={pestana} />}
        </div>
      </div>
    </div>
  )
}
