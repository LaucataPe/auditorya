import { useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Check, FileText, Paperclip, Plus } from 'lucide-react'
import {
  COMPONENTES_CALIDAD,
  FORMATOS_CALIDAD,
  RESULTADO_EVALUACION_LABEL,
  VINCULOS_CALIDAD,
  estadoFormato,
  formatoDeRespuesta,
  type ComponenteCalidad,
  type FormatoCalidad,
  type RespuestaCalidad,
  type SistemaCalidad,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { FORMATO_UI, fecha, hoyISO, type Calidad, type Edicion } from './calidad-ui'

/**
 * Objetivos → riesgos → respuestas de un componente. Cada respuesta es una fila con su estado
 * y su acción (crear el formato, verlo, adjuntar evidencia); editar la cadena se hace en `editando`.
 */
export function CalidadElementos({
  componente,
  sistema,
  calidad,
  editando,
  onEditar,
  onAbrirFormato,
}: {
  componente: ComponenteCalidad
  sistema: SistemaCalidad
  calidad: Calidad
  editando: boolean
  onEditar: (e: Edicion) => void
  onAbrirFormato: (formato: string) => void
}) {
  const [verInactivos, setVerInactivos] = useState(false)
  const gestiona = sistema.puedeGestionar
  const conInactivos = editando && verInactivos
  const visible = <T extends { activo: boolean }>(x: T) => conInactivos || x.activo
  const objetivos = sistema.objetivos.filter((o) => o.componente === componente && visible(o))

  // Un formato del componente cuya respuesta se desactivó igual cuenta para el verde: se muestra aparte.
  const activos = sistema.respuestas.filter((a) => a.activo && sistema.riesgos.some((r) => r.id === a.riesgoId && r.activo))
  const huerfanos = FORMATOS_CALIDAD.filter(
    (f) => f.componente === componente && !activos.some((a) => a.baseClave && f.respuestasBase.includes(a.baseClave)),
  )

  return (
    <div>
      {objetivos.length === 0 && <p className="border-t border-gray-100 px-5 py-4 text-sm text-gray-500">Sin objetivos en este componente.</p>}

      {objetivos.map((o, i) => {
        const riesgos = sistema.riesgos.filter((r) => r.objetivoId === o.id && visible(r))
        return (
          <div key={o.id} className={cn('space-y-3 border-t border-gray-100 p-5', !o.activo && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-xs font-bold text-indigo-700">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Objetivo
                    {!o.baseClave && <Marca>Propio</Marca>}
                    {!o.activo && <Marca>Desactivado</Marca>}
                  </p>
                  <p className="text-sm font-medium text-gray-900">{o.texto}</p>
                </div>
              </div>
              {editando && gestiona && (
                <Acciones
                  activo={o.activo}
                  onEditar={() => onEditar({ modo: 'editar', tipo: 'objetivos', id: o.id, texto: o.texto, titulo: 'Editar objetivo' })}
                  onActivo={(modo) =>
                    onEditar({ modo, tipo: 'objetivos', id: o.id, titulo: modo === 'desactivar' ? 'Desactivar objetivo' : 'Reactivar objetivo' })
                  }
                  onAgregar={() =>
                    onEditar({
                      modo: 'crear',
                      tipo: 'riesgos',
                      titulo: 'Agregar riesgo de calidad',
                      padre: { campo: 'objetivoId', valor: o.id },
                    })
                  }
                  agregarLabel="Riesgo"
                />
              )}
            </div>

            {riesgos.length === 0 && <p className="ml-9 text-sm text-gray-500">Sin riesgos identificados.</p>}

            {riesgos.map((r) => {
              const respuestas = sistema.respuestas.filter((a) => a.riesgoId === r.id && visible(a))
              const sinRespuesta = r.activo && !respuestas.some((a) => a.activo)
              return (
                <div
                  key={r.id}
                  className={cn(
                    'ml-9 overflow-hidden rounded-xl border',
                    sinRespuesta ? 'border-red-200' : 'border-gray-200',
                    !r.activo && 'opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-start justify-between gap-2 border-b px-4 py-2.5',
                      sinRespuesta ? 'border-red-100 bg-red-50/60' : 'border-gray-100 bg-gray-50/70',
                    )}
                  >
                    <p className="min-w-0 flex-1 text-sm text-gray-800">
                      <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-gray-200">
                        Riesgo
                      </span>
                      {r.descripcion}
                      {!r.activo && <Marca>Desactivado</Marca>}
                    </p>
                    {editando && gestiona && (
                      <Acciones
                        activo={r.activo}
                        onEditar={() => onEditar({ modo: 'editar', tipo: 'riesgos', id: r.id, texto: r.descripcion, titulo: 'Editar riesgo' })}
                        onActivo={(modo) =>
                          onEditar({ modo, tipo: 'riesgos', id: r.id, titulo: modo === 'desactivar' ? 'Desactivar riesgo' : 'Reactivar riesgo' })
                        }
                        onAgregar={() =>
                          onEditar({
                            modo: 'crear',
                            tipo: 'respuestas',
                            titulo: 'Agregar respuesta',
                            padre: { campo: 'riesgoId', valor: r.id },
                          })
                        }
                        agregarLabel="Respuesta"
                      />
                    )}
                  </div>

                  {sinRespuesta && (
                    <p className="flex items-center gap-1.5 px-4 py-3 text-sm text-red-700">
                      <AlertTriangle size={14} className="shrink-0" />
                      Este riesgo no tiene respuesta.{' '}
                      {gestiona && (editando ? 'Agrégale una o desactívalo.' : 'Entra a «Editar diseño» para agregarle una o desactivarlo.')}
                    </p>
                  )}

                  <div className="divide-y divide-gray-100">
                    {respuestas.map((a) => (
                      <FilaRespuesta
                        key={a.id}
                        respuesta={a}
                        sistema={sistema}
                        calidad={calidad}
                        editando={editando}
                        onEditar={onEditar}
                        onAbrirFormato={onAbrirFormato}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {huerfanos.length > 0 && (
        <div className="space-y-2 border-t border-gray-100 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Otros formatos del componente</p>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {huerfanos.map((f) => (
              <FilaFormato key={f.clave} formato={f} sistema={sistema} onAbrirFormato={onAbrirFormato} />
            ))}
          </div>
        </div>
      )}

      {editando && gestiona && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => setVerInactivos((v) => !v)}>
            {verInactivos ? 'Ocultar desactivados' : 'Ver desactivados'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onEditar({
                modo: 'crear',
                tipo: 'objetivos',
                titulo: 'Agregar objetivo de calidad',
                padre: { campo: 'componente', valor: componente },
              })
            }
          >
            <Plus size={14} className="mr-1" /> Objetivo propio
          </Button>
        </div>
      )}
    </div>
  )
}

const Marca = ({ children }: { children: ReactNode }) => (
  <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
    {children}
  </span>
)

/** Círculo de estado a la izquierda de cada fila. */
function Estado({ tono }: { tono: 'listo' | 'auditorya' | 'pendiente' | 'vencido' | 'libre' }) {
  if (tono === 'listo' || tono === 'auditorya') {
    return (
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white',
          tono === 'listo' ? 'bg-emerald-500' : 'bg-indigo-500',
        )}
      >
        <Check size={12} strokeWidth={3.5} />
      </span>
    )
  }
  if (tono === 'libre') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Paperclip size={11} />
      </span>
    )
  }
  return (
    <span
      className={cn('h-5 w-5 shrink-0 rounded-full border-2', tono === 'vencido' ? 'border-red-500' : 'border-amber-400')}
    />
  )
}

function FilaRespuesta({
  respuesta: a,
  sistema,
  calidad,
  editando,
  onEditar,
  onAbrirFormato,
}: {
  respuesta: RespuestaCalidad
  sistema: SistemaCalidad
  calidad: Calidad
  editando: boolean
  onEditar: (e: Edicion) => void
  onAbrirFormato: (formato: string) => void
}) {
  const gestiona = sistema.puedeGestionar
  const formato = formatoDeRespuesta(a.baseClave)

  // Con formato, la evidencia es el formato (firmado o subido): un solo camino.
  let tono: Parameters<typeof Estado>[0]['tono']
  let detalle: ReactNode
  let accion: ReactNode = null
  if (formato) {
    const f = describirFormato(formato, sistema)
    tono = f.tono
    detalle = (
      <>
        <span className={f.color}>{f.texto}</span>
        {a.vinculo && <span className="block text-indigo-700">También la cubre AuditorYa: {VINCULOS_CALIDAD[a.vinculo]}</span>}
      </>
    )
    accion = f.accion(gestiona, onAbrirFormato)
  } else if (a.vinculo === 'evaluacion_anual') {
    // La función existe siempre, pero esta respuesta depende de que la evaluación del año se haga:
    // se muestra su estado real (solo informativo, no entra en la regla del verde).
    const ev = sistema.evaluacion
    const revisados = Object.keys(ev.componentesRevisados).length
    tono = ev.concluidoAt ? 'listo' : 'pendiente'
    detalle = ev.concluidoAt ? (
      <span className="text-emerald-700">
        Evaluación {ev.anio} concluida el {fecha(ev.concluidoAt)} por {ev.concluidoPorNombre ?? '—'}
        {ev.resultado && ` · ${RESULTADO_EVALUACION_LABEL[ev.resultado]}`}
      </span>
    ) : (
      <span className="text-amber-700">
        Evaluación {ev.anio} en curso · {revisados} de {COMPONENTES_CALIDAD.length} componentes revisados
      </span>
    )
    accion = (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => document.getElementById('evaluacion-anual')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
      >
        Ver evaluación
      </Button>
    )
  } else if (a.vinculo === 'cambios_relevantes') {
    // Lista mientras no haya cambios del año sin evaluar.
    const cambios = sistema.cambiosRelevantes
    const sinEvaluar = cambios.filter((x) => !x.decision).length
    tono = sinEvaluar ? 'pendiente' : 'listo'
    detalle =
      sinEvaluar > 0 ? (
        <span className="text-amber-700">
          {sinEvaluar === 1 ? '1 cambio sin evaluar' : `${sinEvaluar} cambios sin evaluar`} en {sistema.evaluacion.anio}
        </span>
      ) : (
        <span className="text-emerald-700">
          {cambios.length === 0
            ? `Sin cambios relevantes registrados en ${sistema.evaluacion.anio}`
            : `${cambios.length === 1 ? '1 cambio registrado' : `${cambios.length} cambios registrados`} en ${sistema.evaluacion.anio}, todos evaluados`}
        </span>
      )
    accion = (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => document.getElementById('cambios-relevantes')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        Ver cambios
      </Button>
    )
  } else if (a.vinculo) {
    tono = 'auditorya'
    detalle = <span className="text-indigo-700">Cubierta por AuditorYa: {VINCULOS_CALIDAD[a.vinculo]}</span>
  } else {
    tono = 'libre'
    detalle = a.evidenciaNombre ? (
      <button
        type="button"
        onClick={() => calidad.abrirEvidencia(a.id)}
        className="inline-flex items-center gap-1 text-gray-700 hover:underline"
      >
        <Paperclip size={12} /> {a.evidenciaNombre}
      </button>
    ) : (
      <span className="text-gray-500">Evidencia opcional: un soporte que muestre que se hace.</span>
    )
    if (gestiona && a.activo) accion = <SubirEvidencia respuestaId={a.id} calidad={calidad} reemplaza={!!a.evidenciaNombre} />
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3 px-4 py-3', !a.activo && 'opacity-60')}>
      <Estado tono={a.activo ? tono : 'libre'} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">
          {a.descripcion}
          {!a.baseClave && <Marca>Propia</Marca>}
          {!a.activo && <Marca>Desactivada</Marca>}
        </p>
        <p className="mt-0.5 text-xs">{detalle}</p>
      </div>
      {editando && gestiona ? (
        <Acciones
          activo={a.activo}
          onEditar={() => onEditar({ modo: 'editar', tipo: 'respuestas', id: a.id, texto: a.descripcion, titulo: 'Editar respuesta' })}
          onActivo={(modo) =>
            onEditar({ modo, tipo: 'respuestas', id: a.id, titulo: modo === 'desactivar' ? 'Desactivar respuesta' : 'Reactivar respuesta' })
          }
        />
      ) : (
        a.activo && accion
      )}
    </div>
  )
}

function FilaFormato({
  formato,
  sistema,
  onAbrirFormato,
}: {
  formato: FormatoCalidad
  sistema: SistemaCalidad
  onAbrirFormato: (formato: string) => void
}) {
  const f = describirFormato(formato, sistema)
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Estado tono={f.tono} />
      <p className={cn('min-w-0 flex-1 text-sm', f.color)}>{f.texto}</p>
      {f.accion(sistema.puedeGestionar, onAbrirFormato)}
    </div>
  )
}

/** Estado de un formato contado en una línea, con el botón que corresponde. */
function describirFormato(formato: FormatoCalidad, sistema: SistemaCalidad) {
  const resumen = sistema.documentos.find((d) => d.formato === formato.clave)
  const estado = estadoFormato(resumen, hoyISO())
  const firmado = resumen?.firmado
  const nombre = `Formato «${formato.titulo}»`
  const texto =
    estado === 'firmado' && firmado
      ? firmado.documentoFirma
        ? `${nombre} · cubierto por «${firmado.documentoFirma.nombre}»${firmado.documentoFirma.referencia ? ` (${firmado.documentoFirma.referencia})` : ''} hasta el ${fecha(firmado.vigenteHasta!)}`
        : firmado.archivoNombre
        ? `${nombre} · documento propio firmado el ${fecha(firmado.firmadoAt)}`
        : `${nombre} · versión ${firmado.version} firmada por ${firmado.firmadoPorNombre ?? '—'} el ${fecha(firmado.firmadoAt)}`
      : estado === 'vencido' && firmado?.vigenteHasta
        ? `${nombre} · venció el ${fecha(firmado.vigenteHasta)}`
        : estado === 'borrador' && resumen?.borrador
          ? `${nombre} · borrador ${resumen.borrador.pendientes > 0 ? `con ${resumen.borrador.pendientes} campo(s) por completar` : 'listo para firmar'}`
          : `${nombre} · sin crear`
  return {
    tono: (estado === 'firmado' ? 'listo' : estado === 'vencido' ? 'vencido' : 'pendiente') as 'listo' | 'vencido' | 'pendiente',
    color: estado === 'firmado' ? 'text-emerald-700' : estado === 'vencido' ? 'text-red-700' : 'text-amber-700',
    texto,
    accion: (gestiona: boolean, onAbrir: (formato: string) => void) =>
      estado === 'sin_crear' && !gestiona ? null : (
        <Button size="sm" variant={estado === 'firmado' ? 'secondary' : 'primary'} className="gap-1.5" onClick={() => onAbrir(formato.clave)}>
          <FileText size={13} /> {estado === 'sin_crear' ? 'Crear formato' : FORMATO_UI[estado].accion}
        </Button>
      ),
  }
}

function Acciones({
  activo,
  onEditar,
  onActivo,
  onAgregar,
  agregarLabel,
}: {
  activo: boolean
  onEditar: () => void
  onActivo: (modo: 'desactivar' | 'reactivar') => void
  onAgregar?: () => void
  agregarLabel?: string
}) {
  const boton = 'rounded-md px-2 py-1 text-xs'
  return (
    <div className="flex shrink-0 items-center gap-1">
      {onAgregar && activo && (
        <button type="button" onClick={onAgregar} className={cn(boton, 'inline-flex items-center gap-1 text-indigo-700 hover:bg-indigo-50')}>
          <Plus size={12} /> {agregarLabel}
        </button>
      )}
      {activo && (
        <button type="button" onClick={onEditar} className={cn(boton, 'text-gray-600 hover:bg-gray-100')}>
          Editar
        </button>
      )}
      <button
        type="button"
        onClick={() => onActivo(activo ? 'desactivar' : 'reactivar')}
        className={cn(boton, 'text-gray-600 hover:bg-gray-100')}
      >
        {activo ? 'Desactivar' : 'Reactivar'}
      </button>
    </div>
  )
}

function SubirEvidencia({ respuestaId, calidad, reemplaza }: { respuestaId: string; calidad: Calidad; reemplaza: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) calidad.subirEvidencia.mutate({ respuestaId, archivo })
          e.target.value = ''
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        loading={calidad.subirEvidencia.isPending && calidad.subirEvidencia.variables?.respuestaId === respuestaId}
        onClick={() => ref.current?.click()}
      >
        {reemplaza ? 'Reemplazar' : 'Adjuntar'}
      </Button>
    </>
  )
}
