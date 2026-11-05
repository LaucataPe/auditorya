import { Sparkles } from 'lucide-react'
import { ANCLA_CONTACTO, MENSAJES_WHATSAPP, enlaceWhatsApp, CAPTURA_HERO, CTA, HERO } from './contenido'
import { CtaLink } from './CtaLink'
import { ProductScreenshot } from './ProductScreenshot'
import { AppMockup } from './AppMockup'
import { Resaltado } from './Tipografia'

/** Hero con el titular (2 líneas) y el CTA de la variante A/B asignada (ver useVarianteHero). */
export function Hero({ titular, cta }: { titular: readonly [string, string]; cta: string }) {
  const ctaHref = enlaceWhatsApp(MENSAJES_WHATSAPP.conocer) ?? ANCLA_CONTACTO
  return (
    <section id="inicio" aria-labelledby="hero-titulo" className="relative scroll-mt-20 overflow-hidden pt-16 sm:pt-20">
      {/* Luces de fondo (solo violetas) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-[10%] -top-[10%] h-[680px] bg-[radial-gradient(520px_320px_at_16%_18%,rgba(139,92,246,0.32),transparent_70%),radial-gradient(500px_300px_at_84%_8%,rgba(91,33,182,0.22),transparent_70%),radial-gradient(460px_280px_at_55%_58%,rgba(196,181,253,0.45),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-5xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-marca-linea bg-white px-3.5 py-1.5 text-xs font-semibold text-marca-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {HERO.etiqueta}
          </p>
          <h1
            id="hero-titulo"
            className="mt-6 text-balance text-[2.1rem] font-extrabold leading-[1.12] tracking-tight text-marca-tinta sm:text-5xl lg:text-[3.25rem]"
          >
            <span className="lg:block lg:whitespace-nowrap">{titular[0]}</span>{' '}
            <Resaltado className="lg:block lg:whitespace-nowrap">{titular[1]}</Resaltado>
          </h1>
          <p className="mx-auto mt-6 max-w-[660px] text-lg leading-relaxed text-marca-suave">{HERO.subtitulo}</p>
          <div className="mt-8 flex flex-col items-center gap-2.5">
            <CtaLink href={ctaHref} ubicacion="hero" className="w-full sm:w-auto">
              {cta} <span aria-hidden="true">→</span>
            </CtaLink>
            <p className="text-sm text-marca-suave">{HERO.notaCta}</p>
          </div>
          <p className="mt-5 text-sm text-marca-suave">
            {HERO.preguntaExplorar}{' '}
            <CtaLink href="#como-funciona" variante="texto" ubicacion="hero" evento="demo_click" className="text-sm">
              {CTA.explorar} <span aria-hidden="true">↓</span>
            </CtaLink>
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-[1080px] after:absolute after:inset-x-[6%] after:-bottom-8 after:h-24 after:bg-[radial-gradient(closest-side,rgba(91,33,182,0.4),transparent)] after:blur-xl">
          <ProductScreenshot
            src={CAPTURA_HERO.src}
            alt={CAPTURA_HERO.alt}
            ancho={CAPTURA_HERO.ancho}
            alto={CAPTURA_HERO.alto}
            prioritaria
          >
            <AppMockup />
          </ProductScreenshot>
        </div>
      </div>
    </section>
  )
}
