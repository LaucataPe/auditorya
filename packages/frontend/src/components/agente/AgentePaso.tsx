import { useState, type ReactNode } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { TIPO_PROPUESTA_LABEL, type PropuestaAgente } from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { DecisionCard } from './DecisionCard'
import { useCorrerBalance, useDecidir, usePropuestas, useResumenAgente } from '../../hooks/useAgente'

const PASO_TEXTO: Record<string, { titulo: string; sinPendientes: string }> = {
  balance: { titulo: 'Revisión del balance', sinPendientes: 'No queda nada por decidir en el balance.' },
  materialidad: { titulo: 'Materialidad propuesta', sinPendientes: 'La materialidad ya está decidida.' },
  pbc: { titulo: 'Documentos que el agente necesita', sinPendientes: 'No hay documentos pendientes.' },
}

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * Vista "una decisión a la vez" para un paso del rail. Muestra la propuesta más
 * importante al frente, las siguientes en pequeño, y lo hecho por el agente
 * plegado. El contenido clásico del paso (children) queda a un clic.
 */
export function AgentePaso({ auditoriaId, paso, children, contenidoLabel = 'Ver el contenido completo del paso' }: {
  auditoriaId: string
  paso: 'balance' | 'materialidad' | 'pbc'
  children: ReactNode
  contenidoLabel?: string
}) {
  const resumen = useResumenAgente(auditoriaId, true)
  const pendientes = usePropuestas(auditoriaId, paso, 'propuesta')
  const todas = usePropuestas(auditoriaId, paso, 'todas')
  const decidir = useDecidir(auditoriaId)
  const correr = useCorrerBalance(auditoriaId)
  const [verContenido, setVerContenido] = useState(false)
  const [verHecho, setVerHecho] = useState(false)

  const corrida = resumen.data?.corrida ?? null
  const lista = pendientes.data ?? []
  const decididas = (todas.data ?? []).filter((p) => p.estado !== 'propuesta' && p.estado !== 'omitida')
  const omitidas = (todas.data ?? []).filter((p) => p.estado === 'omitida')
  const actual = lista[0]
  const texto = PASO_TEXTO[paso]

  // Sin corrida todavía: en el paso Balance el contenido clásico (subir el balance) va al frente.
  const sinCorrida = !corrida
  if (sinCorrida && paso === 'balance') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-500" />
          <div className="text-sm text-indigo-900">
            <p className="font-medium">El agente está listo.</p>
            <p className="text-indigo-800/80">Sube el balance de prueba y en segundos tendrás la revisión: integridad, naturaleza de saldos, cuentas bolsa, variaciones y materialidad propuesta.</p>
          </div>
          <Button size="sm" variant="secondary" className="ml-auto shrink-0" loading={correr.isPending} onClick={() => correr.mutate()}>Revisar ahora</Button>
        </div>
        {children}
      </div>
    )
  }

  const linea = (p: PropuestaAgente) => (
    <div key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 shrink-0">{TIPO_PROPUESTA_LABEL[p.tipo]}</span>
      <span className="truncate text-gray-800">{p.codigo && <span className="font-mono text-gray-400 mr-1">{p.codigo}</span>}{p.titulo}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Estado del agente en este paso */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gray-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-gray-700"><Sparkles size={14} className="text-indigo-500" />{texto?.titulo}</span>
        {corrida?.estado === 'completada' && corrida.resultado && (
          <span>
            {corrida.filas?.toLocaleString('es-CO')} filas · {String((corrida.resultado as { reglasEjecutadas?: string[] }).reglasEjecutadas?.length ?? 0)} reglas · {String((corrida.resultado as { hallazgos?: number }).hallazgos ?? 0)} hallazgos
          </span>
        )}
        {corrida?.estado === 'error' && <span className="text-red-600">La última revisión falló. Puedes reintentar.</span>}
        {paso === 'balance' && (
          <button type="button" onClick={() => correr.mutate()} disabled={correr.isPending} className="text-indigo-600 hover:underline disabled:opacity-50">
            {correr.isPending ? 'Revisando…' : 'Volver a revisar'}
          </button>
        )}
      </div>

      {/* La decisión al frente */}
      {pendientes.isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
      ) : actual ? (
        <DecisionCard
          key={actual.id}
          propuesta={actual}
          posicion={{ actual: 1, total: lista.length }}
          decidiendo={decidir.isPending}
          onDecidir={(decision, extra) => decidir.mutate({ id: actual.id, decision, ...extra })}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 px-5 py-8 text-center">
          <p className="font-medium text-gray-900">{texto?.sinPendientes ?? 'Nada pendiente aquí.'}</p>
          <p className="mt-1 text-sm text-gray-500">
            {resumen.data && resumen.data.teToca > 0
              ? `Te quedan ${resumen.data.teToca} decisiones en otros pasos; míralas en el rail.`
              : 'El agente sigue trabajando y te avisa cuando te necesite.'}
          </p>
        </div>
      )}

      {lista.length > 1 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Después de esto</h4>
          <div className="space-y-1.5">{lista.slice(1, 4).map(linea)}</div>
          {lista.length > 4 && <p className="mt-1 text-xs text-gray-400">y {lista.length - 4} más</p>}
        </div>
      )}

      {omitidas.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Omitidas por ahora · {omitidas.length}</h4>
          <div className="space-y-1.5">
            {omitidas.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px]">
                <span className="truncate text-gray-600">{p.codigo && <span className="font-mono text-gray-400 mr-1">{p.codigo}</span>}{p.titulo}</span>
                <button type="button" className="ml-auto shrink-0 text-indigo-600 hover:underline" onClick={() => decidir.mutate({ id: p.id, decision: 'retomar' })}>Retomar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lo que el agente ya hizo aquí (bitácora de la corrida + decisiones) */}
      {(corrida?.bitacora.length || decididas.length) ? (
        <div>
          <button type="button" onClick={() => setVerHecho((v) => !v)} aria-expanded={verHecho} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
            <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verHecho && 'rotate-90')} />
            Lo que el agente ya hizo en este paso · {(paso === 'balance' ? corrida?.bitacora.length ?? 0 : 0) + decididas.length}
          </button>
          {verHecho && (
            <div className="mt-2 space-y-1">
              {paso === 'balance' && corrida?.bitacora.map((l) => (
                <div key={l.numero} className="flex gap-3 border-l-2 border-emerald-400 py-1.5 pl-3 text-[13px] text-gray-600">
                  <span className="font-mono text-[11px] text-gray-400 shrink-0 pt-0.5">{hora(l.createdAt)}</span>
                  <span>{l.texto}</span>
                </div>
              ))}
              {decididas.map((p) => (
                <div key={p.id} className="flex gap-3 border-l-2 border-emerald-400 py-1.5 pl-3 text-[13px] text-gray-600">
                  <span className="font-mono text-[11px] text-gray-400 shrink-0 pt-0.5">{hora(p.decididaAt ?? undefined)}</span>
                  <span><span className="font-medium text-gray-800">{p.estado === 'aprobada' ? 'Aprobaste' : p.estado === 'ajustada' ? 'Aprobaste con ajustes' : 'Descartaste'}</span> {p.codigo ? `${p.codigo} · ` : ''}{p.titulo}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Contenido clásico del paso, a un clic */}
      <div className="border-t border-gray-200 pt-3">
        <button type="button" onClick={() => setVerContenido((v) => !v)} aria-expanded={verContenido} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
          <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verContenido && 'rotate-90')} />
          {contenidoLabel}
        </button>
        {verContenido && <div className="mt-4">{children}</div>}
      </div>
    </div>
  )
}
