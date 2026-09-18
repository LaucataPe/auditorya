import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronRight, Circle, FileText, Inbox, Sparkles } from 'lucide-react'
import { ESTADO_CICLO_LABEL, type AccionCiclo, type CicloAgente, type EstadoCiclo } from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { DecisionCard } from './DecisionCard'
import { useCiclo, useCiclos, useCrearPruebaRiesgo, useDecidir, useIniciarCiclo, useProponerConclusion, useResponderRiesgo } from '../../hooks/useAgente'

const ESTADO_CLS: Record<EstadoCiclo, string> = {
  listo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  decidir: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sin_iniciar: 'bg-gray-100 text-gray-600 border-gray-200',
  esperando: 'bg-amber-50 text-amber-700 border-amber-200',
  terminado: 'bg-emerald-600 text-white border-emerald-600',
}
const RIESGO_CLS: Record<string, string> = { alto: 'text-red-700', medio: 'text-amber-700', bajo: 'text-gray-500' }
const SEV_CLS: Record<string, string> = { alta: 'bg-red-50 text-red-700', media: 'bg-amber-50 text-amber-700', baja: 'bg-gray-100 text-gray-600' }
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })

/**
 * Ejecución por ciclo: lista de ciclos ordenada por lo que ya se puede hacer (el agente
 * sugiere el primero, el auditor entra al que quiera) y, dentro, las acciones del ciclo,
 * las propuestas pendientes como tarjetas y los papeles con su avance.
 */
export function CiclosAgente({ auditoriaId, empresaId, materialidadAprobada, children }: {
  auditoriaId: string
  empresaId: string
  materialidadAprobada: boolean
  children: ReactNode
}) {
  const [sp, setSp] = useSearchParams()
  const area = sp.get('ciclo')
  const [verContenido, setVerContenido] = useState(false)
  const irA = (a: string | null) => {
    const next = new URLSearchParams(sp)
    if (a) next.set('ciclo', a); else next.delete('ciclo')
    setSp(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      {area ? <DetalleCiclo auditoriaId={auditoriaId} empresaId={empresaId} area={area} materialidadAprobada={materialidadAprobada} onVolver={() => irA(null)} /> : <ListaCiclos auditoriaId={auditoriaId} onEntrar={irA} />}
      <div className="border-t border-gray-200 pt-3">
        <button type="button" onClick={() => setVerContenido((v) => !v)} aria-expanded={verContenido} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
          <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verContenido && 'rotate-90')} />
          Ver todos los papeles de trabajo
        </button>
        {verContenido && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}

function ListaCiclos({ auditoriaId, onEntrar }: { auditoriaId: string; onEntrar: (area: string) => void }) {
  const q = useCiclos(auditoriaId)
  const [verOtros, setVerOtros] = useState(false)
  if (q.isLoading || !q.data) return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
  const { ciclos, otros, sugerido } = q.data
  const sug = ciclos.find((c) => c.area === sugerido)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gray-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700"><Sparkles size={14} className="text-indigo-500" />Ejecución por ciclo</span>
        <span>{ciclos.length} ciclo{ciclos.length === 1 ? '' : 's'} con trabajo · ordenados por lo que ya se puede hacer</span>
      </div>

      {sug && (
        <button type="button" onClick={() => onEntrar(sug.area)} className="w-full rounded-2xl border border-indigo-200 bg-indigo-50/60 px-5 py-4 text-left transition-colors hover:bg-indigo-50">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Te sugiero empezar por</p>
          <p className="mt-1 text-[17px] font-semibold text-gray-900">{sug.nombre}</p>
          <p className="mt-0.5 text-sm text-gray-600">{sug.motivo}</p>
          {sug.siguiente && <p className="mt-1 text-sm font-medium text-indigo-700">{sug.siguiente} →</p>}
        </button>
      )}

      {ciclos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-center">
          <p className="font-medium text-gray-900">Todavía no hay ciclos con trabajo.</p>
          <p className="mt-1 text-sm text-gray-500">Aprueba hallazgos del balance o riesgos, o inicia un ciclo desde la lista de abajo.</p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {ciclos.filter((c) => c.area !== sugerido).map((c) => <TarjetaCiclo key={c.area} c={c} onClick={() => onEntrar(c.area)} />)}
      </div>

      {otros.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerOtros((v) => !v)} aria-expanded={verOtros} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
            <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verOtros && 'rotate-90')} />
            Otros ciclos sin trabajo todavía · {otros.length}
          </button>
          {verOtros && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {otros.map((o) => (
                <button key={o.area} type="button" onClick={() => onEntrar(o.area)} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-gray-400">
                  <span className="font-mono text-gray-400 mr-1">{o.prefijo}</span>{o.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TarjetaCiclo({ c, onClick }: { c: CicloAgente; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-gray-300 hover:bg-gray-50">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-gray-400">{c.prefijo}</span>
        <span className="flex-1 truncate text-[15px] font-semibold text-gray-900">{c.nombre}</span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', ESTADO_CLS[c.estado])}>{ESTADO_CICLO_LABEL[c.estado]}</span>
      </div>
      <p className="mt-1 text-[13px] text-gray-600">{c.motivo}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {c.riesgos > 0 && <span>{c.riesgos} riesgo{c.riesgos === 1 ? '' : 's'}{c.riesgoMaximo && <span className={cn('ml-1 font-medium', RIESGO_CLS[c.riesgoMaximo])}>{c.riesgoMaximo}</span>}</span>}
        {c.papeles.length > 0 && <span>{c.papeles.length} papel{c.papeles.length === 1 ? '' : 'es'}</span>}
        {c.pendientes > 0 && <span className="text-indigo-700">{c.pendientes} por decidir</span>}
        {c.pbcPendientes > 0 && <span className="text-amber-700">{c.pbcPendientes} doc. pendientes</span>}
        {c.hallazgosAbiertos > 0 && <span className="text-red-700">{c.hallazgosAbiertos} hallazgos abiertos</span>}
        {c.senalesBalance > 0 && c.papeles.length === 0 && <span>{c.senalesBalance} señales del balance</span>}
      </div>
    </button>
  )
}

function DetalleCiclo({ auditoriaId, empresaId, area, materialidadAprobada, onVolver }: {
  auditoriaId: string; empresaId: string; area: string; materialidadAprobada: boolean; onVolver: () => void
}) {
  const q = useCiclo(auditoriaId, area)
  const decidir = useDecidir(auditoriaId)
  const iniciar = useIniciarCiclo(auditoriaId)
  const concluir = useProponerConclusion(auditoriaId)
  const crearPrueba = useCrearPruebaRiesgo(auditoriaId)
  const responder = useResponderRiesgo(auditoriaId)
  const [decidiendo, setDecidiendo] = useState<string | null>(null)
  const [respondiendo, setRespondiendo] = useState<{ riesgoId: string; texto: string } | null>(null)
  if (q.isLoading || !q.data) return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
  const c = q.data
  const papelUrl = (id: string) => `/empresas/${empresaId}/encargos/${auditoriaId}/papeles/${id}`
  const propuestaActual = decidiendo ? c.propuestas.find((p) => p.id === decidiendo) : null

  const accion = (a: AccionCiclo, i: number) => {
    const boton = a.tipo === 'decidir' && a.propuestaId
      ? <Button size="sm" onClick={() => setDecidiendo(a.propuestaId!)}>Decidir</Button>
      : a.tipo === 'concluir' && a.papelId
        ? <Button size="sm" loading={concluir.isPending} onClick={() => concluir.mutate(a.papelId!)}>Proponer conclusión</Button>
        : a.tipo === 'iniciar'
          ? <Button size="sm" loading={iniciar.isPending} onClick={() => iniciar.mutate(area)}>Iniciar ciclo</Button>
          : a.tipo === 'prueba' && a.riesgoId
            ? <span className="flex shrink-0 flex-col items-end gap-1">
                <Button size="sm" loading={crearPrueba.isPending} onClick={() => crearPrueba.mutate(a.riesgoId!)}>Crear prueba</Button>
                <button type="button" className="text-[11px] text-gray-500 hover:underline" onClick={() => setRespondiendo({ riesgoId: a.riesgoId!, texto: '' })}>Responder sin prueba</button>
              </span>
          : a.papelId
            ? <Link to={papelUrl(a.papelId)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"><FileText size={13} /> Abrir {a.papelIndice}</Link>
            : null
    return (
      <li key={i} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', a.tipo === 'decidir' ? 'bg-indigo-500' : a.tipo === 'pedir' ? 'bg-amber-400' : a.tipo === 'hallazgo' ? 'bg-red-500' : 'bg-emerald-500')} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-gray-900">{a.texto}</p>
          {a.detalle && <p className="text-[12.5px] text-gray-500">{a.detalle}</p>}
          {a.tipo === 'prueba' && respondiendo && respondiendo.riesgoId === a.riesgoId && (
            <div className="mt-2 space-y-1.5">
              <textarea value={respondiendo.texto} onChange={(e) => setRespondiendo({ riesgoId: a.riesgoId!, texto: e.target.value })} rows={2} placeholder="Cómo se cubre este riesgo sin una prueba específica" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-900" />
              <div className="flex gap-2">
                <Button size="sm" loading={responder.isPending} disabled={!respondiendo.texto.trim()} onClick={() => responder.mutate({ riesgoId: a.riesgoId!, respuestaPlaneada: respondiendo.texto.trim() }, { onSuccess: () => setRespondiendo(null) })}>Guardar respuesta</Button>
                <Button size="sm" variant="ghost" onClick={() => setRespondiendo(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>
        {boton}
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-900"><ArrowLeft size={14} /> Ciclos</button>
        <span className="font-mono text-[11px] text-gray-400">{c.prefijo}</span>
        <h3 className="text-[17px] font-semibold text-gray-900">{c.nombre}</h3>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', ESTADO_CLS[c.estado])}>{ESTADO_CICLO_LABEL[c.estado]}</span>
        <span className="flex-1" />
        <span className="text-[13px] text-gray-500">{c.motivo}</span>
      </div>

      {!materialidadAprobada && c.estado === 'sin_iniciar' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Sin materialidad aprobada solo se crea el riesgo; la prueba queda para cuando el socio la apruebe.</p>
      )}

      {propuestaActual ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setDecidiendo(null)} className="text-[13px] text-gray-500 hover:text-gray-900">← Volver a las acciones del ciclo</button>
          <DecisionCard
            propuesta={propuestaActual}
            posicion={{ actual: c.propuestas.indexOf(propuestaActual) + 1, total: c.propuestas.length }}
            decidiendo={decidir.isPending}
            onDecidir={(decision, extra) => decidir.mutate({ id: propuestaActual.id, decision, ...extra }, { onSuccess: () => setDecidiendo(null) })}
          />
        </div>
      ) : (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Qué sigue en este ciclo</h4>
          {c.acciones.length === 0
            ? <p className="rounded-xl border border-dashed border-gray-300 px-4 py-4 text-[13px] text-gray-500">Nada pendiente aquí por ahora.</p>
            : <ul className="space-y-1.5">{c.acciones.map(accion)}</ul>}
        </div>
      )}

      {c.papelesDetalle.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Papeles del ciclo · {c.papelesDetalle.length}</h4>
          <div className="space-y-2">
            {c.papelesDetalle.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-gray-400">{p.indice}</span>
                  <Link to={papelUrl(p.id)} className="text-[14px] font-medium text-gray-900 hover:underline">{p.titulo}</Link>
                  <span className="text-[11px] text-gray-400">{p.estado === 'aprobado' ? 'Aprobado' : p.estado === 'en_revision' ? 'En revisión' : 'Borrador'}</span>
                  <span className="flex-1" />
                  {p.pasosTotal > 0 && <span className={cn('font-mono text-[11px]', p.pasosHechos === p.pasosTotal ? 'text-emerald-600' : 'text-gray-500')}>{p.pasosHechos}/{p.pasosTotal} pasos</span>}
                  <span className="text-[11px] text-gray-500">{p.evidencias} evid.</span>
                  {p.tieneConclusion ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600"><Check size={11} /> concluido</span> : <span className="text-[11px] text-gray-400">sin conclusión</span>}
                </div>
                {p.pasos.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {p.pasos.map((s) => (
                      <li key={s.indice} className="flex items-start gap-2 text-[12.5px]">
                        {s.hecho ? <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" /> : <Circle size={11} className="mt-1 shrink-0 text-gray-300" />}
                        <span className={s.hecho ? 'text-gray-500' : 'text-gray-700'}>{s.texto}{s.nota && <span className="text-gray-400"> · {s.nota}</span>}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(p.pbc.length > 0 || p.evidenciasLista.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.pbc.map((s) => (
                      <span key={s.id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', s.estado === 'recibido' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : s.estado === 'no_aplica' ? 'border-gray-200 text-gray-400' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                        <Inbox size={10} /> {s.descripcion}
                      </span>
                    ))}
                    {p.evidenciasLista.map((e) => (
                      <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600"><FileText size={10} /> {e.nombre} · {fecha(e.createdAt)}</span>
                    ))}
                  </div>
                )}
                {p.conclusion && <p className="mt-2 border-l-2 border-emerald-400 pl-3 text-[12.5px] text-gray-600">{p.conclusion}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(c.riesgosLista.length > 0 || c.hallazgosLista.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {c.riesgosLista.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Riesgos · {c.riesgosLista.length}</h4>
              <ul className="space-y-1">
                {c.riesgosLista.map((r) => (
                  <li key={r.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700">
                    <span className={cn('mr-1.5 font-mono text-[10px] font-semibold uppercase', RIESGO_CLS[r.riesgoCombinado])}>{r.riesgoCombinado}</span>{r.descripcion}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.hallazgosLista.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Hallazgos · {c.hallazgosLista.length}</h4>
              <ul className="space-y-1">
                {c.hallazgosLista.map((h) => (
                  <li key={h.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12.5px] text-gray-700">
                    <span className={cn('mr-1.5 rounded px-1 font-mono text-[10px] font-semibold uppercase', SEV_CLS[h.severidad])}>{h.severidad}</span>
                    {h.papelIndice && <span className="mr-1 font-mono text-[10px] text-gray-400">{h.papelIndice}</span>}
                    <span className="line-clamp-2">{h.descripcion}</span>
                    <span className="ml-1 text-[10px] text-gray-400">{h.estado}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
