import { Isotipo } from '../ui/Logo'
import { MENSAJES_WHATSAPP, PROGRAMA, SITIO, enlaceWhatsApp } from './contenido'
import { CtaLink } from './CtaLink'
import { TituloSeccion } from './Tipografia'

/**
 * Cierre de la página (ancla #contacto): invitación al programa fundador con un solo botón.
 * El botón abre WhatsApp (VITE_WHATSAPP) o, si no hay número, un correo (VITE_CONTACTO_EMAIL);
 * sin ninguno de los dos se muestra pero no lleva a ningún lado (ver docs/landing.md).
 */
export function FounderProgram() {
  const destino =
    enlaceWhatsApp(MENSAJES_WHATSAPP.fundador) ??
    (SITIO.correoContacto
      ? `mailto:${SITIO.correoContacto}?subject=${encodeURIComponent(PROGRAMA.asuntoCorreo)}`
      : null)

  return (
    <section id="contacto" aria-labelledby="programa-titulo" className="scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-marca-linea bg-gradient-to-br from-white via-[#f1ebff] to-[#e4d9ff] p-6 shadow-[0_40px_80px_-50px_rgba(46,16,101,0.6)] sm:p-10 lg:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.35),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-32 h-[380px] w-[380px] rounded-full bg-[radial-gradient(closest-side,rgba(91,33,182,0.18),transparent)]"
        />

        <div className="relative grid grid-cols-1 items-center gap-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-14">
          {/* Isotipo grande con halo */}
          <div className="relative mx-auto flex h-40 w-40 items-center justify-center md:h-52 md:w-52">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.45),transparent)] blur-md"
            />
            <Isotipo className="relative h-24 w-24 rounded-[26px] shadow-[0_24px_40px_-14px_rgba(46,16,101,0.8)] md:h-32 md:w-32" />
          </div>

          <div className="text-center md:text-left">
            <TituloSeccion id="programa-titulo" titulo={PROGRAMA.titulo} className="lg:text-[2.5rem]" />
            <p className="mt-4 max-w-2xl leading-relaxed text-marca-suave md:text-lg">{PROGRAMA.texto}</p>
            {destino ? (
              <CtaLink href={destino} ubicacion="cta_final" className="mt-8 w-full sm:w-auto">
                {PROGRAMA.cta} <span aria-hidden="true">→</span>
              </CtaLink>
            ) : (
              <span
                aria-disabled="true"
                title="Falta configurar el WhatsApp o el correo de contacto"
                className="mt-8 inline-flex min-h-[46px] w-full cursor-default items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-marca-800 to-marca-600 px-6 py-3 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(91,33,182,0.7)] sm:w-auto"
              >
                {PROGRAMA.cta} <span aria-hidden="true">→</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
