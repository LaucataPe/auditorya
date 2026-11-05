/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** Landing: URL pública (canónica y og:url). */
  readonly VITE_SITE_URL?: string
  /** Landing: URL de la política de tratamiento de datos (Ley 1581). */
  readonly VITE_POLITICA_DATOS_URL?: string
  /** Landing: fija la variante del titular del hero ('a' | 'b') para todos los visitantes. */
  readonly VITE_HERO_VARIANTE?: string
  /** Landing: términos de uso y correo de contacto del footer. */
  readonly VITE_TERMINOS_URL?: string
  readonly VITE_CONTACTO_EMAIL?: string
  /** Landing: WhatsApp de los CTA, con indicativo (p. ej. 573001234567). */
  readonly VITE_WHATSAPP?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
