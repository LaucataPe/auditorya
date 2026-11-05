import type { Tarjeta } from './contenido'

/** Tarjeta de característica con ícono en recuadro violeta. */
export function FeatureCard({ icon: Icon, titulo, texto }: Tarjeta) {
  return (
    <div className="rounded-2xl border border-marca-linea bg-white p-7 transition motion-safe:hover:-translate-y-1 hover:shadow-[0_22px_40px_-24px_rgba(91,33,182,0.55)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-marca-800 to-marca-500 text-white shadow-[0_10px_20px_-10px_rgba(91,33,182,0.7)]">
        <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-marca-tinta">{titulo}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-marca-suave">{texto}</p>
    </div>
  )
}
