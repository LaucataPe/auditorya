import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  CERTEZA_LABEL, TIPO_PROPUESTA_LABEL, nivelCombinado, CALIFICACION_COSO_LABEL, RESPUESTA_COSO_LABEL,
  type PropuestaAgente, type DecisionPropuesta, type NivelRiesgo, type CalificacionCoso,
} from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { confirmar } from '../../store/confirm.store'
import { useAreas } from '../../hooks/useAreas'
import { MaterialidadForm } from '../auditoria/MaterialidadTab'
import type { AjustesDecision } from '../../hooks/useAgente'

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CO')}`

const TIPO_COLOR: Record<PropuestaAgente['tipo'], string> = {
  hallazgo: 'text-red-700', materialidad: 'text-indigo-700', juicio: 'text-indigo-700', documento: 'text-amber-700', ambiguedad: 'text-red-700', riesgo: 'text-orange-700',
}
const NIVEL_LABEL: Record<NivelRiesgo, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }
const CALIF_CLS: Record<CalificacionCoso, string> = {
  efectivo: 'border-emerald-500 bg-emerald-50 text-emerald-800', con_deficiencias: 'border-amber-400 bg-amber-50 text-amber-800', deficiente: 'border-red-400 bg-red-50 text-red-800',
}
const RESP_CLS: Record<string, string> = { si: 'text-emerald-700', parcial: 'text-amber-700', no: 'text-red-700', no_aplica: 'text-gray-500', no_se: 'text-indigo-700' }
const SEV: Record<string, string> = { alta: 'bg-red-50 text-red-700', media: 'bg-amber-50 text-amber-700', baja: 'bg-gray-100 text-gray-600' }
const CERT: Record<string, string> = { verificado: 'bg-emerald-50 text-emerald-700', requiere_evidencia: 'bg-amber-50 text-amber-700', no_verificable: 'bg-gray-100 text-gray-500 border border-gray-200' }

type Props = {
  propuesta: PropuestaAgente
  posicion?: { actual: number; total: number }
  onDecidir: (decision: DecisionPropuesta, extra?: { motivo?: string; ajustes?: AjustesDecision }) => void
  decidiendo?: boolean
  soloLectura?: boolean
}

export function DecisionCard({ propuesta: p, posicion, onDecidir, decidiendo, soloLectura }: Props) {
  const [ajustando, setAjustando] = useState(false)
  const [titulo, setTitulo] = useState(p.titulo)
  const [descripcion, setDescripcion] = useState(p.contenido.descripcion ?? '')
  const [severidad, setSeveridad] = useState<'alta' | 'media' | 'baja' | ''>(p.severidad ?? '')
  const [bitacoraAbierta, setBitacoraAbierta] = useState(false)
  const riesgo = p.tipo === 'riesgo' ? p.contenido.riesgo ?? null : null
  const coso = p.tipo === 'juicio' && p.contenido.destino === 'coso' ? p.contenido.coso ?? null : null
  const [calif, setCalif] = useState<CalificacionCoso>(coso?.calificacion ?? 'con_deficiencias')
  const [observaciones, setObservaciones] = useState(coso?.observaciones ?? '')
  const [verRespuestas, setVerRespuestas] = useState(false)
  const [area, setArea] = useState(riesgo?.area ?? '')
  const [inherente, setInherente] = useState<NivelRiesgo>(riesgo?.riesgoInherente ?? 'medio')
  const [control, setControl] = useState<NivelRiesgo>(riesgo?.riesgoControl ?? 'medio')
  const [respuesta, setRespuesta] = useState(riesgo?.respuestaPlaneada ?? '')
  const { areas } = useAreas()

  const accionPrincipal =
    coso ? `Confirmar: ${CALIFICACION_COSO_LABEL[coso.calificacion].toLowerCase()}`
      : p.tipo === 'materialidad' ? `Confirmar ${p.monto != null ? money(p.monto) : 'materialidad'}`
      : p.tipo === 'documento' ? 'Pedir al cliente'
        : p.tipo === 'ambiguedad' || p.tipo === 'juicio' ? (p.contenido.opciones?.[0]?.label ?? 'Confirmar')
          : p.tipo === 'riesgo' ? 'Aprobar riesgo'
            : 'Aprobar hallazgo'

  const ajustes = (): AjustesDecision => ({
    titulo, descripcion, severidad: severidad || undefined,
    ...(riesgo ? { riesgo: { area, riesgoInherente: inherente, riesgoControl: control, respuestaPlaneada: respuesta } } : {}),
    ...(coso ? { coso: { calificacion: calif, observaciones } } : {}),
  })

  async function descartar() {
    const ok = await confirmar({
      titulo: 'Descartar esta propuesta',
      descripcion: 'No se borra: queda en el papel de trabajo como descartada, con tu nombre y la hora. Puedes indicar el motivo.',
      confirmar: 'Descartar',
      variante: 'danger',
    })
    if (ok) onDecidir('descartar', { motivo: 'Descartada por el auditor' })
  }

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-card overflow-hidden" data-propuesta={p.id}>
      <div className="px-5 pt-4 space-y-1.5">
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider', TIPO_COLOR[p.tipo])}>
          <i className="h-1.5 w-1.5 rounded-full bg-current" />
          {TIPO_PROPUESTA_LABEL[p.tipo]}
          {p.codigo && <span className="font-mono normal-case tracking-normal text-gray-400 ml-1">{p.codigo}</span>}
        </span>
        <h3 className="text-[17px] font-semibold leading-snug text-gray-900 text-balance">{p.titulo}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {p.severidad && <span className={cn('font-mono text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', SEV[p.severidad])}>{riesgo ? `Combinado ${NIVEL_LABEL[riesgo.riesgoCombinado]}` : `Riesgo ${p.severidad}`}</span>}
          {p.certeza && <span className={cn('font-mono text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', CERT[p.certeza])}>{CERTEZA_LABEL[p.certeza]}</span>}
          {p.monto != null && (p.tipo === 'hallazgo' || p.tipo === 'riesgo') && (
            <span className={cn('font-mono tabular-nums font-semibold text-sm', p.monto < 0 ? 'text-red-700' : 'text-gray-900')}>{money(p.monto)}</span>
          )}
          {p.reglas.length > 0 && <span className="font-mono text-[11px] text-gray-400">{p.reglas.join(' · ')}</span>}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 text-sm text-gray-600">
        {ajustando && p.tipo === 'materialidad' ? (
          <MaterialidadForm
            auditoriaId={p.auditoriaId}
            valoresIniciales={p.contenido.materialidad ? {
              baseCalculo: p.contenido.materialidad.baseCalculo, montoBase: p.contenido.materialidad.montoBase,
              porcentaje: p.contenido.materialidad.porcentaje, porcentajeDesempeno: p.contenido.materialidad.porcentajeDesempeno,
              justificacion: p.contenido.materialidad.justificacion,
            } : null}
            guardando={decidiendo}
            botonLabel="Guardar y confirmar"
            onGuardar={(v) => onDecidir('ajustar', { ajustes: { materialidad: { baseCalculo: v.baseCalculo, montoBase: v.montoBase, porcentaje: v.porcentaje, porcentajeDesempeno: v.porcentajeDesempeno, justificacion: v.justificacion || undefined } } })}
            acciones={<Button size="sm" variant="secondary" onClick={() => setAjustando(false)}>Cancelar</Button>}
          />
        ) : ajustando && coso ? (
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-gray-700">Calificación</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {(['efectivo', 'con_deficiencias', 'deficiente'] as CalificacionCoso[]).map((c) => (
                  <button key={c} type="button" onClick={() => setCalif(c)} className={cn('rounded-lg border-2 px-3 py-1.5 text-sm font-medium', calif === c ? CALIF_CLS[c] : 'border-gray-200 text-gray-600 hover:border-gray-400')}>{CALIFICACION_COSO_LABEL[c]}</button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Observaciones del componente</span>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
            </label>
          </div>
        ) : ajustando ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Título</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Descripción</span>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
            </label>
            {p.tipo === 'hallazgo' && (
              <label className="block">
                <span className="text-xs font-medium text-gray-700">Riesgo</span>
                <select value={severidad} onChange={(e) => setSeveridad(e.target.value as typeof severidad)} className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
                  <option value="alta">Alto</option><option value="media">Medio</option><option value="baja">Bajo</option>
                </select>
              </label>
            )}
            {riesgo && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Área</span>
                    <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
                      {areas.map((a) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Riesgo inherente</span>
                    <select value={inherente} onChange={(e) => setInherente(e.target.value as NivelRiesgo)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
                      <option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-700">Riesgo de control</span>
                    <select value={control} onChange={(e) => setControl(e.target.value as NivelRiesgo)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
                      <option value="alto">Alto</option><option value="medio">Medio</option><option value="bajo">Bajo</option>
                    </select>
                  </label>
                </div>
                <p className="text-xs text-gray-500">Riesgo combinado: <span className="font-medium text-gray-800">{NIVEL_LABEL[nivelCombinado(inherente, control)]}</span></p>
                <label className="block">
                  <span className="text-xs font-medium text-gray-700">Respuesta planeada</span>
                  <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
                </label>
              </>
            )}
          </div>
        ) : (
          <>
            {p.contenido.descripcion && <p>{p.contenido.descripcion}</p>}
            {p.datos.length > 0 && (
              <dl className="grid gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                {p.datos.map((d) => (
                  <div key={d.etiqueta} className="bg-white px-3 py-2">
                    <dt className="text-[10px] uppercase tracking-wider text-gray-400">{d.etiqueta}</dt>
                    <dd className="font-mono tabular-nums text-[13px] font-medium text-gray-900">{d.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
            {coso && (
              <div className="space-y-2">
                {coso.deficiencias.length > 0 && (
                  <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[13px] text-amber-900">
                    {coso.deficiencias.map((d) => <li key={d.pregunta}><span className="font-mono text-[11px] text-amber-700 mr-1">{d.pregunta}</span>{d.texto}</li>)}
                  </ul>
                )}
                {coso.senales.length > 0 && (
                  <ul className="space-y-1 text-[13px] text-gray-700">
                    {coso.senales.map((s, i) => <li key={i} className="flex gap-2"><span className="text-indigo-500">•</span><span>{s}</span></li>)}
                  </ul>
                )}
                {coso.respuestas.length > 0 && (
                  <div>
                    <button type="button" onClick={() => setVerRespuestas((v) => !v)} aria-expanded={verRespuestas} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
                      <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verRespuestas && 'rotate-90')} />
                      Tus respuestas · {coso.respuestas.length} de {coso.total}
                    </button>
                    {verRespuestas && (
                      <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 text-[12.5px]">
                        {coso.respuestas.map((r) => (
                          <li key={r.pregunta} className="grid grid-cols-[52px_1fr_auto] gap-2 px-3 py-1.5">
                            <span className="font-mono text-[11px] text-gray-400">{r.pregunta}</span>
                            <span className="text-gray-700">{r.texto}{r.nota && <span className="block text-gray-400">“{r.nota}”</span>}</span>
                            <span className={cn('font-medium', RESP_CLS[r.respuesta])}>{RESPUESTA_COSO_LABEL[r.respuesta]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            {riesgo && p.contenido.recomendacion && (
              <p className="text-[13px]"><span className="font-medium text-gray-700">Respuesta planeada:</span> {p.contenido.recomendacion}</p>
            )}
            {p.contenido.norma && (
              <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Norma:</span> {p.contenido.norma}</p>
            )}
            {(p.contenido.para || p.desbloqueaCodigo) && (
              <div className="rounded-lg bg-indigo-50 px-3 py-2 text-[13px] text-indigo-800">
                {p.desbloqueaCodigo ? `Desbloquea ${p.desbloqueaCodigo} · ${p.desbloqueaTitulo}` : p.contenido.para}
              </div>
            )}
          </>
        )}

        <div className="border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => setBitacoraAbierta((v) => !v)}
            aria-expanded={bitacoraAbierta}
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900"
          >
            <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', bitacoraAbierta && 'rotate-90')} />
            Cómo llegué aquí · {p.bitacora.length} pasos
          </button>
          {bitacoraAbierta && (
            <ol className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50">
              {p.bitacora.map((l) => (
                <li key={l.numero} className="grid grid-cols-[28px_1fr] gap-2 px-3 py-2 text-[12.5px] text-gray-600">
                  <span className="font-mono text-[11px] text-gray-400 pt-0.5">{String(l.numero).padStart(2, '0')}</span>
                  <span>
                    {l.actor === 'usuario' && <span className="font-medium text-gray-900">{l.usuarioNombre ? '' : ''}</span>}
                    {l.texto}
                    {l.referencia && (l.referencia as { regla?: string; norma?: string }).regla && (
                      <span className="ml-1 font-mono text-[11px] text-indigo-600">{String((l.referencia as { regla?: string }).regla)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {!soloLectura && !(ajustando && p.tipo === 'materialidad') && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          {ajustando ? (
            <>
              <Button size="sm" loading={decidiendo} onClick={() => onDecidir('ajustar', { ajustes: ajustes() })}>Guardar y aprobar</Button>
              <Button size="sm" variant="secondary" onClick={() => setAjustando(false)}>Cancelar</Button>
            </>
          ) : (
            <>
              <Button size="sm" loading={decidiendo} onClick={() => onDecidir('aprobar')}>{accionPrincipal}</Button>
              {coso && (['efectivo', 'con_deficiencias', 'deficiente'] as CalificacionCoso[]).filter((c) => c !== coso.calificacion).map((c) => (
                <Button key={c} size="sm" variant="secondary" loading={decidiendo} onClick={() => onDecidir('ajustar', { motivo: `Calificación cambiada a ${CALIFICACION_COSO_LABEL[c].toLowerCase()}`, ajustes: { coso: { calificacion: c, observaciones: coso.observaciones } } })}>{CALIFICACION_COSO_LABEL[c]}</Button>
              ))}
              {!coso && p.contenido.opciones && p.contenido.opciones.length > 1 && (
                <Button size="sm" variant="secondary" loading={decidiendo} onClick={() => onDecidir('ajustar', { motivo: p.contenido.opciones![1].label })}>{p.contenido.opciones[1].label}</Button>
              )}
              {p.tipo !== 'documento' && <Button size="sm" variant="secondary" onClick={() => setAjustando(true)}>Ajustar</Button>}
              <Button size="sm" variant="ghost" onClick={() => onDecidir('omitir')}>Omitir por ahora</Button>
              <Button size="sm" variant="ghost" className="text-gray-400" onClick={descartar}>Descartar</Button>
            </>
          )}
          <span className="flex-1" />
          {posicion && <span className="font-mono text-xs text-gray-400 tabular-nums">{posicion.actual} de {posicion.total}</span>}
        </div>
      )}
    </article>
  )
}
