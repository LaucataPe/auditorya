import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink, Lightbulb, Pencil } from 'lucide-react'
import {
  COMPONENTES_CALIDAD,
  FUENTE_NICC1_COLOMBIA,
  NIGC1_URL,
  NORMATIVA_CALIDAD,
  cambiosPosterioresARevision,
  cumplimientoComponente,
  riesgosSinRespuesta,
  type ComponenteCalidad,
  type CumplimientoComponente,
  type EstadoCumplimiento,
  type PasoCumplimiento,
  type SistemaCalidad,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { CalidadElementos } from './CalidadElementos'
import { CambiosRelevantes } from './CambiosRelevantes'
import { MotivoModal } from './CalidadModales'
import { CUMPLIMIENTO_UI, hoyISO, type Calidad, type Edicion } from './calidad-ui'

const ORDEN_LEYENDA: EstadoCumplimiento[] = ['cumplido', 'progreso', 'atencion', 'sin_empezar']

/** Los 8 componentes con su color de cumplimiento y, debajo, qué le falta al elegido. */
export function CalidadResumen({
  sistema,
  calidad,
  onEditar,
  onAbrirFormato,
}: {
  sistema: SistemaCalidad
  calidad: Calidad
  onEditar: (e: Edicion) => void
  onAbrirFormato: (formato: string) => void
}) {
  const hoy = hoyISO()
  const cumplimientos = Object.fromEntries(
    COMPONENTES_CALIDAD.map((c) => [c.clave, cumplimientoComponente(c.clave, sistema, hoy)]),
  ) as Record<ComponenteCalidad, CumplimientoComponente>
  // Arranca en el primer componente que no está cumplido: es lo que hay que atender.
  const [seleccion, setSeleccion] = useState<ComponenteCalidad>(
    () => COMPONENTES_CALIDAD.find((c) => cumplimientos[c.clave].estado !== 'cumplido')?.clave ?? 'valoracion_riesgos',
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600">
        {ORDEN_LEYENDA.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <i className={cn('inline-block h-2.5 w-2.5 rounded-[3px]', CUMPLIMIENTO_UI[e].punto)} />
            {CUMPLIMIENTO_UI[e].leyenda}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {COMPONENTES_CALIDAD.map((c, i) => {
          const cu = cumplimientos[c.clave]
          const ui = CUMPLIMIENTO_UI[cu.estado]
          return (
            <button
              key={c.clave}
              type="button"
              onClick={() => setSeleccion(c.clave)}
              aria-pressed={seleccion === c.clave}
              className={cn(
                'flex min-h-[170px] flex-col gap-2.5 rounded-2xl border p-4 text-left transition-shadow hover:shadow-md',
                ui.tarjeta,
                seleccion === c.clave && 'ring-2 ring-indigo-500 ring-offset-2',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold', ui.icono)}>
                  {cu.estado === 'cumplido' ? <Check size={16} strokeWidth={3} /> : cu.estado === 'atencion' ? '!' : i + 1}
                </span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', ui.badge)}>{ui.label}</span>
              </div>
              <span className="text-[15px] font-semibold leading-snug text-gray-900">{c.titulo}</span>
              <div className="mt-auto w-full space-y-1.5 text-xs text-gray-600">
                <p>{cu.resumen}</p>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-900/10" aria-hidden="true">
                  <div className={cn('h-full', ui.barra)} style={{ width: `${(cu.hechos / cu.pasos.length) * 100}%` }} />
                </div>
                <p>
                  {cu.hechos} de {cu.pasos.length} pasos
                </p>
              </div>
            </button>
          )
        })}
      </div>

      <PanelComponente
        key={seleccion}
        componente={seleccion}
        cumplimiento={cumplimientos[seleccion]}
        sistema={sistema}
        calidad={calidad}
        onEditar={onEditar}
        onAbrirFormato={onAbrirFormato}
      />
    </div>
  )
}

/** Frase con lo que le falta al componente, a partir de sus pasos. */
function queFalta(pasos: PasoCumplimiento[], sinObjetivos: boolean, sinRespuesta: number): { total: number; frase: string } {
  const partes: string[] = []
  let total = 0
  if (pasos.some((p) => p.tipo === 'diseno' && !p.hecho)) {
    total++
    partes.push(
      sinObjetivos
        ? 'agregar al menos un objetivo'
        : sinRespuesta === 1
          ? 'darle respuesta a 1 riesgo'
          : `darles respuesta a ${sinRespuesta} riesgos`,
    )
  }
  const formatos = pasos.filter((p) => p.tipo === 'formato' && !p.hecho)
  const vencidos = formatos.filter((p) => p.estadoFormato === 'vencido').length
  const porFirmar = formatos.length - vencidos
  if (porFirmar) partes.push(porFirmar === 1 ? 'firmar 1 formato' : `firmar ${porFirmar} formatos`)
  if (vencidos) partes.push(vencidos === 1 ? 'renovar 1 formato vencido' : `renovar ${vencidos} formatos vencidos`)
  total += formatos.length
  if (pasos.some((p) => p.tipo === 'revision' && !p.hecho)) {
    total++
    partes.push('marcar el componente como revisado')
  }
  const frase = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : (partes[0] ?? '')
  return { total, frase }
}

function PanelComponente({
  componente,
  cumplimiento,
  sistema,
  calidad,
  onEditar,
  onAbrirFormato,
}: {
  componente: ComponenteCalidad
  cumplimiento: CumplimientoComponente
  sistema: SistemaCalidad
  calidad: Calidad
  onEditar: (e: Edicion) => void
  onAbrirFormato: (formato: string) => void
}) {
  const info = COMPONENTES_CALIDAD.find((c) => c.clave === componente)!
  const [editando, setEditando] = useState(false)
  const [notaOpen, setNotaOpen] = useState(false)
  const gestiona = sistema.puedeGestionar
  const concluida = !!sistema.evaluacion.concluidoAt
  const ui = CUMPLIMIENTO_UI[cumplimiento.estado]
  const revision = cumplimiento.pasos.find((p) => p.tipo === 'revision')!
  const sinObjetivos = !sistema.objetivos.some((o) => o.componente === componente && o.activo)
  const posteriores = cambiosPosterioresARevision(componente, sistema)
  const falta = queFalta(cumplimiento.pasos, sinObjetivos, riesgosSinRespuesta(componente, sistema).length)

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{info.titulo}</h3>
              <span className="text-xs text-gray-400">{info.ref}</span>
              <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', ui.badge)}>{ui.label}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {falta.total === 0 ? (
                'Este componente está al día.'
              ) : (
                <>
                  Te {falta.total === 1 ? 'falta' : 'faltan'}{' '}
                  <strong className="text-gray-900">{falta.total === 1 ? '1 cosa' : `${falta.total} cosas`}</strong>: {falta.frase}.
                </>
              )}
            </p>
          </div>
          {gestiona &&
            (editando ? (
              <Button size="sm" onClick={() => setEditando(false)}>
                Listo
              </Button>
            ) : (
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setEditando(true)}>
                <Pencil size={13} /> Editar diseño
              </Button>
            ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <div className={cn('h-full', ui.barra)} style={{ width: `${(cumplimiento.hechos / cumplimiento.pasos.length) * 100}%` }} />
          </div>
          <span className="text-xs tabular-nums text-gray-500">
            {cumplimiento.hechos} de {cumplimiento.pasos.length} listo
          </span>
        </div>

        <Explicacion componente={componente} abiertaPorDefecto={cumplimiento.estado === 'sin_empezar'} simple={info.simple} jcc={info.jcc} />

        {posteriores.length > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>
              {posteriores.length === 1 ? 'Se registró un cambio relevante' : `Se registraron ${posteriores.length} cambios relevantes`}{' '}
              después de la revisión de este componente: {posteriores.map((x) => `«${x.descripcion}»`).join(', ')}. Conviene
              mirarlo de nuevo; la revisión sigue marcada.
            </p>
          </div>
        )}

        {editando && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Estás editando el diseño del componente. Cada cambio pide un motivo y queda en el historial.
          </p>
        )}
      </div>

      <CalidadElementos
        componente={componente}
        sistema={sistema}
        calidad={calidad}
        editando={editando}
        onEditar={onEditar}
        onAbrirFormato={onAbrirFormato}
      />

      {componente === 'valoracion_riesgos' && <CambiosRelevantes sistema={sistema} calidad={calidad} />}

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4">
        {revision.hecho ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check size={12} strokeWidth={3.5} />
          </span>
        ) : (
          <span className="h-5 w-5 shrink-0 rounded-full border-2 border-amber-400" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">Revisión {sistema.evaluacion.anio}</p>
          <p className="text-xs text-gray-500">
            {revision.hecho
              ? `Revisado ${revision.detalle?.replace(/^Por /, 'por ') ?? ''}.`
              : 'Último paso: confirmas que revisaste el componente este año. Puedes dejar una nota.'}
          </p>
        </div>
        {gestiona && !concluida &&
          (revision.hecho ? (
            <Button
              size="sm"
              variant="ghost"
              loading={calidad.marcarComponente.isPending}
              onClick={() => calidad.marcarComponente.mutate({ componente, revisado: false })}
            >
              Desmarcar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setNotaOpen(true)}>
              Marcar como revisado
            </Button>
          ))}
      </div>

      {notaOpen && (
        <MotivoModal
          titulo={`Marcar «${info.titulo}» como revisado ${sistema.evaluacion.anio}`}
          descripcion="Nota opcional: qué revisaste y si encontraste algo."
          accion="Marcar revisado"
          opcional
          pending={calidad.marcarComponente.isPending}
          onClose={() => setNotaOpen(false)}
          onConfirmar={(nota) =>
            calidad.marcarComponente.mutate({ componente, revisado: true, nota }, { onSuccess: () => setNotaOpen(false) })
          }
        />
      )}
    </section>
  )
}

/** "¿De qué se trata?" con la base normativa: abierta mientras el componente está sin empezar; lo que elija el usuario se recuerda. */
function Explicacion({
  componente,
  abiertaPorDefecto,
  simple,
  jcc,
}: {
  componente: ComponenteCalidad
  abiertaPorDefecto: boolean
  simple: string
  jcc: string
}) {
  const clave = `calidad.explicacion.${componente}`
  const [abierta, setAbierta] = useState(() => {
    try {
      const v = localStorage.getItem(clave)
      return v === null ? abiertaPorDefecto : v === '1'
    } catch {
      return abiertaPorDefecto
    }
  })
  function alternar() {
    setAbierta((a) => {
      try {
        localStorage.setItem(clave, a ? '0' : '1')
      } catch {
        /* sin almacenamiento: solo dura la sesión */
      }
      return !a
    })
  }

  return (
    <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
      <button type="button" onClick={alternar} aria-expanded={abierta} className="flex w-full items-center gap-1.5 text-left font-semibold">
        <Lightbulb size={15} /> ¿De qué se trata?
        <span className="font-normal text-indigo-700">· Base normativa</span>
        <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-normal text-indigo-700">
          {abierta ? 'Ocultar' : 'Mostrar'} {abierta ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>
      {abierta && (
        <div className="mt-2 grid gap-3 leading-relaxed sm:grid-cols-2">
          <p>
            <span className="font-semibold">En palabras simples.</span> {simple}
          </p>
          <p>
            <span className="font-semibold">Qué revisa la JCC.</span> {jcc}
          </p>
          <BaseNormativa componente={componente} />
        </div>
      )}
    </div>
  )
}


/** Apartados de la NIGC 1 con un resumen propio, su equivalencia en la NICC 1 y el enlace al texto oficial. */
function BaseNormativa({ componente }: { componente: ComponenteCalidad }) {
  const n = NORMATIVA_CALIDAD[componente]
  return (
    <div className="border-t border-indigo-200/70 pt-3 sm:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">Base normativa · NIGC 1</p>
        <a
          href={`${NIGC1_URL}#page=${n.pagina}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:underline"
        >
          Abrir la NIGC 1 en la página {n.pagina} <ExternalLink size={12} />
        </a>
      </div>
      <ul className="mt-1.5 space-y-1">
        {n.apartados.map((a) => (
          <li key={a.ref} className="flex gap-2">
            <span className="w-16 shrink-0 font-medium tabular-nums">{a.ref}</span>
            <span className="min-w-0">{a.resumen}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-indigo-900/80">
        <span className="font-medium">Equivale en la NICC 1:</span> {n.nicc1} En Colombia la NICC 1 sigue vigente en el{' '}
        {FUENTE_NICC1_COLOMBIA}; la NIGC 1 se aplica de forma anticipada. Los resúmenes son nuestros: para citar, usa
        el texto oficial.
      </p>
    </div>
  )
}
