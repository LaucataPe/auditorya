/**
 * Eventos de analítica de la landing, sin proveedor atado.
 *
 * Cada evento se publica de dos formas:
 *  - `window.dataLayer.push({ event, ...props })` si existe un dataLayer (Google Tag Manager o similar).
 *  - `CustomEvent('auditorya:analitica')` en `window`, para conectar cualquier otro proveedor
 *    (Plausible, PostHog, Meta Pixel…) con un solo listener.
 *
 * Ver docs/landing.md → "Analítica".
 */

export type EventoAnalitica =
  | 'cta_click' // clic en un CTA (props: ubicacion, texto)
  | 'demo_click' // clic en "Explora el flujo de un encargo" (props: ubicacion)

export const EVENTO_ANALITICA_DOM = 'auditorya:analitica'

type Props = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
  }
}

/** Props que viajan con todos los eventos (p. ej. la variante del experimento del hero). */
const contexto: Props = {}

export function fijarContextoAnalitica(props: Props) {
  Object.assign(contexto, props)
}

export function rastrear(evento: EventoAnalitica, props: Props = {}) {
  const payload = { ...contexto, ...props }
  try {
    window.dataLayer?.push({ event: evento, ...payload })
    window.dispatchEvent(new CustomEvent(EVENTO_ANALITICA_DOM, { detail: { evento, ...payload } }))
  } catch {
    // La analítica nunca debe romper la página.
  }
  if (import.meta.env.DEV) console.debug('[analitica]', evento, payload)
}
