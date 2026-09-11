import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { CERTEZA_LABEL, TIPO_PROPUESTA_LABEL, type PropuestaAgente, type DecisionPropuesta } from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { confirmar } from '../../store/confirm.store'

const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CO')}`

const TIPO_COLOR: Record<PropuestaAgente['tipo'], string> = {
  hallazgo: 'text-red-700', materialidad: 'text-indigo-700', juicio: 'text-indigo-700', documento: 'text-amber-700', ambiguedad: 'text-red-700',
}
const SEV: Record<string, string> = { alta: 'bg-red-50 text-red-700', media: 'bg-amber-50 text-amber-700', baja: 'bg-gray-100 text-gray-600' }
const CERT: Record<string, string> = { verificado: 'bg-emerald-50 text-emerald-700', requiere_evidencia: 'bg-amber-50 text-amber-700', no_verificable: 'bg-gray-100 text-gray-500 border border-gray-200' }

type Props = {
  propuesta: PropuestaAgente
  posicion?: { actual: number; total: number }
  onDecidir: (decision: DecisionPropuesta, extra?: { motivo?: string; ajustes?: { titulo?: string; descripcion?: string; severidad?: 'alta' | 'media' | 'baja' } }) => void
  decidiendo?: boolean
  soloLectura?: boolean
}

export function DecisionCard({ propuesta: p, posicion, onDecidir, decidiendo, soloLectura }: Props) {
  const [ajustando, setAjustando] = useState(false)
  const [titulo, setTitulo] = useState(p.titulo)
  const [descripcion, setDescripcion] = useState(p.contenido.descripcion ?? '')
  const [severidad, setSeveridad] = useState<'alta' | 'media' | 'baja' | ''>(p.severidad ?? '')
  const [bitacoraAbierta, setBitacoraAbierta] = useState(false)

  const accionPrincipal =
    p.tipo === 'materialidad' ? `Confirmar ${p.monto != null ? money(p.monto) : 'materialidad'}`
      : p.tipo === 'documento' ? 'Marcar como recibido'
        : p.tipo === 'ambiguedad' || p.tipo === 'juicio' ? (p.contenido.opciones?.[0]?.label ?? 'Confirmar')
          : 'Aprobar hallazgo'

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
          {p.severidad && <span className={cn('font-mono text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', SEV[p.severidad])}>Riesgo {p.severidad}</span>}
          {p.certeza && <span className={cn('font-mono text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded', CERT[p.certeza])}>{CERTEZA_LABEL[p.certeza]}</span>}
          {p.monto != null && p.tipo === 'hallazgo' && (
            <span className={cn('font-mono tabular-nums font-semibold text-sm', p.monto < 0 ? 'text-red-700' : 'text-gray-900')}>{money(p.monto)}</span>
          )}
          {p.reglas.length > 0 && <span className="font-mono text-[11px] text-gray-400">{p.reglas.join(' · ')}</span>}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 text-sm text-gray-600">
        {ajustando ? (
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

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          {ajustando ? (
            <>
              <Button size="sm" loading={decidiendo} onClick={() => onDecidir('ajustar', { ajustes: { titulo, descripcion, severidad: severidad || undefined } })}>Guardar y aprobar</Button>
              <Button size="sm" variant="secondary" onClick={() => setAjustando(false)}>Cancelar</Button>
            </>
          ) : (
            <>
              <Button size="sm" loading={decidiendo} onClick={() => onDecidir('aprobar')}>{accionPrincipal}</Button>
              {p.contenido.opciones && p.contenido.opciones.length > 1 && (
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
