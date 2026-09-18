import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, FileText, Plus, Sparkles } from 'lucide-react'
import type { PropuestaAgente, RiesgosCiclo } from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { DecisionCard } from './DecisionCard'
import {
  useAgregarRiesgo, useCorrerRiesgos, useCrearPruebaRiesgo, useDecidir, useResponderRiesgo, useResumenAgente, useRiesgosPorCiclo,
} from '../../hooks/useAgente'

const NIVEL_CLS: Record<string, string> = { alto: 'bg-red-50 text-red-700', medio: 'bg-amber-50 text-amber-700', bajo: 'bg-gray-100 text-gray-600' }
const FUENTE_TXT: Record<string, string> = { hallazgo: 'del balance', entendimiento: 'del entendimiento', sector: 'del sector' }
const ORIGEN_TXT: Record<string, string> = { manual: 'manual', sugerido: 'sugerido', analitico: 'del balance' }

/**
 * Riesgos por ciclo: en cada ciclo marcas los riesgos que cubres y el agente los aprueba y
 * crea su prueba. Los no marcados quedan como propuesta omitida (no entran a la matriz).
 * Los riesgos ya en la matriz muestran su prueba o piden crearla / responder sin prueba.
 */
export function RiesgosPorCiclo({ auditoriaId, materialidadAprobada, children }: { auditoriaId: string; materialidadAprobada: boolean; children: ReactNode }) {
  const q = useRiesgosPorCiclo(auditoriaId)
  const resumen = useResumenAgente(auditoriaId, true)
  const correr = useCorrerRiesgos(auditoriaId)
  const decidir = useDecidir(auditoriaId)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [cubriendo, setCubriendo] = useState(false)
  const [verContenido, setVerContenido] = useState(false)
  const [verOtros, setVerOtros] = useState(false)

  // Sin corrida de riesgos todavía: el agente propone solo al entrar si el balance ya está revisado.
  const corridaBalance = resumen.data?.corrida ?? null
  const corridaRiesgos = resumen.data?.corridaRiesgos ?? null
  const disparado = useRef(false)
  useEffect(() => {
    if (!resumen.data || disparado.current || correr.isPending) return
    if (corridaBalance?.estado === 'completada' && !corridaRiesgos) { disparado.current = true; correr.mutate() }
  }, [resumen.data, corridaBalance, corridaRiesgos, correr])

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const cubrir = async (ids: string[]) => {
    if (ids.length === 0) return
    setCubriendo(true)
    try { for (const id of ids) await decidir.mutateAsync({ id, decision: 'aprobar' }) } finally { setCubriendo(false); setSel((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n }) }
  }
  const omitir = async (ids: string[]) => {
    setCubriendo(true)
    try { for (const id of ids) await decidir.mutateAsync({ id, decision: 'omitir' }) } finally { setCubriendo(false) }
  }

  if (q.isLoading || !q.data) return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
  const { ciclos, otros } = q.data
  const totalPendientes = ciclos.reduce((n, c) => n + c.propuestas.length, 0)
  const r = corridaRiesgos?.resultado as { riesgos?: number; porFuente?: { hallazgo: number; sector: number; entendimiento: number } } | undefined

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gray-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700"><Sparkles size={14} className="text-indigo-500" />Riesgos por ciclo</span>
        {corridaRiesgos?.estado === 'completada' && r && <span>{r.riesgos ?? 0} propuestos · {r.porFuente?.hallazgo ?? 0} del balance · {r.porFuente?.entendimiento ?? 0} del entendimiento · {r.porFuente?.sector ?? 0} del sector</span>}
        {!corridaRiesgos && !correr.isPending && corridaBalance?.estado !== 'completada' && <span>Revisa el balance primero y el agente propone los riesgos con evidencia.</span>}
        <button type="button" onClick={() => correr.mutate()} disabled={correr.isPending} className="text-indigo-600 hover:underline disabled:opacity-50">{correr.isPending ? 'Proponiendo…' : corridaRiesgos ? 'Volver a proponer' : 'Proponer riesgos'}</button>
      </div>

      {totalPendientes > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-2.5 backdrop-blur">
          <span className="text-[13px] text-indigo-900">Marca los riesgos que vas a cubrir. Al cubrirlos entran a la matriz y el agente crea la prueba de cada uno{materialidadAprobada ? '' : ' cuando se apruebe la materialidad'}.</span>
          <span className="flex-1" />
          <Button size="sm" loading={cubriendo} disabled={sel.size === 0} onClick={() => cubrir([...sel])}>Cubrir seleccionados{sel.size ? ` (${sel.size})` : ''}</Button>
        </div>
      )}

      {ciclos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-center">
          <p className="font-medium text-gray-900">Todavía no hay riesgos propuestos ni en la matriz.</p>
          <p className="mt-1 text-sm text-gray-500">{corridaBalance ? 'Pulsa "Proponer riesgos" o agrega uno en un ciclo.' : 'Sube y revisa el balance: de ahí salen los riesgos con evidencia.'}</p>
        </div>
      )}

      {ciclos.map((c) => (
        <Ciclo key={c.area} auditoriaId={auditoriaId} c={c} sel={sel} onToggle={toggle} onCubrir={cubrir} onOmitir={omitir} ocupado={cubriendo} decidir={decidir} />
      ))}

      {otros.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerOtros((v) => !v)} aria-expanded={verOtros} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
            <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verOtros && 'rotate-90')} />
            Ciclos sin riesgos · {otros.length}
          </button>
          {verOtros && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {otros.map((o) => <AgregarRiesgo key={o.area} auditoriaId={auditoriaId} area={o.area} nombre={o.nombre} prefijo={o.prefijo} catalogo={[]} compacto />)}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-gray-200 pt-3">
        <button type="button" onClick={() => setVerContenido((v) => !v)} aria-expanded={verContenido} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
          <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verContenido && 'rotate-90')} />
          Ver la matriz de riesgos completa
        </button>
        {verContenido && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}

function Ciclo({ auditoriaId, c, sel, onToggle, onCubrir, onOmitir, ocupado, decidir }: {
  auditoriaId: string; c: RiesgosCiclo; sel: Set<string>; onToggle: (id: string) => void
  onCubrir: (ids: string[]) => void; onOmitir: (ids: string[]) => void; ocupado: boolean; decidir: ReturnType<typeof useDecidir>
}) {
  const [abierto, setAbierto] = useState(true)
  const [detalle, setDetalle] = useState<string | null>(null)
  const ids = c.propuestas.map((p) => p.id)
  const marcados = ids.filter((id) => sel.has(id))
  const todos = ids.length > 0 && marcados.length === ids.length
  const detallePropuesta = detalle ? c.propuestas.find((p) => p.id === detalle) : null

  return (
    <section className="rounded-2xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="inline-flex items-center gap-1.5">
          <ChevronDown size={15} className={cn('text-gray-400 transition-transform motion-reduce:transition-none', !abierto && '-rotate-90')} />
          <span className="font-mono text-[11px] text-gray-400">{c.prefijo}</span>
          <span className="text-[15px] font-semibold text-gray-900">{c.nombre}</span>
        </button>
        {c.riesgoMaximo && <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', NIVEL_CLS[c.riesgoMaximo])}>{c.riesgoMaximo}</span>}
        <span className="text-[12px] text-gray-500">
          {c.propuestas.length > 0 && <span className="text-indigo-700">{c.propuestas.length} por decidir</span>}
          {c.propuestas.length > 0 && c.matriz.length > 0 && ' · '}
          {c.matriz.length > 0 && <span>{c.matriz.length} en la matriz</span>}
          {c.senalesBalance > 0 && <span> · {c.senalesBalance} señal{c.senalesBalance === 1 ? '' : 'es'} del balance</span>}
        </span>
        <span className="flex-1" />
        {ids.length > 0 && (
          <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600">
            <input type="checkbox" checked={todos} onChange={() => ids.forEach((id) => { if (todos ? sel.has(id) : !sel.has(id)) onToggle(id) })} className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600" />
            todos
          </label>
        )}
      </header>

      {abierto && (
        <div className="space-y-1 border-t border-gray-100 px-4 py-3">
          {detallePropuesta ? (
            <div className="space-y-2">
              <button type="button" onClick={() => setDetalle(null)} className="text-[13px] text-gray-500 hover:text-gray-900">← Volver al ciclo</button>
              <DecisionCard propuesta={detallePropuesta} decidiendo={decidir.isPending} onDecidir={(decision, extra) => decidir.mutate({ id: detallePropuesta.id, decision, ...extra }, { onSuccess: () => setDetalle(null) })} />
            </div>
          ) : (
            <>
              {c.propuestas.map((p) => <FilaPropuesta key={p.id} p={p} marcado={sel.has(p.id)} onToggle={() => onToggle(p.id)} onVer={() => setDetalle(p.id)} />)}
              {c.matriz.map((m) => <FilaMatriz key={m.id} auditoriaId={auditoriaId} m={m} />)}
              {c.omitidas.length > 0 && (
                <p className="px-1 pt-1 text-[11px] text-gray-400">
                  {c.omitidas.length} no tomado{c.omitidas.length === 1 ? '' : 's'}: {c.omitidas.map((o) => (
                    <button key={o.id} type="button" onClick={() => decidir.mutate({ id: o.id, decision: 'retomar' })} className="mr-2 underline-offset-2 hover:underline">{o.codigo ?? o.titulo.slice(0, 30)} · retomar</button>
                  ))}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {marcados.length > 0 && <Button size="sm" loading={ocupado} onClick={() => onCubrir(marcados)}>Cubrir {marcados.length} de {c.nombre.toLowerCase()}</Button>}
                {ids.length > marcados.length && marcados.length > 0 && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => onOmitir(ids.filter((id) => !sel.has(id)))}>No tomar los otros {ids.length - marcados.length}</Button>}
                {ids.length > 0 && marcados.length === 0 && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => onOmitir(ids)}>No tomar ninguno</Button>}
                <span className="flex-1" />
                <AgregarRiesgo auditoriaId={auditoriaId} area={c.area} nombre={c.nombre} prefijo={c.prefijo} catalogo={c.catalogo} />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function FilaPropuesta({ p, marcado, onToggle, onVer }: { p: PropuestaAgente; marcado: boolean; onToggle: () => void; onVer: () => void }) {
  const r = p.contenido.riesgo!
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors', marcado ? 'bg-indigo-50' : 'hover:bg-gray-50')}>
      <input type="checkbox" checked={marcado} onChange={onToggle} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-gray-400">{p.codigo}</span>
          <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', NIVEL_CLS[r.riesgoCombinado])}>{r.riesgoCombinado}</span>
          <span className="text-[11px] text-gray-400">{FUENTE_TXT[r.fuente.tipo]}{r.fuente.codigos.length ? ` · ${r.fuente.codigos.join(', ')}` : ''}</span>
          {p.certeza && <span className="text-[11px] text-gray-400">· {p.certeza === 'verificado' ? 'verificado' : 'requiere evidencia'}</span>}
        </span>
        <span className="block text-[13.5px] text-gray-900">{p.titulo.replace(/^Riesgo en [^:]+:\s*/, '')}</span>
        {p.contenido.descripcion && <span className="mt-0.5 line-clamp-2 block text-[12px] text-gray-500">{p.contenido.descripcion}</span>}
      </span>
      <button type="button" onClick={(e) => { e.preventDefault(); onVer() }} className="shrink-0 text-[12px] text-indigo-600 hover:underline">ver</button>
    </label>
  )
}

function FilaMatriz({ auditoriaId, m }: { auditoriaId: string; m: RiesgosCiclo['matriz'][number] }) {
  const crear = useCrearPruebaRiesgo(auditoriaId)
  const responder = useResponderRiesgo(auditoriaId)
  const [respondiendo, setRespondiendo] = useState(false)
  const [texto, setTexto] = useState(m.respuestaPlaneada ?? '')
  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2">
      <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider', NIVEL_CLS[m.riesgoCombinado])}>{m.riesgoCombinado}</span>
          <span className="text-[11px] text-gray-400">en la matriz · {ORIGEN_TXT[m.origen]}</span>
        </div>
        <p className="text-[13.5px] text-gray-800">{m.descripcion}</p>
        {m.papeles.length > 0 ? (
          <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
            {m.papeles.map((p) => <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700"><FileText size={10} /> {p.indice} · {p.titulo}</span>)}
          </p>
        ) : respondiendo ? (
          <div className="mt-1 space-y-1.5">
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Cómo se cubre este riesgo sin una prueba específica (p. ej. revisión analítica, cubierto por la prueba de otro ciclo)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900" />
            <div className="flex gap-2">
              <Button size="sm" loading={responder.isPending} disabled={!texto.trim()} onClick={() => responder.mutate({ riesgoId: m.id, respuestaPlaneada: texto.trim() }, { onSuccess: () => setRespondiendo(false) })}>Guardar respuesta</Button>
              <Button size="sm" variant="ghost" onClick={() => setRespondiendo(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-amber-700">Sin prueba</span>
            <Button size="sm" variant="secondary" loading={crear.isPending} onClick={() => crear.mutate(m.id)}>Crear prueba</Button>
            <button type="button" onClick={() => setRespondiendo(true)} className="text-gray-500 hover:underline">Responder sin prueba</button>
            {m.respuestaPlaneada && <span className="text-gray-400">· {m.respuestaPlaneada.slice(0, 80)}{m.respuestaPlaneada.length > 80 ? '…' : ''}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function AgregarRiesgo({ auditoriaId, area, nombre, prefijo, catalogo, compacto }: {
  auditoriaId: string; area: string; nombre: string; prefijo: string
  catalogo: RiesgosCiclo['catalogo']; compacto?: boolean
}) {
  const agregar = useAgregarRiesgo(auditoriaId)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [nivel, setNivel] = useState<'alto' | 'medio' | 'bajo'>('medio')
  const guardar = (descripcion: string, inherente: 'alto' | 'medio' | 'bajo', respuesta?: string) =>
    agregar.mutate({ area, descripcion, riesgoInherente: inherente, riesgoControl: 'medio', respuestaPlaneada: respuesta }, { onSuccess: () => { setAbierto(false); setTexto('') } })

  if (!abierto) {
    return compacto ? (
      <button type="button" onClick={() => setAbierto(true)} className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-left text-[13px] text-gray-600 hover:border-gray-400 hover:bg-gray-50">
        <span className="font-mono text-[11px] text-gray-400">{prefijo}</span>{nombre}<Plus size={13} className="ml-auto text-gray-400" />
      </button>
    ) : (
      <button type="button" onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-900"><Plus size={13} /> Agregar riesgo</button>
    )
  }
  return (
    <div className={cn('space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3', compacto ? '' : 'w-full')}>
      <p className="text-[12px] font-medium text-gray-700">Agregar riesgo en {nombre.toLowerCase()}</p>
      {catalogo.length > 0 && (
        <div className="space-y-1">
          {catalogo.map((c, i) => (
            <button key={i} type="button" disabled={agregar.isPending} onClick={() => guardar(c.descripcion, c.riesgoInherente, c.respuestaPlaneada)} className="flex w-full items-start gap-2 rounded-lg bg-white px-2 py-1.5 text-left text-[12.5px] text-gray-700 hover:bg-indigo-50">
              <span className={cn('mt-0.5 rounded px-1 font-mono text-[10px] font-semibold uppercase', NIVEL_CLS[c.riesgoInherente])}>{c.riesgoInherente}</span>
              <span>{c.descripcion} <span className="text-gray-400">· del sector</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O escribe uno propio" className="min-w-[200px] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-[13px] text-gray-900" />
        <select value={nivel} onChange={(e) => setNivel(e.target.value as typeof nivel)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-[13px] text-gray-900">
          <option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option>
        </select>
        <Button size="sm" loading={agregar.isPending} disabled={texto.trim().length < 3} onClick={() => guardar(texto.trim(), nivel)}>Agregar</Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
