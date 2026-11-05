import { useEffect } from 'react'
import { Info, Sparkles, UserRound } from 'lucide-react'
import { fijarContextoAnalitica } from '../lib/analitica'
import { useVarianteHero } from '../hooks/useVarianteHero'
import {
  COMO_FUNCIONA,
  EXPERIENCIA,
  IA,
  MENSAJES_WHATSAPP,
  PREGUNTAS,
  PROBLEMA,
  SITIO,
  enlaceWhatsApp,
} from '../components/landing/contenido'
import { Navbar } from '../components/landing/Navbar'
import { Hero } from '../components/landing/Hero'
import { FeatureCard } from '../components/landing/FeatureCard'
import { WorkflowDiagram } from '../components/landing/WorkflowDiagram'
import { FounderProgram } from '../components/landing/FounderProgram'
import { FAQAccordion } from '../components/landing/FAQAccordion'
import { Footer } from '../components/landing/Footer'
import { CtaLink } from '../components/landing/CtaLink'
import { Eyebrow, Pill, Resaltado, TituloSeccion } from '../components/landing/Tipografia'

/** Título, canónica y og:url de la landing; se restauran al salir hacia la app. */
function useSeoLanding() {
  useEffect(() => {
    const tituloPrevio = document.title
    document.title = SITIO.titulo
    const creados: Element[] = []
    if (SITIO.url) {
      const canonical = document.createElement('link')
      canonical.rel = 'canonical'
      canonical.href = SITIO.url
      const ogUrl = document.createElement('meta')
      ogUrl.setAttribute('property', 'og:url')
      ogUrl.content = SITIO.url
      document.head.append(canonical, ogUrl)
      creados.push(canonical, ogUrl)
    }
    return () => {
      document.title = tituloPrevio
      creados.forEach((el) => el.remove())
    }
  }, [])
}

const CONTENEDOR = 'mx-auto max-w-6xl px-4 sm:px-6'
const SECCION = 'scroll-mt-20 py-20 sm:py-24'
const BANDA = 'border-y border-marca-linea bg-marca-banda'

export function LandingPage() {
  const { variante, titular, cta } = useVarianteHero()
  useSeoLanding()
  useEffect(() => fijarContextoAnalitica({ varianteHero: variante }), [variante])

  return (
    <div className="min-h-screen bg-marca-fondo text-marca-tinta">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-card-hover"
      >
        Saltar al contenido
      </a>
      <Navbar />

      <main id="contenido">
        <Hero titular={titular} cta={cta} />

        {/* Problema */}
        <section id="problema" aria-labelledby="problema-titulo" className="scroll-mt-20 pb-20 pt-24 sm:pb-24 sm:pt-32">
          <div className={CONTENEDOR}>
            <div className="mx-auto max-w-4xl text-center">
              <TituloSeccion id="problema-titulo" titulo={PROBLEMA.titulo} />
              <p className="mt-4 text-lg leading-relaxed text-marca-suave">{PROBLEMA.bajada}</p>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {PROBLEMA.tarjetas.map((t) => (
                <FeatureCard key={t.titulo} {...t} />
              ))}
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section id="como-funciona" aria-labelledby="flujo-titulo" className={`${SECCION} ${BANDA}`}>
          <div className={CONTENEDOR}>
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <Eyebrow>{COMO_FUNCIONA.eyebrow}</Eyebrow>
              <TituloSeccion id="flujo-titulo" titulo={COMO_FUNCIONA.titulo} className="mt-3" />
              <p className="mt-4 text-lg leading-relaxed text-marca-suave">{COMO_FUNCIONA.bajada}</p>
            </div>
            <WorkflowDiagram etapas={COMO_FUNCIONA.etapas} />
          </div>
        </section>

        {/* IA: única banda oscura de la página */}
        <section id="ia" aria-labelledby="ia-titulo" className={`${SECCION} relative overflow-hidden bg-marca-950 text-[#f3ecff]`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(620px_380px_at_85%_8%,rgba(139,92,246,0.45),transparent_70%),radial-gradient(520px_340px_at_5%_100%,rgba(109,63,242,0.3),transparent_70%)]"
          />
          <div className={`${CONTENEDOR} relative`}>
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <Eyebrow className="text-marca-300">{IA.eyebrow}</Eyebrow>
              <h2 id="ia-titulo" className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                {IA.titulo[0]}
                <br />
                <span className="text-marca-300">{IA.titulo[1]}</span>
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-[#cdbcf5]">{IA.bajada}</p>
            </div>

            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-white">
                  {IA.criteriosTitulo[0]} <span className="text-marca-300">{IA.criteriosTitulo[1]}</span>
                </h3>
                <ul className="mt-4">
                  {IA.criterios.map(({ icon: Icon, texto }) => (
                    <li key={texto} className="flex items-center gap-3.5 border-b border-white/10 py-3.5 last:border-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-marca-300">
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      {texto}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/15 bg-white/[0.08] px-3.5 py-3 text-sm text-[#e9ddff]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {IA.advertencia}
                </p>
              </div>
              <FichaIA />
            </div>
          </div>
        </section>

        {/* Quiénes somos */}
        <section id="nosotros" aria-labelledby="nosotros-titulo" className={SECCION}>
          <div className={`${CONTENEDOR} grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14`}>
            <div>
              <Eyebrow>{EXPERIENCIA.eyebrow}</Eyebrow>
              <TituloSeccion id="nosotros-titulo" titulo={EXPERIENCIA.titulo} className="mt-3" />
              <p className="mt-5 text-lg leading-relaxed text-marca-suave">{EXPERIENCIA.texto}</p>
              <p className="mt-7 border-l-[3px] border-marca-600 pl-4 text-lg font-bold">
                {EXPERIENCIA.frase[0]} <span className="text-marca-700">{EXPERIENCIA.frase[1]}</span>
              </p>
            </div>
            <PerfilAuditor />
          </div>
        </section>

        {/* Preguntas frecuentes */}
        <section id="faq" aria-labelledby="faq-titulo" className={`${SECCION} ${BANDA}`}>
          <div className={`${CONTENEDOR} grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-14`}>
            <div>
              <Eyebrow>FAQ</Eyebrow>
              <h2 id="faq-titulo" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
                Preguntas frecuentes
              </h2>
              <p className="mt-4 text-marca-suave">
                ¿Tienes otra duda?{' '}
                <CtaLink href={enlaceWhatsApp(MENSAJES_WHATSAPP.pregunta) ?? '#contacto'} variante="texto" ubicacion="faq" className="text-base underline underline-offset-2">
                  Escríbenos.
                </CtaLink>
              </p>
            </div>
            <FAQAccordion preguntas={PREGUNTAS} />
          </div>
        </section>

        <FounderProgram />
      </main>

      <Footer />
    </div>
  )
}

/** Ficha de una función de IA real (formato Usa / Genera / Se registra en / Tú revisas). */
function FichaIA() {
  const { ficha } = IA
  return (
    <figure className="rounded-[20px] bg-white p-6 text-marca-tinta shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
      <figcaption className="flex flex-wrap items-center gap-2.5 text-sm font-bold">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-marca-600 text-white">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        {ficha.nombre}
        <span className="ml-auto">
          <Pill tono="marca">{ficha.estado}</Pill>
        </span>
      </figcaption>
      <blockquote className="my-4 rounded-xl bg-marca-100 p-3.5 text-sm text-marca-800">“{ficha.cita}”</blockquote>
      <dl className="grid grid-cols-1 overflow-hidden rounded-xl border border-marca-linea text-[13px] sm:grid-cols-[120px_minmax(0,1fr)]">
        {ficha.filas.map(({ campo, valor }, i) => {
          const borde = i < ficha.filas.length - 1 ? 'border-b border-marca-linea' : ''
          return (
            <div key={campo} className="contents">
              <dt className={`bg-[#faf8ff] px-3 py-2.5 text-[11px] uppercase tracking-[0.06em] text-marca-suave ${borde}`}>{campo}</dt>
              <dd className={`px-3 py-2.5 ${borde}`}>{valor}</dd>
            </div>
          )
        })}
      </dl>
      <div aria-hidden="true" className="mt-4 flex justify-end gap-2 text-[13px] font-semibold">
        <span className="rounded-[10px] border border-marca-linea px-3.5 py-2">{ficha.acciones[0]}</span>
        <span className="rounded-[10px] bg-marca-600 px-3.5 py-2 text-white">{ficha.acciones[1]}</span>
      </div>
    </figure>
  )
}

/** Foto, nombre y perfil del auditor; espacio reservado mientras el equipo no lo complete. */
function PerfilAuditor() {
  const { auditor, anios } = EXPERIENCIA
  return (
    <figure className="rounded-[22px] border border-marca-linea bg-white p-7 shadow-[0_30px_60px_-36px_rgba(91,33,182,0.6)]">
      {auditor.foto ? (
        <img
          src={auditor.foto}
          alt={auditor.nombre ? `Foto de ${auditor.nombre}` : 'Foto del auditor'}
          width={640}
          height={480}
          loading="lazy"
          className="aspect-[4/3] w-full rounded-2xl object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#d3c8f3] bg-[repeating-linear-gradient(135deg,#f7f4ff_0_12px,#fff_12px_24px)] text-xs tracking-[0.08em] text-[#8a80b3]">
          <UserRound className="h-8 w-8" aria-hidden="true" />
          FOTO DEL AUDITOR (PENDIENTE)
        </div>
      )}
      <figcaption>
        <p className="mt-5 text-lg font-semibold">{auditor.nombre ?? 'Nombre del auditor (pendiente)'}</p>
        <p className="text-sm text-marca-suave">{auditor.perfil ?? 'Auditor · Rol en AuditorYa · Credenciales'}</p>
        <div className="mt-5 flex items-baseline gap-3 border-t border-marca-linea pt-5">
          <Resaltado className="text-[2.6rem] font-extrabold tracking-tight">{anios.valor}</Resaltado>
          <span className="max-w-[10rem] text-sm leading-snug text-marca-suave">{anios.texto}</span>
        </div>
      </figcaption>
    </figure>
  )
}
