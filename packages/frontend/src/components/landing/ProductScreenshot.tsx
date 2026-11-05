import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Marco de navegador para mostrar el producto: una captura real (`src`) o, mientras no la
 * haya, el contenido que se pase como `children` (p. ej. AppMockup).
 */
export function ProductScreenshot({
  src,
  alt,
  ancho,
  alto,
  prioritaria = false,
  className,
  children,
}: {
  src?: string | null
  alt: string
  ancho?: number
  alto?: number
  /** true para la captura del hero (carga inmediata); el resto carga diferido. */
  prioritaria?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <figure
      className={cn(
        'relative z-[1] overflow-hidden rounded-t-[18px] border border-marca-linea bg-white text-left shadow-[0_40px_90px_-30px_rgba(46,16,101,0.5)]',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-marca-linea bg-[#faf8ff] px-4 py-2.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9d2f3]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9d2f3]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#d9d2f3]" />
        <span className="ml-3 h-[22px] max-w-[300px] flex-1 rounded-md border border-marca-linea bg-white" />
      </div>
      {src ? (
        <img
          src={src}
          alt={alt}
          width={ancho}
          height={alto}
          loading={prioritaria ? 'eager' : 'lazy'}
          decoding="async"
          className="block h-auto w-full"
        />
      ) : (
        children
      )}
    </figure>
  )
}
