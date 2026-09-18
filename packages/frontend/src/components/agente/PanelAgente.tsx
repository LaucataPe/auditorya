import { useState } from 'react'
import { Check, ChevronRight, Sparkles } from 'lucide-react'
import type { CorridaAgente, PropuestaAgente } from '@auditorya/types'
import { cn } from '../../lib/cn'
import type { TabConfig } from '../../lib/etapas-encargo'
import { usePropuestasEncargo, useResumenAgente } from '../../hooks/useAgente'

const SEV_DOT: Record<string, string> = { alta: 'bg-red-500', media: 'bg-amber-400', baja: 'bg-gray-300' }
const ESTADO_TXT: Record<string, string> = { aprobada: 'Aprobaste', ajustada: 'Ajustaste', descartada: 'Descartaste' }

const hora = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) : '')

function resumenCorrida(paso: string, c: CorridaAgente | null): string | null {
  if (!c || c.estado !== 'completada') return null
  const r = (c.resultado ?? {}) as Record<string, unknown>
  if (paso === 'balance') return `Revisó ${c.filas?.toLocaleString('es-CO') ?? '?'} filas con ${(r.reglasEjecutadas as string[] | undefined)?.length ?? 0} reglas · ${String(r.hallazgos ?? 0)} hallazgos, ${String(r.documentos ?? 0)} documentos`
  if (paso === 'riesgos') { const f = r.porFuente as { hallazgo: number; sector: number; entendimiento: number } | undefined; return `Propuso ${String(r.riesgos ?? 0)} riesgos · ${f?.hallazgo ?? 0} del balance, ${f?.entendimiento ?? 0} del entendimiento, ${f?.sector ?? 0} del sector` }
  if (paso === 'control_interno') { const pc = r.porCalificacion as Record<string, number> | undefined; return `Calificó ${String(r.componentes ?? 0)} componentes · ${pc?.efectivo ?? 0} efectivos, ${pc?.con_deficiencias ?? 0} con deficiencias, ${pc?.deficiente ?? 0} deficientes · ${(r.deficiencias as unknown[] | undefined)?.length ?? 0} deficiencias` }
  return null
}

/**
 * Tarjeta del panel derecho en modo agéntico: dos pestañas, "Te toca" (decisiones
 * pendientes por paso) y "Hecho por el agente" (corridas y decisiones por paso).
 * Cada ítem lleva al paso y, si es una propuesta, la pone al frente.
 */
export function PanelAgente({ auditoriaId, tabs, onIr }: {
  auditoriaId: string
  tabs: TabConfig[]
  onIr: (paso: string, propuestaId?: string) => void
}) {
  const resumen = useResumenAgente(auditoriaId, true)
  const todas = usePropuestasEncargo(auditoriaId)
  const [vista, setVista] = useState<'te_toca' | 'hecho'>('te_toca')
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})

  const r = resumen.data
  const lista = todas.data ?? []
  const orden = tabs.map((t) => t.id as string)
  const labelDe = (paso: string) => tabs.find((t) => t.id === paso)?.label ?? paso
  const IconDe = (paso: string) => tabs.find((t) => t.id === paso)?.icon
  const pasos = [...new Set(lista.map((p) => p.paso))].sort((a, b) => orden.indexOf(a) - orden.indexOf(b))

  const pendientes = lista.filter((p) => p.estado === 'propuesta')
  const omitidas = lista.filter((p) => p.estado === 'omitida')
  const decididas = lista.filter((p) => (p.estado === 'aprobada' || p.estado === 'ajustada' || p.estado === 'descartada') && p.decididaPor)
  const corridas: Record<string, CorridaAgente | null> = { balance: r?.corrida ?? null, riesgos: r?.corridaRiesgos ?? null, control_interno: r?.corridaControlInterno ?? null }

  const toggle = (k: string) => setAbiertos((a) => ({ ...a, [k]: !(a[k] ?? true) }))
  const abierto = (k: string) => abiertos[k] ?? true

  const fila = (p: PropuestaAgente, hecho: boolean) => (
    <button
      key={p.id}
      type="button"
      onClick={() => onIr(p.paso, hecho ? undefined : p.id)}
      className={cn('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors', hecho ? 'hover:bg-emerald-50' : 'hover:bg-indigo-50')}
    >
      {hecho
        ? <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
        : <i className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEV_DOT[p.severidad ?? ''] ?? 'bg-indigo-400')} />}
      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-gray-700">
        {hecho && <span className="font-medium text-emerald-700">{ESTADO_TXT[p.estado] ?? p.estado} </span>}
        {p.codigo && <span className="font-mono text-[11px] text-gray-400">{p.codigo} </span>}
        <span className="line-clamp-2">{p.titulo}</span>
      </span>
      {hecho && p.decididaAt && <span className="shrink-0 text-[10px] text-gray-400">{hora(p.decididaAt)}</span>}
    </button>
  )

  const grupo = (paso: string, hijos: React.ReactNode, n: number, hecho: boolean) => {
    const Icon = IconDe(paso)
    const k = `${vista}:${paso}`
    return (
      <div key={k}>
        <button type="button" onClick={() => toggle(k)} aria-expanded={abierto(k)} className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-800">
          <ChevronRight size={12} className={cn('transition-transform motion-reduce:transition-none', abierto(k) && 'rotate-90')} />
          {Icon && <Icon size={12} className="text-gray-400" />}
          <span className="flex-1 text-left">{labelDe(paso)}</span>
          <span className={cn('font-mono text-[10px] tabular-nums', hecho ? 'text-emerald-600' : 'text-indigo-600')}>{n}</span>
          <span className="sr-only">ir al paso</span>
        </button>
        {abierto(k) && <div className="mb-1 space-y-0.5">{hijos}</div>}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={14} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-gray-900">Tu agente</h3>
      </div>
      <div className="mb-3 flex gap-2" role="tablist">
        <button
          role="tab" aria-selected={vista === 'te_toca'} type="button" onClick={() => setVista('te_toca')}
          className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            vista === 'te_toca' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')}
        >
          Te toca <span className="font-mono tabular-nums font-semibold">{r?.teToca ?? pendientes.length}</span>
        </button>
        <button
          role="tab" aria-selected={vista === 'hecho'} type="button" onClick={() => setVista('hecho')}
          className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            vista === 'hecho' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')}
        >
          Hecho por el agente <span className="font-mono tabular-nums font-semibold">{r?.hecho ?? decididas.length}</span>
        </button>
      </div>

      {todas.isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
      ) : vista === 'te_toca' ? (
        pendientes.length === 0 && omitidas.length === 0 ? (
          <p className="px-1 py-3 text-[13px] text-gray-500">Nada pendiente. El agente sigue trabajando y te avisa cuando te necesite.</p>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {pasos.filter((paso) => pendientes.some((p) => p.paso === paso)).map((paso) => {
              const del = pendientes.filter((p) => p.paso === paso)
              return grupo(paso, del.map((p) => fila(p, false)), del.length, false)
            })}
            {omitidas.length > 0 && (
              <p className="px-2 pt-1 text-[11px] text-gray-400">
                {omitidas.length} omitida{omitidas.length === 1 ? '' : 's'} por ahora en {[...new Set(omitidas.map((p) => labelDe(p.paso)))].join(', ')}.
              </p>
            )}
          </div>
        )
      ) : (
        <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          {pasos.filter((paso) => corridas[paso] || decididas.some((p) => p.paso === paso)).map((paso) => {
            const del = decididas.filter((p) => p.paso === paso)
            const c = corridas[paso]
            const texto = resumenCorrida(paso, c)
            const hijos = (
              <>
                {texto && (
                  <button type="button" onClick={() => onIr(paso)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-emerald-50">
                    <Sparkles size={13} className="mt-0.5 shrink-0 text-indigo-500" />
                    <span className="flex-1 text-[12.5px] leading-snug text-gray-700">{texto}<span className="text-gray-400"> · {c!.bitacora.length} pasos en la bitácora</span></span>
                  </button>
                )}
                {del.map((p) => fila(p, true))}
              </>
            )
            return grupo(paso, hijos, del.length + (texto ? 1 : 0), true)
          })}
          {decididas.length === 0 && !Object.values(corridas).some(Boolean) && (
            <p className="px-1 py-3 text-[13px] text-gray-500">Todavía nada: sube el balance y el agente empieza.</p>
          )}
        </div>
      )}
    </div>
  )
}
