import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import {
  CUESTIONARIO_COSO_PYME, COMPONENTES_COSO, COMPONENTE_COSO_LABEL, RESPUESTA_COSO_LABEL,
  type RespuestaCoso,
} from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { useControlInternoAgente, useCorrerControlInterno, useGuardarRespuestasCoso } from '../../hooks/useAgente'

const OPCIONES: { valor: RespuestaCoso; cls: string }[] = [
  { valor: 'si', cls: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { valor: 'parcial', cls: 'border-amber-400 bg-amber-50 text-amber-800' },
  { valor: 'no', cls: 'border-red-400 bg-red-50 text-red-800' },
  { valor: 'no_aplica', cls: 'border-gray-400 bg-gray-100 text-gray-700' },
  { valor: 'no_se', cls: 'border-indigo-300 bg-indigo-50 text-indigo-800' },
]

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short' })

/**
 * Cuestionario de control interno pyme: una pregunta a la vez, con la respuesta del
 * año anterior como punto de partida, guardado automático y, al final, la propuesta
 * de calificación del agente.
 */
export function CuestionarioCoso({ auditoriaId, onTerminado, onSalir }: {
  auditoriaId: string
  onTerminado: () => void
  onSalir?: () => void
}) {
  const estado = useControlInternoAgente(auditoriaId)
  const guardar = useGuardarRespuestasCoso(auditoriaId)
  const correr = useCorrerControlInterno(auditoriaId)
  const preguntas = CUESTIONARIO_COSO_PYME
  const respondidas = useMemo(() => new Map((estado.data?.respuestas ?? []).map((r) => [r.pregunta, r])), [estado.data])
  const memoria = useMemo(() => new Map((estado.data?.memoria?.respuestas ?? []).map((r) => [r.pregunta, r])), [estado.data])
  const [idx, setIdx] = useState<number | null>(null)
  const [nota, setNota] = useState('')
  const [verNota, setVerNota] = useState(false)

  if (estado.isLoading || !estado.data) return <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />

  // Arranca en la primera pregunta sin responder (o en la última si ya están todas).
  const primeraSin = preguntas.findIndex((p) => !respondidas.has(p.id))
  const actual = idx ?? (primeraSin === -1 ? preguntas.length : primeraSin)
  const total = preguntas.length
  const contestadas = preguntas.filter((p) => respondidas.has(p.id)).length

  const ir = (i: number) => {
    setIdx(Math.max(0, Math.min(total, i)))
    const p = preguntas[Math.max(0, Math.min(total - 1, i))]
    setNota(respondidas.get(p?.id ?? '')?.nota ?? '')
    setVerNota(false)
  }

  const responder = (p: (typeof preguntas)[number], respuesta: RespuestaCoso) => {
    guardar.mutate([{ pregunta: p.id, respuesta, nota: nota.trim() || undefined }], { onSuccess: () => ir(actual + 1) })
  }

  // Pantalla final: resumen y botón para que el agente califique.
  if (actual >= total) {
    const porComp = COMPONENTES_COSO.map((c) => {
      const ps = preguntas.filter((p) => p.componente === c)
      return { c, r: ps.filter((p) => respondidas.has(p.id)).length, n: ps.length, no: ps.filter((p) => ['no', 'parcial'].includes(respondidas.get(p.id)?.respuesta ?? '')).length }
    })
    return (
      <div className="rounded-2xl border border-gray-200 bg-white shadow-card px-6 py-6 space-y-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-700"><Sparkles size={13} /> Cuestionario de control interno</div>
        <h3 className="text-[17px] font-semibold text-gray-900">{contestadas === total ? 'Listo, respondiste las 15 preguntas.' : `Respondiste ${contestadas} de ${total} preguntas.`}</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {porComp.map(({ c, r, n, no }) => (
            <li key={c} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-[13px]">
              <span className="text-gray-800">{COMPONENTE_COSO_LABEL[c]}</span>
              <span className="font-mono text-xs text-gray-500">{r}/{n}{no > 0 && <span className="ml-2 text-amber-700">{no} con deficiencia</span>}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-600">Con esto califico cada componente, cruzo lo que vi en el balance y en el entendimiento, y te dejo las cinco calificaciones para que las confirmes o las cambies.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button loading={correr.isPending} onClick={() => correr.mutate(undefined, { onSuccess: onTerminado })}>Proponer la calificación</Button>
          <Button variant="secondary" onClick={() => ir(0)}>Revisar respuestas</Button>
          {contestadas < total && <button type="button" className="text-sm text-indigo-600 hover:underline" onClick={() => ir(primeraSin)}>Seguir con las que faltan</button>}
        </div>
      </div>
    )
  }

  const p = preguntas[actual]
  const previa = respondidas.get(p.id)
  const deAntes = memoria.get(p.id)
  const compIdx = COMPONENTES_COSO.indexOf(p.componente)
  const enComp = preguntas.filter((q) => q.componente === p.componente)
  const posEnComp = enComp.findIndex((q) => q.id === p.id) + 1

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-card overflow-hidden">
      {/* Progreso por componente */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-3">
        <div className="flex items-center gap-1.5" aria-label={`Pregunta ${actual + 1} de ${total}`}>
          {COMPONENTES_COSO.map((c, k) => {
            const ps = preguntas.filter((q) => q.componente === c)
            const hechas = ps.filter((q) => respondidas.has(q.id)).length
            return <i key={c} title={`${COMPONENTE_COSO_LABEL[c]} · ${hechas}/${ps.length}`} className={cn('h-1.5 w-8 rounded-full', hechas === ps.length ? 'bg-emerald-500' : k === compIdx ? 'bg-indigo-600' : 'bg-gray-200')} />
          })}
        </div>
        <span className="font-mono text-xs text-gray-400 tabular-nums">{actual + 1}/{total}</span>
        <span className="flex-1" />
        {onSalir && <button type="button" onClick={onSalir} className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600">Responder después</button>}
      </div>

      <div className="px-6 py-5 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">{COMPONENTE_COSO_LABEL[p.componente]} · {posEnComp} de {enComp.length}</p>
        <h3 className="text-[19px] font-semibold leading-snug text-gray-900 text-balance">{p.texto}</h3>
        <p className="text-sm text-gray-500">{p.ayuda}</p>

        {deAntes && !previa && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900">
            <span>El año pasado respondiste <strong>{RESPUESTA_COSO_LABEL[deAntes.respuesta]}</strong>{estado.data.memoria?.fecha ? ` (${fecha(estado.data.memoria.fecha)})` : ''}{deAntes.nota ? ` · "${deAntes.nota}"` : ''}.</span>
            <button type="button" className="ml-auto inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline" onClick={() => responder(p, deAntes.respuesta)} disabled={guardar.isPending}><Check size={13} /> Sigue igual</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              disabled={guardar.isPending}
              onClick={() => responder(p, o.valor)}
              className={cn('rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60', previa?.respuesta === o.valor ? o.cls : 'border-gray-200 text-gray-700 hover:border-gray-400')}
            >
              {RESPUESTA_COSO_LABEL[o.valor]}
            </button>
          ))}
        </div>

        {verNota || nota ? (
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Nota para el papel de trabajo (quién lo hace, con qué frecuencia, qué viste)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
        ) : (
          <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setVerNota(true)}>Agregar una nota</button>
        )}
        {p.areas.length > 0 && <p className="text-xs text-gray-400">Si respondes "no", sube el riesgo de control en: {p.areas.map((a) => a.replace(/_/g, ' ')).join(', ')}.</p>}
      </div>

      <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-3">
        <Button size="sm" variant="ghost" disabled={actual === 0} onClick={() => ir(actual - 1)}><ArrowLeft size={14} /> Anterior</Button>
        <span className="flex-1" />
        {previa && <span className="text-xs text-gray-400">Guardado</span>}
        <Button size="sm" variant="secondary" onClick={() => ir(actual + 1)}>{previa ? 'Siguiente' : 'Saltar'} <ArrowRight size={14} /></Button>
      </div>
    </div>
  )
}
