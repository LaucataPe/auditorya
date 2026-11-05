/**
 * Contenido editable de la landing. Los componentes de `components/landing/` solo presentan:
 * para cambiar textos, ejemplos, preguntas o la persona del equipo, se edita este archivo.
 *
 * Regla: todo lo que diga esta página debe poder mostrarse en la plataforma hoy. Nada de
 * clientes, testimonios, métricas, precios, cupos ni certificaciones que no existan, y los
 * ejemplos de la interfaz solo muestran funciones implementadas.
 * Lo pendiente de completar antes de publicar está en docs/landing.md.
 */
import { Download, FileText, FolderOpen, Layers, ListChecks, Search, UserRound, type LucideIcon } from 'lucide-react'

// ─── Sitio / SEO ────────────────────────────────────────────────────────────

export const SITIO = {
  nombre: 'AuditorYa',
  lema: 'Plataforma de auditoría con IA',
  titulo: 'AuditorYa · Plataforma de auditoría con IA para revisores fiscales y firmas en Colombia',
  descripcion:
    'Organiza tus encargos de auditoría bajo NIA, conecta riesgos, pruebas, evidencias y conclusiones, y apóyate en la IA sin reemplazar tu criterio profesional.',
  /** URL pública de la landing (canónica y og:url). Sin definir, no se emite. */
  url: import.meta.env.VITE_SITE_URL as string | undefined,
  /** Política de tratamiento de datos (Ley 1581). Sin definir, no se enlaza. */
  politicaDatosUrl: import.meta.env.VITE_POLITICA_DATOS_URL as string | undefined,
  /** Términos de uso. Sin definir, no se enlaza. */
  terminosUrl: import.meta.env.VITE_TERMINOS_URL as string | undefined,
  /** Correo de contacto del footer. Sin definir, no se muestra. */
  correoContacto: import.meta.env.VITE_CONTACTO_EMAIL as string | undefined,
  /** WhatsApp de contacto: indicativo + número, p. ej. 573001234567. Sin definir, los CTA van a #contacto. */
  whatsapp: (import.meta.env.VITE_WHATSAPP as string | undefined)?.replace(/\D/g, '') || undefined,
}

/** Mensaje con el que se abre el chat de WhatsApp según el CTA. */
export const MENSAJES_WHATSAPP = {
  conocer: 'Hola, quiero conocer la plataforma AuditorYa.',
  fundador: 'Hola, quiero participar como firma fundadora de AuditorYa.',
  pregunta: 'Hola, tengo una pregunta sobre AuditorYa.',
}

/** Enlace wa.me con el mensaje prellenado, o null si no hay número configurado. */
export function enlaceWhatsApp(mensaje: string): string | null {
  return SITIO.whatsapp ? `https://wa.me/${SITIO.whatsapp}?text=${encodeURIComponent(mensaje)}` : null
}

// ─── CTA y experimento del hero ──────────────────────────────────────────────

export const ANCLA_CONTACTO = '#contacto'

export const CTA = {
  principal: 'Quiero conocer la plataforma',
  explorar: 'Explora el flujo de un encargo',
}

/**
 * Prueba A/B del titular: dos líneas, la segunda resaltada. En la primera prueba solo cambia
 * el titular; el CTA y el resto de la página son iguales. La asignación es estable por
 * visitante (ver hooks/useVarianteHero.ts).
 */
export const HERO_VARIANTES = {
  a: {
    titular: ['Cada encargo bajo control.', 'Cada conclusión, sustentada.'],
    cta: CTA.principal,
  },
  b: {
    titular: ['Deja de perseguir papeles de trabajo.', 'Organiza tu auditoría en un solo flujo.'],
    cta: CTA.principal,
  },
} as const satisfies Record<string, { titular: readonly [string, string]; cta: string }>

export type VarianteHero = keyof typeof HERO_VARIANTES

export const NAV = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#ia', label: 'IA' },
  { href: '#nosotros', label: 'Quiénes somos' },
  { href: '#faq', label: 'Preguntas' },
]

/**
 * Titular con una parte resaltada en violeta (degradado). `antes` va en tinta normal y
 * `resaltado` con degradado; `salto` pone el resaltado en una línea aparte.
 */
export type TituloResaltado = { antes: string; resaltado: string; salto?: boolean }

// ─── Hero ───────────────────────────────────────────────────────────────────

export const HERO = {
  etiqueta: 'Para revisores fiscales y firmas de auditoría',
  subtitulo:
    'Organiza tus encargos de auditoría bajo NIA, conecta riesgos, pruebas, evidencias y conclusiones, y aprovecha la IA para apoyar tu análisis sin reemplazar tu criterio profesional.',
  notaCta: 'Solicita una demostración o postula tu firma.',
  preguntaExplorar: '¿Quieres ver cómo funciona?',
}

/**
 * Captura real del hero. Mientras sea null se muestra `AppMockup` (interfaz de ejemplo hecha
 * en HTML con datos ficticios). Para usar la real: guardarla en src/assets/landing/, importarla
 * aquí y ajustar ancho/alto a sus dimensiones.
 */
export const CAPTURA_HERO: { src: string | null; alt: string; ancho: number; alto: number } = {
  src: null,
  alt: 'Espacio de trabajo de un encargo en AuditorYa: fases, riesgos, pruebas, evidencias, conclusiones y asistente de IA.',
  ancho: 1600,
  alto: 1000,
}

/** Datos ficticios del mockup del hero. Solo funciones que existen en la plataforma. */
export const MOCKUP_APP = {
  menu: ['Encargos', 'Riesgos', 'Pruebas', 'Documentos (PBC)', 'Papeles de trabajo', 'Informes'],
  clientes: ['[Cliente A] S.A.S.', '[Cliente B] Ltda.', '[Cliente C] S.A.'],
  encargo: 'Revisoría fiscal · Cierre 2025',
  fases: [
    { label: '1 · Planea ✓', estado: 'hecha' },
    { label: '2 · Ejecuta', estado: 'activa' },
    { label: '3 · Informa', estado: 'pendiente' },
    { label: '4 · Cierra', estado: 'pendiente' },
  ] as const,
  columnas: [
    {
      titulo: 'Riesgos',
      items: [
        { texto: 'Corte de ventas', pill: 'Alto', tono: 'alto' },
        { texto: 'Valoración de inventarios', pill: 'Medio', tono: 'medio' },
      ],
    },
    {
      titulo: 'Pruebas',
      items: [
        { texto: 'Corte de facturación', pill: 'En curso', tono: 'marca' },
        { texto: 'Observación de conteo', pill: 'Planeada', tono: 'medio' },
      ],
    },
    {
      titulo: 'Evidencias',
      items: [
        { texto: 'Facturas dic. 2025', pill: 'Recibido', tono: 'bajo' },
        { texto: 'Acta de conteo', pill: 'Solicitado', tono: 'medio' },
      ],
    },
    {
      titulo: 'Conclusiones',
      items: [{ texto: 'Ingresos · papel I-3', pill: 'Por aprobar', tono: 'marca' }],
    },
  ] as const,
  asistente: [
    {
      texto: 'La IA sugiere 6 riesgos para este encargo a partir del sector, el entendimiento y el balance.',
      nota: 'Sugerencia · requiere tu revisión',
      acciones: true,
    },
    { texto: 'Borrador de conclusión listo para el papel I-3.', nota: 'Borrador · edítalo antes de guardar', acciones: false },
  ],
}

// ─── Problema ───────────────────────────────────────────────────────────────

export type Tarjeta = { icon: LucideIcon; titulo: string; texto: string }

export const PROBLEMA = {
  titulo: { antes: 'El problema no es hacer la auditoría.', resaltado: 'Es mantener conectado todo el trabajo.', salto: true },
  bajada:
    'Cuando llevas varios encargos al mismo tiempo, la documentación y la supervisión pueden volverse un trabajo adicional.',
  tarjetas: [
    {
      icon: FolderOpen,
      titulo: 'Papeles de trabajo dispersos',
      texto: 'Excel, Word, carpetas y plantillas que dificultan mantener una visión integral del encargo.',
    },
    {
      icon: Search,
      titulo: 'Documentación difícil de revisar',
      texto: 'Encontrar qué falta, qué se hizo y dónde está el soporte puede requerir revisiones adicionales.',
    },
    {
      icon: Layers,
      titulo: 'Herramientas que agregan trabajo',
      texto: 'Formatos que no se conectan con el resto del encargo y terminan obligando a documentar dos veces.',
    },
  ] satisfies Tarjeta[],
}

// ─── Cómo funciona (hilo dorado) ─────────────────────────────────────────────

export type Tono = 'alto' | 'medio' | 'bajo' | 'marca'
export type Celda = string | { pill: string; tono: Tono }

export type Etapa = {
  titulo: string
  normas: string
  texto: string
  tabla: { titulo: string; etiqueta: string; columnas: string[]; filas: Celda[][]; pie?: string }
}

export const COMO_FUNCIONA = {
  eyebrow: 'Cómo funciona',
  titulo: { antes: 'Un encargo conectado', resaltado: 'de principio a fin.' },
  bajada:
    'El valor no está solo en tener los documentos en un mismo lugar, sino en poder seguir el razonamiento del encargo y entender qué sustenta cada etapa.',
  etapas: [
    {
      titulo: 'Riesgo',
      normas: 'NIA 315',
      texto:
        'Identificas los riesgos por área con su nivel y la respuesta planeada. Puedes partir de sugerencias de la IA o del catálogo del sector.',
      tabla: {
        titulo: 'Matriz de riesgos',
        etiqueta: 'NIA 315',
        columnas: ['Riesgo', 'Área', 'Nivel', 'Respuesta'],
        filas: [
          ['R-01 · Corte de ventas al cierre', 'Ingresos', { pill: 'Alto', tono: 'alto' }, '2 pruebas'],
          ['R-02 · Valoración de inventarios', 'Inventarios', { pill: 'Medio', tono: 'medio' }, '1 prueba'],
          ['R-03 · Deterioro de cartera', 'Cartera', { pill: 'Medio', tono: 'medio' }, '1 prueba'],
          ['R-04 · Prestaciones sociales', 'Nómina', { pill: 'Bajo', tono: 'bajo' }, '1 prueba'],
        ],
      },
    },
    {
      titulo: 'Prueba',
      normas: 'NIA 330 · 500',
      texto:
        'Desde cada riesgo diseñas las pruebas con apoyo de un catálogo estándar. Al crearlas, la plataforma arma la lista de documentos que hay que pedirle al cliente.',
      tabla: {
        titulo: 'Pruebas · R-01 Corte de ventas',
        etiqueta: 'NIA 330',
        columnas: ['Prueba', 'Responsable', 'Estado', 'Documentos'],
        filas: [
          ['Corte de facturación (últimos 5 días)', '[Asistente 1]', { pill: 'En curso', tono: 'marca' }, '2 pedidos'],
          ['Conciliación ventas vs. despachos', '[Asistente 2]', { pill: 'Planeada', tono: 'medio' }, '1 pedido'],
        ],
        pie: 'Los documentos se piden al cliente desde la misma prueba.',
      },
    },
    {
      titulo: 'Evidencia',
      normas: 'NIA 500 · 230',
      texto:
        'Cuando marcas un documento como recibido, queda adjunto como evidencia del papel de trabajo, con acceso privado por enlaces temporales.',
      tabla: {
        titulo: 'Documentos solicitados al cliente',
        etiqueta: 'PBC',
        columnas: ['Documento', 'Prueba', 'Estado'],
        filas: [
          ['Facturas de venta dic. 2025', 'Corte de facturación', { pill: 'Recibido · en papel I-3', tono: 'bajo' }],
          ['Remisiones de despacho', 'Corte de facturación', { pill: 'Solicitado', tono: 'medio' }],
          ['Auxiliar de ventas', 'Conciliación', { pill: 'Solicitado', tono: 'medio' }],
        ],
      },
    },
    {
      titulo: 'Conclusión',
      normas: 'NIA 230 · 220',
      texto:
        'Documentas la conclusión en el papel de trabajo. El socio la revisa con notas de revisión y es quien la aprueba.',
      tabla: {
        titulo: 'Papel I-3 · Ingresos',
        etiqueta: 'Por aprobar',
        columnas: ['Campo', 'Contenido'],
        filas: [
          ['Riesgo', 'R-01 · Corte de ventas al cierre'],
          ['Evidencia', 'Facturas de venta dic. 2025'],
          ['Conclusión', 'No se identificaron diferencias de corte significativas.'],
          ['Revisión', '1 nota del socio abierta'],
        ],
        pie: 'Solo el socio responsable puede aprobar el papel.',
      },
    },
  ] satisfies Etapa[],
}

// ─── IA ─────────────────────────────────────────────────────────────────────

export const IA = {
  eyebrow: 'Inteligencia artificial',
  titulo: ['IA para apoyar el análisis.', 'Tú mantienes el control.'],
  bajada:
    'No necesitas delegar tu criterio para aprovechar la IA. Está integrada al flujo, de modo que su aporte se revisa en el contexto del encargo.',
  criteriosTitulo: ['Cada función, explicada con claridad.', 'Así se presenta cada una:'],
  criterios: [
    { icon: Download, texto: 'Qué información utiliza.' },
    { icon: ListChecks, texto: 'Qué resultado genera.' },
    { icon: FileText, texto: 'Dónde queda registrado.' },
    { icon: UserRound, texto: 'Qué debe revisar el profesional.' },
  ],
  advertencia: 'La IA puede equivocarse. Todo lo que propone llega como sugerencia o borrador para tu revisión.',
  ficha: {
    nombre: 'Sugerencia de riesgos · NIA 315',
    estado: 'Función disponible',
    cita: 'La IA analiza el contexto del encargo para proponer riesgos de incorrección material. Tú decides cuáles entran a la matriz.',
    filas: [
      { campo: 'Usa', valor: 'Sector, entendimiento del cliente y balance de prueba (si está cargado)' },
      { campo: 'Genera', valor: '5 a 10 riesgos con área, nivel inherente y respuesta planeada' },
      { campo: 'Se registra en', valor: 'Matriz de riesgos del encargo · pista de auditoría con fecha y autor' },
      { campo: 'Tú revisas', valor: 'Que cada riesgo aplique, su nivel y que la respuesta sea suficiente' },
    ],
    acciones: ['Descartar', 'Agregar a la matriz'],
  },
}

// ─── Quiénes somos ──────────────────────────────────────────────────────────

export const EXPERIENCIA = {
  eyebrow: 'Quiénes somos',
  titulo: { antes: 'Experiencia de auditoría', resaltado: 'aplicada al desarrollo del producto.' },
  texto:
    'La plataforma se está construyendo junto a un auditor con más de 20 años de experiencia, con el objetivo de responder a los desafíos reales de quienes gestionan y supervisan encargos.',
  frase: ['No se trata de agregar IA por agregarla.', 'Se trata de integrarla donde puede apoyar el trabajo profesional.'],
  anios: { valor: '20+', texto: 'años de experiencia en auditoría' },
  /** Completar con la información que apruebe el equipo. Mientras falte, se ve un espacio reservado. */
  auditor: {
    nombre: null as string | null,
    /** Ej.: 'Auditor · Rol en AuditorYa · Credenciales' */
    perfil: null as string | null,
    /** Importar desde src/assets/landing/. */
    foto: null as string | null,
  },
}

// ─── Preguntas frecuentes ───────────────────────────────────────────────────

export const PREGUNTAS = [
  {
    pregunta: '¿Para quién está diseñada la plataforma?',
    respuesta:
      'Para revisores fiscales independientes y firmas de auditoría pequeñas y medianas en Colombia, con equipos de unas 2 a 20 personas que manejan varios encargos en paralelo y hoy trabajan con Excel, Word, carpetas compartidas o plantillas propias.',
  },
  {
    pregunta: '¿La plataforma reemplaza mi criterio profesional?',
    respuesta:
      'No. La plataforma organiza el trabajo y la IA propone sugerencias y borradores, pero tú decides qué se incorpora al encargo. La aprobación de los papeles de trabajo y del dictamen queda en manos del socio responsable.',
  },
  {
    pregunta: '¿Qué etapas del encargo están disponibles?',
    respuesta:
      'En revisoría fiscal: aceptación del encargo, planeación, ejecución, informes (dictamen, carta de control interno y carta de representaciones) y cierre. En auditoría interna: alcance, programas de trabajo, hallazgos con su seguimiento e informe.',
  },
  {
    pregunta: '¿La IA puede equivocarse?',
    respuesta:
      'Sí. Por eso todo lo que propone llega como sugerencia o borrador: los riesgos sugeridos solo entran a la matriz si los seleccionas y los textos se pueden editar antes de guardar. En la lectura de declaraciones DIAN, la plataforma verifica que los totales cuadren para detectar lecturas erróneas.',
  },
  {
    pregunta: '¿Qué pasa con la confidencialidad de los documentos?',
    respuesta:
      'Cada firma ve solo su propia información. Los archivos de evidencia nunca son públicos: se abren con enlaces firmados que vencen a los 15 minutos, y las acciones relevantes quedan en una pista de auditoría. Cuando usas una función de IA, el contexto necesario para responder se envía al proveedor del modelo.',
  },
]

// ─── Programa fundador (cierre + formulario) ────────────────────────────────

export const PROGRAMA = {
  titulo: { antes: 'Ayúdanos a construir la herramienta que', resaltado: 'tu firma necesita.' },
  texto:
    'Buscamos revisores fiscales y firmas de auditoría pequeñas y medianas en Colombia que quieran probar una nueva forma de gestionar sus encargos y aportar su experiencia al desarrollo del producto.',
  /** Botón del cierre: abre WhatsApp (o un correo si no hay número; ver FounderProgram). */
  cta: 'Quiero participar como firma fundadora',
  asuntoCorreo: 'Programa fundador AuditorYa',
}
