import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { rastrear } from '../../lib/analitica'

type Variante = 'primario' | 'secundario' | 'texto'

const variantes: Record<Variante, string> = {
  primario:
    'min-h-[46px] rounded-xl bg-gradient-to-br from-marca-800 to-marca-600 px-6 py-3 text-white shadow-[0_10px_24px_-10px_rgba(91,33,182,0.7)] hover:shadow-[0_16px_30px_-10px_rgba(91,33,182,0.75)] motion-safe:hover:-translate-y-0.5',
  secundario: 'min-h-[46px] rounded-xl border border-marca-linea bg-white/75 px-6 py-3 text-marca-tinta hover:bg-white',
  texto: 'font-semibold text-marca-700 hover:text-marca-900',
}

/**
 * Enlace a una sección con aspecto de botón (o de enlace, en la variante `texto`).
 * Registra el evento de analítica con la ubicación del CTA en la página.
 */
export function CtaLink({
  href,
  variante = 'primario',
  ubicacion,
  evento = 'cta_click',
  className,
  children,
}: {
  href: string
  variante?: Variante
  ubicacion: string
  evento?: 'cta_click' | 'demo_click'
  className?: string
  children: ReactNode
}) {
  // Enlaces externos (WhatsApp, etc.) en pestaña nueva; las anclas y mailto en la misma.
  const externo = /^https?:\/\//.test(href)
  return (
    <a
      href={href}
      target={externo ? '_blank' : undefined}
      rel={externo ? 'noopener noreferrer' : undefined}
      onClick={() => rastrear(evento, { ubicacion, texto: typeof children === 'string' ? children : undefined })}
      className={cn(
        'inline-flex items-center justify-center gap-2 text-center text-[15px] font-semibold transition focus:outline-none focus-visible:ring-[3px] focus-visible:ring-marca-300 focus-visible:ring-offset-2',
        variantes[variante],
        className,
      )}
    >
      {children}
    </a>
  )
}
