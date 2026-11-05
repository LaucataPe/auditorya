import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { Tono, TituloResaltado } from './contenido'

/** Texto con el degradado violeta de la marca (oscuro → violeta). */
export function Resaltado({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('bg-gradient-to-r from-marca-900 via-marca-700 to-marca-500 bg-clip-text text-transparent', className)}>
      {children}
    </span>
  )
}

/** Antetítulo de sección (pequeño, en mayúsculas). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs font-bold uppercase tracking-[0.12em] text-marca-700', className)}>{children}</p>
}

/** h2 de sección: parte en tinta normal + parte resaltada. */
export function TituloSeccion({
  id,
  titulo,
  className,
}: {
  id: string
  titulo: TituloResaltado
  className?: string
}) {
  return (
    <h2
      id={id}
      className={cn('text-balance text-3xl font-extrabold tracking-tight text-marca-tinta sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]', className)}
    >
      {titulo.antes}
      {titulo.salto ? <br /> : ' '}
      <Resaltado>{titulo.resaltado}</Resaltado>
    </h2>
  )
}

const TONOS: Record<Tono, string> = {
  alto: 'bg-red-50 text-red-700',
  medio: 'bg-amber-50 text-amber-800',
  bajo: 'bg-emerald-50 text-emerald-700',
  marca: 'bg-marca-100 text-marca-700',
}

export function Pill({ tono, children }: { tono: Tono; children: ReactNode }) {
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold', TONOS[tono])}>
      {children}
    </span>
  )
}
