# Landing pública (`/`)

Landing orientada a conseguir contactos de firmas para el **programa fundador**. Vive en el frontend Vite
(no es una app aparte): `pages/LandingPage.tsx` arma las secciones con los componentes de
`components/landing/`.

| Pieza | Archivo |
|---|---|
| Contenido editable (textos, ejemplos de la interfaz, FAQ, persona del equipo) | `components/landing/contenido.ts` |
| Componentes | `Navbar`, `Hero` (+ `AppMockup`), `FeatureCard`, `WorkflowDiagram` (pasos navegables), `ProductScreenshot`, `FAQAccordion`, `FounderProgram` (cierre con botón de contacto), `Footer`, `CtaLink`, `Tipografia` |
| Colores de marca | `marca.*` en `tailwind.config.ts` |
| Analítica | `lib/analitica.ts` |
| Experimento A/B del titular | `hooks/useVarianteHero.ts` + `HERO_VARIANTES` en `contenido.ts` |

Orden de la página: hero (con mockup de la app) → problema → cómo funciona (riesgo → prueba →
evidencia → conclusión) → IA (banda oscura, ficha de la sugerencia de riesgos) → quiénes somos →
preguntas frecuentes → programa fundador (`#contacto`).

Estilo: fondo lavanda (`marca-fondo`) con bandas alternas (`marca-banda`), luces difusas solo en
violeta y degradado de texto violeta oscuro → violeta (`Resaltado`). Sin rosados.

Regla de contenido: todo lo que diga la página debe poder mostrarse hoy en la plataforma. Nada de
clientes, testimonios, métricas, precios, cupos, descuentos ni certificaciones inventadas.

## Variables de entorno (`packages/frontend/.env`)

```
VITE_SITE_URL=            # URL pública de la landing → <link rel="canonical"> y og:url
VITE_POLITICA_DATOS_URL=  # política de tratamiento de datos → enlace en el consentimiento y el footer
VITE_HERO_VARIANTE=       # 'a' | 'b' para fijar una variante a todos (al terminar la prueba)
VITE_TERMINOS_URL=        # términos de uso → enlace "Términos" del footer
VITE_CONTACTO_EMAIL=      # correo de contacto: footer y botón "Quiero participar como firma fundadora"
VITE_WHATSAPP=            # WhatsApp de los CTA con indicativo (573001234567); abre wa.me con un mensaje prellenado
```

Son variables de build: se leen al compilar, así que cambiarlas exige un nuevo `pnpm build`.

## Analítica

`rastrear(evento, props)` publica cada evento en `window.dataLayer` (si existe) y como
`CustomEvent('auditorya:analitica')` en `window`. Todos llevan `varianteHero`.

| Evento | Cuándo | Props |
|---|---|---|
| `cta_click` | clic en un CTA | `ubicacion` (navbar, menu_movil, hero, faq, cta_final), `texto` |
| `demo_click` | clic en "Explora el flujo de un encargo" | `ubicacion` |

- **Google Tag Manager / GA4:** agregar el snippet de GTM en `index.html`; los eventos ya llegan
  al `dataLayer` con `event: <nombre>`. Crear en GTM los activadores por evento personalizado.
- **Otro proveedor** (Plausible, PostHog, Meta Pixel…): un listener de una línea, por ejemplo
  `window.addEventListener('auditorya:analitica', (e) => plausible(e.detail.evento, { props: e.detail }))`.
- En desarrollo cada evento sale también en la consola (`[analitica]`).

## Experimento A/B del titular

- Variantes en `HERO_VARIANTES` (`contenido.ts`). En la primera prueba solo cambia el titular; el CTA
  y el resto de la página son iguales.
- Asignación estable por navegador (localStorage), 50/50. Se puede forzar con `?variante=a` o
  `?variante=b` (QA, o para enlazar una campaña a una variante) o para todos con `VITE_HERO_VARIANTE`.
- La variante viaja en todos los eventos de analítica, así que los clics en los CTA se pueden
  comparar por variante.

## Capturas del producto

Mientras `CAPTURA_HERO.src` sea `null`, el hero muestra `AppMockup`: una interfaz de ejemplo hecha
en HTML con datos ficticios (`MOCKUP_APP` en `contenido.ts`) que solo muestra funciones reales. Para
poner una captura real en su lugar:

1. Guardar la imagen en `src/assets/landing/` (WebP o PNG, unos 1600 px de ancho).
2. En `contenido.ts`: `import capturaHero from '../../assets/landing/hero.webp'` y asignar `src: capturaHero`.
3. Ajustar `ancho`/`alto` a las dimensiones reales (evitan saltos de layout) y revisar el `alt`.

Usar datos de ejemplo, nunca de clientes reales.

## Pendiente antes de publicar

- [ ] Decidir si el hero se queda con el mockup en HTML o pasa a una captura real del producto.
- [ ] **Perfil del auditor** (`EXPERIENCIA.auditor`): nombre, perfil aprobado y foto, con su autorización.
- [ ] **Política de tratamiento de datos** (Ley 1581) publicada y su URL en `VITE_POLITICA_DATOS_URL`;
      confirmar con quien asesore en lo legal el texto del consentimiento y el nombre del responsable del tratamiento.
- [ ] **WhatsApp** (`VITE_WHATSAPP`) en `.env.production`: sin él, los CTA bajan a `#contacto` y el botón del cierre usa el correo o no lleva a ningún lado.
- [ ] **Términos y correo de contacto** (`VITE_TERMINOS_URL`, `VITE_CONTACTO_EMAIL`); sin ellos el footer no los muestra.
- [ ] **Dominio** (`VITE_SITE_URL`) y **imagen Open Graph** 1200×630 (`og:image` con URL absoluta en `index.html`).
- [ ] **Proveedor de analítica** y su snippet.
- [ ] Revisar con el equipo las respuestas de la FAQ, en especial "¿Qué puedo hacer actualmente?" y
      "Confidencialidad" (dice que el contexto de las funciones de IA se envía al proveedor del modelo).
- [ ] Revisar que las funciones de IA listadas estén activas en producción (`OPENROUTER_API_KEY`
      configurada; lectura DIAN vía n8n o LLM).

## Rendimiento y SEO

- **División por rutas:** en `App.tsx` solo la landing se importa directo; el resto de páginas y
  layouts usan `React.lazy` y se descargan al entrar a esa ruta. Primera visita a `/`: ~138 KB
  transferidos (antes ~460 KB solo de JS+CSS). Al agregar una página nueva, declararla con `lazy()`
  y envolverla en `<L c={…} />`, no con import directo.
- **Imágenes:** el isotipo y el logo se sirven en WebP (`src/assets/*.webp`, generados con
  `cwebp -q 90 -alpha_q 100`); los PNG originales quedan como fuente. Favicon de 64 px
  (`public/favicon-64.png`) en lugar del original de 1038 px.
- **Fuente:** Inter se pide desde `index.html` (preconnect + stylesheet), no con `@import` en el CSS.
- **`public/robots.txt`** permite todo; falta la línea `Sitemap:` y el `sitemap.xml` cuando haya dominio.
- **Pendiente (SEO de verdad):** prerender de `/` a HTML estático en el build, para que buscadores y
  redes reciban el contenido sin ejecutar JavaScript.
