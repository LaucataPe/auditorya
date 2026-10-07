/**
 * Revisión guiada de un impuesto con agente (IVA, retención en la fuente; ver
 * AGENTES_TRIBUTARIOS): el paso a paso que acompaña al auditor de principio a
 * fin (pedido de la usuaria, 2026-09-25). Cinco pasos sobre la misma revisión y
 * las mismas tablas de siempre:
 *   1. Alcance y programa: qué va a revisar y qué pasos sigue el agente.
 *   2. Documentos: los insumos que el programa necesita, con su "para qué".
 *   3. Procedimientos: el análisis abierto cédula por cédula (qué se comparó,
 *      contra qué criterio, qué cuadró y qué no) con la conclusión del auditor
 *      en cada una. Un análisis guardado antes de las cédulas muestra su bitácora.
 *   4. Hallazgos: decisiones una a la vez + la tabla de hallazgos para agregar más.
 *   5. Informe: conclusión, documento y firma.
 * El paso vive en la URL (?paso=). Las pestañas clásicas siguen disponibles.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Bot, Calculator, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Download, FileSpreadsheet,
  FileText, FolderOpen, Landmark, LayoutList, Play, Plus, Printer, Sparkles, Trash2, Upload,
} from 'lucide-react'
import {
  AGENTES_TRIBUTARIOS,
  IMPUESTOS_CATALOGO,
  alcanceSugerido,
  textoProcedimientos,
  type DefinicionAgente,
  type InsumoIva,
  type ProgramaRevision,
  type RevisionTributariaDetalle,
  type TipoAgentico,
  hallazgosDelAgente,
  mapeoMemoriaDe,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { fechaCorta } from '../../lib/fechas'
import { Button } from '../ui/Button'
import { DecisionCard } from '../agente/DecisionCard'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { useAgenteIva, type AnalisisAuxiliar } from '../../hooks/useAgenteIva'
import { CampoPapel, HallazgosTabla } from './HallazgosTributarios'
import { CedulasRevision } from './CedulasRevision'

export const PASOS_GUIA = [
  { n: 1, id: 'programa', label: 'Alcance y programa', Icono: ClipboardList },
  { n: 2, id: 'documentos', label: 'Documentos', Icono: FolderOpen },
  { n: 3, id: 'analisis', label: 'Procedimientos', Icono: Bot },
  { n: 4, id: 'hallazgos', label: 'Hallazgos', Icono: AlertTriangle },
  { n: 5, id: 'informe', label: 'Informe', Icono: FileText },
] as const

type Props = {
  revision: RevisionTributariaDetalle
  empresa: { nombre: string; nit?: string } | null
  sellada: boolean
  /** LLM disponible (redacción de hallazgos). */
  iaDisponible: boolean
  /** Lectura del formulario por casillas disponible: workflow n8n o LLM, cualquiera de los dos. */
  lecturaDisponible: boolean
  paso: number
  onPaso: (n: number) => void
  guardar: (campos: Record<string, unknown>) => void
  guardando: boolean
  invalidar: () => void
  onLeerBorrador: () => void
  onAdjuntar: (hallazgoId: string | null) => void
  onDescargar: (adjuntoId: string) => void
  onEliminarAdjunto: (adjuntoId: string) => void
  onFirmar: () => void
  onReabrir?: () => void
  /** Abre las cifras del período (declarado contra libros) en una ventana, desde cualquier paso. */
  onVerCifras: () => void
  /** Renglones con diferencia entre declarado y libros, para el indicador del botón. */
  diferenciasCifras: number
  exportarDocumento: (formato: 'pdf' | 'word') => void
  /** Cédulas (papel de trabajo interno) con todo lo comparado y las conclusiones. */
  exportarCedulas: (formato: 'pdf' | 'word') => void
  irAPestanas: () => void
  // Tabla de hallazgos (misma que la pestaña): fila nueva, borrador y creación.
  nuevoHallazgoId: string | null
  onEnfocadoNuevo: () => void
  borradorHallazgo: boolean
  setBorradorHallazgo: (v: boolean) => void
  onCrearHallazgo: (descripcion: string) => void
}

const INSUMO_ICONO: Record<InsumoIva, typeof FileText> = { borrador: FileText, auxiliar: FileSpreadsheet, dian: Landmark, anterior: ArrowLeft }

export function RevisionGuiadaIva(p: Props) {
  const { revision, empresa, sellada, paso, onPaso } = p
  const agente = useAgenteIva(revision, sellada, p.invalidar, empresa?.nit ?? null)
  const agenteDef = AGENTES_TRIBUTARIOS[revision.obligacion.tipo as TipoAgentico]
  const programa: ProgramaRevision = revision.programa ?? agenteDef.programaSugerido()
  const catalogo = IMPUESTOS_CATALOGO[revision.obligacion.tipo].checklist
  const hechos = catalogo.filter((i) => revision.checklistEstado[i.id]?.hecho).length
  const soportes = revision.adjuntos.filter((a) => a.hallazgoId === null)

  const guardarPrograma = (nuevo: ProgramaRevision) => {
    if (sellada) return
    const conFecha = { ...nuevo, actualizadoAt: new Date().toISOString() }
    p.guardar({ programa: conFecha, procedimientos: textoProcedimientos(conFecha) })
  }

  // Estado de cada paso para el stepper: hecho / actual / pendiente.
  const estadoPaso = (n: number): 'hecho' | 'actual' | 'pendiente' => {
    if (n === paso) return 'actual'
    const hecho =
      n === 1 ? revision.programa !== null
        : n === 2 ? agente.declaradoDiligenciado
          : n === 3 ? !!agente.corrida && !agente.desactualizada && agente.sinConcluir.length === 0
            : n === 4 ? !!agente.corrida && agente.pendientes.length === 0 && agente.propuestas.length > 0
              : sellada
    return hecho ? 'hecho' : 'pendiente'
  }

  return (
    <div className="space-y-5">
      {/* Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <ol className="flex flex-wrap items-center gap-1">
          {PASOS_GUIA.map((s, i) => {
            const estado = estadoPaso(s.n)
            return (
              <li key={s.id} className="flex items-center">
                <button
                  onClick={() => onPaso(s.n)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    estado === 'actual' ? 'bg-indigo-600 text-white' : estado === 'hecho' ? 'text-emerald-700 hover:bg-emerald-50' : 'text-gray-500 hover:bg-gray-50',
                  )}
                >
                  <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold', estado === 'actual' ? 'bg-white/20' : estado === 'hecho' ? 'bg-emerald-100' : 'bg-gray-100')}>
                    {estado === 'hecho' ? <Check size={12} /> : s.n}
                  </span>
                  <span className="font-medium">{s.label}</span>
                </button>
                {i < PASOS_GUIA.length - 1 && <ChevronRight size={14} className="mx-0.5 text-gray-300" />}
              </li>
            )
          })}
        </ol>
        <div className="flex items-center gap-3">
          <button
            onClick={p.onVerCifras}
            title="Consultar el borrador y las cifras del período sin salir del paso"
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            <Calculator size={13} /> Cifras del período
            {p.diferenciasCifras > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">{p.diferenciasCifras} dif.</span>}
          </button>
          <button onClick={p.irAPestanas} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600">
            <LayoutList size={13} /> Ver por pestañas
          </button>
        </div>
      </div>

      {paso === 1 && <PasoPrograma revision={revision} empresa={empresa} sellada={sellada} programa={programa} agenteDef={agenteDef} onGuardar={guardarPrograma} guardar={p.guardar} onSiguiente={() => { if (!revision.programa) guardarPrograma(programa); onPaso(2) }} />}
      {paso === 2 && <PasoDocumentos p={p} agente={agente} programa={programa} agenteDef={agenteDef} soportes={soportes} />}
      {paso === 3 && <PasoAnalisis agente={agente} sellada={sellada} exportarCedulas={p.exportarCedulas} onSiguiente={() => onPaso(4)} onAtras={() => onPaso(2)} />}
      {paso === 4 && <PasoHallazgos p={p} agente={agente} programa={programa} onGuardarPrograma={guardarPrograma} />}
      {paso === 5 && <PasoInforme p={p} agente={agente} programa={programa} hechos={hechos} total={catalogo.length} soportes={soportes.length} />}
    </div>
  )
}

// ─── Paso 1 · Alcance y programa ─────────────────────────────────────────────

function PasoPrograma({ revision, empresa, sellada, programa, agenteDef, onGuardar, guardar, onSiguiente }: {
  agenteDef: DefinicionAgente
  revision: RevisionTributariaDetalle
  empresa: { nombre: string } | null
  sellada: boolean
  programa: ProgramaRevision
  onGuardar: (programa: ProgramaRevision) => void
  guardar: (campos: Record<string, unknown>) => void
  onSiguiente: () => void
}) {
  const [nuevoPaso, setNuevoPaso] = useState('')
  const [detalleAbierto, setDetalleAbierto] = useState<string | null>(null)
  const porId = new Map(agenteDef.programa.map((x) => [x.id, x]))
  const activos = programa.pasos.filter((x) => x.activo).length

  const toggle = (id: string) => onGuardar({ ...programa, pasos: programa.pasos.map((x) => (x.id === id ? { ...x, activo: !x.activo } : x)) })
  const agregar = () => {
    const texto = nuevoPaso.trim()
    if (texto.length < 2) return
    onGuardar({ ...programa, pasos: [...programa.pasos, { id: `propio-${Date.now().toString(36)}`, texto, origen: 'propio', activo: true, hecho: false }] })
    setNuevoPaso('')
  }
  const quitar = (id: string) => onGuardar({ ...programa, pasos: programa.pasos.filter((x) => x.id !== id) })

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <section className="overflow-hidden rounded-xl border border-amber-100 bg-white lg:col-span-2">
        <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><ClipboardList size={14} className="text-amber-500" /> Alcance</h2>
        </div>
        <div className="p-5">
          <CampoPapel
            etiqueta="Alcance"
            ayuda="Qué cubre la revisión de este período y qué no. Viene un borrador estándar; ajústalo si hace falta."
            valor={revision.alcance}
            sugerido={alcanceSugerido({ obligacion: revision.obligacion, periodo: revision.periodo, empresaNombre: empresa?.nombre ?? '' })}
            remontar={`${empresa?.nombre ?? ''}|${revision.alcance === null}`}
            filas={12}
            deshabilitado={sellada}
            onGuardar={(v) => guardar({ alcance: v })}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white lg:col-span-3">
        <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><Bot size={14} className="text-indigo-500" /> Programa de trabajo</h2>
          <span className="text-xs text-indigo-600">{activos} paso(s) activos</span>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs text-gray-500">
            Estos son los pasos que el agente va a ejecutar. Desactiva los que no apliquen a este cliente y agrega los tuyos:
            los propios los marcas tú, y todos quedan escritos en el informe como procedimientos aplicados.
          </p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {programa.pasos.map((x, i) => {
              const def = x.origen === 'agente' ? porId.get(x.id) : undefined
              const abierto = detalleAbierto === x.id
              return (
                <li key={x.id} className={cn('px-3 py-2.5', !x.activo && 'bg-gray-50/70')}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={x.activo} disabled={sellada} onChange={() => toggle(x.id)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', x.activo ? 'text-gray-800' : 'text-gray-400 line-through')}>
                        <span className="mr-1.5 text-[11px] text-gray-400">{i + 1}.</span>{x.texto}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        {x.origen === 'agente' ? (
                          <>
                            <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700">Lo hace el agente</span>
                            {def?.insumos.map((ins) => <span key={ins} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600">{agenteDef.insumos[ins].nombre.split(' (')[0]}</span>)}
                            {def && (
                              <button onClick={() => setDetalleAbierto(abierto ? null : x.id)} className="flex items-center gap-0.5 text-gray-400 hover:text-indigo-600">
                                {abierto ? <ChevronDown size={11} /> : <ChevronRight size={11} />} qué verifica
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Paso propio · lo marcas tú</span>
                            {!sellada && <button onClick={() => quitar(x.id)} className="text-gray-300 hover:text-rose-600" title="Quitar"><Trash2 size={11} /></button>}
                          </>
                        )}
                      </div>
                      {abierto && def && <p className="mt-1.5 text-[11px] leading-snug text-gray-500">{def.detalle} <span className="text-gray-400">Reglas {def.reglas.join(', ')}.</span></p>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {!sellada && (
            <div className="flex items-center gap-2">
              <input
                value={nuevoPaso}
                onChange={(e) => setNuevoPaso(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') agregar() }}
                placeholder={`Agregar un paso propio, p. ej. ${agenteDef.ejemploPasoPropio}`}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none"
              />
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={agregar} disabled={nuevoPaso.trim().length < 2}><Plus size={13} /> Agregar</Button>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button className="gap-2" onClick={onSiguiente}>{revision.programa ? 'Continuar con los documentos' : 'Aceptar el programa y continuar'} <ArrowRight size={15} /></Button>
          </div>
        </div>
      </section>
    </div>
  )
}

// ─── Paso 2 · Documentos ─────────────────────────────────────────────────────

function PasoDocumentos({ p, agente, programa, agenteDef, soportes }: { p: Props; agente: ReturnType<typeof useAgenteIva>; programa: ProgramaRevision; agenteDef: DefinicionAgente; soportes: RevisionTributariaDetalle['adjuntos'] }) {
  const { revision, sellada } = p
  const activos = new Set(programa.pasos.filter((x) => x.origen === 'agente' && x.activo).map((x) => x.id))
  const insumos: InsumoIva[] = (['borrador', 'auxiliar', 'dian', 'anterior'] as InsumoIva[]).filter((i) => agenteDef.programa.some((x) => activos.has(x.id) && x.insumos.includes(i)))
  const tieneAnteriorEnPlataforma = !!agente.anterior
  const recomendadoAnterior = agenteDef.anteriorRelevante(revision.cifras)
  const declaracionAnteriorAdjunta = revision.adjuntos.some((a) => a.tipo === 'declaracion' && /anterior/i.test(a.nombre))

  const estado = (i: InsumoIva): { listo: boolean; texto: string; opcional?: boolean } => {
    switch (i) {
      case 'borrador': return { listo: agente.declaradoDiligenciado, texto: agente.declaradoDiligenciado ? 'Columna Declarado diligenciada' : 'Falta: léelo con la IA o digítalo en la vista por pestañas' }
      case 'auxiliar': return {
        listo: agente.librosDiligenciados,
        texto: agente.auxiliares.length
          ? `${agente.auxiliares.length} auxiliar(es) cargado(s): ${agente.combinado?.resumen.cuentas.length ?? 0} cuenta(s) con movimiento en el período${(agente.combinado?.resumen.cuentas.reduce((s, c) => s + c.cierres.length, 0) ?? 0) ? ', asientos de cierre excluidos' : ''}`
          : agente.librosDiligenciados ? 'Según libros ya guardado en la revisión' : `Falta: el libro auxiliar de ${agenteDef.cuentas.map((c) => c.prefijo).join(', ')} del período, o el balance de prueba del período. Puede ser un archivo por cuenta o uno solo con todas; se lee tal como lo exporta el programa contable.`,
      }
      case 'dian': return { listo: !!agente.dian, texto: agente.dian ? `${agente.dian.archivo}: ${agente.dian.reporte.documentos.length} documento(s)` : 'Falta: se descarga del portal de facturación electrónica de la DIAN', opcional: true }
      case 'anterior': return tieneAnteriorEnPlataforma
        ? { listo: true, texto: `La revisión de ${agente.anterior!.etiqueta} está en la plataforma: no hace falta adjuntarla` }
        : { listo: declaracionAnteriorAdjunta, texto: declaracionAnteriorAdjunta ? 'Declaración anterior adjunta' : recomendadoAnterior ?? agenteDef.anteriorOpcional, opcional: true }
    }
  }
  const listos = insumos.filter((i) => estado(i).listo).length
  // El mapa de la memoria que usa este impuesto (2408, 2365 o 2368).
  const mapaMemoria = mapeoMemoriaDe(agenteDef.tipo, agente.memoria)
  const puedeAnalizar = agente.declaradoDiligenciado
  // Auxiliar elegido pero aún sin confirmar: el modal muestra qué trae y pide el nombre.
  const [analisis, setAnalisis] = useState<AnalisisAuxiliar | null>(null)

  return (
    <section className="overflow-hidden rounded-xl border border-teal-100 bg-white">
      <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50/70 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-teal-900"><FolderOpen size={14} className="text-teal-500" /> Documentos que el agente necesita</h2>
        <span className="text-xs text-teal-700">{listos} de {insumos.length} listos</span>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-xs text-gray-500">Según el programa que aceptaste, estos son los insumos clave. Cada uno dice para qué sirve; los opcionales amplían lo que el agente puede verificar.</p>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {insumos.map((i) => {
            const e = estado(i)
            const Icono = INSUMO_ICONO[i]
            const label = agenteDef.insumos[i]
            return (
              <li key={i} className={cn('flex flex-col gap-2 rounded-xl border p-4', e.listo ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200')}>
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', e.listo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    {e.listo ? <CheckCircle2 size={16} /> : <Icono size={16} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                      {label.nombre}
                      {e.opcional && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Opcional</span>}
                    </p>
                    <p className="text-[11px] leading-snug text-gray-500">{label.para}</p>
                    <p className={cn('mt-1 text-[11px]', e.listo ? 'text-emerald-700' : 'text-amber-700')}>{e.texto}</p>
                    {i === 'auxiliar' && (Object.keys(mapaMemoria).length > 0 || agente.memoria.tiposDocCierre.length > 0) && (
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-indigo-700">
                        <Bot size={11} /> Memoria de la empresa:
                        {agente.memoria.tiposDocCierre.length > 0 && <span>cierre con comprobante {agente.memoria.tiposDocCierre.join(', ')}</span>}
                        {agente.memoria.tiposDocCierre.length > 0 && Object.keys(mapaMemoria).length > 0 && <span>·</span>}
                        {Object.keys(mapaMemoria).length > 0 && <span title={Object.entries(mapaMemoria).map(([c, d]) => `${c.replace(/^obligacion:.*/, 'municipio de una declaración')} → ${d}`).join('\n')}>{Object.keys(mapaMemoria).length} clasificación(es) guardada(s)</span>}
                        {!sellada && <button onClick={() => agente.olvidarMemoria.mutate()} className="ml-1 text-gray-400 underline-offset-2 hover:underline">Olvidar</button>}
                      </p>
                    )}
                    {i === 'auxiliar' && agente.auxiliares.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {agente.auxiliares.map((a) => (
                          <li key={a.id} className="flex items-center gap-2 rounded-md border border-emerald-100 bg-white px-2 py-1 text-[11px] text-gray-700">
                            <FileSpreadsheet size={11} className="shrink-0 text-emerald-600" />
                            <span className="min-w-0 flex-1 truncate" title={`${a.archivo} · cuentas ${a.cuentas.join(', ')}`}>
                              <span className="font-medium">{a.nombre}</span>
                              <span className="text-gray-400"> · {a.familia === 'balance' ? `balance, ${a.cuentas.length} cuenta(s)` : `${a.enPeriodo} asiento(s), ${a.cuentas.length} cuenta(s)${a.cierres ? `, ${a.cierres} cierre(s) excluido(s)` : ''}`}</span>
                            </span>
                            {!sellada && <button onClick={() => void agente.quitarAuxiliar(a.id)} className="text-gray-300 hover:text-rose-600" title="Quitar este auxiliar"><Trash2 size={11} /></button>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {!sellada && (
                  <div className="flex flex-wrap gap-2 pl-11">
                    {i === 'borrador' && (
                      <>
                        {p.lecturaDisponible && <Button size="sm" variant="secondary" className="gap-1.5" onClick={p.onLeerBorrador}><Sparkles size={12} /> Leer el borrador</Button>}
                        <Button size="sm" variant="ghost" className="gap-1.5" onClick={p.irAPestanas}><LayoutList size={12} /> Digitar cifras</Button>
                      </>
                    )}
                    {i === 'auxiliar' && (
                      <CargarArchivo
                        label={agente.auxiliares.length ? 'Cargar otro auxiliar' : 'Cargar auxiliar'}
                        loading={agente.cargando === 'auxiliar' && !analisis}
                        onFile={async (f) => { const a = await agente.analizarAuxiliar(f); if (a) setAnalisis(a) }}
                      />
                    )}
                    {i === 'dian' && <CargarArchivo label={agente.dian ? 'Cargar otro reporte' : 'Cargar reporte DIAN'} loading={agente.cargando === 'dian'} onFile={agente.cargarDian} />}
                    {i === 'anterior' && !tieneAnteriorEnPlataforma && <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => p.onAdjuntar(null)}><Upload size={12} /> Adjuntar declaración anterior</Button>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-600">Soportes de la revisión ({soportes.length})</p>
            {!sellada && <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => p.onAdjuntar(null)}><Upload size={12} /> Adjuntar otro</Button>}
          </div>
          {soportes.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {soportes.map((a) => (
                <li key={a.id} className="flex items-center gap-1 rounded-full border border-gray-200 bg-white py-0.5 pl-1 pr-2 text-[11px] text-gray-600">
                  <button onClick={() => p.onDescargar(a.id)} title={`Descargar ${a.archivoNombre}`} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-indigo-700 hover:bg-indigo-50">
                    <Download size={11} /> {a.nombre}
                  </button>
                  <span className="text-gray-300">· {fechaCorta(a.createdAt)}</span>
                  {(!sellada || a.posteriorAFirma) && <button onClick={() => p.onEliminarAdjunto(a.id)} className="text-gray-300 hover:text-rose-600" title="Quitar"><Trash2 size={10} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <ModalAuxiliar
          analisis={analisis}
          cargando={agente.cargando === 'auxiliar'}
          onClose={() => setAnalisis(null)}
          onConfirmar={async (nombre) => { if (analisis) { await agente.confirmarAuxiliar(analisis, nombre); setAnalisis(null) } }}
        />

        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" className="gap-2" onClick={() => p.onPaso(1)}><ArrowLeft size={15} /> Programa</Button>
          {sellada ? (
            <Button className="gap-2" onClick={() => p.onPaso(3)}>Ver el análisis <ArrowRight size={15} /></Button>
          ) : (
            <Button className="gap-2" disabled={!puedeAnalizar} loading={agente.correr.isPending} onClick={() => agente.correr.mutate(undefined, { onSuccess: () => p.onPaso(3) })} title={puedeAnalizar ? undefined : 'Primero diligencia la columna Declarado'}>
              <Play size={15} /> {agente.corrida ? 'Volver a analizar' : 'Iniciar el análisis'}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Confirmación de un auxiliar antes de cargarlo: qué cuentas y cuántos asientos
 * trae en el período, qué auxiliar reemplazaría, y el nombre con el que queda
 * como soporte (sugerido según las cuentas; el auditor lo edita).
 */
const COLUMNA_LABEL: Record<string, string> = {
  fecha: 'fecha', cuenta: 'cuenta', cuentaNombre: 'nombre de cuenta', debito: 'débito', credito: 'crédito', valor: 'valor único', tipoDoc: 'tipo de documento',
  numeroDoc: 'número de documento', tercero: 'NIT tercero', terceroNombre: 'nombre tercero', concepto: 'concepto', base: 'base gravable', tarifa: 'tarifa',
  nombre: 'nombre de cuenta', saldoInicial: 'saldo inicial', saldoFinal: 'saldo final',
}

function ModalAuxiliar({ analisis, cargando, onClose, onConfirmar }: { analisis: AnalisisAuxiliar | null; cargando: boolean; onClose: () => void; onConfirmar: (nombre: string) => void | Promise<void> }) {
  const [nombre, setNombre] = useState('')
  // Remonta el nombre con cada archivo nuevo.
  useEffect(() => setNombre(analisis?.sugerencia ?? ''), [analisis])
  if (!analisis) return null
  return (
    <Modal open onClose={onClose} title={analisis.familia === 'balance' ? 'Cargar balance de prueba' : 'Cargar auxiliar'} size="sm">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2 text-xs text-gray-600">
          <p className="truncate font-medium text-gray-800" title={analisis.archivo.name}>{analisis.archivo.name}</p>
          <p className="mt-0.5">
            {analisis.familia === 'balance'
              ? `Balance de prueba del período: ${analisis.enPeriodo} cuenta(s) con movimiento`
              : `Libro auxiliar: ${analisis.enPeriodo} asiento(s) dentro del período${analisis.cierres ? ` · ${analisis.cierres} asiento(s) de cierre excluidos` : ''}`}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">Columnas reconocidas: {analisis.reconocidas.map((r) => COLUMNA_LABEL[r] ?? r).join(', ')}.</p>
          <ul className="mt-1.5 space-y-0.5">
            {analisis.cuentas.slice(0, 8).map((c) => (
              <li key={c.cuenta} className="flex justify-between gap-2"><span className="truncate">{c.cuenta} {c.nombre ?? ''}</span><span className="shrink-0 text-gray-400">{c.movimientos}</span></li>
            ))}
            {analisis.cuentas.length > 8 && <li className="text-gray-400">… y {analisis.cuentas.length - 8} cuenta(s) más</li>}
          </ul>
          {analisis.advertencias.map((a, i) => <p key={i} className="mt-1 text-amber-700">{a}</p>)}
        </div>
        <Input
          label="Nombre del auxiliar"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={analisis.sugerencia}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && !cargando) void onConfirmar(nombre) }}
        />
        <p className="-mt-2 text-xs text-gray-400">Así queda como soporte de la revisión y así lo nombra el agente en su bitácora.</p>
        {analisis.reemplaza.length > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Trae cuentas que ya están en {analisis.reemplaza.map((a) => `"${a.nombre}"`).join(' y ')}: al cargarlo lo reemplaza para no sumar dos veces.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={cargando}>Cancelar</Button>
          <Button loading={cargando} onClick={() => void onConfirmar(nombre)} className="gap-1.5"><Upload size={13} /> Cargar</Button>
        </div>
      </div>
    </Modal>
  )
}

function CargarArchivo({ label, loading, onFile }: { label: string; loading: boolean; onFile: (f: File) => void }) {
  const id = useMemo(() => `archivo-${Math.random().toString(36).slice(2)}`, [])
  return (
    <>
      <input id={id} type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f) }} />
      <Button size="sm" variant="secondary" className="gap-1.5" loading={loading} onClick={() => document.getElementById(id)?.click()}><Upload size={12} /> {label}</Button>
    </>
  )
}

// ─── Paso 3 · Análisis ───────────────────────────────────────────────────────

function PasoAnalisis({ agente, sellada, exportarCedulas, onSiguiente, onAtras }: { agente: ReturnType<typeof useAgenteIva>; sellada: boolean; exportarCedulas: (formato: 'pdf' | 'word') => void; onSiguiente: () => void; onAtras: () => void }) {
  const corrida = agente.corrida
  const r = agente.resumen
  // La bitácora persistida de la corrida (lectura de archivos + reglas del motor).
  const lineas = useMemo(() => corrida?.bitacora.map((l) => l.texto) ?? [], [corrida])
  // Recién corrida en esta sesión se revela línea a línea; al volver a entrar se muestra completa.
  const animar = agente.recienCorrida
  const [reveladas, setReveladas] = useState(animar ? 0 : lineas.length)
  useEffect(() => {
    if (!animar) { setReveladas(lineas.length); return }
    setReveladas(0)
    if (lineas.length === 0) return
    const t = setInterval(() => setReveladas((n) => (n >= lineas.length ? n : n + 1)), 90)
    return () => clearInterval(t)
  }, [lineas, animar])
  const terminado = reveladas >= lineas.length
  useEffect(() => { if (terminado && animar) agente.marcarVista() }, [terminado, animar]) // eslint-disable-line react-hooks/exhaustive-deps
  const fecha = corrida?.terminadaAt ? new Date(corrida.terminadaAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : null
  const hayCedulas = agente.cedulas.length > 0

  if (agente.cargandoEstado) {
    return <section className="rounded-xl border border-indigo-100 bg-white p-5 text-sm text-gray-500">Cargando el análisis guardado…</section>
  }

  if (!corrida) {
    return (
      <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
        <div className="border-b border-indigo-100 bg-indigo-50/70 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><Bot size={14} className="text-indigo-500" /> Análisis</h2>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-gray-600">Todavía no hay un análisis guardado para esta revisión. Cuando lo corras, quedan registradas las reglas que se ejecutaron, con qué documentos y qué propuso el agente.</p>
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" className="gap-2" onClick={onAtras}><ArrowLeft size={15} /> Documentos</Button>
            {!sellada && (
              <Button className="gap-2" disabled={!agente.declaradoDiligenciado} loading={agente.correr.isPending} onClick={() => agente.correr.mutate()} title={agente.declaradoDiligenciado ? undefined : 'Primero diligencia la columna Declarado'}>
                <Play size={15} /> Correr el análisis
              </Button>
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-5">
    <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
      <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><Bot size={14} className={cn('text-indigo-500', !terminado && 'animate-pulse')} /> {terminado ? (hayCedulas ? 'El agente preparó los procedimientos' : 'Análisis terminado') : 'Analizando…'}</h2>
        {r && <span className="text-xs text-indigo-600">{r.reglasEjecutadas.length} regla(s) · {r.limitaciones.length} limitación(es){fecha ? ` · ${fecha}` : ''}</span>}
      </div>
      <div className="space-y-4 p-5">
        {agente.desactualizada && !sellada && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span>Los documentos o las cifras declaradas cambiaron después de este análisis. Lo que ves es el registro de la corrida anterior.</span>
            <Button size="sm" variant="secondary" className="gap-1.5" loading={agente.correr.isPending} onClick={() => agente.correr.mutate()}><Play size={12} /> Volver a analizar</Button>
          </div>
        )}
        {r && r.insumos && (
          <p className="text-xs text-gray-500">
            Insumos: {[
              ...r.insumos.auxiliares.map((a) => a.nombre),
              r.insumos.dian ? `${r.insumos.dian.archivo} (${r.insumos.dian.documentos} documentos DIAN)` : null,
              r.insumos.anterior ? `revisión de ${r.insumos.anterior}` : null,
            ].filter(Boolean).join(' · ') || 'solo la columna Declarado'}.
          </p>
        )}
        {hayCedulas && terminado ? (
          <details className="rounded-lg border border-gray-100 bg-gray-50/60 text-[12px] text-gray-700">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-600">Bitácora técnica del análisis ({lineas.length} línea(s))</summary>
            <ol className="max-h-80 space-y-1 overflow-y-auto border-t border-gray-100 p-3 leading-relaxed">
              {lineas.map((t, i) => <li key={i} className="flex gap-2"><span className="w-6 shrink-0 text-right text-gray-400">{String(i + 1).padStart(2, '0')}</span><span>{t}</span></li>)}
            </ol>
          </details>
        ) : (
          <ol className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-[12px] leading-relaxed text-gray-700">
            {lineas.slice(0, reveladas).map((t, i) => <li key={i} className="flex gap-2"><span className="w-6 shrink-0 text-right text-gray-400">{String(i + 1).padStart(2, '0')}</span><span>{t}</span></li>)}
            {!terminado && <li className="pl-8 text-gray-400">…</li>}
          </ol>
        )}
        {hayCedulas && terminado && (
          <p className="text-xs leading-relaxed text-gray-600">
            Abajo está cada procedimiento con todo lo que se comparó, lo que cuadró y lo que no. El agente prepara la cédula; la conclusión de cada una es tuya,
            y la revisión no se puede firmar mientras falte alguna. {agente.sinConcluir.length > 0 ? `Faltan ${agente.sinConcluir.length}.` : 'Ya concluiste todos.'}
          </p>
        )}
        {terminado && r && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { n: r.hallazgos, label: 'hallazgos propuestos', clase: 'text-rose-700 bg-rose-50 border-rose-100' },
              { n: r.juicios, label: 'puntos por confirmar', clase: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
              { n: r.ambiguedades + r.documentos, label: 'aclaraciones o documentos', clase: 'text-amber-700 bg-amber-50 border-amber-100' },
              hayCedulas
                ? { n: agente.cedulas.reduce((s, c) => s + c.resultado.conformes, 0), label: 'partidas conformes', clase: 'text-emerald-700 bg-emerald-50 border-emerald-100' }
                : { n: r.verificados.length, label: 'puntos verificados sin diferencias', clase: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
            ].map((c) => (
              <div key={c.label} className={cn('rounded-lg border px-3 py-2', c.clase)}>
                <p className="text-xl font-semibold">{c.n}</p>
                <p className="text-[11px] leading-tight">{c.label}</p>
              </div>
            ))}
          </div>
        )}
        {terminado && r && r.limitaciones.length > 0 && (
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
            <p className="mb-1 font-medium">Lo que el agente no pudo verificar</p>
            <ul className="list-disc space-y-0.5 pl-4">{r.limitaciones.map((l) => <li key={l.regla}><span className="font-medium">{l.regla}:</span> {l.motivo}</li>)}</ul>
          </div>
        )}
        {!hayCedulas && (
          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" className="gap-2" onClick={onAtras}><ArrowLeft size={15} /> Documentos</Button>
            <Button className="gap-2" disabled={!terminado} onClick={onSiguiente}>Ver los hallazgos <ArrowRight size={15} /></Button>
          </div>
        )}
      </div>
    </section>
    {hayCedulas && terminado && (
      <>
        <CedulasRevision agente={agente} sellada={sellada} />
        <div className="flex items-center justify-between">
          <Button variant="ghost" className="gap-2" onClick={onAtras}><ArrowLeft size={15} /> Documentos</Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">Cédulas:</span>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => exportarCedulas('pdf')}><Printer size={13} /> PDF</Button>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => exportarCedulas('word')}><Download size={13} /> Word</Button>
            <Button className="gap-2" onClick={onSiguiente}>Ver los hallazgos <ArrowRight size={15} /></Button>
          </div>
        </div>
      </>
    )}
    </div>
  )
}

// ─── Paso 4 · Hallazgos ──────────────────────────────────────────────────────

function PasoHallazgos({ p, agente, programa, onGuardarPrograma }: { p: Props; agente: ReturnType<typeof useAgenteIva>; programa: ProgramaRevision; onGuardarPrograma: (pr: ProgramaRevision) => void }) {
  const { revision, sellada } = p
  const pendientes = agente.pendientes
  // Una decisión a la vez: al decidir, la propuesta sale de las pendientes y entra la siguiente.
  const actual = pendientes[0] ?? null
  const propios = programa.pasos.filter((x) => x.origen === 'propio' && x.activo)
  const total = agente.propuestas.length
  const decididas = agente.propuestas.filter((x) => x.estado === 'aprobada' || x.estado === 'ajustada' || x.estado === 'descartada').length

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
        <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><Bot size={14} className="text-indigo-500" /> Lo que propone el agente</h2>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700">{pendientes.length === 0 ? 'Sin decisiones pendientes' : `Te toca: ${pendientes.length}`}</span>
        </div>
        <div className="p-5">
          {!agente.corrida ? (
            <p className="text-sm text-gray-600">Aún no hay análisis. <button onClick={() => p.onPaso(3)} className="text-indigo-600 underline-offset-2 hover:underline">Córrelo en el paso anterior</button> para ver lo que propone el agente.</p>
          ) : actual ? (
            <DecisionCard
              key={actual.id}
              propuesta={actual}
              posicion={{ actual: total - pendientes.length + 1, total }}
              decidiendo={agente.decidir.isPending}
              soloLectura={sellada}
              onDecidir={(decision, extra) => agente.decidir.mutate({ p: actual, decision, extra })}
            />
          ) : (
            <p className="text-sm text-gray-600">
              {total === 0
                ? 'El agente no encontró diferencias por encima del redondeo del formulario con los documentos cargados.'
                : agente.omitidas.length > 0
                  ? `Decidiste ${decididas} de ${total} propuesta(s); ${agente.omitidas.length} quedaron omitidas por ahora.`
                  : `Decidiste las ${total} propuesta(s) del análisis. Agrega abajo lo que hayas encontrado por tu cuenta.`}
              {agente.omitidas.length > 0 && !sellada && (
                <button onClick={() => agente.retomarOmitidas.mutate()} disabled={agente.retomarOmitidas.isPending} className="ml-2 text-xs text-gray-400 underline-offset-2 hover:underline">Volver a ver las omitidas</button>
              )}
            </p>
          )}
        </div>
      </section>

      {propios.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-100 bg-white">
          <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><ClipboardList size={14} className="text-amber-500" /> Tus pasos propios</h2>
          </div>
          <ul className="divide-y divide-gray-100 px-5">
            {propios.map((x) => (
              <li key={x.id} className="flex items-start gap-3 py-2.5">
                <input type="checkbox" checked={!!x.hecho} disabled={sellada} onChange={(e) => onGuardarPrograma({ ...programa, pasos: programa.pasos.map((y) => (y.id === x.id ? { ...y, hecho: e.target.checked } : y)) })} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', x.hecho ? 'text-gray-400 line-through' : 'text-gray-700')}>{x.texto}</p>
                  <input
                    type="text"
                    placeholder="Nota de lo que verificaste (opcional)"
                    defaultValue={x.nota ?? ''}
                    disabled={sellada}
                    onBlur={(e) => { if ((e.target.value || null) !== (x.nota ?? null)) onGuardarPrograma({ ...programa, pasos: programa.pasos.map((y) => (y.id === x.id ? { ...y, nota: e.target.value || null } : y)) }) }}
                    className="mt-1 w-full rounded border border-gray-100 px-2 py-1 text-xs text-gray-600 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none disabled:bg-gray-50"
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-rose-100 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 bg-rose-50/70 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900"><AlertTriangle size={14} className="text-rose-500" /> Hallazgos de la revisión</h2>
          {!sellada && (
            <Button size="sm" variant="secondary" className="gap-1.5" disabled={p.borradorHallazgo} onClick={() => p.setBorradorHallazgo(true)}><Plus size={13} /> Agregar otro hallazgo</Button>
          )}
        </div>
        <div className="p-5">
          <HallazgosTabla
            hallazgos={revision.hallazgos}
            sellada={sellada}
            iaDisponible={p.iaDisponible}
            nuevoId={p.nuevoHallazgoId}
            onEnfocadoNuevo={p.onEnfocadoNuevo}
            borrador={p.borradorHallazgo}
            onCerrarBorrador={() => p.setBorradorHallazgo(false)}
            onCrear={p.onCrearHallazgo}
            adjuntos={revision.adjuntos}
            onAdjuntar={(hallazgoId) => p.onAdjuntar(hallazgoId)}
            onDescargar={p.onDescargar}
            onEliminarAdjunto={p.onEliminarAdjunto}
            onCambio={p.invalidar}
            origenAgente={hallazgosDelAgente(revision.agente)}
            />
        </div>
      </section>

      <div className="flex items-center justify-between">
        <Button variant="ghost" className="gap-2" onClick={() => p.onPaso(3)}><ArrowLeft size={15} /> Procedimientos</Button>
        <Button className="gap-2" onClick={() => p.onPaso(5)}>Preparar el informe <ArrowRight size={15} /></Button>
      </div>
    </div>
  )
}

// ─── Paso 5 · Informe ────────────────────────────────────────────────────────

function PasoInforme({ p, agente, programa, hechos, total, soportes }: { p: Props; agente: ReturnType<typeof useAgenteIva>; programa: ProgramaRevision; hechos: number; total: number; soportes: number }) {
  const { revision, sellada } = p
  const pendientes = revision.hallazgos.filter((h) => h.estado !== 'resuelto').length
  const propiosPendientes = programa.pasos.filter((x) => x.origen === 'propio' && x.activo && !x.hecho).length
  const sinConclusion = !(revision.conclusion ?? '').trim()
  const faltanCedulas = agente.sinConcluir.length
  const motivoNoFirmar = sinConclusion ? 'Escribe la conclusión antes de firmar' : faltanCedulas ? `Falta tu conclusión en ${faltanCedulas} procedimiento(s)` : undefined
  const resumen = [
    { label: 'Programa', valor: `${programa.pasos.filter((x) => x.activo).length} paso(s)${propiosPendientes ? ` · ${propiosPendientes} propio(s) sin marcar` : ''}`, ok: propiosPendientes === 0 },
    { label: 'Checklist del impuesto', valor: `${hechos} de ${total} puntos`, ok: hechos === total },
    { label: 'Hallazgos', valor: `${revision.hallazgos.length}${pendientes ? ` · ${pendientes} pendiente(s)` : ''}`, ok: true },
    ...(agente.cedulas.length ? [{ label: 'Conclusiones por procedimiento', valor: agente.sinConcluir.length === 0 ? 'todas escritas' : `faltan ${agente.sinConcluir.length}`, ok: agente.sinConcluir.length === 0 }] : []),
    { label: 'Decisiones del agente', valor: agente.pendientes.length === 0 ? 'todas tomadas' : `${agente.pendientes.length} sin decidir`, ok: agente.pendientes.length === 0 },
    { label: 'Soportes', valor: String(soportes), ok: soportes > 0 },
  ]

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <section className="overflow-hidden rounded-xl border border-violet-100 bg-white lg:col-span-2">
        <div className="border-b border-violet-100 bg-violet-50/70 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-900"><FileText size={14} className="text-violet-500" /> Observaciones y conclusión</h2>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-900">Observaciones</label>
            <textarea rows={3} defaultValue={revision.observaciones ?? ''} disabled={sellada}
              onBlur={(e) => { if ((e.target.value || null) !== revision.observaciones) p.guardar({ observaciones: e.target.value }) }}
              placeholder="Partidas por aclarar, recomendaciones generales al cliente…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none disabled:bg-gray-50" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-900">Conclusión</label>
            <textarea rows={4} defaultValue={revision.conclusion ?? ''} disabled={sellada}
              onBlur={(e) => { if ((e.target.value || null) !== revision.conclusion) p.guardar({ conclusion: e.target.value }) }}
              placeholder="p. ej. Revisada la declaración del período contra libros y facturación electrónica; las bases, tarifas y descontables son razonables y se presentó y pagó oportunamente."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none disabled:bg-gray-50" />
            <p className="mt-1 text-xs text-gray-400">Requerida para firmar. El informe lleva alcance, programa, lo verificado, hallazgos, conclusión y soportes.</p>
            {faltanCedulas > 0 && !sellada && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Falta tu conclusión en {faltanCedulas} procedimiento(s): {agente.sinConcluir.map((c) => c.titulo).join('; ')}.{' '}
                <button onClick={() => p.onPaso(3)} className="font-medium underline-offset-2 hover:underline">Ir a los procedimientos</button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button variant="ghost" className="gap-2" onClick={() => p.onPaso(4)}><ArrowLeft size={15} /> Hallazgos</Button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-400">{sellada ? 'Constancia:' : 'Informe preliminar:'}</span>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => p.exportarDocumento('pdf')}><Printer size={13} /> PDF</Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => p.exportarDocumento('word')}><Download size={13} /> Word</Button>
              {!sellada && <Button className="gap-2" disabled={!!motivoNoFirmar} onClick={p.onFirmar} title={motivoNoFirmar}><CheckCircle2 size={15} /> Firmar revisión</Button>}
            </div>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Qué lleva el informe</h2>
        </div>
        <ul className="divide-y divide-gray-100 px-5">
          {resumen.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="text-gray-600">{r.label}</span>
              <span className={cn('flex items-center gap-1 text-right text-xs font-medium', r.ok ? 'text-emerald-700' : 'text-amber-700')}>
                {r.ok ? <Check size={12} /> : <AlertTriangle size={12} />} {r.valor}
              </span>
            </li>
          ))}
        </ul>
        {sellada && (
          <p className="px-5 pb-4 text-xs text-emerald-700">Firmada{revision.revisadoNombre ? ` por ${revision.revisadoNombre}` : ''} el {fechaCorta(revision.revisadoAt)}: la constancia quedó sellada.</p>
        )}
      </section>
    </div>
  )
}
