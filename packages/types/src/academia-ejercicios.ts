/**
 * Ejercicios del caso de AuditorYa Academia: lo que hace el auditor en cada lección que no tiene
 * playground. Cuatro tipos: decidir, completar un documento (descargable), calcular y clasificar.
 * La evaluación es determinista (funciones de abajo) para que cada respuesta tenga su porqué.
 *
 * Las cifras salen de academia-caso.ts y del expediente del cliente (EXPEDIENTE_CASO).
 */
import type { PersonajeId } from './academia-caso'

type EjercicioBase = {
  titulo: string
  /** Quién pide el ejercicio dentro de la historia. */
  deQuien: PersonajeId
  mensaje: string
  /** Documentos del expediente que conviene revisar (ids de EXPEDIENTE_CASO; 'balance' = balance de prueba). */
  expediente?: string[]
  /** Se muestra al resolverlo: la idea que debe quedar. */
  cierre: string
}

export type OpcionDecision = { texto: string; correcta: boolean; feedback: string }

export type CampoDocumento = {
  id: string
  etiqueta: string
  tipo: 'texto' | 'textoLargo' | 'opcion'
  opciones?: string[]
  ayuda?: string
  /** Si se indica, la respuesta debe contener alguno de estos valores (sin tildes, mayúsculas, puntos ni espacios). */
  esperado?: string[]
  /** Pista cuando la respuesta no coincide con lo esperado. */
  pista?: string
}

export type ItemCalculo = {
  id: string
  enunciado: string
  respuesta: number
  unidad: 'millones' | 'horas' | '%' | 'veces'
  /** Diferencia aceptada (por defecto 0,5 % de la respuesta). */
  tolerancia?: number
  pista: string
}

export type ItemClasificacion = { id: string; texto: string; correcta: string; explicacion: string }

export type EjercicioCaso = EjercicioBase &
  (
    | { tipo: 'decision'; pregunta: string; opciones: OpcionDecision[] }
    | {
        tipo: 'documento'
        documento: {
          titulo: string
          nombreArchivo: string
          campos: CampoDocumento[]
          /** El texto lleva {{idCampo}} donde va lo que escribe el auditor. */
          secciones: { titulo: string; texto: string }[]
        }
      }
    | {
        tipo: 'calculo'
        items: ItemCalculo[]
        /** Reparto de una cifra: las respuestas deben sumar `valor` y la tabla muestra el total al pie. */
        total?: { etiqueta: string; valor: number }
      }
    | { tipo: 'clasificar'; instruccion: string; categorias: string[]; items: ItemClasificacion[] }
  )

export type TipoEjercicio = EjercicioCaso['tipo']

// ─── Evaluación ──────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes y sin nada que no sea letra o número: «$25.000.000» → «25000000». */
export function normalizarRespuesta(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Error de cada campo del documento (null si está bien). */
export function evaluarDocumento(
  campos: CampoDocumento[],
  valores: Record<string, string>,
): Record<string, string | null> {
  const r: Record<string, string | null> = {}
  for (const c of campos) {
    const v = (valores[c.id] ?? '').trim()
    if (v.length < 2) {
      r[c.id] = 'Completa este campo'
    } else if (c.esperado && !c.esperado.some((e) => normalizarRespuesta(v).includes(normalizarRespuesta(e)))) {
      r[c.id] = c.pista ?? 'Revisa este dato contra el expediente'
    } else {
      r[c.id] = null
    }
  }
  return r
}

export function llenarPlantilla(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, id: string) => (valores[id] ?? '').trim() || '______')
}

/** Convierte lo que escribe el usuario en número: acepta «105», «105,5», «1.000», «-95». */
export function leerNumero(s: string): number | null {
  const limpio = s.trim().replace(/\s/g, '').replace(/\$/g, '')
  if (!limpio) return null
  // «1.000» o «1.000.000» → miles con punto; «10,5» → decimal con coma.
  const normal = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(',', '.')
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

export function evaluarCalculo(item: ItemCalculo, valor: string): boolean {
  const n = leerNumero(valor)
  if (n === null) return false
  const tolerancia = item.tolerancia ?? Math.max(Math.abs(item.respuesta) * 0.005, 0.01)
  return Math.abs(n - item.respuesta) <= tolerancia
}

// ─── Ejercicios por lección ──────────────────────────────────────────────────

const SOCIA = 'socia' as const

export const EJERCICIOS_CASO: Record<string, EjercicioCaso> = {
  // ── Inducción ──
  '0.1': {
    tipo: 'decision',
    titulo: 'Antes de empezar',
    deQuien: SOCIA,
    mensaje: 'Bienvenido al equipo. Antes de mandarte al cliente quiero estar segura de que entendiste cómo vamos a trabajar.',
    pregunta: '¿Qué necesitas para que se abra la siguiente lección?',
    opciones: [
      { texto: 'Abrir cada lección y pasar a la siguiente cuando quieras.', correcta: false, feedback: 'No: el curso se recorre en orden y cada lección exige demostrar que la entendiste.' },
      { texto: 'Aprobar un examen final al terminar todas las fases.', correcta: false, feedback: 'No hay examen final: el avance se gana lección por lección, con el checkpoint de cada fase.' },
      { texto: 'Leer la teoría, pulsar «Ya lo entendí» y hacer su ejercicio.', correcta: true, feedback: 'Exacto: la teoría y su ejercicio del caso (o la práctica en AuditorYa). Y al cerrar cada fase hay un checkpoint con un quiz de cinco preguntas: necesitas 4 correctas para pasar a la siguiente.' },
    ],
    cierre: 'Cada lección tiene teoría y un ejercicio sobre la Comercializadora. Tu avance se guarda en este navegador.',
  },
  '0.2': {
    tipo: 'clasificar',
    titulo: 'Primera impresión del cliente',
    deQuien: SOCIA,
    mensaje: 'Revisa el expediente y dime qué te llama la atención. En la reunión de mañana quiero llegar con las alertas claras.',
    expediente: ['camara', 'renuncia', 'acta-018', 'correo-gerente'],
    instruccion: 'Clasifica cada hecho del cliente.',
    categorias: ['Señal de alerta', 'Normal'],
    items: [
      { id: 'renuncia', texto: 'El revisor fiscal anterior dictaminó 2025 con salvedades por el inventario y luego renunció por diferencias con la administración.', correcta: 'Señal de alerta', explicacion: 'Un desacuerdo sobre cifras con la administración es justo lo que hay que indagar antes de aceptar. Además, el inventario inicial de 2026 llega sin verificar.' },
      { id: 'gerente', texto: 'El gerente es también el accionista mayoritario (85 %).', correcta: 'Señal de alerta', explicacion: 'Concentra el poder: aumenta el riesgo de que la dirección eluda los controles (NIA 240).' },
      { id: 'grupo2', texto: 'La empresa aplica NIIF para las PYMES (Grupo 2).', correcta: 'Normal', explicacion: 'Es el marco que corresponde a su tamaño: no es una alerta.' },
      { id: 'arriendo', texto: 'La sociedad arrienda una bodega que es propiedad del gerente.', correcta: 'Señal de alerta', explicacion: 'Es una transacción con parte relacionada: hay que verificar precio y revelación (NIA 550).' },
      { id: 'correo', texto: 'El gerente pide que no se revise tanto el inventario.', correcta: 'Señal de alerta', explicacion: 'Presionar para limitar el trabajo en un área es una señal de riesgo de fraude: escepticismo profesional.' },
      { id: 'matricula', texto: 'La matrícula mercantil está renovada.', correcta: 'Normal', explicacion: 'Cumplimiento básico, sin alerta.' },
      { id: 'estatutos', texto: 'La empresa no alcanza los topes legales de revisoría fiscal, pero sus estatutos la exigen.', correcta: 'Normal', explicacion: 'Los estatutos pueden crear el cargo. Una vez creado, el revisor fiscal tiene las funciones y responsabilidades del Código de Comercio (arts. 203 a 217).' },
    ],
    cierre: 'Cuatro alertas desde el primer día: cambio de revisor por desacuerdos, dirección concentrada, parte relacionada y presión sobre el alcance. Las vas a ver reaparecer en todo el curso.',
  },

  // ── Fase 1 · Aceptación ──
  '1.1': {
    tipo: 'clasificar',
    titulo: 'Verifica la ficha del cliente',
    deQuien: SOCIA,
    mensaje: 'Arma la ficha de la Comercializadora con el certificado de Cámara de Comercio. Dime qué está resuelto y qué falta investigar.',
    expediente: ['camara'],
    instruccion: '¿El dato ya está verificado con el certificado o falta otra consulta?',
    categorias: ['Verificado en el certificado', 'Falta consultarlo'],
    items: [
      { id: 'nit', texto: 'NIT y razón social', correcta: 'Verificado en el certificado', explicacion: 'Están en el certificado vigente.' },
      { id: 'rl', texto: 'Facultades del representante legal', correcta: 'Verificado en el certificado', explicacion: 'El certificado dice que no tiene limitaciones de cuantía.' },
      { id: 'listas', texto: 'Que socios y administradores no estén en listas ONU/OFAC', correcta: 'Falta consultarlo', explicacion: 'El certificado no lo dice: hay que consultar las listas y guardar el soporte con fecha.' },
      { id: 'accionistas', texto: 'Composición accionaria', correcta: 'Verificado en el certificado', explicacion: 'Andrés 85 % y Lucía 15 %. Ojo: Lucía es su hermana, otra parte relacionada.' },
      { id: 'insolvencia', texto: 'Procesos de insolvencia o investigaciones', correcta: 'Falta consultarlo', explicacion: 'Se consulta en la Superintendencia de Sociedades y en prensa.' },
    ],
    cierre: 'El certificado responde quién es el cliente; las listas restrictivas y los antecedentes se consultan aparte y se archivan con fecha.',
  },
  '1.2': {
    tipo: 'documento',
    titulo: 'Firma tu declaración de independencia',
    deQuien: SOCIA,
    mensaje: 'Antes de tocar un papel del cliente necesito tu declaración de independencia firmada. Llénala con tus datos y los del encargo.',
    expediente: ['camara'],
    documento: {
      titulo: 'Declaración de independencia',
      nombreArchivo: 'Declaracion_independencia',
      campos: [
        { id: 'nombre', etiqueta: 'Tu nombre completo', tipo: 'texto' },
        { id: 'cliente', etiqueta: 'Cliente del encargo', tipo: 'texto', esperado: ['comercializadora ejemplo'], pista: 'Es la Comercializadora Ejemplo S.A.S.' },
        { id: 'nit', etiqueta: 'NIT del cliente', tipo: 'texto', esperado: ['900000000'], pista: 'Míralo en el certificado de Cámara de Comercio.' },
        { id: 'periodo', etiqueta: 'Período auditado', tipo: 'texto', esperado: ['2026'], pista: 'Auditas el año 2026.' },
        {
          id: 'relaciones', etiqueta: 'Relaciones con el cliente, sus socios o administradores', tipo: 'opcion',
          opciones: ['No tengo relaciones financieras, familiares ni laborales con el cliente, sus socios o administradores.', 'Tengo una relación que debo informar.'],
          esperado: ['no tengo relaciones'], pista: 'Para este ejercicio, asume que no tienes ninguna relación.',
        },
        {
          id: 'servicios', etiqueta: 'Servicios prestados al cliente', tipo: 'opcion',
          opciones: ['No he llevado su contabilidad ni prestado servicios incompatibles en los últimos dos años.', 'Llevé su contabilidad en el último año.'],
          esperado: ['no he llevado'], pista: 'Llevar la contabilidad que vas a auditar es autorrevisión: te inhabilita.',
        },
      ],
      secciones: [
        { titulo: 'Declaración', texto: 'Yo, {{nombre}}, miembro del equipo de Rendón & Asociados Auditores S.A.S. asignado a la revisoría fiscal de {{cliente}} (NIT {{nit}}) por el período {{periodo}}, declaro que:' },
        { titulo: 'Relaciones', texto: '{{relaciones}}' },
        { titulo: 'Servicios', texto: '{{servicios}}' },
        { titulo: 'Compromiso', texto: 'Me comprometo a informar a la socia del encargo cualquier cambio en estas circunstancias durante el encargo, conforme al Código de Ética IESBA y al artículo 205 del Código de Comercio.' },
      ],
    },
    cierre: 'La independencia se declara por persona y por encargo, cada año. Si algo cambia a mitad del trabajo, se informa de inmediato.',
  },
  '1.3': {
    tipo: 'calculo',
    titulo: 'Reparte el presupuesto de horas',
    deQuien: SOCIA,
    mensaje: 'Aprobé 400 horas para el encargo. Repártelas con nuestra regla práctica: 15 % aceptación y planeación, 60 % ejecución, 15 % informe y 10 % cierre.',
    total: { etiqueta: 'Horas aprobadas por la socia', valor: 400 },
    items: [
      { id: 'plan', enunciado: 'Aceptación y planeación (15 %)', respuesta: 60, unidad: 'horas', pista: '400 × 15 %' },
      { id: 'ejec', enunciado: 'Ejecución (60 %)', respuesta: 240, unidad: 'horas', pista: '400 × 60 %' },
      { id: 'inf', enunciado: 'Informe (15 %)', respuesta: 60, unidad: 'horas', pista: '400 × 15 %' },
      { id: 'cierre', enunciado: 'Cierre (10 %)', respuesta: 40, unidad: 'horas', pista: '400 × 10 %' },
    ],
    cierre: 'Con un inventario de 318 M y un riesgo en el costo, probablemente la ejecución necesite más horas: la regla es el punto de partida y se ajusta al riesgo.',
  },
  '1.4': {
    tipo: 'documento',
    titulo: 'Escribe al revisor fiscal anterior',
    deQuien: SOCIA,
    mensaje: 'El gerente ya autorizó por escrito que contactemos a Héctor Salazar. Prepara la carta: quiero saber exactamente qué pasó con el inventario y el costo de ventas de 2025.',
    expediente: ['renuncia'],
    documento: {
      titulo: 'Comunicación con el auditor predecesor',
      nombreArchivo: 'Carta_revisor_anterior',
      campos: [
        { id: 'destinatario', etiqueta: 'Destinatario', tipo: 'texto', esperado: ['hector salazar'], pista: 'La carta va al revisor fiscal anterior: revisa quién firmó la renuncia.' },
        { id: 'cliente', etiqueta: 'Cliente', tipo: 'texto', esperado: ['comercializadora ejemplo'], pista: 'Es la Comercializadora Ejemplo S.A.S.' },
        { id: 'motivo', etiqueta: 'Asunto que motivó la renuncia (según su carta)', tipo: 'textoLargo', esperado: ['costo'], pista: 'Su carta habla de las diferencias sobre el inventario y el costo de ventas de 2025, que terminaron en una opinión con salvedades.' },
        {
          id: 'autorizacion', etiqueta: 'Autorización del cliente', tipo: 'opcion',
          opciones: ['Contamos con autorización escrita del representante legal para esta comunicación.', 'No es necesaria la autorización del cliente.'],
          esperado: ['contamos con autorizacion'], pista: 'Sin autorización del cliente el predecesor no puede responder: reserva profesional.',
        },
        { id: 'saldos', etiqueta: 'Qué papeles le pides revisar', tipo: 'textoLargo', esperado: ['saldo'], pista: 'Necesitas validar los saldos de apertura, empezando por el inventario de 210 M que él no pudo verificar (NIA 510).' },
      ],
      secciones: [
        { titulo: 'Destinatario', texto: 'Señor {{destinatario}}, Contador Público.' },
        { titulo: 'Asunto', texto: 'Hemos sido nombrados revisores fiscales de {{cliente}} para el período 2026. {{autorizacion}}' },
        { titulo: 'Consulta', texto: 'En su carta de renuncia usted menciona diferencias de criterio con la administración. Le agradecemos informarnos el detalle de: {{motivo}}. Asimismo, si conoce sospechas de fraude, limitaciones al alcance u honorarios pendientes que debamos considerar.' },
        { titulo: 'Papeles de trabajo', texto: 'Le solicitamos acceso a: {{saldos}}.' },
        { titulo: 'Firma', texto: 'Claudia Rendón, socia del encargo · Rendón & Asociados Auditores S.A.S.' },
      ],
    },
    cierre: 'La respuesta del predecesor es evidencia para aceptar el encargo y para validar los saldos de apertura. Si no responde, se deja constancia y se refuerzan las pruebas de los saldos iniciales.',
  },
  '1.5': {
    tipo: 'clasificar',
    titulo: 'Revisa las condiciones previas',
    deQuien: SOCIA,
    mensaje: 'Antes de firmar la carta de encargo repasa las condiciones de la NIA 210. ¿Cuáles ya están y cuáles faltan?',
    expediente: ['politicas', 'acta-018'],
    instruccion: '¿La condición ya se cumple o falta obtenerla antes de firmar?',
    categorias: ['Se cumple', 'Falta obtenerla'],
    items: [
      { id: 'marco', texto: 'Marco de información financiera aceptable identificado', correcta: 'Se cumple', explicacion: 'Las políticas dicen NIIF para las PYMES, Grupo 2.' },
      { id: 'resp', texto: 'Reconocimiento escrito de la dirección sobre su responsabilidad por los estados financieros', correcta: 'Falta obtenerla', explicacion: 'Debe quedar por escrito; normalmente va en la misma carta de encargo.' },
      { id: 'acceso', texto: 'Compromiso de acceso ilimitado a registros y personas', correcta: 'Falta obtenerla', explicacion: 'El correo del gerente pidiendo no revisar tanto el inventario hace aún más importante dejarlo pactado.' },
      { id: 'nombramiento', texto: 'Nombramiento como revisor fiscal por el órgano competente', correcta: 'Se cumple', explicacion: 'La asamblea lo hizo en el Acta 018.' },
    ],
    cierre: 'Si la dirección no acepta sus responsabilidades o limita el acceso, no se cumplen las condiciones previas y no se debe aceptar el encargo (NIA 210.8).',
  },
  '1.6': {
    tipo: 'decision',
    titulo: 'Decide sobre la aceptación',
    deQuien: SOCIA,
    mensaje: 'Ya tienes todo: alertas, independencia, horas, la carta al revisor anterior y las condiciones previas. ¿Qué me recomiendas firmar?',
    expediente: ['renuncia', 'acta-018', 'correo-gerente'],
    pregunta: 'Con lo que sabes de la Comercializadora, ¿cuál es tu recomendación?',
    opciones: [
      { texto: 'Aceptar con salvaguardas: más pruebas en costo e inventarios.', correcta: true, feedback: 'Correcto: riesgo medio. Las alertas no impiden aceptar, pero exigen una respuesta planeada y documentada, con el acceso ilimitado pactado por escrito.' },
      { texto: 'Aceptar sin salvaguardas: el cliente paga bien y entregó todo.', correcta: false, feedback: 'Hay cuatro alertas documentadas; aceptar sin respuesta a ellas no resistiría una revisión de calidad.' },
      { texto: 'Rechazar el encargo: el revisor anterior renunció por desacuerdos.', correcta: false, feedback: 'La renuncia del predecesor no obliga a rechazar; obliga a indagar y a responder al riesgo.' },
    ],
    cierre: 'La decisión queda en el formato de aceptación firmado por la socia: riesgo medio, salvaguardas y por qué.',
  },

  // ── Fase 2 · Planeación ──
  '2.1': {
    tipo: 'clasificar',
    titulo: 'Arma la lista PBC',
    deQuien: SOCIA,
    mensaje: 'Mañana es la reunión inicial con Andrés y Patricia. Quiero llevar la lista de requerimientos completa: pidamos todo de una vez, pero solo lo que corresponde ahora.',
    instruccion: '¿Lo incluyes en la lista PBC de la reunión inicial?',
    categorias: ['Pedirlo ahora', 'No va en esta lista'],
    items: [
      { id: 'balance', texto: 'Balance de prueba por tercero al 30 de septiembre', correcta: 'Pedirlo ahora', explicacion: 'Es la base de la planeación y de la visita interina.' },
      { id: 'kardex', texto: 'Kárdex de inventarios del año', correcta: 'Pedirlo ahora', explicacion: 'Con el riesgo del costo, se necesita desde la interina.' },
      { id: 'actas', texto: 'Actas de asamblea del año', correcta: 'Pedirlo ahora', explicacion: 'Ahí aparecen decisiones como el arriendo al gerente.' },
      { id: 'representacion', texto: 'Carta de representación firmada', correcta: 'No va en esta lista', explicacion: 'Se obtiene al final, con fecha cercana a la del informe (NIA 580).' },
      { id: 'extractos', texto: 'Extractos y conciliaciones bancarias', correcta: 'Pedirlo ahora', explicacion: 'Siempre van en la lista inicial.' },
      { id: 'confirmacion', texto: 'Respuestas de los clientes a la circularización', correcta: 'No va en esta lista', explicacion: 'Las confirmaciones las envía y recibe el auditor directamente, nunca por medio del cliente.' },
    ],
    cierre: 'La lista PBC va con responsable y fecha por documento. Lo que debe venir directo de terceros (confirmaciones) nunca se le pide al cliente.',
  },
  // ── Fase 3 · Ejecución ──
  '3.1': {
    tipo: 'calculo',
    titulo: 'Valida el balance antes de analizar',
    deQuien: SOCIA,
    mensaje: 'Antes de cualquier prueba, comprueba que el balance cuadra. Trabaja en millones de pesos.',
    expediente: ['balance', 'kardex'],
    items: [
      { id: 'resultado', enunciado: 'Activo 577, pasivo 267 y patrimonio 272: ¿qué resultado del ejercicio hace cuadrar la ecuación?', respuesta: 38, unidad: 'millones', pista: 'Activo − pasivo − patrimonio.' },
      { id: 'inventario', enunciado: 'Cuenta 1435: saldo inicial 210, débitos (compras) 703 y créditos 595. ¿Cuál es el saldo final?', respuesta: 318, unidad: 'millones', pista: 'Saldo inicial + débitos − créditos.' },
    ],
    cierre: 'El balance cuadra al peso y la 1435 se recalcula bien. Ahora sí se puede analizar: un balance descuadrado invalida todo lo que venga después.',
  },
  '3.2': {
    tipo: 'calculo',
    titulo: 'Arma la expectativa del costo',
    deQuien: SOCIA,
    mensaje: 'El gerente insiste en que el margen subió por mejores precios. Arma tu propia expectativa del costo con el margen histórico y compárala. Trabaja en millones.',
    expediente: ['balance', 'kardex', 'correo-gerente'],
    items: [
      { id: 'esperado', enunciado: 'Ventas de 1.000 con margen histórico de 30 %: ¿cuál es el costo de ventas esperado?', respuesta: 700, unidad: 'millones', pista: 'Ventas × (1 − 30 %).' },
      { id: 'diferencia', enunciado: 'El costo registrado es 595. ¿De cuánto es la diferencia sin explicar?', respuesta: 105, unidad: 'millones', pista: 'Esperado − registrado.' },
      { id: 'veces', enunciado: '¿Cuántas veces la materialidad global (10) es esa diferencia?', respuesta: 10.5, unidad: 'veces', pista: 'Diferencia ÷ materialidad.' },
    ],
    cierre: 'Además, el kárdex muestra salidas por 700: coincide con tu expectativa. La explicación del gerente no tiene soporte; la diferencia es un hallazgo.',
  },
  '3.3': {
    tipo: 'documento',
    titulo: 'Prepara la circularización',
    deQuien: SOCIA,
    mensaje: 'Comercial Andina lleva más de un año sin movimiento. Prepara la carta de confirmación del saldo; sale firmada por Andrés pero la enviamos nosotros.',
    expediente: ['cartera-edades'],
    documento: {
      titulo: 'Solicitud de confirmación de saldo',
      nombreArchivo: 'Confirmacion_Comercial_Andina',
      campos: [
        { id: 'tercero', etiqueta: 'Destinatario', tipo: 'texto', esperado: ['comercial andina'], pista: 'Es el cliente con el saldo sin movimiento.' },
        { id: 'nit', etiqueta: 'NIT del destinatario', tipo: 'texto', esperado: ['900111222'], pista: 'Está en la cartera por edades.' },
        { id: 'saldo', etiqueta: 'Saldo a confirmar', tipo: 'texto', esperado: ['25000000'], pista: 'Escribe el saldo completo en pesos, como aparece en la cartera por edades.' },
        { id: 'fecha', etiqueta: 'Fecha del saldo', tipo: 'texto', esperado: ['2026'], pista: 'Es el saldo al 31 de diciembre de 2026.' },
        {
          id: 'respuesta', etiqueta: 'A quién se envía la respuesta', tipo: 'opcion',
          opciones: ['Directamente al correo del auditor (Rendón & Asociados).', 'A la gerencia de la Comercializadora, que la reenvía al auditor.'],
          esperado: ['directamente'], pista: 'Si la respuesta pasa por el cliente, deja de ser evidencia externa (caso Parmalat).',
        },
      ],
      secciones: [
        { titulo: 'Destinatario', texto: 'Señores {{tercero}} (NIT {{nit}}).' },
        { titulo: 'Solicitud', texto: 'Nuestros auditores, Rendón & Asociados Auditores S.A.S., están revisando nuestros estados financieros. Les solicitamos confirmar el saldo que nos adeudaban al {{fecha}}, que según nuestros registros es de ${{saldo}}.' },
        { titulo: 'Instrucciones', texto: 'Si el saldo es correcto, firmen en el espacio indicado; si no, indiquen la diferencia y su detalle. Respuesta: {{respuesta}}' },
        { titulo: 'Firma', texto: 'Andrés Gómez Pardo, representante legal · Comercializadora Ejemplo S.A.S.' },
      ],
    },
    cierre: 'La firma es del cliente, pero el envío y la respuesta los controla el auditor (NIA 505.7). Si no responde, se aplican procedimientos alternativos y se evalúa el deterioro.',
  },
  '3.4': {
    tipo: 'clasificar',
    titulo: 'Clasifica las incorrecciones',
    deQuien: SOCIA,
    mensaje: 'Antes de mandarle los ajustes a Andrés, clasifica lo que encontramos. Recuerda: el umbral de errores triviales es de 500.000 pesos.',
    expediente: ['kardex', 'politicas', 'cartera-edades', 'acta-018'],
    instruccion: '¿Qué tipo de incorrección es cada una?',
    categorias: ['Factual', 'De juicio', 'Proyectada', 'Claramente trivial'],
    items: [
      { id: 'costo', texto: 'Costo de ventas no registrado: el kárdex muestra salidas por 700 M y el costo es de 595 M (105 M).', correcta: 'Factual', explicacion: 'Está soportado por el kárdex: no hay duda sobre el hecho ni el monto.' },
      { id: 'depre', texto: 'Depreciación 2026 del equipo de oficina no registrada (3 M según la política).', correcta: 'Factual', explicacion: 'La política fija el cálculo: es un error objetivo.' },
      { id: 'andina', texto: 'Deterioro no reconocido sobre Comercial Andina (25 M sin movimiento ni confirmación).', correcta: 'De juicio', explicacion: 'Depende de evaluar la recuperabilidad: es una estimación en la que el auditor discrepa de la gerencia.' },
      { id: 'corte', texto: 'Errores de corte en una muestra de ventas, extrapolados a toda la población (8 M). La contadora revisó el corte completo y lo ajustó.', correcta: 'Proyectada', explicacion: 'Es la mejor estimación del error en la población a partir de la muestra (NIA 530).' },
      { id: 'factura', texto: 'Diferencia de 300.000 pesos en una factura de servicios.', correcta: 'Claramente trivial', explicacion: 'Está por debajo del umbral de 500.000: no se acumula, salvo que indique algo más grave.' },
    ],
    cierre: 'Las incorrecciones se acumulan por tipo para evaluar si, en conjunto, son materiales (NIA 450). Las triviales quedan fuera, y el corte ya se corrigió: a Andrés le van el costo, el deterioro y la depreciación.',
  },
  '3.5': {
    tipo: 'decision',
    titulo: 'La carta de representación',
    deQuien: 'gerente',
    mensaje: 'Claudia, no voy a firmar esa carta de representación. Ustedes ya revisaron todo, ¿para qué necesitan que yo firme algo más?',
    pregunta: 'El gerente se niega a firmar la carta de representación. ¿Qué haces?',
    opciones: [
      { texto: 'Emitir el informe sin la carta: las pruebas ya dan evidencia suficiente.', correcta: false, feedback: 'La NIA 580 la exige: sin ella falta evidencia que no se puede reemplazar con otras pruebas.' },
      { texto: 'Insistir en que es obligatoria; si se niega, abstenerse de opinar.', correcta: true, feedback: 'Correcto: la negativa a dar las manifestaciones escritas es una limitación al alcance que lleva a abstenerse de opinar (NIA 580.20) y a reconsiderar la integridad de la dirección.' },
      { texto: 'Pedir que la firme la contadora externa, que preparó las cifras.', correcta: false, feedback: 'Las manifestaciones las da la dirección responsable de los estados financieros; la contadora externa no la sustituye.' },
    ],
    cierre: 'La carta de representación no es un trámite: si la dirección no la firma, el auditor no puede opinar.',
  },

  // ── Fase 4 · Informe ──
  '4.2': {
    tipo: 'clasificar',
    titulo: 'Revisa las revelaciones',
    deQuien: SOCIA,
    mensaje: 'Lee las notas del borrador de estados financieros con la lista de verificación. Dime qué debe revelarse y no está.',
    expediente: ['acta-018', 'camara', 'politicas'],
    instruccion: '¿Debe revelarse en las notas bajo NIIF para las PYMES?',
    categorias: ['Debe revelarse', 'No es necesario'],
    items: [
      { id: 'arriendo', texto: 'El arriendo de la bodega de propiedad del gerente', correcta: 'Debe revelarse', explicacion: 'Transacción con parte relacionada (Sección 33 NIIF para las PYMES).' },
      { id: 'politica-inv', texto: 'La política de inventarios a costo promedio', correcta: 'Debe revelarse', explicacion: 'Las políticas contables significativas siempre se revelan.' },
      { id: 'hermana', texto: 'Que la accionista minoritaria es hermana del gerente', correcta: 'Debe revelarse', explicacion: 'Las relaciones de control y familiares cercanos son partes relacionadas.' },
      { id: 'proveedor', texto: 'El nombre de cada proveedor con el que se negoció precio', correcta: 'No es necesario', explicacion: 'No es una revelación exigida por el marco.' },
    ],
    cierre: 'Auditar las cifras sin leer las notas deja por fuera justo lo que el usuario necesita para entender las relaciones de la empresa.',
  },
  '4.3': {
    tipo: 'decision',
    titulo: 'Decide la opinión',
    deQuien: SOCIA,
    mensaje: 'Tienes la suma de lo no corregido. Proponme el tipo de opinión para el dictamen.',
    pregunta: 'Las incorrecciones no corregidas (133 M) afectan costo, inventario, cartera, resultado y patrimonio. ¿Qué opinión corresponde?',
    opciones: [
      { texto: 'Opinión con salvedades.', correcta: false, feedback: 'La salvedad es para efectos materiales pero no generalizados. Aquí el costo omitido afecta varios rubros y cambia utilidad por pérdida.' },
      { texto: 'Abstención de opinión.', correcta: false, feedback: 'La abstención es por falta de evidencia. Aquí sí hay evidencia: lo que hay son cifras equivocadas.' },
      { texto: 'Opinión desfavorable.', correcta: true, feedback: 'Correcto: incorrecciones materiales y generalizadas llevan a opinión desfavorable o adversa (NIA 705.8).' },
    ],
    cierre: 'Dos preguntas deciden la opinión: ¿es incorrección o falta de evidencia? ¿es material y generalizada? Aquí: incorrección, material y generalizada.',
  },
  '4.4': {
    tipo: 'decision',
    titulo: 'El párrafo adicional',
    deQuien: SOCIA,
    mensaje: 'Los estados financieros de 2025 los auditó Héctor Salazar, con opinión con salvedades por el inventario. ¿Cómo lo mencionamos en el informe?',
    pregunta: '¿Qué sección usas para decir que el año anterior lo auditó otro revisor?',
    opciones: [
      { texto: 'Párrafo de énfasis.', correcta: false, feedback: 'El énfasis destaca algo revelado en los estados financieros; quién auditó el año anterior no está en ellos.' },
      { texto: 'Párrafo de otras cuestiones.', correcta: true, feedback: 'Correcto: es un asunto relevante que no está en los estados financieros (NIA 706.10 y NIA 710).' },
      { texto: 'No se menciona en el dictamen.', correcta: false, feedback: 'Debe informarse para que el usuario sepa que las cifras comparativas las dictaminó otro profesional.' },
    ],
    cierre: 'El párrafo dice que 2025 lo auditó otro revisor, el tipo de opinión que emitió (con salvedades) y por qué, y la fecha de su informe: 10 de febrero de 2026 (NIA 710.13). Énfasis para lo que está revelado y es fundamental; otras cuestiones para lo que no está en los estados financieros.',
  },
  '4.6': {
    tipo: 'documento',
    titulo: 'Escribe la recomendación de control',
    deQuien: SOCIA,
    mensaje: 'Prepara la carta de recomendaciones con la deficiencia de compras y pagos. La presentamos en la asamblea.',
    expediente: ['narrativa-compras'],
    documento: {
      titulo: 'Carta de recomendaciones · Deficiencia de control interno',
      nombreArchivo: 'Carta_recomendaciones',
      campos: [
        { id: 'deficiencia', etiqueta: 'Deficiencia (condición)', tipo: 'textoLargo', esperado: ['registra', 'paga', 'pago'], pista: 'Describe lo que hace Julián: registra las facturas y prepara los pagos.' },
        { id: 'riesgo', etiqueta: 'Riesgo que genera', tipo: 'textoLargo', esperado: ['fraude', 'pago', 'indebid', 'error'], pista: 'Piensa en pagos indebidos o fraude que nadie detecta.' },
        { id: 'recomendacion', etiqueta: 'Recomendación', tipo: 'textoLargo', esperado: ['segreg', 'separ'], pista: 'La solución es segregar (separar) las funciones de registro y pago.' },
        { id: 'responsable', etiqueta: 'Responsable en la Comercializadora', tipo: 'texto', esperado: ['andres', 'gerente'], pista: 'La implementación corresponde a la gerencia.' },
        { id: 'fecha', etiqueta: 'Fecha comprometida', tipo: 'texto' },
      ],
      secciones: [
        { titulo: 'Deficiencia', texto: '{{deficiencia}}' },
        { titulo: 'Riesgo', texto: '{{riesgo}}' },
        { titulo: 'Recomendación', texto: '{{recomendacion}}' },
        { titulo: 'Responsable y fecha', texto: '{{responsable}} · {{fecha}}' },
      ],
    },
    cierre: 'Una recomendación útil tiene responsable y fecha; sin ellos no hay a quién hacerle seguimiento el año siguiente.',
  },

  // ── Fase 5 · Cierre ──
  '5.1': {
    tipo: 'decision',
    titulo: 'El plazo del archivo',
    deQuien: SOCIA,
    mensaje: 'El dictamen quedó fechado el 28 de febrero de 2027. ¿Hasta cuándo tenemos para compilar el archivo final?',
    pregunta: 'Con 60 días desde la fecha del informe, ¿cuál es la fecha límite?',
    opciones: [
      { texto: '28 de abril de 2027', correcta: false, feedback: 'Sumaste dos meses, pero el plazo es de 60 días: marzo tiene 31.' },
      { texto: '29 de abril de 2027', correcta: true, feedback: 'Correcto: 31 días de marzo más 29 de abril completan los 60 días.' },
      { texto: '28 de febrero de 2027', correcta: false, feedback: 'Esa es la fecha del informe; el plazo corre desde ahí.' },
    ],
    cierre: 'La fecha de cierre del archivo se anota en el índice. Después de ella, nada se borra ni se reemplaza.',
  },
  '5.2': {
    tipo: 'decision',
    titulo: 'Llegó la confirmación tarde',
    deQuien: SOCIA,
    mensaje: 'En mayo llegó por fin la respuesta de Comercial Andina: confirman el saldo pero dicen que están en reestructuración. El archivo ya está cerrado.',
    pregunta: '¿Qué haces con la respuesta?',
    opciones: [
      { texto: 'Reemplazar el papel V3 por una versión que incluya la respuesta.', correcta: false, feedback: 'Después del cierre no se reemplaza nada: se agrega con rastro.' },
      { texto: 'Guardarla en el correo del encargo: el archivo ya está cerrado.', correcta: false, feedback: 'La evidencia que llega después debe quedar en el archivo, con rastro del cambio.' },
      { texto: 'Agregarla en un papel nuevo con fecha, autor y motivo.', correcta: true, feedback: 'Correcto (NIA 230.16): con fecha, autor, motivo y su efecto en las conclusiones. Y como la reestructuración afecta la recuperabilidad, se evalúa también como hecho posterior.' },
    ],
    cierre: 'Agregar sí, borrar o reemplazar no. Todo cambio posterior deja constancia de quién, cuándo y por qué.',
  },
  '5.3': {
    tipo: 'clasificar',
    titulo: 'Custodia del archivo',
    deQuien: SOCIA,
    mensaje: 'Revisa cómo quedó guardado el archivo de la Comercializadora antes de que llegue la revisión de calidad.',
    instruccion: '¿Es una buena práctica de custodia?',
    categorias: ['Buena práctica', 'Riesgo'],
    items: [
      { id: 'repo', texto: 'Archivo en el repositorio de la firma con acceso solo para la socia y el gerente del encargo', correcta: 'Buena práctica', explicacion: 'Acceso restringido y trazable.' },
      { id: 'usb', texto: 'Copia del balance por tercero en la memoria USB de un asistente', correcta: 'Riesgo', explicacion: 'Rompe la reserva profesional y la protección de datos (Ley 1581).' },
      { id: 'backup', texto: 'Copia de seguridad automática del repositorio', correcta: 'Buena práctica', explicacion: 'Protege la conservación durante el plazo de la política.' },
      { id: 'correo', texto: 'Enviar la nómina del cliente al correo personal para trabajar desde casa', correcta: 'Riesgo', explicacion: 'Datos personales fuera de los canales de la firma.' },
    ],
    cierre: 'Los papeles son confidenciales y son tu defensa ante la Junta Central de Contadores: se guardan completos, protegidos y por el plazo de la política.',
  },
  '5.4': {
    tipo: 'decision',
    titulo: 'Un hecho después del informe',
    deQuien: SOCIA,
    mensaje: 'Abril de 2027: Distribuidora del Norte, el cliente principal de la Comercializadora (58 M de cartera), entró en liquidación. El dictamen ya se emitió.',
    expediente: ['cartera-edades'],
    pregunta: '¿Qué haces?',
    opciones: [
      { texto: 'Hablarlo con la gerencia y evaluar si los estados deben cambiar.', correcta: true, feedback: 'Correcto: también se evalúa si el hecho se debió conocer antes. Si los estados se reemiten, se emite un nuevo informe con un párrafo que explique la modificación.' },
      { texto: 'Nada: emitido el dictamen, los hechos posteriores no te tocan.', correcta: false, feedback: 'Emitido el informe sigue habiendo responsabilidad si aparece un hecho que lo habría cambiado (NIA 560.14).' },
      { texto: 'Retirar el dictamen de inmediato y avisar a la Supersociedades.', correcta: false, feedback: 'Primero se discute con la dirección; las acciones para evitar que se confíe en el informe se toman después, con asesoría legal.' },
    ],
    cierre: 'La pregunta clave es: ¿esto habría cambiado mi opinión a la fecha del informe?',
  },
  '5.5': {
    tipo: 'calculo',
    titulo: 'Evalúa las horas',
    deQuien: SOCIA,
    mensaje: 'Cerremos el encargo con números. Presupuestamos 40 horas para inventarios y usamos 80.',
    items: [
      { id: 'desv', enunciado: '¿Cuántas horas de desviación hubo en inventarios?', respuesta: 40, unidad: 'horas', pista: 'Reales − presupuestadas.' },
      { id: 'pct', enunciado: '¿Qué porcentaje de desviación es sobre lo presupuestado?', respuesta: 100, unidad: '%', pista: 'Desviación ÷ presupuesto × 100.' },
    ],
    cierre: 'La causa fue reconstruir el costo con el kárdex al cierre: para 2027 se pide el kárdex mensual desde la visita interina.',
  },
  '5.6': {
    tipo: 'documento',
    titulo: 'Deja listo el plan de 2027',
    deQuien: SOCIA,
    mensaje: 'Antes de cerrar, deja el plan preliminar para el encargo de 2027. Lo que aprendimos este año es el punto de partida.',
    expediente: ['narrativa-compras', 'kardex'],
    documento: {
      titulo: 'Plan preliminar del encargo 2027',
      nombreArchivo: 'Plan_preliminar_2027',
      campos: [
        { id: 'riesgo', etiqueta: 'Riesgo significativo que se mantiene', tipo: 'textoLargo', esperado: ['costo', 'inventario'], pista: 'El problema del costo de ventas y el inventario no está corregido.' },
        { id: 'pedido', etiqueta: 'Qué pedirás al cliente desde la visita interina', tipo: 'textoLargo', esperado: ['kardex'], pista: 'Lo que más horas consumió fue reconstruir el costo con el kárdex.' },
        { id: 'seguimiento', etiqueta: 'Recomendación a la que harás seguimiento', tipo: 'textoLargo', esperado: ['segreg', 'separ'], pista: 'La deficiencia de compras y pagos.' },
        { id: 'aceptacion', etiqueta: '¿Continuar con el cliente?', tipo: 'opcion', opciones: ['Continuar, con riesgo alto y salvaguardas reforzadas', 'Continuar sin cambios', 'No continuar'], esperado: ['continuar con riesgo alto'], pista: 'Hubo opinión desfavorable y ajustes no aceptados: el riesgo del cliente sube.' },
      ],
      secciones: [
        { titulo: 'Riesgos de partida', texto: '{{riesgo}}' },
        { titulo: 'Solicitudes anticipadas', texto: '{{pedido}}' },
        { titulo: 'Seguimiento a recomendaciones', texto: '{{seguimiento}}' },
        { titulo: 'Continuidad del cliente', texto: '{{aceptacion}}' },
      ],
    },
    cierre: 'Terminaste tu primer encargo completo. La auditoría siguiente empieza donde termina esta.',
  },
}
