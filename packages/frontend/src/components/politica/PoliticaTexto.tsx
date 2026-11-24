import { POLITICA_DATOS } from '@auditorya/types'
import { cn } from '../../lib/cn'

/** `**negrilla**` → <strong>. El resto del texto se muestra tal cual (sin HTML). */
function conNegrilla(texto: string) {
  return texto.split('**').map((parte, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900">{parte}</strong> : parte))
}

const ES_ITEM = /^(\d+\.|[ivx]+\)|-)\s|^\*\*[ivx]+\)/

/** Texto completo de la política vigente. Única fuente: @auditorya/types → politica-datos. */
export function PoliticaTexto({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-5 text-sm leading-relaxed text-gray-700', className)}>
      {POLITICA_DATOS.secciones.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.titulo && <h2 className="text-base font-semibold text-gray-900">{s.titulo}</h2>}
          {s.parrafos.map((p, j) => (
            <p key={j} className={ES_ITEM.test(p) ? 'pl-4' : undefined}>{conNegrilla(p)}</p>
          ))}
        </section>
      ))}
    </div>
  )
}
