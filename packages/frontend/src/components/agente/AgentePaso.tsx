import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, Sparkles } from 'lucide-react'
import { TIPO_PROPUESTA_LABEL, type PropuestaAgente } from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { DecisionCard } from './DecisionCard'
import { CuestionarioCoso } from './CuestionarioCoso'
import { useCorrerBalance, useCorrerControlInterno, useCorrerRiesgos, useDecidir, usePropuestas, useResumenAgente } from '../../hooks/useAgente'

const PASO_TEXTO: Record<string, { titulo: string; sinPendientes: string }> = {
  entendimiento: { titulo: 'Entendimiento del período', sinPendientes: 'El entendimiento ya está confirmado.' },
  balance: { titulo: 'Revisión del balance', sinPendientes: 'No queda nada por decidir en el balance.' },
  control_interno: { titulo: 'Control interno propuesto', sinPendientes: 'Los cinco componentes ya están calificados.' },
  materialidad: { titulo: 'Materialidad propuesta', sinPendientes: 'La materialidad ya está decidida.' },
  riesgos: { titulo: 'Riesgos propuestos', sinPendientes: 'No queda ningún riesgo por decidir. Los aprobados ya están en la matriz.' },
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
  paso: 'entendimiento' | 'balance' | 'control_interno' | 'materialidad' | 'riesgos' | 'pbc'
  children: ReactNode
  contenidoLabel?: string
}) {
  const resumen = useResumenAgente(auditoriaId, true)
  const pendientes = usePropuestas(auditoriaId, paso, 'propuesta')
  const todas = usePropuestas(auditoriaId, paso, 'todas')
  const decidir = useDecidir(auditoriaId)
  const correr = useCorrerBalance(auditoriaId)
  const correrRiesgos = useCorrerRiesgos(auditoriaId)
  const correrControl = useCorrerControlInterno(auditoriaId)
  const [verContenido, setVerContenido] = useState(false)
  const [verHecho, setVerHecho] = useState(false)
  const [verCuestionario, setVerCuestionario] = useState(false)
  const [aprobandoTodo, setAprobandoTodo] = useState(false)

  const [searchParams] = useSearchParams()
  const seleccionada = searchParams.get('propuesta')
  const corridaBalance = resumen.data?.corrida ?? null
  const corridaRiesgos = resumen.data?.corridaRiesgos ?? null
  const corridaControl = resumen.data?.corridaControlInterno ?? null
  // Cada paso mira su propia corrida: riesgos, control interno o balance.
  const corrida = paso === 'riesgos' ? corridaRiesgos : paso === 'control_interno' ? corridaControl : corridaBalance
  const conCorridaPropia = paso === 'balance' || paso === 'riesgos' || paso === 'control_interno'

  // Riesgos: si el balance ya está revisado y el agente aún no propuso riesgos, los propone solo al entrar.
  const autoDisparado = useRef(false)
  useEffect(() => {
    if (paso !== 'riesgos' || !resumen.data || autoDisparado.current) return
    if (corridaBalance?.estado === 'completada' && !corridaRiesgos && !correrRiesgos.isPending) {
      autoDisparado.current = true
      correrRiesgos.mutate()
    }
  }, [paso, resumen.data, corridaBalance, corridaRiesgos, correrRiesgos])
  const lista = pendientes.data ?? []
  // Solo decisiones de personas: lo que el agente reemplazó al volver a correr no tiene decididaPor.
  const decididas = (todas.data ?? []).filter((p) => p.estado !== 'propuesta' && p.estado !== 'omitida' && p.decididaPor)
  const omitidas = (todas.data ?? []).filter((p) => p.estado === 'omitida')
  // Si llegaste desde el panel a una propuesta concreta, esa va al frente.
  const actual = lista.find((p) => p.id === seleccionada) ?? lista[0]
  const posicionActual = actual ? lista.indexOf(actual) + 1 : 1
  const texto = PASO_TEXTO[paso]

  // Sin corrida todavía: en el paso Balance el contenido clásico (subir el balance) va al frente.
  const sinCorrida = !corrida
  // Control interno: el cuestionario va al frente hasta que el agente proponga la calificación (o cuando el auditor quiera volver a él).
  if (paso === 'control_interno' && (sinCorrida || verCuestionario)) {
    return (
      <div className="space-y-4">
        {sinCorrida && (
          <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-500" />
            <div className="text-sm text-indigo-900">
              <p className="font-medium">Quince preguntas y el agente califica los cinco componentes.</p>
              <p className="text-indigo-800/80">Responde lo que sabes de la empresa. Cruzo tus respuestas con el balance y el entendimiento, y cada "no" queda listo para la carta de control interno y para el riesgo de control del área.</p>
            </div>
          </div>
        )}
        <CuestionarioCoso auditoriaId={auditoriaId} onTerminado={() => setVerCuestionario(false)} onSalir={sinCorrida ? undefined : () => setVerCuestionario(false)} />
        {sinCorrida && (
          <div className="border-t border-gray-200 pt-3">
            <button type="button" onClick={() => setVerContenido((v) => !v)} aria-expanded={verContenido} className="flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900">
              <ChevronRight size={14} className={cn('transition-transform motion-reduce:transition-none', verContenido && 'rotate-90')} />
              {contenidoLabel}
            </button>
            {verContenido && <div className="mt-4">{children}</div>}
          </div>
        )}
      </div>
    )
  }
  if (sinCorrida && paso === 'riesgos') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-500" />
          <div className="text-sm text-indigo-900">
            <p className="font-medium">{correrRiesgos.isPending ? 'Proponiendo riesgos…' : 'El agente está listo para proponer riesgos.'}</p>
            <p className="text-indigo-800/80">
              {corridaBalance?.estado === 'completada'
                ? 'Los arma con los hallazgos del balance que aprobaste, lo que contaste en el entendimiento, el control interno y el sector.'
                : 'Sube y revisa el balance primero: de ahí salen los riesgos con evidencia. Igual puedes pedirle los del sector ahora.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="ml-auto shrink-0" loading={correrRiesgos.isPending} onClick={() => correrRiesgos.mutate()}>Proponer riesgos</Button>
        </div>
        {children}
      </div>
    )
  }
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
        {paso === 'control_interno' && corrida?.estado === 'completada' && corrida.resultado && (() => {
          const r = corrida.resultado as { componentes?: number; porCalificacion?: Record<string, number>; deficiencias?: unknown[]; sinResponder?: number }
          return (
            <span>
              {r.componentes ?? 0} componentes · {r.porCalificacion?.efectivo ?? 0} efectivos · {r.porCalificacion?.con_deficiencias ?? 0} con deficiencias · {r.porCalificacion?.deficiente ?? 0} deficientes · {r.deficiencias?.length ?? 0} deficiencias
              {(r.sinResponder ?? 0) > 0 && <span className="text-amber-700"> · {r.sinResponder} preguntas sin responder</span>}
            </span>
          )
        })()}
        {paso !== 'riesgos' && paso !== 'control_interno' && corrida?.estado === 'completada' && corrida.resultado && (
          <span>
            {corrida.filas?.toLocaleString('es-CO')} filas · {String((corrida.resultado as { reglasEjecutadas?: string[] }).reglasEjecutadas?.length ?? 0)} reglas · {String((corrida.resultado as { hallazgos?: number }).hallazgos ?? 0)} hallazgos
          </span>
        )}
        {paso === 'riesgos' && corrida?.estado === 'completada' && corrida.resultado && (() => {
          const r = corrida.resultado as { riesgos?: number; hallazgosUsados?: number; hallazgosPendientes?: number; porFuente?: { hallazgo: number; sector: number; entendimiento: number } }
          return (
            <span>
              {r.riesgos ?? 0} riesgos · {r.porFuente?.hallazgo ?? 0} del balance · {r.porFuente?.entendimiento ?? 0} del entendimiento · {r.porFuente?.sector ?? 0} del sector
              {(r.hallazgosPendientes ?? 0) > 0 && <span className="text-amber-700"> · {r.hallazgosPendientes} hallazgos del balance sin decidir</span>}
            </span>
          )
        })()}
        {corrida?.estado === 'error' && <span className="text-red-600">La última revisión falló. Puedes reintentar.</span>}
        {paso === 'balance' && (
          <button type="button" onClick={() => correr.mutate()} disabled={correr.isPending} className="text-indigo-600 hover:underline disabled:opacity-50">
            {correr.isPending ? 'Revisando…' : 'Volver a revisar'}
          </button>
        )}
        {paso === 'riesgos' && (
          <button type="button" onClick={() => correrRiesgos.mutate()} disabled={correrRiesgos.isPending} className="text-indigo-600 hover:underline disabled:opacity-50">
            {correrRiesgos.isPending ? 'Proponiendo…' : 'Volver a proponer'}
          </button>
        )}
        {paso === 'control_interno' && (
          <>
            <button type="button" onClick={() => setVerCuestionario(true)} className="text-indigo-600 hover:underline">Volver al cuestionario</button>
            <button type="button" onClick={() => correrControl.mutate()} disabled={correrControl.isPending} className="text-indigo-600 hover:underline disabled:opacity-50">
              {correrControl.isPending ? 'Calificando…' : 'Volver a calificar'}
            </button>
          </>
        )}
      </div>

      {/* La decisión al frente */}
      {pendientes.isLoading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
      ) : actual ? (
        <DecisionCard
          key={actual.id}
          propuesta={actual}
          posicion={{ actual: posicionActual, total: lista.length }}
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

      {paso === 'control_interno' && lista.length > 1 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900">
          <span>¿De acuerdo con las {lista.length} calificaciones tal como están?</span>
          <Button
            size="sm" variant="secondary" className="ml-auto" loading={aprobandoTodo}
            onClick={async () => {
              setAprobandoTodo(true)
              try { for (const p of lista) await decidir.mutateAsync({ id: p.id, decision: 'aprobar' }) } finally { setAprobandoTodo(false) }
            }}
          >
            Aprobar las {lista.length}
          </Button>
        </div>
      )}

      {lista.length > 1 && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Después de esto</h4>
          <div className="space-y-1.5">{lista.filter((p) => p.id !== actual?.id).slice(0, 3).map(linea)}</div>
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
            Lo que el agente ya hizo en este paso · {(conCorridaPropia ? corrida?.bitacora.length ?? 0 : 0) + decididas.length}
          </button>
          {verHecho && (
            <div className="mt-2 space-y-1">
              {conCorridaPropia && corrida?.bitacora.map((l) => (
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
