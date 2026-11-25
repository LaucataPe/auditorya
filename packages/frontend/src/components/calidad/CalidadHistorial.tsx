import { CheckCircle2, Circle } from 'lucide-react'
import type { SistemaCalidad } from '@auditorya/types'
import { ACCION_LABEL, fecha, tituloComponente } from './calidad-ui'

/** Últimos cambios del sistema de calidad, tomados de la pista de auditoría (con su motivo). */
export function CalidadHistorial({ sistema }: { sistema: SistemaCalidad }) {
  if (sistema.cambios.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
        Todavía no hay cambios registrados en el sistema de calidad.
      </p>
    )
  }
  return (
    <section className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <p className="mb-2 text-sm text-gray-500">
        Últimos {sistema.cambios.length} cambios. Cada uno queda en la pista de auditoría con su autor y motivo.
      </p>
      <ul className="divide-y divide-gray-100">
        {sistema.cambios.map((x) => {
          const d = x.detalle ?? {}
          const componente = typeof d.componente === 'string' ? tituloComponente(d.componente) : null
          const titulo = typeof d.titulo === 'string' ? d.titulo : null
          const motivo = typeof d.motivo === 'string' ? d.motivo : null
          return (
            <li key={x.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-2.5 text-sm">
              <span className="w-36 shrink-0 whitespace-nowrap text-gray-500">{fecha(x.createdAt)}</span>
              <span className="flex min-w-0 flex-1 items-start gap-1.5 text-gray-900">
                {/(revisar|concluir|firmar)$/.test(x.accion) ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <Circle size={14} className="mt-0.5 shrink-0 text-gray-300" />
                )}
                <span>
                  {ACCION_LABEL[x.accion] ?? x.accion}
                  {titulo && <span className="text-gray-500"> · {titulo}</span>}
                  {!titulo && componente && <span className="text-gray-500"> · {componente}</span>}
                  {motivo && <span className="text-gray-500"> · «{motivo}»</span>}
                </span>
              </span>
              <span className="text-gray-500">{x.usuarioNombre}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
