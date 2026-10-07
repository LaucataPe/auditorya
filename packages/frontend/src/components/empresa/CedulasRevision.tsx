/**
 * Cédulas de la revisión agéntica: el análisis abierto procedimiento por
 * procedimiento (pedido del auditor, 2026-09-29). A la derecha, colapsable, la
 * secuencia (borrador solo → libros solos → cruce → detalle → analíticas →
 * oportunidad); a la izquierda la cédula: objetivo, criterio, fuente, TODO lo comparado, las
 * propuestas que nacieron ahí y la conclusión, que escribe el auditor.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, CircleDashed, FileSearch, FileText, ListChecks, MinusCircle, PanelRightClose, PanelRightOpen, PenLine, RefreshCw, Scale } from 'lucide-react'
import {
  ESTADO_FILA_LABEL,
  FASE_CEDULA_LABEL,
  ORDEN_FASES_CEDULA,
  RESULTADOS_CONCLUSION_CEDULA,
  RESULTADO_CONCLUSION_LABEL,
  estadoConclusionCedula,
  formatoCeldaCedula,
  type CedulaProcedimiento,
  type EstadoFilaCedula,
  type FilaCedula,
  type ResultadoConclusionCedula,
  type TablaCedula,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { DecisionCard } from '../agente/DecisionCard'
import type { AgenteIva } from '../../hooks/useAgenteIva'

const ESTADO_FILA_CLASE: Record<EstadoFilaCedula, string> = {
  conforme: 'bg-emerald-50 text-emerald-700',
  diferencia: 'bg-rose-50 text-rose-700',
  por_confirmar: 'bg-amber-50 text-amber-700',
  informativo: 'bg-gray-100 text-gray-600',
  no_verificable: 'bg-slate-100 text-slate-600',
}
const ES_EXCEPCION: Record<EstadoFilaCedula, boolean> = { conforme: false, diferencia: true, por_confirmar: true, informativo: false, no_verificable: true }
const FILAS_VISIBLES = 25
const CLAVE_COLAPSADO = 'auditorya.cedulas.panelColapsado'

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

export function CedulasRevision({ agente, sellada }: { agente: AgenteIva; sellada: boolean }) {
  const { cedulas, conclusiones } = agente
  const ordenadas = useMemo(
    () => [...cedulas].sort((a, b) => ORDEN_FASES_CEDULA.indexOf(a.fase) - ORDEN_FASES_CEDULA.indexOf(b.fase)),
    [cedulas],
  )
  // Abre en la primera cédula ejecutada que aún no tiene conclusión vigente.
  const inicial = ordenadas.find((c) => c.estado === 'ejecutada' && estadoConclusionCedula(c, conclusiones) !== 'vigente') ?? ordenadas[0]
  const [actualId, setActualId] = useState<string | null>(inicial?.id ?? null)
  // Panel de procedimientos colapsado: preferencia del navegador (puede no haber almacenamiento).
  const [colapsado, setColapsado] = useState<boolean>(() => { try { return localStorage.getItem(CLAVE_COLAPSADO) === '1' } catch { return false } })
  const cambiarColapsado = (v: boolean) => { setColapsado(v); try { localStorage.setItem(CLAVE_COLAPSADO, v ? '1' : '0') } catch { /* sin almacenamiento */ } }
  const actual = ordenadas.find((c) => c.id === actualId) ?? inicial
  if (!actual) return null
  const indice = ordenadas.indexOf(actual)
  const ejecutadas = ordenadas.filter((c) => c.estado === 'ejecutada')
  const concluidas = ejecutadas.filter((c) => estadoConclusionCedula(c, conclusiones) === 'vigente').length

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        <Cedula key={`${actual.id}-${actual.huella}`} cedula={actual} agente={agente} sellada={sellada} />
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={indice === 0} onClick={() => setActualId(ordenadas[indice - 1].id)}><ArrowLeft size={13} /> Procedimiento anterior</Button>
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={indice === ordenadas.length - 1} onClick={() => setActualId(ordenadas[indice + 1].id)}>Siguiente procedimiento <ArrowRight size={13} /></Button>
        </div>
      </div>

      <nav aria-label="Procedimientos" className={cn('shrink-0 transition-[width] duration-200 lg:sticky lg:top-4', colapsado ? 'lg:w-12' : 'lg:w-72')}>
        {colapsado ? (
          // Franja angosta: solo el estado de cada procedimiento, igual sirve para navegar.
          <div className="flex flex-row flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-white p-1.5 lg:flex-col lg:flex-nowrap">
            <button onClick={() => cambiarColapsado(false)} title="Mostrar los procedimientos" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-700">
              <PanelRightOpen size={16} />
            </button>
            <span className="hidden h-px w-6 bg-gray-100 lg:block" />
            {ordenadas.map((c, n) => (
              <button
                key={c.id}
                onClick={() => setActualId(c.id)}
                title={`${n + 1}. ${c.titulo}`}
                className={cn('flex h-8 w-8 items-center justify-center rounded-lg', c.id === actual.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50')}
              >
                <IconoCedula cedula={c} conclusion={estadoConclusionCedula(c, conclusiones)} />
              </button>
            ))}
            <span className="px-1 pt-1 text-center text-[10px] font-medium leading-tight text-gray-400" title={`${concluidas} de ${ejecutadas.length} con tu conclusión`}>{concluidas}/{ejecutadas.length}</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Procedimientos</p>
                <p className="text-[11px] text-gray-500">{concluidas} de {ejecutadas.length} con tu conclusión</p>
              </div>
              <button onClick={() => cambiarColapsado(true)} title="Ocultar los procedimientos" className="-mr-1 flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200/60 hover:text-gray-700">
                <PanelRightClose size={15} />
              </button>
            </div>
            <ol className="max-h-[calc(100vh-10rem)] overflow-y-auto py-1">
              {ORDEN_FASES_CEDULA.filter((f) => ordenadas.some((c) => c.fase === f)).map((fase) => (
                <li key={fase}>
                  <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{FASE_CEDULA_LABEL[fase]}</p>
                  <ul>
                    {ordenadas.filter((c) => c.fase === fase).map((c) => {
                      const concl = estadoConclusionCedula(c, conclusiones)
                      const abiertas = agente.propuestas.filter((p) => p.contenido.tributario?.cedula === c.id && p.estado === 'propuesta').length
                      return (
                        <li key={c.id}>
                          <button
                            onClick={() => setActualId(c.id)}
                            className={cn('flex w-full items-start gap-2 px-4 py-2 text-left text-xs transition-colors', c.id === actual.id ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50')}
                          >
                            <IconoCedula cedula={c} conclusion={concl} />
                            <span className="min-w-0 flex-1">
                              <span className={cn('block leading-snug', c.estado !== 'ejecutada' && 'text-gray-400')}>{c.titulo}</span>
                              <span className="mt-0.5 block text-[10px] text-gray-400">
                                {c.estado === 'omitida' ? 'Desactivado en el programa' : c.estado === 'sin_insumos' ? 'No se ejecutó' : [
                                  `${c.resultado.filas} partida(s)`,
                                  c.resultado.diferencias ? `${c.resultado.diferencias} diferencia(s)` : null,
                                  abiertas ? `${abiertas} por decidir` : null,
                                  concl === 'por_reconfirmar' ? 'reconfirmar conclusión' : null,
                                ].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        )}
      </nav>
    </div>
  )
}

/**
 * Botón compacto que abre un panel flotante con el detalle (criterio, fuente,
 * reglas). Se cierra al hacer clic afuera, con Esc o al abrir otro.
 */
function InfoChip({ Icono, label, children }: { Icono: typeof FileText; label: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors', abierto ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-700')}
      >
        <Icono size={11} /> {label} <ChevronDown size={11} className={cn('transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div role="dialog" aria-label={label} className="absolute left-0 top-full z-20 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          {children}
        </div>
      )}
    </div>
  )
}

function IconoCedula({ cedula, conclusion }: { cedula: CedulaProcedimiento; conclusion: ReturnType<typeof estadoConclusionCedula> }) {
  if (cedula.estado !== 'ejecutada') return <MinusCircle size={14} className="mt-0.5 shrink-0 text-gray-300" />
  if (conclusion === 'vigente') return <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
  if (conclusion === 'por_reconfirmar') return <RefreshCw size={14} className="mt-0.5 shrink-0 text-amber-500" />
  if (cedula.resultado.diferencias > 0) return <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-500" />
  return <CircleDashed size={14} className="mt-0.5 shrink-0 text-gray-400" />
}

function Cedula({ cedula, agente, sellada }: { cedula: CedulaProcedimiento; agente: AgenteIva; sellada: boolean }) {
  const propuestas = agente.propuestas.filter((p) => p.contenido.tributario?.cedula === cedula.id)
  const pendientes = propuestas.filter((p) => p.estado === 'propuesta')
  const decididas = propuestas.filter((p) => p.estado !== 'propuesta')
  const r = cedula.resultado

  return (
    <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
      <div className="border-b border-indigo-100 bg-indigo-50/70 px-5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">{FASE_CEDULA_LABEL[cedula.fase]}</p>
        <h2 className="flex items-start gap-2 text-sm font-semibold text-indigo-900"><FileSearch size={14} className="mt-0.5 shrink-0 text-indigo-500" /> {cedula.titulo}</h2>
      </div>
      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <p className="text-xs leading-snug text-gray-600">{cedula.objetivo}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <InfoChip Icono={Scale} label="Criterio y tolerancia">
              <p className="leading-relaxed">{cedula.criterio}</p>
            </InfoChip>
            <InfoChip Icono={FileText} label={cedula.fuentes.length > 1 ? `Fuentes (${cedula.fuentes.length})` : 'Fuente'}>
              <ul className="space-y-1">{cedula.fuentes.map((f, i) => <li key={i} className="leading-snug">{f}</li>)}</ul>
            </InfoChip>
            <InfoChip Icono={ListChecks} label={`Reglas (${cedula.reglas.length})`}>
              <p className="font-mono text-[11px] leading-relaxed">{cedula.reglas.join(', ')}</p>
              <p className="mt-1.5 text-[11px] text-gray-400">El detalle de cada regla está en la especificación del procedimiento.</p>
            </InfoChip>
          </div>
        </div>

        {cedula.estado !== 'ejecutada' ? (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <span className="font-medium">{cedula.estado === 'omitida' ? 'Procedimiento no ejecutado por decisión del auditor.' : 'Procedimiento no ejecutado.'}</span> {cedula.motivo}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{r.filas} partida(s)</span>
              <span className={cn('rounded-full px-2 py-0.5', ESTADO_FILA_CLASE.conforme)}>{r.conformes} conforme(s)</span>
              <span className={cn('rounded-full px-2 py-0.5', r.diferencias ? ESTADO_FILA_CLASE.diferencia : 'bg-gray-100 text-gray-500')}>{r.diferencias} con diferencia</span>
              <span className={cn('rounded-full px-2 py-0.5', r.porConfirmar ? ESTADO_FILA_CLASE.por_confirmar : 'bg-gray-100 text-gray-500')}>{r.porConfirmar} por confirmar</span>
              {r.noVerificables > 0 && <span className={cn('rounded-full px-2 py-0.5', ESTADO_FILA_CLASE.no_verificable)}>{r.noVerificables} no verificable(s)</span>}
            </div>
            {cedula.tablas.map((t) => <TablaDeCedula key={t.id} tabla={t} />)}
            {cedula.limitaciones.length > 0 && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                <p className="mb-1 font-medium">Limitaciones de este procedimiento</p>
                <ul className="list-disc space-y-0.5 pl-4">{cedula.limitaciones.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </div>
            )}
          </>
        )}

        {propuestas.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-700">Propuestas que salieron de este procedimiento</p>
            {pendientes[0] && (
              <DecisionCard
                key={pendientes[0].id}
                propuesta={pendientes[0]}
                posicion={{ actual: decididas.length + 1, total: propuestas.length }}
                decidiendo={agente.decidir.isPending}
                soloLectura={sellada}
                onDecidir={(decision, extra) => agente.decidir.mutate({ p: pendientes[0], decision, extra })}
              />
            )}
            {decididas.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-xs">
                {decididas.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="font-mono text-[11px] text-gray-400">{p.codigo}</span>
                    <span className="min-w-0 flex-1 text-gray-700">{p.titulo}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', p.estado === 'descartada' ? 'bg-gray-100 text-gray-600' : p.estado === 'omitida' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                      {p.estado === 'aprobada' ? 'Aprobada' : p.estado === 'ajustada' ? 'Aprobada con ajustes' : p.estado === 'omitida' ? 'Omitida por ahora' : 'Descartada'}
                    </span>
                    {p.motivoDecision && <span className="w-full text-[11px] text-gray-500">{p.motivoDecision}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {cedula.estado !== 'omitida' && <ConclusionDeCedula cedula={cedula} agente={agente} sellada={sellada} propuestasAbiertas={propuestas.filter((p) => p.estado === 'propuesta' || p.estado === 'omitida').length} />}
      </div>
    </section>
  )
}

function TablaDeCedula({ tabla }: { tabla: TablaCedula }) {
  const excepciones = tabla.filas.filter((f) => ES_EXCEPCION[f.estado]).length
  const [soloExcepciones, setSoloExcepciones] = useState(false)
  const filas = useMemo(() => (soloExcepciones ? tabla.filas.filter((f) => ES_EXCEPCION[f.estado]) : tabla.filas), [tabla, soloExcepciones])
  const hayNotas = tabla.filas.some((f) => f.nota || f.propuesta)
  const columnas = useMemo<ColumnDef<FilaCedula, any>[]>(() => [
    ...tabla.columnas.map((c): ColumnDef<FilaCedula, any> => ({
      id: c.clave,
      header: c.titulo,
      accessorFn: (f) => f.valores[c.clave] ?? null,
      cell: ({ getValue }) => formatoCeldaCedula(getValue() as string | number | null, c.formato),
      meta: c.formato === 'texto' ? undefined : { align: 'right', className: 'whitespace-nowrap tabular-nums' },
    })),
    {
      id: 'estado',
      header: 'Resultado',
      accessorFn: (f) => ESTADO_FILA_LABEL[f.estado],
      cell: ({ row }) => <span className={cn('whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium', ESTADO_FILA_CLASE[row.original.estado])}>{ESTADO_FILA_LABEL[row.original.estado]}</span>,
    },
    ...(hayNotas ? [{
      id: 'nota',
      header: 'Nota',
      accessorFn: (f: FilaCedula) => [f.propuesta, f.nota].filter(Boolean).join(' '),
      cell: ({ row }: { row: { original: FilaCedula } }) => <span className="text-gray-500">{row.original.propuesta && <span className="mr-1 font-mono text-indigo-600">{row.original.propuesta}</span>}{row.original.nota}</span>,
    } as ColumnDef<FilaCedula, any>] : []),
  ], [tabla, hayNotas])

  return (
    <div>
      <div className="mb-1.5">
        <p className="text-xs font-semibold text-gray-800">{tabla.titulo}</p>
        {tabla.descripcion && <p className="text-[11px] leading-snug text-gray-500">{tabla.descripcion}</p>}
      </div>
      <DataTable
        columns={columnas}
        data={filas}
        pageSize={FILAS_VISIBLES}
        searchPlaceholder={tabla.filas.length > 8 ? 'Buscar en la tabla…' : undefined}
        toolbar={excepciones > 0 && excepciones < tabla.filas.length ? (
          <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <input type="checkbox" checked={soloExcepciones} onChange={(e) => setSoloExcepciones(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600" />
            Solo excepciones ({excepciones})
          </label>
        ) : undefined}
        rowClassName={(f) => (f.estado === 'diferencia' ? 'bg-rose-50/30' : undefined)}
        emptyMessage="Sin partidas."
      />
      {tabla.omitidas ? <p className="mt-1 text-[11px] text-gray-400">{tabla.omitidas} fila(s) más no se guardaron en la cédula: están en el archivo fuente.</p> : null}
    </div>
  )
}

function ConclusionDeCedula({ cedula, agente, sellada, propuestasAbiertas }: { cedula: CedulaProcedimiento; agente: AgenteIva; sellada: boolean; propuestasAbiertas: number }) {
  const guardada = agente.conclusiones[cedula.id] ?? null
  const estado = estadoConclusionCedula(cedula, agente.conclusiones)
  const resultadoSugerido: ResultadoConclusionCedula = cedula.estado !== 'ejecutada' ? 'no_concluyente' : cedula.resultado.diferencias + cedula.resultado.porConfirmar > 0 ? 'con_excepciones' : 'satisfactorio'
  const [texto, setTexto] = useState(guardada?.texto ?? '')
  const [resultado, setResultado] = useState<ResultadoConclusionCedula>(guardada?.resultado ?? resultadoSugerido)
  useEffect(() => { setTexto(guardada?.texto ?? ''); setResultado(guardada?.resultado ?? resultadoSugerido) }, [guardada?.at]) // eslint-disable-line react-hooks/exhaustive-deps
  const sinCambios = !!guardada && estado === 'vigente' && guardada.texto === texto.trim() && guardada.resultado === resultado
  const bloqueaSatisfactorio = resultado === 'satisfactorio' && propuestasAbiertas > 0

  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-900"><PenLine size={13} className="text-violet-500" /> Tu conclusión sobre este procedimiento</p>
        {guardada && (
          <span className={cn('text-[11px]', estado === 'vigente' ? 'text-emerald-700' : 'text-amber-700')}>
            {estado === 'vigente' ? 'Concluido' : 'Por reconfirmar'} · {guardada.porNombre ?? 'Usuario'} · {fechaHora(guardada.at)}
          </span>
        )}
      </div>
      {estado === 'por_reconfirmar' && (
        <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">El contenido de esta cédula cambió con un análisis posterior a tu conclusión. Revísala y vuelve a guardarla para que cuente.</p>
      )}
      {cedula.estado === 'sin_insumos' && !guardada && (
        <p className="mb-2 text-[11px] text-gray-500">Este procedimiento no se ejecutó, así que no exige conclusión para firmar. Puedes dejar constancia de por qué o de cómo lo cubriste por otro medio.</p>
      )}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {RESULTADOS_CONCLUSION_CEDULA.map((r) => (
          <button
            key={r}
            disabled={sellada}
            onClick={() => setResultado(r)}
            className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors', resultado === r ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-violet-300')}
          >
            {RESULTADO_CONCLUSION_LABEL[r]}
          </button>
        ))}
      </div>
      <textarea
        rows={4}
        value={texto}
        disabled={sellada}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Qué revisaste, qué encontraste y por qué el resultado te parece suficiente."
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-violet-300 focus:outline-none disabled:bg-gray-50"
      />
      {!sellada && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px]">
            {cedula.conclusionSugerida && <button onClick={() => setTexto(cedula.conclusionSugerida)} className="text-violet-700 underline-offset-2 hover:underline">Partir del borrador del agente</button>}
            {bloqueaSatisfactorio && <span className="text-amber-700">Hay {propuestasAbiertas} propuesta(s) sin decidir: decídelas o concluye con excepciones.</span>}
          </div>
          <Button size="sm" loading={agente.concluir.isPending} disabled={texto.trim().length < 10 || sinCambios || bloqueaSatisfactorio} onClick={() => agente.concluir.mutate({ cedulaId: cedula.id, texto: texto.trim(), resultado })}>
            {guardada ? (estado === 'por_reconfirmar' ? 'Reconfirmar conclusión' : 'Actualizar conclusión') : 'Guardar conclusión'}
          </Button>
        </div>
      )}
    </div>
  )
}
