/**
 * AuditorYa Academia — curso básico de auditoría financiera bajo NIA.
 *
 * Catálogo del curso: módulos (fases), lecciones (pasos), checkpoints y glosario. Las lecciones con
 * `practica` se hacen en la pestaña real del encargo de práctica; el servidor simulado del navegador
 * las da por completadas leyendo lo que quedó guardado (ver `CriterioPractica` y
 * frontend/src/lib/academia-demo.ts).
 *
 * Contenido adaptado del documento «Curso Básico de Auditoría Financiera». Las cifras del caso viven
 * en academia-caso.ts. Puntos marcados «revisar con contador» deben validarse antes de publicar.
 */

import { EJERCICIOS_CASO, type EjercicioCaso } from './academia-ejercicios'
import { FIRMA_CASO, PERSONAJES_CASO } from './academia-caso'

export type PasoTutor = {
  texto: string
  /** Elemento a resaltar en la pestaña: valor de `data-tour` o `id` del control. */
  ancla?: string
}

/** Pestañas del encargo que pueden montarse en un playground. */
export type PestanaPractica =
  | 'carta_encargo'
  | 'entendimiento'
  | 'balance'
  | 'control_interno'
  | 'materialidad'
  | 'riesgos'
  | 'memo'
  | 'pbc'
  | 'ajustes'
  | 'informes'

/** Qué verifica el servidor simulado para dar la práctica por hecha. */
export type CriterioPractica =
  | 'carta_encargo'
  | 'entendimiento'
  | 'coso_actividades'
  | 'riesgo_analitico'
  | 'materialidad'
  | 'riesgo_costo'
  | 'memo_planeacion'
  | 'pruebas_costo'
  | 'hoja_ajustes'
  | 'dictamen'

export type PracticaLeccion = {
  titulo: string
  /** Una frase: qué se logra en el playground. */
  objetivo: string
  /** La primera es la que abre; si hay varias, el playground muestra un selector. */
  pestanas: PestanaPractica[]
  pasos: PasoTutor[]
  criterio: CriterioPractica
}

export type ExigenciaNorma = { norma: string; requisito: string }

export type Leccion = {
  /** '0.1' … '5.6' */
  id: string
  titulo: string
  resumen: string
  /** Lo que el estudiante sabrá hacer al terminar la lección. */
  objetivo?: string
  /** Por qué importa el paso: qué riesgo resuelve y qué sale mal si se omite. Abre la teoría. */
  porQue?: string
  /** Lecciones narrativas (inducción): secciones de texto en lugar de la ficha técnica. */
  narrativa?: { titulo: string; parrafos: string[] }[]
  queHacer?: string[]
  comoHacerlo?: string[]
  modelo?: string
  tabla?: { encabezados: string[]; filas: string[][] }
  norma?: string
  entregable?: string
  enElCaso?: string
  errorFrecuente?: string
  exigencias?: ExigenciaNorma[]
  /** Práctica en las pestañas reales de AuditorYa (playground). */
  practica?: PracticaLeccion
  /** Ejercicio sobre el caso (cuando no hay playground). Ver academia-ejercicios.ts. */
  ejercicio?: EjercicioCaso
}

export type PreguntaRepaso = {
  pregunta: string
  opciones: string[]
  correcta: number
  explicacion: string
}

export type CasoReal = { titulo: string; contexto: string; hechos: string; leccion: string; normas: string }

export type ModuloCurso = {
  id: string
  /** Referencia de la fase en el índice y los encabezados: «Fase 1» … «Fase 5» */
  ref: string
  numero: number
  corto: string
  titulo: string
  normas: string[]
  duracion: string
  intro: string
  objetivos: string[]
  entregables: string[]
  enColombia: string
  lecciones: Leccion[]
  casosReales: CasoReal[]
  /** Cierre de la fase. La inducción no tiene. */
  checkpoint?: CheckpointFase
}

/**
 * Checkpoint al final de cada fase: lo esencial que se aprendió, cómo quedó el encargo de la
 * Comercializadora y un quiz de cinco preguntas que abre la fase siguiente.
 */
export type CheckpointFase = {
  aprendido: string[]
  caso: {
    resumen: string
    hitos: string[]
    cifras: { etiqueta: string; valor: string }[]
    siguiente: string
  }
  preguntas: PreguntaRepaso[]
}

// ─── Introducción (F0) ───────────────────────────────────────────────────────

export const INTRO_CURSO = {
  titulo: 'Antes de empezar: qué es una auditoría financiera',
  normas: ['NIA 200', 'Ley 43 de 1990', 'Decreto 2420 de 2015'],
  intro:
    'La auditoría financiera termina en una opinión: si los estados financieros están libres de incorrección material. Todo lo que hace el auditor, desde aceptar al cliente hasta archivar los papeles, existe para sostener esa opinión con evidencia.',
  caso:
    'En cada lección verás cómo se aplica a Comercializadora Ejemplo S.A.S., una distribuidora ficticia de NIIF para las PYMES auditada por el año 2026 (visita interina al 30 de septiembre, final al 31 de diciembre). Tiene ventas por 1.000 millones con un costo que no cuadra, cartera sin movimiento, retenciones pagadas a un NIT equivocado y la utilidad de 2025 sin trasladar. Es el mismo caso que tendrás cargado en tu encargo de práctica.',
}

export const CONCEPTOS_BASE: { titulo: string; texto: string; formula?: string }[] = [
  { titulo: 'El objetivo', texto: 'Obtener seguridad razonable, no absoluta, de que los estados financieros están libres de incorrección material, debida a fraude o error, y emitir una opinión (NIA 200).' },
  { titulo: 'El marco en Colombia', texto: 'La Ley 43 de 1990 regula la profesión. El Decreto 2420 de 2015 (Anexo 4) incorpora las NIA y el Código de Ética. Su aplicación obligatoria depende del grupo y tamaño de la entidad: verifica cada caso.' },
  { titulo: 'Auditor externo y revisor fiscal', texto: 'El auditor externo opina sobre los estados financieros. El revisor fiscal, además, se pronuncia sobre el cumplimiento legal, los actos de los administradores y el control interno (art. 207 C.Co.).' },
  { titulo: 'El riesgo de auditoría', texto: 'Se controla ajustando el riesgo de detección: a mayor riesgo de incorrección material, más y mejores pruebas.', formula: 'Riesgo de auditoría = R. inherente × R. de control × R. de detección' },
  { titulo: 'Las aseveraciones', texto: 'Cada cifra afirma algo: que existe, que está completa, que está bien valuada, que pertenece al período correcto. Las pruebas se diseñan por aseveración.' },
  { titulo: 'La regla de oro', texto: 'Lo que no está documentado no se hizo. Un auditor con experiencia que no participó debe poder entender el trabajo leyendo los papeles (NIA 230).' },
]

export const NORMAS_COLOMBIA: { encabezados: string[]; filas: string[][] } = {
  encabezados: ['Norma', 'Qué regula', 'Para qué la usas'],
  filas: [
    ['Ley 43 de 1990', 'Ejercicio de la contaduría pública, ética, fe pública y reserva profesional', 'Responsabilidad y conducta del auditor; régimen disciplinario ante la Junta Central de Contadores'],
    ['Ley 1314 de 2009', 'Convergencia hacia estándares internacionales de contabilidad y aseguramiento', 'Fundamento legal de las NIIF y las NIA en Colombia'],
    ['Decreto 2420 de 2015, Anexo 4', 'Normas de aseguramiento: NIA, normas de calidad, ISAE 3000 y Código de Ética IESBA', 'Las normas técnicas con las que ejecutas y documentas la auditoría'],
    ['Código de Comercio, arts. 203–217', 'Revisoría fiscal: obligatoriedad, inhabilidades, funciones, dictamen e informe', 'Lo que el revisor fiscal debe hacer y decir además de la NIA'],
    ['Ley 222 de 1995', 'Estados financieros de propósito general, certificación (art. 37) y dictamen (art. 38)', 'Qué estados financieros se dictaminan y quién los certifica'],
    ['Estatuto Tributario', 'Soporte de costos (art. 771-2), bancarización (art. 771-5), deducibilidad (art. 107), sanciones', 'Pruebas de impuestos y riesgo fiscal'],
    // revisar con contador: alcance e indicadores exactos del Decreto 1378 de 2021.
    ['Ley 2069 de 2020 y Decreto 1378 de 2021', 'Deterioro de la hipótesis de negocio en marcha e indicadores de alerta', 'Evaluación de empresa en funcionamiento (NIA 570)'],
    ['Ley 1474 de 2011 (art. 7) y Ley 1762 de 2015', 'Denuncia de actos de corrupción y reporte de operaciones sospechosas a la UIAF', 'Deberes legales adicionales del revisor fiscal'],
  ],
}

export const GLOSARIO: { termino: string; definicion: string }[] = [
  { termino: 'Aseveraciones', definicion: 'Afirmaciones implícitas de la dirección en los estados financieros. Sobre transacciones: ocurrencia, integridad, exactitud, corte y clasificación. Sobre saldos: existencia, derechos y obligaciones, integridad, exactitud, valoración e imputación, y clasificación. Además, presentación (NIA 315.A190).' },
  { termino: 'Materialidad', definicion: 'Monto o naturaleza de un error que podría cambiar las decisiones de los usuarios de los estados financieros (NIA 320).' },
  { termino: 'Riesgo de auditoría', definicion: 'Riesgo de emitir una opinión inadecuada. Se compone del riesgo de incorrección material (inherente y de control) y del riesgo de detección.' },
  { termino: 'Riesgo significativo', definicion: 'Riesgo cuyo riesgo inherente se evalúa en el extremo alto del espectro, o que otra NIA trata como tal (por ejemplo, el fraude en ingresos). Exige una respuesta específica del auditor (NIA 315.12).' },
  { termino: 'Escepticismo profesional', definicion: 'Actitud de mente inquisitiva, alerta a condiciones que puedan indicar error o fraude, y evaluación crítica de la evidencia (NIA 200).' },
  { termino: 'Evidencia suficiente y adecuada', definicion: 'Suficiente es la cantidad; adecuada es la calidad (relevancia y fiabilidad). Ambas son necesarias (NIA 500).' },
  { termino: 'Papel de trabajo', definicion: 'Registro de los procedimientos aplicados, la evidencia obtenida y las conclusiones alcanzadas (NIA 230).' },
  { termino: 'Prueba sustantiva', definicion: 'Procedimiento para detectar errores materiales en saldos y transacciones: pruebas de detalle o analítica sustantiva.' },
  { termino: 'Prueba de controles', definicion: 'Procedimiento para evaluar si un control funcionó eficazmente durante el período.' },
  { termino: 'Circularización', definicion: 'Confirmación externa: solicitud directa a un tercero (banco, cliente, proveedor) para que confirme un saldo o condición (NIA 505).' },
  { termino: 'Hecho posterior', definicion: 'Hecho ocurrido entre la fecha de los estados financieros y la del informe, o conocido después de este (NIA 560).' },
  { termino: 'Carta de representación', definicion: 'Declaración escrita de la dirección que confirma ciertos asuntos y respalda otra evidencia (NIA 580).' },
  { termino: 'Opinión modificada', definicion: 'Opinión con salvedades, desfavorable o abstención de opinión (NIA 705).' },
  { termino: 'Revisor fiscal', definicion: 'Figura de fiscalización colombiana con funciones legales que van más allá de la auditoría de estados financieros (arts. 203–217 C.Co.).' },
]

// ─── F1 · Aceptación ─────────────────────────────────────────────────────────

const F1: ModuloCurso = {
  id: 'aceptacion',
  ref: 'Fase 1',
  numero: 1,
  corto: 'Aceptación',
  titulo: 'Aceptación y continuidad del cliente',
  normas: ['NIA 210', 'NIA 220', 'NIGC 1', 'Código de Ética IESBA'],
  duracion: '1–2 días',
  intro:
    'Antes de auditar se decide si se puede y se debe aceptar el encargo. Un cliente con dirección poco íntegra, o un auditor que no es independiente, contaminan toda la auditoría desde el inicio.',
  objetivos: [
    'Evaluar la integridad del cliente y los riesgos de asociarse con él.',
    'Confirmar independencia, competencia y capacidad del equipo.',
    'Dejar por escrito los términos del encargo antes de empezar.',
  ],
  entregables: ['Formato de aceptación aprobado', 'Declaraciones de independencia', 'Carta de encargo firmada'],
  enColombia:
    'Verifica si la entidad está obligada a tener revisor fiscal: sociedades anónimas, sucursales de sociedades extranjeras y sociedades con activos brutos iguales o superiores a 5.000 SMMLV o ingresos brutos iguales o superiores a 3.000 SMMLV al 31 de diciembre del año anterior (parágrafo 2, art. 13, Ley 43 de 1990). Revisa también los estatutos: pueden crear el cargo aunque la ley no lo exija, y entonces el revisor fiscal tiene las mismas funciones y responsabilidades legales (arts. 203 a 217 C.Co.). Si no hay obligación legal ni estatutaria, el encargo será una auditoría externa contractual, regida por la carta de encargo y las NIA.',
  lecciones: [
    {
      id: '1.1',
      titulo: 'Conocer al cliente potencial',
      resumen: 'Se reúne información sobre quién es la entidad, quiénes son sus dueños y administradores y cómo hace negocios.',
      objetivo: 'Armar la ficha de un cliente potencial y detectar las señales de alerta antes de comprometer a la firma.',
      porQue:
        'Aceptar un cliente es aceptar su riesgo: si sus dueños o administradores no son íntegros, la firma termina firmando estados financieros que no puede defender. Una vez aceptado, salir es costoso y deja huella. En la Comercializadora, el certificado de Cámara ya muestra a un gerente que concentra la propiedad y la administración, y eso cambia cuánto escepticismo hará falta en todo el encargo.',
      queHacer: [
        'Revisar certificado de existencia y representación legal (Cámara de Comercio), estatutos y composición accionaria.',
        'Consultar listas restrictivas (ONU, OFAC) y antecedentes de socios y administradores.',
        'Entender la actividad, el tamaño y el marco contable que aplica (Grupo 1, 2 o 3).',
      ],
      comoHacerlo: [
        'Arma una ficha del cliente con: NIT, razón social, CIIU, representante legal, accionistas con más del 5 %, grupo NIIF y fecha de corte.',
        'Descarga el certificado de Cámara de Comercio con menos de 30 días y verifica facultades del representante legal.',
        'Consulta las listas vinculantes (Consejo de Seguridad ONU) y la lista OFAC para la sociedad, sus socios y administradores; guarda el pantallazo con fecha.',
        'Busca en prensa y en el portal de la Superintendencia de Sociedades procesos de insolvencia o investigaciones.',
      ],
      norma: 'NIGC 1 · NIA 220',
      entregable: 'Ficha del cliente y resultado de consulta de listas',
      enElCaso: 'Comercializadora Ejemplo S.A.S. vende al por mayor y al detal, es Grupo 2 (NIIF para las PYMES) y su gerente es también accionista mayoritario (85 %). Con 499 M de activos y 820 M de ingresos en 2025 no alcanza los topes legales: tiene revisor fiscal porque sus estatutos lo exigen.',
      errorFrecuente: 'Aceptar sin investigar porque el cliente llegó recomendado.',
      exigencias: [
        { norma: 'NIGC 1', requisito: 'Exige que la firma obtenga información suficiente antes de aceptar un cliente y evalúe la integridad de sus propietarios y dirección.' },
        { norma: 'NIA 220', requisito: 'El socio del encargo debe quedar satisfecho de que se siguieron los procedimientos de aceptación y que las conclusiones son apropiadas.' },
        { norma: 'SAGRILAFT (Circular Básica Jurídica Supersociedades, Cap. X)', requisito: 'Si el cliente está obligado, verificar que tenga oficial de cumplimiento y matriz de riesgos: será parte de tu revisión.' },
      ],
    },
    {
      id: '1.2',
      titulo: 'Evaluar independencia y conflictos de interés',
      resumen: 'El auditor debe ser independiente de hecho y en apariencia. Si no lo es, no puede emitir una opinión creíble.',
      objetivo: 'Identificar las amenazas a la independencia y decidir si se reducen con salvaguardas o si impiden aceptar.',
      porQue:
        'La opinión del revisor fiscal vale porque la da alguien sin intereses en el resultado. Si el auditor lleva la contabilidad, tiene acciones o depende de los honorarios del cliente, su opinión deja de ser creíble aunque el trabajo esté bien hecho, y puede ser además una inhabilidad legal (art. 205 C.Co.). Por eso se evalúa antes de aceptar y se declara por escrito, no cuando ya hay un problema.',
      queHacer: [
        'Identificar relaciones financieras, familiares o comerciales del equipo con el cliente.',
        'Verificar que la firma no preste servicios incompatibles, como llevar la contabilidad que luego se audita.',
        'Para revisoría fiscal, revisar las inhabilidades del art. 205 del Código de Comercio.',
        'Obtener declaración de independencia firmada por cada miembro del equipo.',
      ],
      comoHacerlo: [
        'Envía a cada integrante del equipo un formato de independencia: relaciones familiares, inversiones, préstamos, empleo previo en el cliente y servicios prestados en los últimos dos años.',
        'Lista los servicios que la firma presta o prestó al cliente y clasifica cada uno como compatible o incompatible.',
        'Si hay una amenaza, documenta la salvaguarda (cambiar a la persona, separar equipos) o rechaza el encargo.',
      ],
      norma: 'Código de Ética IESBA (Anexo 4, Decreto 2420/2015) · Ley 43 de 1990 · art. 205 C.Co.',
      entregable: 'Declaraciones de independencia',
      enElCaso: 'Si la firma que lleva la contabilidad de la Comercializadora fuera también su revisor fiscal, estaría auditando su propio trabajo.',
      errorFrecuente: 'Pensar que la independencia solo se revisa el primer año. Se confirma en cada encargo.',
      exigencias: [
        { norma: 'Código de Ética IESBA', requisito: 'Exige identificar, evaluar y responder a amenazas de interés propio, autorrevisión, abogacía, familiaridad e intimidación.' },
        { norma: 'Art. 205 C.Co.', requisito: 'No puede ser revisor fiscal quien sea asociado, empleado o pariente (hasta 4.º grado de consanguinidad, 1.º civil o 2.º de afinidad) de administradores, ni quien desempeñe otro cargo en la compañía.' },
        { norma: 'NIA 220', requisito: 'El socio debe concluir sobre el cumplimiento de los requerimientos de independencia.' },
      ],
    },
    {
      id: '1.3',
      titulo: 'Evaluar competencia, tiempo y recursos',
      resumen: 'La firma debe tener el conocimiento del sector, las personas y las horas para hacer bien el trabajo.',
      objetivo: 'Estimar las horas del encargo y comprobar que la firma tiene las personas y el conocimiento para cumplirlas.',
      porQue:
        'Un encargo aceptado sin tiempo ni gente suficientes termina con pruebas recortadas al final, justo cuando aparecen los problemas. La NIA 220 hace responsable al socio de que el equipo tenga la competencia y el tiempo necesarios. En la Comercializadora, un inventario grande y un costo de ventas dudoso anuncian horas extra en la ejecución: hay que verlas en el presupuesto, no descubrirlas en febrero.',
      queHacer: [
        'Estimar horas por fase y compararlas con la disponibilidad del equipo.',
        'Identificar si se necesitan expertos: avalúos, actuarios, sistemas, tributario.',
        'Verificar la experiencia en el sector del cliente.',
      ],
      comoHacerlo: [
        'Estima horas por fase con la regla práctica 15 % aceptación y planeación, 60 % ejecución, 15 % informe, 10 % cierre, y ajústala al riesgo.',
        'Identifica las áreas que requieren experto: avalúo de propiedades, cálculo actuarial de pensiones, impuesto diferido complejo, sistemas.',
        'Confirma que el equipo tiene experiencia en NIIF para el grupo del cliente.',
      ],
      norma: 'NIA 220 · NIA 620',
      entregable: 'Presupuesto de horas y conformación del equipo',
      enElCaso: 'Inventarios relevantes (318 M) exigen presencia física en el conteo de cierre: se reserva al equipo para la última semana de diciembre.',
      errorFrecuente: 'Aceptar un encargo con honorarios que no cubren las horas necesarias y luego recortar procedimientos.',
      exigencias: [
        { norma: 'NIA 220', requisito: 'El socio debe asegurar que el equipo y los expertos tengan la competencia y el tiempo necesarios.' },
        { norma: 'NIA 620', requisito: 'Si usas un experto, debes evaluar su competencia, capacidad y objetividad, y acordar por escrito su trabajo.' },
      ],
    },
    {
      id: '1.4',
      titulo: 'Comunicarse con el auditor anterior',
      resumen: 'Cuando el cliente cambia de auditor o revisor fiscal, conviene saber por qué.',
      objetivo: 'Saber qué preguntarle al auditor anterior y cómo usar su respuesta para aceptar y para validar los saldos de apertura.',
      porQue:
        'Quien auditó antes conoce lo que el cliente no va a contar: desacuerdos, presiones, limitaciones al alcance. Además, los saldos con los que arranca el año que vas a auditar vienen de su trabajo; si estaban mal, el error entra a tu período. En la Comercializadora, Héctor Salazar dictaminó con salvedades por el inventario y renunció: sin hablar con él no sabrías qué tan firme es el inventario inicial de 210 M.',
      queHacer: [
        'Pedir autorización del cliente para contactar al auditor anterior.',
        'Preguntar por desacuerdos con la dirección, honorarios pendientes o limitaciones al alcance.',
        'Solicitar acceso a papeles de trabajo del año anterior para validar saldos iniciales.',
      ],
      comoHacerlo: [
        'Pide al cliente una autorización escrita para contactar al auditor o revisor anterior.',
        'Envía un cuestionario corto: motivos del cambio, desacuerdos con la dirección, sospechas de fraude, honorarios pendientes.',
        'Solicita revisar sus papeles de saldos de apertura y del archivo permanente.',
      ],
      norma: 'Código de Ética IESBA · NIA 510 (saldos de apertura)',
      entregable: 'Nota de la comunicación con el predecesor',
      enElCaso: 'Héctor Salazar dictaminó 2025 con salvedades porque no pudo verificar el inventario de 210 M, y cinco días después renunció. Ese inventario es el saldo inicial de 2026 y entra en el costo del año: hay que obtener evidencia sobre él (NIA 510). Si no se logra, la salvedad se arrastra al dictamen de 2026.',
      errorFrecuente: 'Omitir el contacto porque «es incómodo».',
      exigencias: [
        { norma: 'NIA 300.13', requisito: 'En un primer encargo, el auditor debe comunicarse con el auditor predecesor cuando haya habido un cambio, cumpliendo los requerimientos de ética.' },
        { norma: 'NIA 510.6', requisito: 'Debe obtener evidencia de que los saldos de apertura no contienen incorrecciones que afecten materialmente el período actual.' },
      ],
    },
    {
      id: '1.5',
      titulo: 'Verificar las condiciones previas',
      resumen: 'La NIA 210 exige confirmar que existe un marco contable aceptable y que la dirección acepta sus responsabilidades.',
      objetivo: 'Comprobar las condiciones previas de la NIA 210 antes de comprometerse con el encargo.',
      porQue:
        'Si la dirección no reconoce que los estados financieros son su responsabilidad, o no hay un marco contable aceptable, el auditor no tiene contra qué opinar ni a quién exigirle. Son condiciones previas: si no se cumplen, no se acepta. Verificarlas al principio evita descubrir en el cierre que la gerencia no entrega información o desconoce los ajustes.',
      queHacer: [
        'Confirmar el marco de información financiera aplicable (NIIF plenas, NIIF para las PYMES o microempresas).',
        'Obtener reconocimiento de la dirección sobre su responsabilidad en la preparación de los estados financieros y el control interno.',
        'Confirmar acceso ilimitado a registros, personas y documentos.',
      ],
      comoHacerlo: [
        'Identifica el marco aplicable revisando el grupo de la entidad: Grupo 1 (NIIF plenas, Anexo 1), Grupo 2 (NIIF para las PYMES, Anexo 2) o Grupo 3 (microempresas, Anexo 3).',
        'Obtén de la gerencia el reconocimiento escrito de sus responsabilidades; puede ir en la misma carta de encargo.',
      ],
      norma: 'NIA 210',
      entregable: 'Lista de verificación de condiciones previas',
      enElCaso: 'La gerencia confirma que los estados financieros se preparan bajo NIIF para las PYMES (Decreto 2420, Anexo 2).',
      errorFrecuente: 'Empezar a auditar sin saber contra qué marco se evaluarán las cifras.',
      exigencias: [
        { norma: 'NIA 210.6', requisito: 'El auditor debe determinar que el marco de información financiera es aceptable y obtener la conformidad de la dirección sobre sus responsabilidades.' },
        { norma: 'NIA 210.8', requisito: 'Si las condiciones previas no se cumplen, no se debe aceptar el encargo, salvo que lo exija la ley.' },
      ],
    },
    {
      id: '1.6',
      titulo: 'Documentar y aprobar la decisión',
      resumen: 'La aceptación es una decisión de calidad de la firma y debe quedar soportada.',
      objetivo: 'Documentar la decisión de aceptación con sus alertas, sus salvaguardas y la aprobación del socio.',
      porQue:
        'La aceptación es una decisión de calidad de la firma, no un trámite: si algo sale mal, lo primero que se revisa es qué se sabía al aceptar y qué se hizo con eso. Una buena decisión que no quedó escrita no se puede demostrar. Además, las alertas que se documentan aquí son las que después guían la planeación.',
      queHacer: [
        'Completar el formato de aceptación con los riesgos identificados y cómo se mitigan.',
        'Obtener la aprobación del socio responsable.',
        'Archivar en el archivo permanente del cliente.',
      ],
      comoHacerlo: [
        'Llena un formato de aceptación con: riesgos del cliente, independencia, competencia, honorarios y conclusión (aceptar, aceptar con salvaguardas, rechazar).',
        'Haz que lo firme el socio y archívalo en el archivo permanente.',
      ],
      norma: 'NIGC 1 · NIA 220 · NIA 230',
      entregable: 'Formato de aceptación aprobado',
      enElCaso: 'Riesgo del cliente calificado como medio: dirección concentrada en el gerente-accionista y cambio reciente de revisor fiscal.',
      errorFrecuente: 'Decidir bien pero no documentarlo. Para un revisor de calidad, lo que no está escrito no se hizo.',
      exigencias: [
        { norma: 'NIGC 1', requisito: 'Las decisiones de aceptación y continuidad deben documentarse, incluida la forma en que se resolvieron los asuntos identificados.' },
        { norma: 'NIA 230.8', requisito: 'Lo que no está documentado no permite a un revisor experimentado entender el juicio aplicado.' },
      ],
    },
    {
      id: '1.7',
      titulo: 'Firmar la carta de encargo',
      resumen: 'Es el contrato que fija qué se audita, cómo y qué se entregará.',
      objetivo: 'Reconocer los elementos obligatorios de la carta de encargo y revisarlos en un borrador.',
      porQue:
        'La carta de encargo deja por escrito qué se audita, qué responsabilidades tiene cada parte y qué informe se va a entregar. Cuando surge un desacuerdo sobre el alcance, el acceso a la información o los honorarios, es la única prueba de lo pactado. En la Comercializadora, donde el gerente ya pidió limitar el trabajo en inventarios, el acceso ilimitado escrito en la carta es lo que permite sostener el alcance.',
      queHacer: [
        'Incluir objetivo y alcance, responsabilidades de la dirección y del auditor, marco aplicable y forma del informe.',
        'Definir cronograma, honorarios y la información que debe entregar el cliente.',
        'Para revisoría fiscal: nombramiento por la asamblea, aceptación escrita e inscripción en Cámara de Comercio.',
      ],
      comoHacerlo: [
        'Usa una carta modelo y personalízala con: entidad, período, marco, tipo de informe, cronograma, equipo, honorarios y lista de información a entregar.',
        'Haz que la firmen el representante legal y el socio del encargo antes de iniciar.',
        'Revisor fiscal: guarda copia del acta de asamblea con el nombramiento, la carta de aceptación y la inscripción en Cámara de Comercio.',
      ],
      modelo:
        'Objetivo y alcance. Auditaremos los estados financieros de [ENTIDAD] al 31 de diciembre de 2026, preparados conforme a la NIIF para las PYMES (Anexo 2, Decreto 2420 de 2015), con el objetivo de expresar una opinión sobre si están libres de incorrección material.\n\nResponsabilidades de la dirección. La dirección es responsable de preparar los estados financieros, del control interno que considere necesario y de proporcionarnos acceso ilimitado a la información y a las personas de la entidad.\n\nLimitaciones inherentes. Debido a las limitaciones inherentes de una auditoría, existe un riesgo inevitable de que no se detecten algunas incorrecciones materiales, aun cuando la auditoría se planifique y ejecute de acuerdo con las NIA.',
      norma: 'NIA 210 · arts. 203–217 C.Co.',
      entregable: 'Carta de encargo firmada por ambas partes',
      enElCaso: 'La carta fija la entrega del balance de prueba al 30 de septiembre para la visita interina y del cierre a diciembre para la final.',
      errorFrecuente: 'Trabajar con un acuerdo verbal. Si surge un desacuerdo, no hay prueba de lo pactado.',
      exigencias: [
        { norma: 'NIA 210.10', requisito: 'La carta debe incluir el objetivo y alcance, las responsabilidades del auditor y de la dirección, el marco aplicable y la estructura esperada del informe.' },
        { norma: 'Arts. 203–217 C.Co.', requisito: 'El revisor fiscal es elegido por la asamblea o junta de socios; su designación se inscribe en el registro mercantil.' },
      ],
      practica: {
        titulo: 'Genera la carta de encargo de la Comercializadora',
        objetivo: 'AuditorYa arma la carta con los datos del encargo; tú revisas que tenga lo que exige la NIA 210.',
        pestanas: ['carta_encargo'],
        pasos: [
          { texto: 'Pulsa «Generar carta de encargo». AuditorYa la arma con la entidad, el período y el marco del encargo.', ancla: 'carta-generar' },
          { texto: 'Lee el borrador: busca el objetivo y alcance, las responsabilidades de la dirección y del auditor, y el marco (NIIF para las PYMES).' },
          { texto: 'Si quieres, edita una sección y guarda. La aprobación es del socio; en la práctica no hace falta aprobarla.' },
        ],
        criterio: 'carta_encargo',
      },
    },
  ],
  casosReales: [
    {
      titulo: 'Enron y Arthur Andersen',
      contexto: 'Estados Unidos, 2001',
      hechos: 'Arthur Andersen auditaba a Enron y, al mismo tiempo, le cobraba honorarios de consultoría de una magnitud similar a los de auditoría. Enron ocultó deuda en entidades de propósito especial y quebró en diciembre de 2001. La firma desapareció al año siguiente.',
      leccion: 'Cuando el auditor depende económicamente del cliente, pierde la objetividad para contradecirlo. El caso dio origen a la Ley Sarbanes-Oxley, que restringió los servicios distintos de auditoría.',
      normas: 'Código de Ética IESBA · amenaza de interés propio y de autorrevisión',
    },
    {
      titulo: 'Situación frecuente en Colombia',
      contexto: 'Revisoría fiscal de una S.A.S.',
      hechos: 'Una firma contable pequeña lleva la contabilidad de una S.A.S. que superó los umbrales de revisoría fiscal y el cliente le pide que asuma también el cargo de revisor fiscal «para no contratar a otro».',
      leccion: 'No se puede aceptar: es una inhabilidad del art. 205 del C.Co. (desempeñar otro cargo en la misma compañía) y una amenaza de autorrevisión. La salida es separar los servicios o renunciar a uno de ellos.',
      normas: 'Art. 205 C.Co. · Ley 43 de 1990 · IESBA',
    },
  ],
  checkpoint: {
    aprendido: [
      'Antes de aceptar se conoce al cliente: dueños, administradores, reputación y listas restrictivas, con soporte fechado.',
      'La independencia se declara por escrito. Llevar la contabilidad del cliente es autorrevisión e inhabilita (art. 205 C.Co.).',
      'Solo se acepta si la firma tiene competencia, tiempo y personas: el presupuesto de horas se reparte por fase.',
      'Si hubo un auditor anterior, se le consulta con autorización del cliente y se revisan los saldos de apertura (NIA 510).',
      'La NIA 210 exige un marco contable aceptable y que la dirección reconozca por escrito sus responsabilidades; todo queda en la carta de encargo.',
      'La decisión de aceptar se documenta con sus alertas y salvaguardas: es una decisión de calidad de la firma.',
    ],
    caso: {
      resumen: 'Rendón & Asociados aceptó la revisoría fiscal 2026 de la Comercializadora, con riesgo medio y salvaguardas.',
      hitos: [
        'Ficha del cliente armada con el certificado de Cámara de Comercio; quedan por soportar las consultas en listas ONU/OFAC y en Supersociedades.',
        'Cuatro alertas documentadas: la salvedad y la renuncia de Héctor Salazar por el inventario y el costo de 2025, el gerente que es accionista del 85 %, el arriendo de la bodega del gerente y su pedido de no revisar tanto el inventario.',
        'Declaración de independencia firmada y 400 horas repartidas: 60 de planeación, 240 de ejecución, 60 de informe y 40 de cierre.',
        'Carta al revisor anterior enviada con la autorización escrita del gerente.',
        'Carta de encargo firmada, con el acceso ilimitado a registros y personas pactado por escrito.',
      ],
      cifras: [
        { etiqueta: 'Horas presupuestadas', valor: '400' },
        { etiqueta: 'Alertas documentadas', valor: '4' },
        { etiqueta: 'Riesgo del cliente', valor: 'Medio' },
      ],
      siguiente: 'En la Fase 2 entras al negocio: entender la Comercializadora, evaluar su control interno, leer el balance y fijar la materialidad.',
    },
    preguntas: [
      { pregunta: 'La firma que lleva la contabilidad de una S.A.S. ¿puede ser su revisor fiscal?', opciones: ['Sí, si separa los equipos y cobra honorarios distintos', 'Sí, si la asamblea lo aprueba con mayoría calificada', 'No: auditaría registros que ella misma preparó'], correcta: 2, explicacion: 'Es una amenaza de autorrevisión: el auditor no puede evaluar con objetividad registros que él mismo preparó.' },
      { pregunta: '¿Qué norma regula la carta de encargo?', opciones: ['NIA 300', 'NIA 700', 'NIA 210'], correcta: 2, explicacion: 'La NIA 210 trata el acuerdo de los términos del encargo y las condiciones previas.' },
      { pregunta: 'El auditor anterior renunció por desacuerdos con la dirección. ¿Qué haces?', opciones: ['Pedir autorización al cliente y consultar al auditor anterior', 'Aceptar sin más: los desacuerdos fueron con otro auditor', 'Rechazar el encargo: esa renuncia es causal suficiente'], correcta: 0, explicacion: 'No obliga a rechazar, pero sí a entender el desacuerdo y considerar su efecto en la aceptación y en los saldos iniciales.' },
      { pregunta: 'En el expediente, el gerente pide «no revisar tanto el inventario». ¿Cómo lo tratas?', opciones: ['Como una preferencia razonable si el inventario ya se contó', 'Como señal de riesgo de fraude: más trabajo en inventarios', 'Como causal para rechazar el encargo de inmediato'], correcta: 1, explicacion: 'Presionar para limitar el trabajo en un área es un factor de riesgo de fraude (NIA 240). No obliga a rechazar, pero sí a pactar el acceso ilimitado y a reforzar las pruebas en esa área.' },
      { pregunta: '¿Qué NO puedes dar por verificado solo con el certificado de Cámara de Comercio?', opciones: ['La razón social, el NIT y el domicilio principal', 'Las facultades y límites del representante legal', 'Que los socios no figuren en listas ONU/OFAC'], correcta: 2, explicacion: 'El certificado no dice nada sobre listas restrictivas: hay que consultarlas y guardar el soporte con fecha.' },
    ],
  },
}

// ─── F2 · Planeación ─────────────────────────────────────────────────────────

const F2: ModuloCurso = {
  id: 'planeacion',
  ref: 'Fase 2',
  numero: 2,
  corto: 'Planeación',
  titulo: 'Planeación y evaluación de riesgos',
  normas: ['NIA 300', 'NIA 315', 'NIA 320', 'NIA 240'],
  duracion: '1–2 semanas',
  intro:
    'Planear es decidir dónde puede estar el error importante y cuánto error es importante. Una buena planeación reduce horas: se trabaja duro en lo riesgoso y se trabaja poco en lo que no lo es.',
  objetivos: [
    'Entender el negocio, su control interno y sus sistemas.',
    'Fijar la materialidad y los riesgos por aseveración.',
    'Convertir los riesgos en un programa de auditoría concreto.',
  ],
  entregables: ['Memorando de planeación', 'Cálculo de materialidad', 'Matriz de riesgos', 'Programa de auditoría'],
  enColombia:
    'En Colombia la planeación debe incluir riesgos regulatorios propios: facturación y nómina electrónica, información exógena, SAGRILAFT o PTEE si aplican, y obligaciones del revisor fiscal sobre control interno y cumplimiento (art. 209 C.Co.), que se evalúan con la ISAE 3000.',
  lecciones: [
    {
      id: '2.1',
      titulo: 'Reunión inicial y solicitud de información',
      resumen: 'Se abre formalmente el trabajo con la gerencia y se pide todo lo necesario de una vez.',
      objetivo: 'Organizar la reunión de inicio y armar la lista de requerimientos (PBC) con responsables y fechas.',
      porQue:
        'Pedir la información a cuentagotas alarga el trabajo de campo y le da al cliente excusas para no entregarla. Una lista completa desde el inicio, con fechas y responsables, convierte la entrega en un compromiso verificable. La reunión inicial también sirve para escuchar a la gerencia: lo que cuenta sobre el año es la primera evidencia del entendimiento.',
      queHacer: [
        'Presentar al equipo, el cronograma y los contactos de cada área.',
        'Entregar la lista de requerimientos (PBC): balance de prueba, auxiliares, extractos, declaraciones, actas, nómina, contratos.',
        'Acordar fechas de entrega y de visitas.',
      ],
      comoHacerlo: [
        'Envía la lista PBC con fecha límite por documento y un responsable del cliente para cada uno.',
        'Incluye siempre: balance de prueba por tercero, mayor, auxiliares, conciliaciones bancarias, extractos, declaraciones (110, 300, 350, ICA), actas, nómina electrónica, PILA, contratos relevantes y estados financieros del año anterior.',
        'Registra en un control qué llegó, cuándo y qué falta.',
      ],
      norma: 'NIA 300',
      entregable: 'Acta de reunión inicial y lista PBC',
      enElCaso: 'Se solicita el balance de prueba con columnas: código, cuenta, documento, tercero, saldo inicial, débito, crédito y saldo final.',
      errorFrecuente: 'Pedir la información por partes a lo largo de la auditoría; retrasa todo y genera cansancio en el cliente.',
      exigencias: [
        { norma: 'NIA 300.7–9', requisito: 'El auditor debe establecer una estrategia global y un plan que defina naturaleza, momento y extensión de los procedimientos.' },
      ],
    },
    {
      id: '2.2',
      titulo: 'Entender la entidad y su entorno',
      resumen: 'No se puede evaluar si una cifra es razonable sin entender cómo gana dinero la empresa.',
      objetivo: 'Describir cómo gana dinero el cliente y qué cambió en el año, para saber qué cifras esperar.',
      porQue:
        'Sin entender el negocio no se puede saber si una cifra es razonable: un margen del 40 % puede ser normal en un sector y un disparate en otro. El entendimiento es lo que le da sentido a la analítica y a los riesgos. En la Comercializadora, saber que es un comercializador con margen histórico del 30 % es lo que hace sospechoso el 40,5 % de este año.',
      queHacer: [
        'Industria, competencia, regulación y factores económicos.',
        'Modelo de negocio, principales clientes y proveedores, partes relacionadas.',
        'Políticas contables, estimaciones relevantes e indicadores que mira la gerencia.',
      ],
      comoHacerlo: [
        'Haz una entrevista estructurada con gerencia, contabilidad y el área comercial: cómo vende, a quién, con qué márgenes, qué cambió este año.',
        'Lee actas de asamblea y junta del año, contratos significativos e informes de gestión.',
        'Lista las partes relacionadas: socios, administradores, familiares y empresas vinculadas.',
      ],
      norma: 'NIA 315 · NIA 550',
      entregable: 'Memorando de conocimiento del negocio',
      enElCaso: 'La Comercializadora compra mercancía y la revende con un margen histórico cercano al 30 %. Ese dato será la base de la analítica del costo.',
      errorFrecuente: 'Copiar el conocimiento del negocio del año anterior sin actualizarlo.',
      exigencias: [
        { norma: 'NIA 315', requisito: 'Exige conocer la entidad, su entorno, el marco contable aplicable y el sistema de control interno para identificar riesgos.' },
        { norma: 'NIA 550', requisito: 'Debe identificarse a las partes relacionadas y las transacciones con ellas, por su riesgo de fraude y de revelación incompleta.' },
      ],
      practica: {
        titulo: 'Registra lo que cambió en el período',
        objetivo: 'Dejar documentado el entendimiento del período (NIA 315) y confirmarlo.',
        pestanas: ['entendimiento'],
        pasos: [
          { texto: 'Mira la ficha del cliente: el modelo de negocio dice que el margen histórico es cercano al 30 %.' },
          { texto: 'En «Cambios significativos del período» escribe lo que cambió: las ventas crecieron 22 %, el inventario 51 % y hubo cambio de revisor fiscal.', ancla: 'ent-cambios' },
          { texto: 'En «Eventos significativos» anota que la utilidad 2025 (20 M) sigue sin trasladar en la 3605.', ancla: 'ent-eventos' },
          { texto: 'Pulsa «Confirmar entendimiento».', ancla: 'ent-confirmar' },
        ],
        criterio: 'entendimiento',
      },
    },
    {
      id: '2.3',
      titulo: 'Entender el control interno y los sistemas',
      resumen: 'Se identifica cómo se generan, aprueban y registran las transacciones.',
      objetivo: 'Evaluar el control interno con los cinco componentes COSO e identificar las deficiencias que afectan las cifras.',
      porQue:
        'El control interno dice dónde es más fácil que aparezca un error o un fraude y si se puede confiar en los registros. Donde un control falta, el auditor necesita más pruebas sustantivas. En la Comercializadora, que la misma persona registre las facturas y prepare los pagos es una puerta abierta a pagos indebidos: cambia el riesgo de compras y del costo.',
      queHacer: [
        'Revisar los cinco componentes: entorno de control, evaluación de riesgos, sistema de información, actividades de control y monitoreo.',
        'Hacer recorridos de los ciclos clave: ventas-cobro, compras-pago, nómina, tesorería y cierre.',
        'Entender el software contable, quién tiene acceso y cómo se hacen los ajustes manuales.',
      ],
      comoHacerlo: [
        'Para cada ciclo, sigue una transacción de principio a fin (recorrido): de la orden de compra al pago, de la factura al cobro.',
        'Anota quién autoriza, quién registra y quién custodia; si la misma persona hace dos de las tres, hay falta de segregación.',
        'Revisa los accesos del software contable: quién crea terceros, quién registra asientos manuales y quién cierra períodos.',
      ],
      norma: 'NIA 315',
      entregable: 'Narrativas o flujogramas por ciclo',
      enElCaso: 'El mismo auxiliar registra facturas de proveedores y prepara los pagos: hay falta de segregación de funciones.',
      errorFrecuente: 'Describir controles que solo existen en el manual y no en la práctica.',
      exigencias: [
        { norma: 'NIA 315', requisito: 'El auditor debe entender los componentes del control interno y evaluar el diseño e implementación de los controles relevantes.' },
        { norma: 'ISAE 3000 (revisor fiscal)', requisito: 'Base para el pronunciamiento sobre control interno exigido por el art. 209 C.Co.' },
      ],
      practica: {
        titulo: 'Califica las actividades de control',
        objetivo: 'Evaluar el componente COSO donde está la falta de segregación de funciones.',
        pestanas: ['control_interno'],
        pasos: [
          { texto: 'Recuerda el recorrido de compras-pago: el mismo auxiliar registra las facturas de proveedores y prepara los pagos.' },
          { texto: 'Busca el componente «Actividades de control». Ahí viven la autorización y la segregación de funciones.', ancla: 'coso-actividades_control' },
          { texto: 'Califícalo como «Con deficiencias» (o «Deficiente») y escribe la observación: quién registra y quién paga.' },
          { texto: 'Guarda el componente.' },
        ],
        criterio: 'coso_actividades',
      },
    },
    {
      id: '2.4',
      titulo: 'Aplicar procedimientos analíticos preliminares',
      resumen: 'Comparar cifras para descubrir dónde algo no encaja.',
      objetivo: 'Comparar cifras y razones del balance para encontrar las variaciones que no tienen explicación.',
      porQue:
        'La analítica preliminar es la forma más barata de saber dónde mirar: en minutos señala las cuentas que se movieron de forma inesperada. Lo que no encaja se convierte en riesgo y orienta las pruebas. En la Comercializadora, un inventario que crece 51 % mientras el costo crece 4 % es la primera pista del costo omitido.',
      queHacer: [
        'Comparar el balance actual con el del año anterior y el presupuesto.',
        'Calcular márgenes, rotaciones y razones de liquidez y endeudamiento.',
        'Marcar como posible riesgo toda variación sin explicación lógica.',
      ],
      comoHacerlo: [
        'Arma una hoja comparativa: año actual, año anterior, variación absoluta y porcentual.',
        'Calcula indicadores: margen bruto, días de cartera, días de inventario, días de proveedores, endeudamiento.',
        'Marca toda variación mayor a la materialidad de ejecución o al 10 % sin explicación lógica.',
      ],
      norma: 'NIA 315 · NIA 520',
      entregable: 'Cédula de analítica preliminar',
      enElCaso: 'El margen bruto saltó de 30 % a 40,5 % y el inventario creció 51 % mientras el costo solo 4 %: hay ventas (unos 150 M) cuyo costo no se registró. Se marca de inmediato como área de riesgo.',
      errorFrecuente: 'Hacer la analítica como un trámite sin preguntar el porqué de las variaciones.',
      exigencias: [
        { norma: 'NIA 315', requisito: 'Los procedimientos analíticos son obligatorios como procedimiento de valoración del riesgo.' },
        { norma: 'NIA 520', requisito: 'Define cómo usar la analítica como prueba sustantiva y en la revisión final.' },
      ],
      practica: {
        titulo: 'Encuentra lo que no cuadra en el balance',
        objetivo: 'Leer la analítica del balance y llevar la variación inusual a la matriz de riesgos.',
        pestanas: ['balance', 'riesgos'],
        pasos: [
          { texto: 'En «Balance» revisa los indicadores: el margen bruto pasó de 30 % a 40,5 % y hay una alerta de inventario frente al costo.' },
          { texto: 'Cambia a «Riesgos» y pulsa «Desde el balance»: AuditorYa propone riesgos a partir de las variaciones inusuales.', ancla: 'riesgos-desde-balance' },
          { texto: 'Selecciona el candidato de Inventarios (1435, +51 %) y agrégalo a la matriz.' },
        ],
        criterio: 'riesgo_analitico',
      },
    },
    {
      id: '2.5',
      titulo: 'Determinar la materialidad',
      resumen: 'La materialidad es el monto a partir del cual un error cambiaría las decisiones de un usuario de los estados financieros.',
      objetivo: 'Calcular la materialidad global, la de ejecución y el umbral trivial, y justificar la base elegida.',
      porQue:
        'Sin materialidad no hay forma de decidir qué es grave: se revisaría todo con el mismo detalle o se escaparía lo importante. Es la regla que convierte «encontré un error» en «esto cambia la opinión», y de ella dependen el tamaño de las muestras, qué ajustes se acumulan y el tipo de dictamen. Una base mal elegida, como una utilidad inflada, deja pasar errores que sí importan.',
      queHacer: [
        'Elegir una base: utilidad antes de impuestos, ingresos, activos o patrimonio, según lo que miran los usuarios.',
        'Aplicar un porcentaje razonable y documentar el juicio.',
        'Fijar la materialidad de ejecución (usualmente 50 %–75 % de la global) y el umbral de errores triviales (usualmente 3 %–5 %).',
      ],
      comoHacerlo: [
        'Elige la base según el usuario: utilidad antes de impuestos si es estable, ingresos si la utilidad es volátil, activos o patrimonio en entidades sin ánimo de lucro o inversoras.',
        'Rangos usuales de referencia: 5 % de la utilidad antes de impuestos, 0,5 %–1 % de ingresos, 1 %–2 % de activos totales.',
        'Documenta por qué elegiste esa base y ese porcentaje; revisa la cifra si los estados financieros finales cambian mucho.',
      ],
      tabla: {
        encabezados: ['Concepto', 'Base / %', 'Importe (COP)'],
        filas: [
          ['Ingresos 2026', 'Base', '1.000.000.000'],
          ['Materialidad global', '1 % de ingresos', '10.000.000'],
          ['Materialidad de ejecución', '75 % de la global', '7.500.000'],
          ['Umbral de errores triviales', '5 % de la global', '500.000'],
        ],
      },
      norma: 'NIA 320 · NIA 450',
      entregable: 'Cédula de cálculo de materialidad',
      enElCaso: 'La utilidad es volátil (20 M en 2025, 38 M en 2026 y pérdida si se corrige el costo omitido), así que la base son los ingresos. Errores por debajo de 500.000 pesos no se acumulan.',
      errorFrecuente: 'Usar siempre el mismo porcentaje sin explicar por qué esa base representa a los usuarios.',
      exigencias: [
        { norma: 'NIA 320.10–11', requisito: 'El auditor debe determinar la materialidad para los estados financieros en su conjunto y la materialidad de ejecución.' },
        { norma: 'NIA 320.12', requisito: 'Debe revisarla si durante la auditoría conoce información que habría llevado a una cifra diferente.' },
        { norma: 'NIA 450.A2', requisito: 'Permite fijar un umbral por debajo del cual las incorrecciones son claramente insignificantes.' },
      ],
      practica: {
        titulo: 'Calcula la materialidad de la Comercializadora',
        objetivo: 'Elegir la base correcta y dejar la materialidad calculada en el encargo.',
        pestanas: ['materialidad'],
        pasos: [
          { texto: 'En «Base de cálculo» elige Ingresos: la utilidad es volátil y está inflada por el costo omitido.', ancla: 'mat-base' },
          { texto: 'Pulsa «Tomar del balance» para traer los ingresos (1.000 M) al monto de la base.', ancla: 'mat-monto' },
          { texto: 'Pon 1 en «% materialidad» y 75 en «% materialidad de desempeño».', ancla: 'mat-porc' },
          { texto: 'Escribe la justificación y pulsa «Guardar materialidad».', ancla: 'mat-just' },
        ],
        criterio: 'materialidad',
      },
    },
    {
      id: '2.6',
      titulo: 'Identificar y evaluar los riesgos de incorrección material',
      resumen: 'Para cada rubro se pregunta qué podría estar mal y en qué aseveración.',
      objetivo: 'Formular riesgos por rubro y aseveración, calificarlos y definir la respuesta a cada uno.',
      porQue:
        'El auditor no puede probarlo todo: la evaluación de riesgos decide dónde se concentra el esfuerzo. Un riesgo mal formulado («riesgo en inventarios») no dice qué probar; uno bien formulado («el costo de ventas está incompleto») lleva directo a la prueba. Lo que aquí no se identifica difícilmente se descubre después.',
      queHacer: [
        'Evaluar el riesgo inherente y el riesgo de control por aseveración: existencia, integridad, exactitud, valuación, corte, presentación.',
        'Identificar los riesgos significativos que requieren respuesta especial.',
        'Considerar el fraude: el riesgo en el reconocimiento de ingresos se presume, y la elusión de controles por la dirección se asume siempre.',
        'Hacer una discusión del equipo sobre dónde podrían estar los errores.',
      ],
      comoHacerlo: [
        'Usa una matriz con columnas: rubro, aseveración, riesgo identificado, riesgo inherente (alto/medio/bajo), riesgo de control, ¿significativo?, respuesta planeada y referencia del papel.',
        'Convoca una sesión de 30–60 minutos con todo el equipo para discutir dónde y cómo podrían manipularse los estados financieros, y deja acta.',
        'Incluye siempre dos riesgos de fraude: ingresos (o documenta por qué no aplica) y elusión de controles por la dirección.',
      ],
      norma: 'NIA 315 · NIA 240 · NIA 250',
      entregable: 'Matriz de riesgos por aseveración',
      enElCaso: 'Riesgos significativos: integridad del costo de ventas (unos 105 M sin registrar) y existencia de la cartera sin movimiento de Comercial Andina (25 M).',
      errorFrecuente: 'Calificar todos los riesgos como «medios». La matriz debe discriminar.',
      exigencias: [
        { norma: 'NIA 240.15', requisito: 'Exige la discusión del equipo sobre la susceptibilidad de los estados financieros a fraude.' },
        { norma: 'NIA 240.26–27', requisito: 'Presume riesgo de fraude en el reconocimiento de ingresos; si se refuta, debe documentarse el motivo.' },
        { norma: 'NIA 240.31', requisito: 'El riesgo de elusión de controles por la dirección está presente en todas las entidades.' },
      ],
      practica: {
        titulo: 'Registra el riesgo significativo del costo de ventas',
        objetivo: 'Dejar en la matriz el riesgo de integridad del costo, con su nivel y su respuesta.',
        pestanas: ['riesgos'],
        pasos: [
          { texto: 'Pulsa «Agregar» para crear un riesgo nuevo.', ancla: 'riesgos-agregar' },
          { texto: 'Área: Costo de ventas. En la descripción explica que el costo está incompleto (integridad): faltarían ~105 M.', ancla: 'r-area' },
          { texto: 'Riesgo inherente Alto y riesgo de control Alto (no hay segregación de funciones): el combinado queda Alto.', ancla: 'r-inh' },
          { texto: 'En la respuesta planeada escribe la prueba: conciliar las salidas de inventario con el costo de ventas.', ancla: 'r-resp' },
        ],
        criterio: 'riesgo_costo',
      },
    },
    {
      id: '2.7',
      titulo: 'Definir la estrategia y el plan',
      resumen: 'Se decide el enfoque general y se asignan recursos.',
      objetivo: 'Definir el enfoque de la auditoría y dejarlo en el memorando de planeación.',
      porQue:
        'La estrategia une todo lo anterior en una decisión: confiar en controles o ir a pruebas sustantivas, cuándo hacer cada visita y quién hace qué. Sin ella, cada miembro del equipo audita a su manera. El memorando es además la prueba de que se planeó antes de ejecutar, que es lo primero que se mira en una revisión de calidad.',
      queHacer: [
        'Elegir enfoque: confiar en controles y reducir pruebas sustantivas, o enfoque sustantivo puro.',
        'Programar la visita interina y la final, la observación de inventarios y las confirmaciones.',
        'Asignar responsables por área y presupuestar horas.',
      ],
      comoHacerlo: [
        'Decide el enfoque por ciclo, no para toda la auditoría: puedes confiar en controles de nómina y ser sustantivo en inventarios.',
        'Programa una visita interina (por ejemplo, a septiembre) para adelantar pruebas y reducir carga al cierre.',
        'Reserva fechas fijas para conteo físico, confirmaciones y reunión con la gerencia.',
      ],
      norma: 'NIA 300 · NIA 330',
      entregable: 'Memorando de estrategia y cronograma',
      enElCaso: 'Por la débil segregación de funciones, se elige enfoque sustantivo: no se confiará en controles.',
      errorFrecuente: 'Diseñar la estrategia antes de evaluar los riesgos.',
      exigencias: [
        { norma: 'NIA 300.7–8', requisito: 'La estrategia debe definir alcance, calendario, dirección del encargo y recursos.' },
        { norma: 'NIA 330.8', requisito: 'Si el auditor espera que los controles operen eficazmente, debe probarlos.' },
      ],
      practica: {
        titulo: 'Genera el memo de planeación',
        objetivo: 'Consolidar entendimiento, control interno, materialidad y riesgos en el memo (NIA 300).',
        pestanas: ['memo'],
        pasos: [
          { texto: 'Pulsa «Generar memo». AuditorYa toma lo que hiciste en las lecciones anteriores: entendimiento, COSO, materialidad y riesgos.', ancla: 'memo-generar' },
          { texto: 'Revisa la sección de estrategia: con la segregación débil, el enfoque debe ser sustantivo.' },
          { texto: 'Si falta algo, vuelve a la lección correspondiente: el memo solo refleja lo que está en el encargo.' },
        ],
        criterio: 'memo_planeacion',
      },
    },
    {
      id: '2.8',
      titulo: 'Elaborar el programa de auditoría',
      resumen: 'El programa traduce cada riesgo en procedimientos concretos que se ejecutarán.',
      objetivo: 'Convertir cada riesgo en pruebas concretas, con su papel de trabajo y los documentos que hay que pedir al cliente.',
      porQue:
        'Un riesgo sin prueba es una preocupación anotada, no una respuesta. El programa traduce cada riesgo en procedimientos que cualquiera del equipo puede ejecutar y revisar, y asegura que ningún rubro material quede sin prueba (NIA 330). De cada prueba sale además lo que el cliente debe entregar: pedirlo a tiempo es lo que permite cumplir el cronograma.',
      queHacer: [
        'Por cada riesgo de la matriz, escribir el procedimiento, la aseveración, la referencia del papel de trabajo y el responsable.',
        'Asegurar que todo saldo material tenga al menos una prueba sustantiva.',
        'Obtener la aprobación del socio antes de ejecutar.',
      ],
      comoHacerlo: [
        'Escribe cada procedimiento en imperativo y verificable: «Obtener confirmación directa de los 10 mayores saldos de cartera y de una muestra aleatoria del resto».',
        'Asigna la referencia del papel (en AuditorYa, la letra del área y un consecutivo: Z-1 es el primer papel de costo de ventas), responsable, fecha y horas.',
        'Comprueba que no quede ningún riesgo de la matriz sin procedimiento ni ningún saldo material sin prueba sustantiva.',
        'De cada prueba sale la lista de documentos que el cliente debe entregar (PBC): pídelos con tiempo y marca lo que llega.',
      ],
      norma: 'NIA 300 · NIA 330',
      entregable: 'Programa de auditoría aprobado',
      enElCaso: 'Riesgo: costo de ventas incompleto. Pruebas: conciliar las salidas del kárdex con el costo (Z-1) y analizar el margen bruto (Z-2). Documentos al cliente: el kárdex valorizado, el auxiliar del costo y el de compras.',
      errorFrecuente: 'Usar un programa estándar sin ajustarlo a los riesgos del cliente.',
      exigencias: [
        { norma: 'NIA 300.9', requisito: 'El plan de auditoría debe describir la naturaleza, el momento y la extensión de los procedimientos.' },
        { norma: 'NIA 330.18', requisito: 'Con independencia del riesgo valorado, deben aplicarse procedimientos sustantivos a cada tipo de transacción, saldo e información a revelar material.' },
      ],
      practica: {
        titulo: 'Del riesgo del costo a las pruebas y los documentos',
        objetivo: 'Diseñas las pruebas del riesgo del costo de ventas y AuditorYa arma la lista de documentos que le pides al cliente.',
        pestanas: ['riesgos', 'pbc'],
        pasos: [
          { texto: 'La socia ya aprobó la materialidad: la ejecución está habilitada. En el riesgo de Costo de ventas pulsa «Responder».', ancla: 'r-responder' },
          { texto: 'Del programa de Costo de ventas marca «Conciliación del kárdex con el costo de ventas» (integridad) y, si quieres, la analítica del margen bruto.', ancla: 'r-programa' },
          { texto: 'Pulsa «Crear papeles de las pruebas». Cada prueba queda como papel de trabajo (Z-1, Z-2…) enlazado al riesgo.', ancla: 'r-crear-pruebas' },
          { texto: 'Cierra el modal y abre la pestaña «Documentos»: ahí está la lista para el cliente que salió de las pruebas.' },
          { texto: 'Patricia ya envió el kárdex valorizado: márcalo como recibido con el botón ✓.', ancla: 'pbc-lista' },
        ],
        criterio: 'pruebas_costo',
      },
    },
  ],
  casosReales: [
    {
      titulo: 'Tesco',
      contexto: 'Reino Unido, 2014',
      hechos: 'El supermercado reconoció de forma anticipada ingresos comerciales de proveedores (descuentos y bonificaciones por volumen) y sobreestimó su utilidad en cerca de 250 millones de libras. El error se detectó por una denuncia interna.',
      leccion: 'Los ingresos con reglas complejas (rebates, descuentos por volumen, contratos con condiciones) son terreno típico de fraude. Entender el modelo de negocio en la planeación es lo que permite ver dónde se puede manipular la cifra.',
      normas: 'NIA 240.26 (presunción de fraude en ingresos) · NIA 315',
    },
    {
      titulo: 'Situación frecuente en Colombia',
      contexto: 'Analítica preliminar',
      hechos: 'Al comparar el balance con la información exógena y con el reporte de facturación electrónica de la DIAN, los ingresos facturados superan a los contabilizados en varios cientos de millones.',
      leccion: 'La diferencia se vuelve un riesgo significativo de integridad de ingresos y de riesgo tributario. Se planea un cruce completo factura por factura en la ejecución.',
      normas: 'NIA 315 · NIA 520 · Resolución DIAN 000165 de 2023 (facturación electrónica)',
    },
  ],
  checkpoint: {
    aprendido: [
      'La reunión inicial abre el trabajo y la lista de requerimientos pide de una vez lo que se necesita ahora; la carta de representación y las confirmaciones no van ahí.',
      'Entender el negocio dice qué cifras esperar. El control interno se evalúa con los cinco componentes COSO (NIA 315).',
      'La analítica preliminar compara cifras y razones para encontrar lo que no encaja antes de diseñar pruebas (NIA 520).',
      'La materialidad se calcula sobre una base estable; la de ejecución deja margen para errores no detectados (NIA 320).',
      'Cada riesgo se asigna a un rubro y una aseveración, con su respuesta planeada. El fraude en ingresos se presume (NIA 240).',
      'La estrategia y el programa convierten los riesgos en procedimientos que cualquiera del equipo puede ejecutar (NIA 300).',
    ],
    caso: {
      resumen: 'La planeación quedó cerrada y apunta a un riesgo principal: el costo de ventas de la Comercializadora estaría incompleto.',
      hitos: [
        'Entendimiento confirmado: ventas +22 % e inventario +51 % frente a 2025; la utilidad 2025 (20 M) sigue sin trasladar en la cuenta 3605.',
        'Control interno con deficiencias: Julián Torres registra las facturas de proveedores y también prepara los pagos.',
        'Analítica: el margen bruto pasó de 30 % a 40,5 % mientras el costo solo creció 4 %.',
        'Riesgo significativo de integridad en costo de ventas, con riesgo inherente y de control altos. Respuesta: conciliar el kárdex con el costo.',
        'Enfoque sustantivo, memo de planeación y programa: Z-1 concilia el kárdex con el costo, y el kárdex ya está pedido al cliente.',
      ],
      cifras: [
        { etiqueta: 'Materialidad global', valor: '10 M' },
        { etiqueta: 'Materialidad de ejecución', valor: '7,5 M' },
        { etiqueta: 'Umbral trivial', valor: '0,5 M' },
        { etiqueta: 'Margen bruto', valor: '40,5 % (histórico 30 %)' },
      ],
      siguiente: 'En la Fase 3 sales a buscar la evidencia: validar el balance, recalcular el costo con el kárdex y confirmar la cartera.',
    },
    preguntas: [
      { pregunta: '¿Qué riesgo de fraude presume la NIA 240 en casi todas las auditorías?', opciones: ['En la valuación de los inventarios', 'En las estimaciones de deterioro', 'En el reconocimiento de ingresos'], correcta: 2, explicacion: 'Se presume riesgo de fraude en ingresos, salvo que se documente por qué no aplica. La elusión de controles por la dirección se asume siempre.' },
      { pregunta: 'Materialidad global 10 millones y de ejecución al 75 %. ¿Cuál es la materialidad de ejecución?', opciones: ['750.000', '7.500.000', '10.000.000'], correcta: 1, explicacion: '10.000.000 × 75 % = 7.500.000. Se usa para diseñar pruebas y dejar margen para errores no detectados.' },
      { pregunta: 'Si los controles son débiles, ¿qué enfoque es razonable?', opciones: ['Enfoque sustantivo, con más pruebas de detalle', 'Confiar en los controles para ahorrar tiempo', 'Reducir la muestra porque el riesgo ya se conoce'], correcta: 0, explicacion: 'Si no se puede confiar en los controles, la evidencia tiene que venir de pruebas sustantivas.' },
      { pregunta: 'En la Comercializadora el margen bruto saltó de 30 % a 40,5 % y el inventario creció 51 %, pero el costo solo 4 %. ¿Qué haces con ese dato?', opciones: ['Lo aceptas: el gerente dice que negoció mejores precios', 'Lo llevas a la matriz como posible costo incompleto', 'Lo dejas para la ejecución, cuando tengas los soportes'], correcta: 1, explicacion: 'La explicación del gerente hay que corroborarla con evidencia. La analítica preliminar existe precisamente para encontrar estas inconsistencias y planear la respuesta (NIA 315 y 520).' },
      { pregunta: '¿Por qué la materialidad del caso se calcula sobre los ingresos y no sobre la utilidad?', opciones: ['Porque la utilidad es volátil y los ingresos son estables', 'Porque la NIA 320 exige los ingresos en empresas comerciales', 'Porque los ingresos dan una materialidad más alta y eficiente'], correcta: 0, explicacion: 'La NIA 320 no impone una base: se elige la que miran los usuarios y que es estable. Una utilidad pequeña o volátil da una materialidad poco confiable.' },
    ],
  },
}

// ─── F3 · Ejecución ──────────────────────────────────────────────────────────

const F3: ModuloCurso = {
  id: 'ejecucion',
  ref: 'Fase 3',
  numero: 3,
  corto: 'Ejecución',
  titulo: 'Ejecución del trabajo de campo',
  normas: ['NIA 330', 'NIA 500', 'NIA 520', 'NIA 530', 'NIA 450'],
  duracion: '2–6 semanas',
  intro:
    'Aquí se obtiene la evidencia. Cada procedimiento responde a un riesgo de la matriz y cada resultado queda en un papel de trabajo que otro auditor podría entender sin preguntar.',
  objetivos: [
    'Validar la información fuente antes de analizarla.',
    'Obtener evidencia suficiente y adecuada para cada saldo material.',
    'Acumular, cuantificar y comunicar los hallazgos.',
  ],
  entregables: ['Papeles de trabajo por rubro', 'Registro de hallazgos', 'Ajustes propuestos (AJE)', 'Carta de recomendaciones'],
  enColombia:
    'La evidencia en Colombia tiene fuentes externas que el auditor puede usar directamente: la plataforma de facturación electrónica de la DIAN (facturas emitidas y recibidas), la nómina electrónica, la planilla PILA, el RUT y los certificados bancarios. Son evidencia más fiable que los documentos internos porque provienen de terceros (NIA 500).',
  lecciones: [
    {
      id: '3.1',
      titulo: 'Preparación y validación de la información',
      resumen: 'Antes de analizar, se comprueba que la información de la entidad sea completa y exacta.',
      objetivo: 'Validar que el balance de prueba y los auxiliares estén completos y cuadren antes de analizarlos.',
      porQue:
        'Toda la ejecución se apoya en la información del cliente: si el balance no cuadra o le faltan cuentas, cada prueba posterior parte de cifras equivocadas. Validarla primero evita rehacer trabajo y es la base para que la evidencia sea fiable (NIA 500).',
      queHacer: [
        'Confirmar que el balance de prueba cuadre: débitos = créditos y Activo = Pasivo + Patrimonio.',
        'Verificar en cada cuenta: saldo final = saldo inicial + débitos − créditos.',
        'Conciliar el balance con el libro mayor y los estados financieros.',
        'Si no cuadra, detenerse y pedir un balance corregido.',
      ],
      comoHacerlo: [
        'Importa el balance a una hoja con fórmulas de control: suma de saldos iniciales, débitos, créditos y saldos finales.',
        'Recalcula cada fila (SI + D − C) y filtra las diferencias.',
        'Concilia los totales por clase con los estados financieros presentados y con el mayor; deja marca Σ y referencia cruzada.',
      ],
      norma: 'NIA 500 · NIA 330',
      entregable: 'Validación del balance de prueba (ecuación contable)',
      enElCaso: 'El balance de la Comercializadora cuadra al peso: activo 577 M = pasivo 267 M + patrimonio 272 M + resultado 38 M. Se puede continuar.',
      errorFrecuente: 'Analizar un balance descuadrado; todas las conclusiones posteriores quedan en duda.',
      exigencias: [
        { norma: 'NIA 500.9', requisito: 'Cuando se usa información generada por la entidad, el auditor debe evaluar si es suficientemente fiable: exacta, completa y con el detalle necesario.' },
        { norma: 'NIA 330.20', requisito: 'Debe verificarse la concordancia de los estados financieros con los registros contables subyacentes.' },
      ],
    },
    {
      id: '3.2',
      titulo: 'Evaluación de controles y análisis de cifras',
      resumen: 'Si la estrategia confía en controles, se prueba que funcionen. En todos los casos se aplica analítica sustantiva.',
      objetivo: 'Decidir cuándo probar controles y aplicar analítica sustantiva con una expectativa propia.',
      porQue:
        'Si la estrategia confía en un control, hay que probar que funcionó todo el año; si no, esa confianza no tiene base. La analítica sustantiva compara lo registrado con una expectativa que construye el auditor, no con la explicación de la gerencia. En la Comercializadora, la expectativa del costo con el margen histórico es la que cuantifica lo que falta.',
      queHacer: [
        'Probar la eficacia operativa de los controles clave con una muestra a lo largo del período.',
        'Formar una expectativa independiente de los saldos (por ejemplo, ventas × (1 − margen) = costo esperado).',
        'Investigar y corroborar con evidencia toda diferencia que supere el umbral.',
      ],
      comoHacerlo: [
        'Para probar un control, toma una muestra (por ejemplo, 25 pagos del año) y verifica evidencia de que el control ocurrió: firma de aprobación, conciliación revisada, log del sistema.',
        'Para la analítica sustantiva, construye la expectativa con datos independientes del saldo: ventas × (1 − margen histórico), número de empleados × salario promedio × meses, deuda promedio × tasa.',
        'Fija el umbral de diferencia aceptable antes de comparar, no después.',
      ],
      norma: 'NIA 330 · NIA 520',
      entregable: 'Analítica del estado de resultados · Z-1 · Conciliación del kárdex con el costo',
      enElCaso: 'Costo esperado: 1.000 M × 70 % (margen histórico de 30 %) = 700 M. Costo registrado: 595 M. Diferencia sin explicar de 105 M: hallazgo.',
      errorFrecuente: 'Aceptar la explicación de la gerencia sin pedir soporte.',
      exigencias: [
        { norma: 'NIA 330.10', requisito: 'Al probar controles, el auditor debe obtener evidencia de cómo se aplicaron durante el período y por quién.' },
        { norma: 'NIA 520.5', requisito: 'Exige evaluar la fiabilidad de los datos, desarrollar una expectativa suficientemente precisa y definir la diferencia aceptable.' },
        { norma: 'NIA 520.7', requisito: 'Las fluctuaciones significativas deben investigarse con indagación y evidencia corroborativa.' },
      ],
    },
    {
      id: '3.3',
      titulo: 'Pruebas sustantivas por ciclo',
      resumen: 'Es el corazón de la ejecución: evidencia de detalle para cada rubro material, incluidas las pruebas que siempre son obligatorias.',
      objetivo: 'Diseñar y ejecutar las pruebas de detalle de cada ciclo, incluidas las que la norma exige en todo encargo.',
      porQue:
        'Las pruebas de detalle producen la evidencia que sostiene la opinión: lo que no se prueba no se puede afirmar en el dictamen. Algunas se hacen siempre, sin importar el riesgo evaluado, porque los fraudes más graves los comete la gerencia saltándose los controles (NIA 240).',
      queHacer: [
        'Ejecutar las pruebas de detalle de cada ciclo (ver tabla).',
        'Siempre: probar asientos de diario manuales y de cierre (NIA 240), revisar estimaciones (NIA 540) e indagar sobre litigios y reclamaciones (NIA 501.9). Si aparece un litigio que pueda ser material, escribir a los abogados (NIA 501.10).',
        'Usar muestreo cuando no se examine el 100 %: definir población, método, tamaño y proyectar los errores (NIA 530).',
      ],
      comoHacerlo: [
        'Confirmaciones: el auditor prepara la carta, la envía directamente al tercero y la respuesta llega directamente al auditor. Lleva un control de envíos y respuestas.',
        'Sin respuesta: aplica procedimientos alternativos, como verificar cobros posteriores con extracto bancario o revisar facturas y remisiones firmadas.',
        'Asientos de diario: extrae el libro diario completo y filtra asientos manuales, de cierre, posteriores al corte, en fin de semana o festivo, sin descripción, con cifras redondas o hechos por usuarios inusuales.',
        'Inventario: asiste al conteo, haz pruebas de piso a lista y de lista a piso, y anota los últimos documentos de entrada y salida para el corte.',
      ],
      modelo:
        'Señores [CLIENTE DEL AUDITADO]\n\nNuestros auditores, [FIRMA], están revisando nuestros estados financieros al 31 de diciembre de 2026. Les solicitamos confirmar directamente a ellos el saldo que nos adeudaban a esa fecha, según nuestros registros: $25.000.000.\n\nSi el saldo es correcto, firmen en el espacio indicado. Si no lo es, indiquen la diferencia y su detalle.\n\nPor favor envíen su respuesta directamente a: [correo del auditor].\n\nFirma del representante legal del auditado.',
      tabla: {
        encabezados: ['Rubro', 'Prueba clave', 'Papel'],
        filas: [
          ['Efectivo', 'Conciliaciones y confirmación bancaria', 'A, B'],
          ['Cartera', 'Circularización, cobros posteriores, deterioro', 'D'],
          ['Inventarios y costo', 'Observación del conteo, valor neto realizable, conciliación del kárdex con el costo', 'F, Z'],
          ['PP&E', 'Adiciones con soporte, recálculo de depreciación', 'G'],
          ['Proveedores', 'Búsqueda de pasivos no registrados', 'BB'],
          ['Impuestos', 'Cruce con formularios 300, 350 y 110', 'DD'],
          ['Nómina', 'Cruce con nómina electrónica y PILA', 'EE'],
          ['Patrimonio', 'Actas y traslado del resultado', 'P'],
          ['Ingresos y gastos', 'Corte, ocurrencia, factura electrónica', 'X, Y'],
        ],
      },
      norma: 'NIA 330 · NIA 240 · NIA 501 · NIA 505 · NIA 530 · NIA 540',
      entregable: 'Cédulas sumarias y analíticas por rubro',
      enElCaso: 'La circularización a Comercial Andina S.A.S. (saldo de 25 millones sin movimiento) vuelve sin respuesta. Se aplican procedimientos alternativos y se evalúa el deterioro.',
      errorFrecuente: 'Saltarse las pruebas obligatorias porque el riesgo «parece bajo».',
      exigencias: [
        { norma: 'NIA 505.7', requisito: 'El auditor debe mantener el control sobre las solicitudes de confirmación externa, incluida la determinación de la información a confirmar y el envío.' },
        { norma: 'NIA 505.12', requisito: 'Ante una falta de respuesta, debe aplicar procedimientos alternativos para obtener evidencia relevante y fiable.' },
        { norma: 'NIA 240.32', requisito: 'Con independencia del riesgo, deben probarse asientos de diario y ajustes, revisarse estimaciones por sesgo y evaluarse transacciones inusuales.' },
        { norma: 'NIA 501.4', requisito: 'Si el inventario es material, el auditor debe asistir al recuento físico, salvo que sea impracticable.' },
        { norma: 'NIA 530.14', requisito: 'Las incorrecciones encontradas en la muestra deben proyectarse a la población.' },
      ],
    },
    {
      id: '3.4',
      titulo: 'Hallazgos, ajustes y comunicación',
      resumen: 'Los errores encontrados se acumulan, se clasifican y se le pide a la entidad que los corrija.',
      objetivo: 'Clasificar las incorrecciones encontradas, proponer los ajustes y comunicarlos a la gerencia.',
      porQue:
        'Un error aislado puede parecer pequeño; acumulados, pueden cambiar la opinión. Clasificarlos como factuales, de juicio o proyectados dice qué tan seguro es el monto y cómo discutirlo con la gerencia. Pedir la corrección a tiempo le da a la entidad la oportunidad de arreglar sus estados antes del dictamen.',
      queHacer: [
        'Registrar todo error por encima del umbral trivial en el registro de hallazgos.',
        'Clasificarlo como factual, de juicio o proyectado.',
        'Proponer el ajuste contable (AJE) y pedir a la gerencia que lo registre.',
        'Comunicar deficiencias de control por escrito (carta de recomendaciones).',
      ],
      comoHacerlo: [
        'Registra cada error con: cuenta, importe, tipo (factual, de juicio o proyectado), efecto en resultados y en patrimonio.',
        'Redacta cada hallazgo con la estructura condición (qué encontraste), criterio (qué dice la norma), causa (por qué pasó) y efecto (cuánto y a qué afecta).',
        'Envía a la gerencia el resumen de ajustes propuestos con fecha límite para responder.',
      ],
      norma: 'NIA 450 · NIA 265 · NIA 260',
      entregable: 'Hoja de Hallazgos · Hoja AJE · Carta de recomendaciones',
      enElCaso: 'AJE-01: traslado de la utilidad 2025 de la 3605 a la 3705 por 20 millones. AJE-02: depreciación omitida por 3 millones (supera el umbral trivial de 0,5 M: se acumula aunque no es material por sí sola). AJE-03: costo de ventas omitido por 105 millones. AJE-04: deterioro de Comercial Andina por 25 millones. El corte de ventas ya lo corrigió la contadora.',
      errorFrecuente: 'Guardar los hallazgos para el final; la gerencia necesita tiempo para corregir.',
      exigencias: [
        { norma: 'NIA 450.5', requisito: 'El auditor debe acumular las incorrecciones identificadas, salvo las claramente insignificantes.' },
        { norma: 'NIA 450.8', requisito: 'Debe comunicarlas oportunamente a la dirección y solicitar que las corrija.' },
        { norma: 'NIA 265.9', requisito: 'Las deficiencias significativas de control deben comunicarse por escrito a los responsables del gobierno.' },
        { norma: 'Art. 207 C.Co., num. 2', requisito: 'El revisor fiscal debe dar cuenta oportuna, por escrito, de las irregularidades que ocurran en el funcionamiento de la sociedad.' },
      ],
    },
    {
      id: '3.5',
      titulo: 'Cierre del trabajo de campo',
      resumen: 'Antes de pasar al informe se confirma que no queda nada abierto.',
      objetivo: 'Confirmar que el trabajo de campo quedó completo y revisado antes de pasar al informe.',
      porQue:
        'Lo que queda abierto al salir del cliente se convierte en una opinión sin soporte. El cierre del trabajo de campo obliga a comprobar que cada riesgo tenga conclusión, que las notas de revisión estén resueltas y que la evidencia final esté pedida. Volver a la entidad después es más costoso y a veces imposible.',
      queHacer: [
        'Buscar hechos posteriores hasta la fecha del informe (NIA 560).',
        'Evaluar la empresa en funcionamiento (NIA 570).',
        'Obtener la carta de representación de la gerencia (NIA 580).',
        'Hacer la analítica final y confirmar que todo riesgo tuvo respuesta.',
        'Cerrar las notas de revisión del supervisor y del socio.',
      ],
      comoHacerlo: [
        'Hechos posteriores: lee actas posteriores al cierre, revisa cobros y pagos de enero y febrero, e indaga sobre litigios nuevos.',
        // revisar con contador: indicadores exactos del Decreto 1378 de 2021.
        'Empresa en funcionamiento: aplica los indicadores de alerta del Decreto 1378 de 2021 (por ejemplo, patrimonio negativo o pérdidas en períodos consecutivos) y revisa el flujo de caja proyectado.',
        'Carta de representación: incluye integridad de la información, partes relacionadas, hechos posteriores, litigios y ajustes no registrados.',
      ],
      norma: 'NIA 560 · NIA 570 · NIA 580 · NIA 220',
      entregable: 'Memorando de cierre con propuesta de opinión',
      enElCaso: 'Los ajustes no registrados (costo 105 M, deterioro 25 M y depreciación 3 M) suman 133 M, mucho más que la materialidad global de 10 M. El memorando propone opinión modificada si no se corrigen.',
      errorFrecuente: 'Pasar al informe con notas de revisión sin responder.',
      exigencias: [
        { norma: 'NIA 560.6', requisito: 'Deben aplicarse procedimientos para identificar hechos ocurridos entre la fecha de los estados financieros y la del informe.' },
        { norma: 'NIA 570', requisito: 'El auditor debe concluir si es adecuado el uso de la hipótesis de empresa en funcionamiento.' },
        { norma: 'Ley 2069 de 2020, art. 4 y Decreto 1378 de 2021', requisito: 'Los administradores deben monitorear el deterioro de la hipótesis de negocio en marcha con indicadores de alerta.' },
        { norma: 'NIA 580.14', requisito: 'La carta de representación debe tener una fecha tan cercana como sea posible a la del informe, pero no posterior.' },
      ],
    },
  ],
  casosReales: [
    {
      titulo: 'Parmalat',
      contexto: 'Italia, 2003',
      hechos: 'La compañía declaraba unos 3.950 millones de euros en una cuenta bancaria de una filial en las Islas Caimán. La «confirmación» del banco era una carta falsificada que los auditores recibieron a través de la propia empresa.',
      leccion: 'Una confirmación solo vale si el auditor controla el envío y la recepción directamente con el tercero. Si pasa por manos del cliente, no es evidencia externa.',
      normas: 'NIA 505.7 (control de las solicitudes) · NIA 500 (fiabilidad)',
    },
    {
      titulo: 'Wirecard',
      contexto: 'Alemania, 2020',
      hechos: 'Faltaban 1.900 millones de euros que figuraban como efectivo en cuentas fiduciarias en Filipinas. Durante años se aceptaron documentos y confirmaciones de terceros intermediarios en lugar de confirmar directamente con los bancos, que finalmente negaron tener esos fondos.',
      leccion: 'El efectivo parece el rubro de menor riesgo y por eso es donde un fraude grande puede pasar desapercibido. El escepticismo profesional obliga a confirmar directamente con la fuente.',
      normas: 'NIA 200.15 (escepticismo) · NIA 505 · NIA 240',
    },
    {
      titulo: 'Situación frecuente en Colombia',
      contexto: 'Prueba de impuestos',
      hechos: 'El débito de la retención en la fuente de febrero aparece registrado contra el NIT de un asesor tributario y no contra la DIAN (800.197.268-4). El asesor recibía el dinero para pagar, pero el recibo 490 nunca se encontró.',
      leccion: 'El cruce contable por tercero detecta lo que el saldo total oculta. Se exige el recibo oficial de pago. Si la retención no se pagó, la declaración no produce efecto (art. 580-1 E.T.), corren intereses de mora (art. 634 E.T.) y no consignar lo retenido puede ser delito (art. 402 C. Penal): se evalúa el fraude y, como revisor fiscal, el deber de denunciar.',
      normas: 'NIA 240 · NIA 250 · arts. 580-1 y 634 E.T. · art. 402 C. Penal',
    },
  ],
  checkpoint: {
    aprendido: [
      'Primero se valida la información: un balance que no cuadra detiene el análisis.',
      'Los controles se prueban solo si la estrategia confía en ellos. La analítica sustantiva parte de una expectativa propia, no de la del cliente.',
      'Las pruebas de detalle dan la evidencia de cada rubro material, y probar asientos de diario es siempre obligatorio (NIA 240).',
      'Las confirmaciones las envía y las recibe el auditor, nunca el cliente (NIA 505).',
      'Las incorrecciones se acumulan como factuales, de juicio o proyectadas; las claramente triviales no se acumulan (NIA 450).',
      'La carta de representación cierra la evidencia: sin ella hay limitación al alcance (NIA 580).',
    ],
    caso: {
      resumen: 'La evidencia confirmó lo que la planeación anticipaba: el costo de ventas de la Comercializadora está subestimado en 105 M.',
      hitos: [
        'El balance cuadra al peso: activo 577 M = pasivo 267 M + patrimonio 272 M + resultado 38 M.',
        'Costo esperado: 1.000 M × 70 % = 700 M, frente a 595 M registrados. El kárdex lo confirma: salidas por 700 M y saldo final de 213 M contra 318 M en libros.',
        'La confirmación a Comercial Andina (25 M sin movimiento) no tuvo respuesta: procedimientos alternativos y evaluación del deterioro.',
        'Ajustes propuestos a Andrés: costo de ventas 105 M, deterioro de Comercial Andina 25 M, depreciación omitida 3 M y traslado de la utilidad 2025 de la 3605 a la 3705.',
        'Andrés firmó la carta de representación después de que le explicamos que sin ella no hay opinión.',
      ],
      cifras: [
        { etiqueta: 'Costo omitido', valor: '105 M' },
        { etiqueta: 'Veces la materialidad', valor: '10,5' },
        { etiqueta: 'Ajustes propuestos', valor: '4' },
      ],
      siguiente: 'En la Fase 4 Andrés decide qué ajustes acepta y tú decides la opinión.',
    },
    preguntas: [
      { pregunta: 'El balance de prueba no cuadra por 2 millones. ¿Qué haces?', opciones: ['Seguir y documentar la diferencia como hallazgo del informe', 'Ajustar los 2 M contra utilidades acumuladas y seguir', 'Detener el análisis y pedir un balance corregido'], correcta: 2, explicacion: 'Sin un balance íntegro no hay base confiable para ninguna prueba posterior.' },
      { pregunta: '¿Cuál de estas pruebas es obligatoria sin importar la evaluación de riesgos?', opciones: ['Observar el conteo físico de los activos fijos', 'Probar asientos de diario y ajustes de cierre', 'Confirmar saldos con todos los proveedores'], correcta: 1, explicacion: 'La NIA 240 exige probar asientos de diario y ajustes para responder al riesgo de elusión de controles por la dirección.' },
      { pregunta: 'Encuentras un error de 300.000 pesos con un umbral trivial de 500.000. ¿Qué haces?', opciones: ['No lo acumulas, pero anotas si sugiere algo más grave', 'Lo acumulas igual: toda diferencia cuenta para el informe', 'Lo proyectas a la población para ver si llega a material'], correcta: 0, explicacion: 'Los errores claramente triviales no se acumulan, salvo que indiquen fraude o un problema de control.' },
      { pregunta: 'La confirmación del saldo de Comercial Andina (25 M) no llega. ¿Qué haces?', opciones: ['Le pides a Andrés que consiga la respuesta y te la reenvíe', 'Aplicas procedimientos alternativos, como pagos posteriores', 'Das el saldo por bueno porque está en la contabilidad'], correcta: 1, explicacion: 'Sin respuesta se aplican procedimientos alternativos (NIA 505) y la respuesta nunca pasa por el cliente. Un saldo sin movimiento hace más de un año es además un indicio de deterioro.' },
      { pregunta: 'El kárdex muestra salidas por 700 M y el costo registrado es 595 M, con materialidad global de 10 M. ¿Cómo calificas la diferencia?', opciones: ['Error no material: es solo el 15 % del costo de ventas', 'Diferencia de juicio: no se acumula como incorrección', 'Incorrección factual y material: 10,5 veces la materialidad'], correcta: 2, explicacion: 'Está soportada por el kárdex, así que no hay duda sobre el hecho ni el monto: es factual. Y supera ampliamente la materialidad.' },
    ],
  },
}

// ─── F4 · Informe ────────────────────────────────────────────────────────────

const F4: ModuloCurso = {
  id: 'informe',
  ref: 'Fase 4',
  numero: 4,
  corto: 'Informe',
  titulo: 'Conclusión e informe',
  normas: ['NIA 700', 'NIA 701', 'NIA 705', 'NIA 706', 'arts. 208–209 C.Co.'],
  duracion: '3–5 días',
  intro:
    'Con la evidencia completa se forma la opinión y se comunica en un informe con estructura normada. En Colombia, el revisor fiscal además se pronuncia sobre asuntos legales específicos.',
  objetivos: [
    'Evaluar si las incorrecciones no corregidas son materiales.',
    'Elegir el tipo de opinión correcto.',
    'Redactar y fechar el informe con todo su soporte.',
  ],
  entregables: ['Informe del auditor / dictamen del revisor fiscal', 'Informe a la asamblea', 'Carta de recomendaciones final'],
  enColombia:
    'El informe del revisor fiscal tiene dos partes: la opinión sobre los estados financieros (NIA 700, 705 y 706) y el informe sobre otros requerimientos legales y reglamentarios (art. 209 C.Co.). Los pronunciamientos sobre actos de los administradores y control interno se soportan en un encargo de aseguramiento bajo ISAE 3000.',
  lecciones: [
    {
      id: '4.1',
      titulo: 'Evaluar la evidencia y las incorrecciones no corregidas',
      resumen: 'Se suma lo que la gerencia no quiso o no alcanzó a corregir y se compara con la materialidad.',
      objetivo: 'Sumar las incorrecciones no corregidas y evaluarlas frente a la materialidad, por su monto y por su naturaleza.',
      porQue:
        'Es el puente entre la evidencia y la opinión: lo que la gerencia no corrigió, sumado, decide si los estados financieros están libres de incorrección material (NIA 450). Mirar solo el monto no basta: un error pequeño que convierte una pérdida en utilidad puede ser material por su naturaleza.',
      queHacer: [
        'Totalizar los errores no corregidos, solos y en conjunto.',
        'Considerar su efecto cualitativo: ¿convierten una pérdida en utilidad?, ¿afectan un compromiso de deuda?',
        'Confirmar que la evidencia es suficiente y adecuada para cada aseveración relevante.',
      ],
      comoHacerlo: [
        'Arma un resumen de diferencias no ajustadas: ajuste propuesto, efecto en activo, pasivo, patrimonio y resultado, y comparación con la materialidad.',
        'Evalúa también el efecto cualitativo: si cambia una tendencia, convierte pérdida en utilidad o incumple un covenant.',
        'Revisa que cada riesgo de la matriz tenga conclusión en un papel firmado.',
      ],
      norma: 'NIA 450 · NIA 330',
      entregable: 'Resumen de diferencias no ajustadas',
      enElCaso: 'No corregido: costo de ventas 105 M, deterioro de Comercial Andina 25 M y depreciación 3 M. Suman 133 M, más de trece veces la materialidad global de 10 M, y convierten la utilidad de 38 M en una pérdida de 95 M.',
      errorFrecuente: 'Evaluar solo el monto y no el efecto cualitativo.',
      exigencias: [
        { norma: 'NIA 450.11', requisito: 'El auditor debe determinar si las incorrecciones no corregidas son materiales, individualmente o de forma agregada.' },
        { norma: 'NIA 330.25–26', requisito: 'Debe concluir si se obtuvo evidencia suficiente y adecuada.' },
      ],
      practica: {
        titulo: 'Arma la hoja de ajustes de la Comercializadora',
        objetivo: 'Registras lo que Andrés no corrigió y AuditorYa lo compara con la materialidad para sugerir la opinión.',
        pestanas: ['ajustes'],
        pasos: [
          { texto: 'Registra el costo de ventas omitido: descripción, cuenta 6135, monto 105000000 (en pesos), tipo Factual, efecto Resultado. Pulsa «Agregar».', ancla: 'aj-form' },
          { texto: 'Registra el deterioro de Comercial Andina: 25000000, tipo De juicio (depende de evaluar si se recupera), efecto Resultado.', ancla: 'aj-form' },
          { texto: 'Registra la depreciación omitida del equipo de oficina: 3000000, tipo Factual, efecto Resultado.', ancla: 'aj-form' },
          { texto: 'El error de corte de ventas (8000000, tipo Proyectado) también va a la hoja, pero la contadora ya lo corrigió: márcalo en la columna «Corregido».', ancla: 'aj-tabla' },
          { texto: 'Lee la opinión sugerida: 133 M sin corregir contra una materialidad de 10 M. Es una sugerencia; la decisión es de la socia.', ancla: 'aj-opinion' },
        ],
        criterio: 'hoja_ajustes',
      },
    },
    {
      id: '4.2',
      titulo: 'Revisar los estados financieros finales',
      resumen: 'Se lee el juego completo de estados financieros como lo verá el usuario.',
      objetivo: 'Leer los estados financieros finales y sus notas para confirmar que revelan lo que el usuario necesita.',
      porQue:
        'El usuario no ve los papeles de trabajo: ve los estados financieros con sus notas. Una cifra correcta con una revelación incompleta, como una operación con el gerente que no aparece en las notas, también induce a error. Esta lectura final es la última oportunidad de verlos como los verá el lector.',
      queHacer: [
        'Verificar que incluyan los ajustes aceptados.',
        'Revisar las notas y revelaciones exigidas por el marco (partes relacionadas, políticas, contingencias).',
        'Comprobar las cifras comparativas del año anterior (NIA 710).',
        'Leer el informe de gestión y otra información para detectar inconsistencias (NIA 720).',
      ],
      comoHacerlo: [
        'Usa una lista de verificación de revelaciones del marco aplicable (NIIF para las PYMES o NIIF plenas).',
        'Cruza cada cifra de las notas con los papeles de trabajo.',
        'Verifica que los estados financieros estén certificados por el representante legal y el contador (art. 37, Ley 222 de 1995).',
      ],
      norma: 'NIA 700 · NIA 710 · NIA 720',
      entregable: 'Lista de verificación de revelaciones',
      enElCaso: 'Las notas no revelan la transacción con el gerente-accionista. Se exige incluirla como parte relacionada.',
      errorFrecuente: 'Auditar las cifras y no leer las notas.',
      exigencias: [
        { norma: 'NIA 700', requisito: 'Debe evaluarse si los estados financieros revelan adecuadamente las políticas contables y si son comprensibles.' },
        { norma: 'NIA 720', requisito: 'El auditor debe leer la otra información (como el informe de gestión) y considerar si hay incongruencias materiales.' },
        { norma: 'Art. 37, Ley 222 de 1995', requisito: 'El representante legal y el contador certifican que verificaron las afirmaciones contenidas en los estados financieros.' },
      ],
    },
    {
      id: '4.3',
      titulo: 'Decidir el tipo de opinión',
      resumen: 'La opinión depende de dos preguntas: ¿el problema es material? y ¿es generalizado?',
      objetivo: 'Elegir el tipo de opinión respondiendo dos preguntas: qué clase de problema hay y qué tan extendido está.',
      porQue:
        'La opinión es el producto de toda la auditoría y lo único que la mayoría de los usuarios lee. Elegir mal el tipo de opinión engaña tanto como no auditar: minimizar un problema o exagerarlo lleva al lector a decidir mal. Por eso la decisión se razona con las mismas preguntas en todos los encargos y queda documentada.',
      queHacer: [
        'Si no hay incorrecciones materiales: opinión no modificada (favorable o limpia).',
        'Si las hay o falta evidencia, usar la matriz de la NIA 705.',
      ],
      comoHacerlo: [
        'Responde dos preguntas: ¿el problema es una incorrección o una falta de evidencia? y ¿es material y generalizado?',
        'Documenta en el memorando por qué la incorrección es o no es generalizada: afecta varios rubros, es fundamental para entender los estados financieros o es una parte sustancial de ellos.',
      ],
      tabla: {
        encabezados: ['Naturaleza del problema', 'Material, no generalizado', 'Material y generalizado'],
        filas: [
          ['Los estados financieros tienen incorrección material', 'Opinión con salvedades', 'Opinión desfavorable (adversa)'],
          ['No se pudo obtener evidencia suficiente', 'Opinión con salvedades', 'Abstención de opinión'],
        ],
      },
      norma: 'NIA 700 · NIA 705',
      entregable: 'Decisión de opinión documentada en el memorando',
      enElCaso: 'El costo omitido afecta resultado, inventario y patrimonio, y convierte la utilidad en pérdida: no se limita a un rubro, así que es material y generalizado (NIA 705.5). Si no se corrige, la opinión sería desfavorable.',
      errorFrecuente: 'Confundir una limitación al alcance con un error en las cifras; llevan a opiniones distintas.',
      exigencias: [
        { norma: 'NIA 705.7', requisito: 'Opinión con salvedades: incorrecciones materiales no generalizadas, o falta de evidencia con efectos posibles materiales no generalizados.' },
        { norma: 'NIA 705.8', requisito: 'Opinión desfavorable: incorrecciones materiales y generalizadas.' },
        { norma: 'NIA 705.9', requisito: 'Abstención: no se obtuvo evidencia suficiente y los posibles efectos podrían ser materiales y generalizados.' },
      ],
    },
    {
      id: '4.4',
      titulo: 'Agregar los párrafos que correspondan',
      resumen: 'Algunos asuntos se comunican sin modificar la opinión.',
      objetivo: 'Distinguir cuándo un asunto se comunica en un párrafo adicional y en qué sección va.',
      porQue:
        'Hay asuntos que el usuario debe conocer aunque no cambien la opinión. Si se comunican en la sección equivocada, el mensaje cambia: el lector puede creer que hay un problema en las cifras cuando no lo hay, o pasar por alto algo fundamental. Usar bien estas secciones hace que el dictamen diga exactamente lo que el auditor quiere decir.',
      queHacer: [
        'Párrafo de énfasis: llama la atención sobre algo bien revelado y fundamental (NIA 706).',
        'Párrafo de otras cuestiones: asuntos relevantes no presentados en los estados financieros (NIA 706).',
        'Incertidumbre material sobre empresa en funcionamiento, en sección separada (NIA 570).',
        'Cuestiones clave de auditoría cuando apliquen, por ejemplo en emisores de valores (NIA 701).',
      ],
      comoHacerlo: [
        'Énfasis: úsalo solo para un asunto ya revelado correctamente por la entidad y remite a la nota.',
        'Otras cuestiones: úsalo para asuntos que no están en los estados financieros, como que el año anterior lo auditó otro profesional.',
        'Si hay incertidumbre material de continuidad bien revelada, usa la sección específica de la NIA 570, no un énfasis.',
      ],
      norma: 'NIA 701 · NIA 706 · NIA 570',
      entregable: 'Borrador del informe con secciones adicionales',
      enElCaso: 'El año anterior lo auditó otro revisor fiscal: se agrega un párrafo de otras cuestiones. No hay incertidumbre de continuidad identificada.',
      errorFrecuente: 'Usar el párrafo de énfasis para «suavizar» algo que debería ser una salvedad.',
      exigencias: [
        { norma: 'NIA 706.8', requisito: 'El párrafo de énfasis se refiere a un asunto adecuadamente presentado o revelado que es fundamental para la comprensión de los estados financieros.' },
        { norma: 'NIA 706.10', requisito: 'El párrafo de otras cuestiones trata asuntos distintos de los presentados o revelados en los estados financieros.' },
        { norma: 'NIA 570', requisito: 'Una incertidumbre material adecuadamente revelada se informa en una sección titulada «Incertidumbre material relacionada con empresa en funcionamiento».' },
      ],
    },
    {
      id: '4.5',
      titulo: 'Redactar, revisar y fechar el informe',
      resumen: 'El informe tiene una estructura fija y su fecha no puede ser anterior a la evidencia que lo sustenta.',
      objetivo: 'Emitir el dictamen con la estructura de la NIA 700, el pronunciamiento del revisor fiscal y la fecha correcta.',
      porQue:
        'El dictamen es un documento público con consecuencias legales: accionistas, bancos y autoridades deciden con él. Su estructura fija hace que cualquier lector lo entienda igual, y su fecha marca hasta cuándo responde el auditor por lo que pasó en la entidad. Fecharlo antes de tener toda la evidencia es firmar algo que todavía no se sabe.',
      queHacer: [
        'Seguir la estructura: título, destinatario, opinión, fundamento, responsabilidades de la dirección y del auditor, otros requerimientos legales, firma con tarjeta profesional, ciudad y fecha.',
        'Revisor fiscal: pronunciarse sobre si la contabilidad se lleva conforme a la ley, si los actos de los administradores se ajustan a estatutos y decisiones de la asamblea, la conservación de correspondencia y libros de actas, el control interno y los aportes a seguridad social (art. 209 C.Co.).',
        'Si aplica, completar la revisión de calidad del encargo antes de fechar (NIGC 2).',
        'Fechar cuando se tenga la carta de representación y la evidencia completa.',
      ],
      comoHacerlo: [
        'Parte de un modelo actualizado de informe y ajústalo; no reutilices el del año anterior sin revisarlo.',
        'Revisor fiscal: en la sección de otros requerimientos legales, pronúnciate sobre contabilidad conforme a la ley, actos de administradores, correspondencia y libros de actas, control interno, aportes a seguridad social y concordancia del informe de gestión.',
        'Firma con nombre, tarjeta profesional, firma a la que pertenece, ciudad y fecha.',
      ],
      // Ejemplo de salvedad con un asunto material pero no generalizado (no el costo omitido, que es generalizado).
      modelo:
        'Opinión con salvedades\n\nHe auditado los estados financieros de [ENTIDAD], que comprenden el estado de situación financiera al 31 de diciembre de 2026, el estado de resultados, el estado de cambios en el patrimonio y el estado de flujos de efectivo del año terminado en esa fecha, y las notas.\n\nEn mi opinión, excepto por los efectos del asunto descrito en la sección «Fundamento de la opinión con salvedades», los estados financieros adjuntos presentan razonablemente, en todos los aspectos materiales, la situación financiera de [ENTIDAD] al 31 de diciembre de 2026, de conformidad con la NIIF para las PYMES.\n\nFundamento de la opinión con salvedades\n\nLa entidad no reconoció deterioro sobre la cuenta por cobrar a Comercial Andina S.A.S. por $25.000.000, sin movimiento durante todo el año y sin respuesta a la confirmación. En consecuencia, las cuentas por cobrar y el resultado del ejercicio están sobreestimados en ese valor. El efecto supera la materialidad pero se limita a un saldo, por lo que no es generalizado.',
      norma: 'NIA 700 · NIGC 2 · arts. 208–209 C.Co.',
      entregable: 'Informe firmado',
      enElCaso: 'El dictamen se fecha el 28 de febrero de 2027, el mismo día de la carta de representación.',
      errorFrecuente: 'Fechar el informe antes de obtener la carta de representación.',
      exigencias: [
        { norma: 'NIA 700', requisito: 'Fija la estructura y los elementos obligatorios del informe y exige que la fecha no sea anterior a la obtención de evidencia suficiente.' },
        { norma: 'Arts. 208–209 C.Co.', requisito: 'Señalan el contenido del dictamen y del informe del revisor fiscal a la asamblea.' },
        { norma: 'Decreto 1406 de 1999', requisito: 'El revisor fiscal debe pronunciarse sobre el pago oportuno de los aportes al sistema de seguridad social.' },
        { norma: 'NIGC 2', requisito: 'La revisión de calidad del encargo, cuando aplica, debe completarse antes de la fecha del informe.' },
      ],
      practica: {
        titulo: 'Emite el dictamen de la Comercializadora',
        objetivo: 'Generas el dictamen con la opinión que corresponde y redactas el fundamento con las cifras del caso.',
        pestanas: ['informes', 'ajustes'],
        pasos: [
          { texto: 'Abre «Dictamen del auditor (NIA 700)».', ancla: 'inf-dictamen' },
          { texto: 'En «Tipo de opinión» elige la que decidiste en la lección 4.3. Debajo, la hoja de ajustes te dice si coincide con su sugerencia.', ancla: 'op-gen' },
          { texto: 'Pulsa «Generar borrador». AuditorYa arma la estructura de la NIA 700 y los requerimientos del art. 209 del C.Co.', ancla: 'inf-generar' },
          { texto: 'En «Fundamento de la opinión» reemplaza el texto entre corchetes: qué no se corrigió (el costo de ventas y los demás ajustes), cuánto suma (133 M) y por qué es generalizado.' },
          { texto: 'Pulsa «Guardar». La aprobación es de la socia; en la práctica no hace falta aprobarlo.', ancla: 'inf-guardar' },
        ],
        criterio: 'dictamen',
      },
    },
    {
      id: '4.6',
      titulo: 'Comunicar y entregar',
      resumen: 'Se cierra el ciclo de comunicación con quienes gobiernan la entidad.',
      objetivo: 'Comunicar por escrito a quienes gobiernan la entidad los hallazgos y las deficiencias de control.',
      porQue:
        'El dictamen dice si las cifras son razonables, pero no cuenta cómo mejorar. La comunicación de deficiencias (NIA 265) y las recomendaciones son lo que la entidad usa para corregir sus procesos, y para el revisor fiscal son parte de su deber legal (art. 207 C.Co.). Si no queda por escrito, la siguiente auditoría encuentra los mismos problemas.',
      queHacer: [
        'Presentar los hallazgos significativos a la junta o a la asamblea (NIA 260).',
        'Entregar la carta de recomendaciones final con las deficiencias de control (NIA 265).',
        'Revisor fiscal: presentar el dictamen e informe a la asamblea ordinaria.',
      ],
      comoHacerlo: [
        'Prepara una presentación corta para la asamblea: opinión, hallazgos principales, ajustes no registrados y recomendaciones.',
        'Entrega la carta de recomendaciones con: deficiencia, riesgo, recomendación, responsable y fecha comprometida por la gerencia.',
      ],
      norma: 'NIA 260 · NIA 265',
      entregable: 'Acta o soporte de la presentación',
      enElCaso: 'Se presenta a la asamblea el dictamen junto con la recomendación de segregar las funciones de cuentas por pagar y tesorería.',
      errorFrecuente: 'Entregar el informe por correo sin explicar los hallazgos a los socios.',
      exigencias: [
        { norma: 'NIA 260.16', requisito: 'Deben comunicarse a los responsables del gobierno los hallazgos significativos de la auditoría.' },
        { norma: 'NIA 265.9', requisito: 'Las deficiencias significativas de control interno se comunican por escrito.' },
        { norma: 'Ley 1474 de 2011, art. 7 · Ley 1762 de 2015', requisito: 'El revisor fiscal debe denunciar actos de corrupción dentro de los seis meses siguientes a conocerlos y reportar operaciones sospechosas a la UIAF.' },
      ],
    },
  ],
  casosReales: [
    {
      titulo: 'Carillion',
      contexto: 'Reino Unido, 2018',
      hechos: 'La constructora recibió una opinión sin salvedades sobre sus estados financieros de 2016. En enero de 2018 entró en liquidación. Los reguladores cuestionaron que la auditoría no desafió los juicios de la gerencia sobre los ingresos de contratos y la continuidad del negocio.',
      leccion: 'Una opinión limpia no protege al auditor si no cuestionó los supuestos de la dirección. La evaluación de empresa en funcionamiento debe probar los supuestos, no solo leerlos.',
      normas: 'NIA 570 · NIA 540 · NIA 200.15',
    },
    {
      titulo: 'Situación frecuente en Colombia',
      contexto: 'Dictamen del revisor fiscal',
      hechos: 'La entidad no corrige la depreciación omitida ni el traslado de la utilidad del año anterior, pero ambos suman menos que la materialidad. Sí hay pagos de seguridad social extemporáneos.',
      leccion: 'Las cifras pueden tener opinión limpia, pero el revisor fiscal debe pronunciarse en la sección de otros requerimientos legales sobre los aportes al sistema de seguridad social y el cumplimiento normativo.',
      normas: 'NIA 700 · art. 209 C.Co. · Decreto 1406 de 1999',
    },
  ],
  checkpoint: {
    aprendido: [
      'Las incorrecciones no corregidas se suman y se comparan con la materialidad, una por una y en conjunto (NIA 450).',
      'Antes de opinar se leen los estados financieros completos, revelaciones incluidas: partes relacionadas y políticas.',
      'Material y no generalizado: salvedad. Material y generalizado: desfavorable. Sin evidencia suficiente: salvedad si el posible efecto no es generalizado, abstención si lo es (NIA 705).',
      'El énfasis destaca algo que está revelado; otras cuestiones, algo que no está en los estados financieros (NIA 706).',
      'El informe tiene estructura fija y su fecha no puede ser anterior a la evidencia, incluida la carta de representación (NIA 700).',
      'Las deficiencias de control interno se comunican por escrito a quienes gobiernan la entidad (NIA 265).',
    ],
    caso: {
      resumen: 'Andrés no aceptó los ajustes: el dictamen de la Comercializadora sale con opinión desfavorable.',
      hitos: [
        'Sin corregir: costo 105 M + deterioro de Comercial Andina 25 M + depreciación 3 M = 133 M, 13,3 veces la materialidad.',
        'Con las cifras corregidas, la utilidad de 38 M se convierte en una pérdida de 95 M.',
        'Las notas debían revelar el arriendo de la bodega del gerente y el parentesco de la accionista minoritaria.',
        'Párrafo de otras cuestiones: los estados financieros de 2025 los dictaminó Héctor Salazar el 10 de febrero de 2026, con salvedades por el inventario (NIA 710.13).',
        'Dictamen fechado el 28 de febrero de 2027, el día de la carta de representación, con carta de recomendaciones por la segregación de compras y pagos.',
      ],
      cifras: [
        { etiqueta: 'Sin corregir', valor: '133 M' },
        { etiqueta: 'Veces la materialidad', valor: '13,3' },
        { etiqueta: 'Resultado corregido', valor: '−95 M' },
        { etiqueta: 'Opinión', valor: 'Desfavorable' },
      ],
      siguiente: 'En la Fase 5 cierras el archivo, atiendes lo que llegue después del informe y preparas el encargo de 2027.',
    },
    preguntas: [
      { pregunta: 'No pudiste observar el inventario, que es material pero no generalizado. ¿Qué opinión corresponde?', opciones: ['Desfavorable', 'Con salvedades', 'Abstención'], correcta: 1, explicacion: 'Falta de evidencia material pero no generalizada: opinión con salvedades por limitación al alcance.' },
      { pregunta: '¿Cuándo se puede fechar el informe?', opciones: ['Al terminar la visita final en las oficinas del cliente', 'El día en que la asamblea aprueba los estados financieros', 'Al tener toda la evidencia, carta de representación incluida'], correcta: 2, explicacion: 'La fecha del informe no puede ser anterior a la evidencia que soporta la opinión.' },
      { pregunta: 'Un párrafo de énfasis…', opciones: ['Resalta un asunto bien revelado que es clave para el lector', 'Modifica la opinión por un asunto material no revelado', 'Reemplaza la salvedad cuando el cliente corrige el error'], correcta: 0, explicacion: 'El énfasis no modifica la opinión ni sustituye una salvedad: dirige la atención del lector a una revelación.' },
      { pregunta: 'En la Comercializadora quedaron sin corregir 133 M, que convierten la utilidad en pérdida y afectan costo, inventario y patrimonio. ¿Qué opinión corresponde?', opciones: ['Con salvedades', 'Desfavorable', 'Abstención'], correcta: 1, explicacion: 'Es material y generalizado: cambia el resultado y afecta varios rubros (NIA 705.5 y 705.8). La abstención es por falta de evidencia, y aquí la evidencia sí existe.' },
      { pregunta: '¿Qué va en el párrafo de otras cuestiones del dictamen de la Comercializadora?', opciones: ['Que el costo de ventas quedó incompleto y no se corrigió', 'Que existe incertidumbre material sobre el negocio en marcha', 'Que los estados de 2025 los auditó otro revisor fiscal'], correcta: 2, explicacion: 'El costo incompleto va en el fundamento de la opinión desfavorable y no se identificó incertidumbre de continuidad. Quién auditó el año anterior no está en los estados financieros: es otra cuestión (NIA 706 y 710).' },
    ],
  },
}

// ─── F5 · Cierre y archivo ───────────────────────────────────────────────────

const F5: ModuloCurso = {
  id: 'cierre',
  ref: 'Fase 5',
  numero: 5,
  corto: 'Cierre y archivo',
  titulo: 'Cierre, archivo y seguimiento',
  normas: ['NIA 230', 'NIA 560', 'NIGC 1'],
  duracion: 'Hasta 60 días después del informe',
  intro:
    'El trabajo no termina con la firma. El archivo debe quedar completo, protegido y listo para una inspección, y lo aprendido alimenta la auditoría del año siguiente.',
  objetivos: [
    'Compilar el archivo final dentro del plazo.',
    'Proteger y conservar los papeles de trabajo.',
    'Aprender del encargo y preparar el siguiente.',
  ],
  entregables: ['Archivo final cerrado', 'Evaluación del encargo', 'Plan preliminar del año siguiente'],
  // revisar con contador: plazo de conservación aplicable y transición NICC 1 → NIGC 1.
  enColombia:
    'La reserva profesional (Ley 43 de 1990) impide revelar el contenido de los papeles de trabajo sin autorización, salvo requerimiento de autoridad competente. Para el plazo de conservación, la norma de calidad indica normalmente no menos de cinco años, y muchas firmas aplican diez años por analogía con el art. 28 de la Ley 962 de 2005.',
  lecciones: [
    {
      id: '5.1',
      titulo: 'Compilar el archivo final',
      resumen: 'Se ordenan los papeles para que reflejen el trabajo hecho y la conclusión alcanzada.',
      objetivo: 'Ordenar y cerrar el archivo del encargo dentro del plazo que fija la norma.',
      porQue:
        'El archivo es la única prueba de lo que se hizo: un revisor de calidad, un inspector o un juez solo pueden juzgar el trabajo por lo que quedó documentado. Cerrarlo completo y a tiempo evita que se modifique después y que se pierda soporte. Ante una investigación, un buen trabajo mal archivado equivale a no haberlo hecho.',
      queHacer: [
        'Completar el índice y las referencias cruzadas.',
        'Eliminar borradores superados y documentos duplicados (sin borrar evidencia).',
        'Confirmar firmas de elaboración y revisión en cada papel.',
        'Cerrar el archivo dentro de los 60 días siguientes a la fecha del informe.',
      ],
      comoHacerlo: [
        'Revisa el índice: cada papel con referencia, firma de elaboración y revisión y conclusión.',
        'Verifica las referencias cruzadas de la sumaria a las cédulas y de las cédulas a los soportes.',
        'Fija una fecha de cierre del archivo y anótala en el índice.',
      ],
      norma: 'NIA 230 (A21)',
      entregable: 'Archivo corriente compilado',
      enElCaso: 'El índice muestra los papeles de cada área revisados (de A-1 a Z-2), cuatro hallazgos y cuatro AJE.',
      errorFrecuente: 'Dejar el archivo abierto indefinidamente.',
      exigencias: [
        { norma: 'NIA 230.14', requisito: 'El auditor debe reunir la documentación en un archivo y completar el proceso administrativo de compilación oportunamente después de la fecha del informe.' },
        { norma: 'NIA 230.A21', requisito: 'Un plazo apropiado normalmente no excede de 60 días después de la fecha del informe.' },
      ],
    },
    {
      id: '5.2',
      titulo: 'Controlar cambios posteriores',
      resumen: 'Después del cierre, nada se borra ni se reemplaza en silencio.',
      objetivo: 'Saber cómo se documenta cualquier cambio al archivo después de cerrarlo.',
      porQue:
        'Después del cierre, un cambio silencioso en los papeles parece una alteración para cubrir un error, aunque no lo sea. La norma permite agregar información, pero dejando constancia de quién, cuándo y por qué. Esa trazabilidad es lo que protege al auditor si su trabajo se cuestiona años después.',
      queHacer: [
        'Si hay que agregar algo, documentar qué cambió, quién lo hizo, cuándo y por qué.',
        'Restringir el acceso de edición al archivo cerrado.',
      ],
      comoHacerlo: [
        'Bloquea la edición del archivo digital después de la fecha de cierre.',
        'Si hay que agregar algo, crea un documento nuevo con fecha, autor, motivo y efecto en las conclusiones; no reemplaces el original.',
      ],
      norma: 'NIA 230.16',
      entregable: 'Bitácora de cambios posteriores',
      enElCaso: 'Llega la respuesta tardía de una confirmación: se agrega con nota de fecha y responsable.',
      errorFrecuente: 'Modificar papeles después del cierre sin dejar rastro.',
      exigencias: [
        { norma: 'NIA 230.15', requisito: 'Una vez compilado el archivo final, no se debe eliminar ni descartar documentación antes de que termine el período de conservación.' },
        { norma: 'NIA 230.16', requisito: 'Toda modificación o adición posterior debe documentar las razones, quién la realizó y cuándo.' },
      ],
    },
    {
      id: '5.3',
      titulo: 'Custodia y conservación',
      resumen: 'Los papeles de trabajo son confidenciales y deben conservarse.',
      objetivo: 'Conocer el deber de reserva y cómo se conservan los papeles de trabajo.',
      porQue:
        'Los papeles contienen información confidencial del cliente: nóminas, contratos, márgenes, estrategias. Una filtración rompe la confianza y la reserva profesional que exige la Ley 43 de 1990. Además, deben conservarse para responder a requerimientos de autoridades o a reclamaciones que pueden llegar años después.',
      queHacer: [
        'Aplicar la reserva profesional (Ley 43 de 1990).',
        'Conservar según la política de la firma: normalmente no menos de 5 años; muchas firmas aplican 10 años por analogía con el art. 28 de la Ley 962 de 2005.',
        'Garantizar copias de seguridad y acceso solo a personal autorizado.',
      ],
      comoHacerlo: [
        'Define en la política de la firma el plazo de conservación y dónde se guardan los archivos.',
        'Usa un repositorio con permisos por usuario, copia de seguridad y registro de accesos.',
        'No envíes papeles de clientes por canales personales.',
      ],
      norma: 'NIA 230 · NIGC 1 · Ley 43 de 1990',
      entregable: 'Registro de custodia',
      enElCaso: 'El archivo digital queda en un repositorio con acceso solo para el socio y el gerente del encargo.',
      errorFrecuente: 'Guardar papeles de clientes en correos personales o memorias USB.',
      exigencias: [
        { norma: 'NIGC 1', requisito: 'La firma debe establecer políticas de conservación de la documentación, que normalmente no es inferior a cinco años.' },
        { norma: 'Ley 43 de 1990', requisito: 'El contador público está obligado a guardar la reserva profesional sobre la información que conozca en ejercicio de su profesión.' },
        { norma: 'Ley 1581 de 2012', requisito: 'Los papeles con datos personales (nómina, terceros) están sujetos al régimen de protección de datos.' },
      ],
    },
    {
      id: '5.4',
      titulo: 'Atender hechos descubiertos después del informe',
      resumen: 'Si después de emitir el informe aparece un hecho que lo habría cambiado, hay que actuar.',
      objetivo: 'Actuar ante un hecho que aparece después de emitido el informe y que lo habría cambiado.',
      porQue:
        'Emitir el dictamen no cierra la responsabilidad: si aparece un hecho que, de haberse conocido, habría cambiado la opinión, los usuarios pueden estar decidiendo con información equivocada. La norma fija qué hacer para que el auditor no quede asociado a unos estados financieros que ya sabe que no son fiables.',
      queHacer: [
        'Discutirlo con la gerencia y evaluar si los estados financieros deben corregirse.',
        'Si se reemiten, emitir un nuevo informe con párrafo explicativo.',
        'Documentar el tratamiento.',
      ],
      comoHacerlo: [
        'Si conoces un hecho nuevo, compáralo con lo que sabías a la fecha del informe y pregunta: ¿habría cambiado la opinión?',
        'Si la entidad corrige y reemite, revisa la corrección y emite un nuevo informe con párrafo que explique la modificación.',
        'Si la entidad no actúa, consulta con asesoría legal antes de tomar acciones para evitar que se siga confiando en el informe.',
      ],
      norma: 'NIA 560 (párr. 14–17)',
      entregable: 'Memorando del hecho posterior',
      enElCaso: 'En abril de 2027 se conoce que Distribuidora del Norte, el cliente principal, entró en liquidación. Se evalúa el efecto sobre la cartera ya dictaminada.',
      errorFrecuente: 'Asumir que, emitido el informe, ya no hay responsabilidad.',
      exigencias: [
        { norma: 'NIA 560.14', requisito: 'Si después de la fecha del informe el auditor conoce un hecho que lo habría llevado a modificarlo, debe discutirlo con la dirección y determinar si los estados financieros requieren modificación.' },
      ],
    },
    {
      id: '5.5',
      titulo: 'Evaluar el encargo',
      resumen: 'Se mide cómo salió el trabajo para mejorar el siguiente.',
      objetivo: 'Evaluar el encargo terminado: horas, calidad, relación con el cliente y lecciones para el siguiente.',
      porQue:
        'Sin una evaluación al final, los mismos errores se repiten cada año: presupuestos que no alcanzan, pruebas que se hacen tarde, áreas que se subestiman. Comparar lo planeado con lo real es lo que permite mejorar el próximo encargo y decidir si conviene continuar con el cliente.',
      queHacer: [
        'Comparar horas reales contra presupuesto por fase y por área.',
        'Registrar qué funcionó, qué demoró y qué se debe pedir antes.',
        'Actualizar la evaluación de continuidad del cliente.',
      ],
      comoHacerlo: [
        'Compara horas presupuestadas y reales por área y anota la causa de cada desviación.',
        'Pregunta al equipo qué cambiarías el próximo año y qué información debe pedirse antes.',
        'Decide si se continúa con el cliente el próximo año y documenta la decisión.',
      ],
      norma: 'NIGC 1',
      entregable: 'Evaluación posterior del encargo',
      enElCaso: 'La conciliación del inventario consumió el doble de horas. Para el próximo año se pide el kárdex mensual desde la visita interina.',
      errorFrecuente: 'No medir horas y repetir los mismos sobrecostos cada año.',
      exigencias: [
        { norma: 'NIGC 1', requisito: 'La firma debe monitorear su sistema de gestión de calidad y corregir deficiencias.' },
        { norma: 'NIA 220', requisito: 'El socio debe concluir sobre la continuidad del cliente y del encargo.' },
      ],
    },
    {
      id: '5.6',
      titulo: 'Hacer seguimiento y preparar el próximo año',
      resumen: 'La auditoría siguiente empieza donde termina esta.',
      objetivo: 'Dejar listo el punto de partida del año siguiente: seguimiento a las recomendaciones y archivo permanente al día.',
      porQue:
        'La auditoría del año siguiente empieza con lo que deja esta: los saldos finales serán los iniciales, y las recomendaciones no atendidas son riesgos que se repiten. Hacer seguimiento y actualizar el archivo permanente ahorra tiempo de planeación y le muestra al cliente que el revisor fiscal acompaña, no solo dictamina.',
      queHacer: [
        'Hacer seguimiento a las recomendaciones de la carta a la gerencia.',
        'Actualizar el archivo permanente: estatutos, contratos, políticas, actas.',
        'Trasladar los riesgos detectados como punto de partida de la planeación siguiente.',
      ],
      comoHacerlo: [
        'Envía a la gerencia, seis meses después, un formato de seguimiento de recomendaciones con estado: implementada, en proceso o no implementada.',
        'Actualiza el archivo permanente con los documentos nuevos: reformas estatutarias, contratos, actas.',
        'Pasa a la matriz de riesgos del año siguiente los hallazgos no corregidos.',
      ],
      norma: 'NIA 300 · NIA 265',
      entregable: 'Plan preliminar del siguiente encargo',
      enElCaso: 'Para 2027 se incluye como riesgo significativo el traslado de inventario al costo, hasta verificar que se corrigió el proceso.',
      errorFrecuente: 'Empezar cada año desde cero, sin aprovechar lo aprendido.',
      exigencias: [
        { norma: 'NIA 265', requisito: 'El auditor considera si las deficiencias comunicadas antes siguen sin corregir.' },
        { norma: 'NIA 300 y NIA 315', requisito: 'La planeación del siguiente encargo debe actualizar el conocimiento de la entidad y considerar los resultados de auditorías anteriores.' },
      ],
    },
  ],
  casosReales: [
    {
      titulo: 'Arthur Andersen y la destrucción de documentos',
      contexto: 'Estados Unidos, 2001–2002',
      hechos: 'Cuando comenzó la investigación de Enron, personal de Arthur Andersen destruyó grandes volúmenes de documentos y correos de la auditoría. La firma fue condenada por obstrucción a la justicia en 2002; aunque la condena se anuló en 2005, la firma ya había dejado de existir.',
      leccion: 'Los papeles de trabajo deben conservarse íntegros y sin alteraciones. Destruir o modificar documentación después del cierre puede convertir un problema técnico en uno penal.',
      normas: 'NIA 230.14–16 · NIGC 1',
    },
    {
      titulo: 'Situación frecuente en Colombia',
      contexto: 'Inspección disciplinaria',
      hechos: 'Años después del dictamen, la Junta Central de Contadores abre una investigación por una queja de un accionista y solicita los papeles de trabajo del revisor fiscal.',
      leccion: 'Sin un archivo completo, firmado y conservado, el contador no puede demostrar que actuó conforme a las normas. Los papeles son su principal defensa.',
      normas: 'Ley 43 de 1990 · NIA 230',
    },
  ],
  checkpoint: {
    aprendido: [
      'El archivo final se compila normalmente dentro de los 60 días siguientes a la fecha del informe (NIA 230).',
      'Después del cierre nada se borra ni se reemplaza: se agrega con fecha, autor y motivo.',
      'Los papeles de trabajo están bajo reserva profesional (Ley 43 de 1990) y se protegen como datos personales (Ley 1581).',
      'Un hecho conocido después del informe que lo habría cambiado obliga a actuar con la gerencia (NIA 560).',
      'La evaluación del encargo compara horas y resultados con lo presupuestado.',
      'El plan del año siguiente parte de los riesgos, deficiencias y aprendizajes de este.',
    ],
    caso: {
      resumen: 'El encargo 2026 de la Comercializadora quedó cerrado y archivado, y el plan de 2027 ya está en marcha.',
      hitos: [
        'Archivo final compilado antes del 29 de abril de 2027, 60 días después del dictamen.',
        'La respuesta tardía de Comercial Andina (en reestructuración) se agregó con rastro y se evaluó como hecho posterior.',
        'La liquidación de Distribuidora del Norte (58 M de cartera) se discutió con la gerencia como hecho conocido después del informe.',
        'Inventarios consumió 80 horas frente a 40 presupuestadas: 100 % de desviación.',
        'Plan 2027: el costo sigue como riesgo significativo, kárdex mensual desde la interina, seguimiento a la segregación y cliente con riesgo alto.',
      ],
      cifras: [
        { etiqueta: 'Fecha límite del archivo', valor: '29-abr-2027' },
        { etiqueta: 'Desviación en inventarios', valor: '+100 %' },
        { etiqueta: 'Riesgo del cliente 2027', valor: 'Alto' },
      ],
      siguiente: 'Terminaste tu primera revisoría fiscal bajo NIA. En AuditorYa haces este mismo recorrido con tus clientes reales.',
    },
    preguntas: [
      { pregunta: '¿Cuál es el plazo de la NIA 230 para compilar el archivo final?', opciones: ['60 días después de la fecha del informe', '30 días después del cierre contable', '90 días después de la asamblea ordinaria'], correcta: 0, explicacion: 'La NIA 230 (A21) señala que normalmente no debe exceder 60 días después de la fecha del informe.' },
      { pregunta: 'Necesitas agregar un documento después del cierre del archivo. ¿Qué haces?', opciones: ['Reemplazar el papel original por la versión corregida', 'Nada: el archivo cerrado ya no admite cambios', 'Agregarlo documentando quién, cuándo y por qué'], correcta: 2, explicacion: 'Se permite agregar, pero dejando rastro completo del cambio (NIA 230.16).' },
      { pregunta: '¿Quién puede consultar los papeles de trabajo de un cliente?', opciones: ['Cualquier socio o empleado de la firma que lo pida', 'Solo personal autorizado, bajo reserva profesional', 'El cliente y cualquier tercero que lo solicite'], correcta: 1, explicacion: 'Los papeles de trabajo están protegidos por la reserva profesional de la Ley 43 de 1990.' },
      { pregunta: 'Ya emitido el dictamen, Distribuidora del Norte (58 M de cartera) entra en liquidación. ¿Qué haces?', opciones: ['Lo hablas con la gerencia y evalúas si cambiar los estados', 'Nada: los hechos posteriores al dictamen ya no te tocan', 'Retiras el dictamen de inmediato sin hablar con el cliente'], correcta: 0, explicacion: 'Después del informe sigue habiendo responsabilidad si aparece un hecho que lo habría cambiado (NIA 560.14). Primero se discute con la dirección.' },
      { pregunta: 'Inventarios consumió 80 horas frente a 40 presupuestadas. ¿Qué cambia en el plan de 2027?', opciones: ['Mantienes el plan igual: fue un caso aislado de 2026', 'Pides el kárdex mensual desde la interina y mantienes el riesgo', 'Reduces las horas de inventario para compensar el sobrecosto'], correcta: 1, explicacion: 'La desviación muestra dónde estuvo el riesgo. El plan del año siguiente responde a eso con información más temprana y la misma atención al costo.' },
    ],
  },
}

// ─── Clase 0 · Inducción ─────────────────────────────────────────────────────

const { socia, gerente, contadora, auxiliar, revisorAnterior } = PERSONAJES_CASO

const F0: ModuloCurso = {
  id: 'induccion',
  ref: 'Clase 0',
  numero: 0,
  corto: 'Tu primer encargo',
  titulo: 'Inducción: cómo funciona el curso y quién es tu cliente',
  normas: [],
  duracion: '15 min',
  intro: 'Antes de auditar, conoce las reglas del curso y al cliente con el que vas a trabajar de principio a fin.',
  objetivos: ['Entender cómo avanzas en el curso.', 'Conocer a la Comercializadora y a las personas del caso.'],
  entregables: [],
  enColombia: '',
  casosReales: [],
  lecciones: [
    {
      id: '0.1',
      titulo: 'Cómo funciona el curso',
      resumen: 'Vas a recorrer una revisoría fiscal completa bajo NIA, de la aceptación del cliente al archivo final, practicando cada paso sobre el mismo cliente.',
      narrativa: [
        {
          titulo: 'Qué vas a aprender',
          parrafos: [
            'Cinco fases de una auditoría financiera bajo las NIA, con las particularidades de la revisoría fiscal en Colombia: aceptación, planeación, ejecución, informe y cierre.',
            'Cada lección explica qué hacer, cómo desarrollarlo, qué exige la norma y el error más frecuente.',
          ],
        },
        {
          titulo: 'Cómo avanzas',
          parrafos: [
            'Las lecciones se abren en orden. Una lección queda completa cuando lees la teoría, pulsas «Ya lo entendí» y resuelves su ejercicio.',
            'Cada fase cierra con un checkpoint: un resumen de lo aprendido, cómo va el caso y un quiz de cinco preguntas. Con 4 de 5 correctas se abre la siguiente fase, y puedes intentarlo las veces que quieras.',
          ],
        },
        {
          titulo: 'Cómo practicas',
          parrafos: [
            'En AuditorYa: en las lecciones de planeación trabajas en las pantallas reales del software (materialidad, riesgos, control interno…) sobre un encargo de práctica. Un tutor te guía y revisa lo que guardas.',
            'Ejercicios del caso: en el resto de lecciones decides ante situaciones reales, completas documentos (cartas, declaraciones, salvedades) que puedes descargar en Word o PDF, haces cálculos con las cifras del cliente y clasificas hallazgos.',
            'El expediente del cliente: en cualquier lección puedes abrir los documentos del caso (certificados, actas, correos, el balance). Los ejercicios te dirán cuáles revisar.',
          ],
        },
        {
          titulo: 'Tu progreso',
          parrafos: [
            'No necesitas cuenta. Tu avance y lo que haces en el encargo de práctica se guardan en este navegador. Puedes empezar de cero cuando quieras desde la portada del curso.',
          ],
        },
      ],
    },
    {
      id: '0.2',
      titulo: 'Conoce a tu cliente',
      resumen: `Trabajas en ${FIRMA_CASO.nombre}. Tu primer encargo es la revisoría fiscal 2026 de Comercializadora Ejemplo S.A.S.`,
      narrativa: [
        {
          titulo: 'Tu firma y tu rol',
          parrafos: [
            `Eres auditor de ${FIRMA_CASO.nombre}, en ${FIRMA_CASO.ciudad}. ${socia.nombre} es la socia del encargo: firma el dictamen, aprueba tus papeles y te irá pidiendo cada tarea.`,
          ],
        },
        {
          titulo: 'El cliente',
          parrafos: [
            'Comercializadora Ejemplo S.A.S. compra productos de consumo masivo y los revende al por mayor a tiendas y distribuidores, y al detal en su punto de venta. Su margen bruto histórico ronda el 30 %.',
            'En 2026 vendió 1.000 millones (820 en 2025), tiene inventarios por 318 millones y reporta una utilidad antes de impuestos de 38 millones. Aplica NIIF para las PYMES (Grupo 2) y tiene revisor fiscal porque sus estatutos lo exigen.',
          ],
        },
        {
          titulo: 'Las personas',
          parrafos: [
            `${gerente.nombre}: ${gerente.rol.toLowerCase()}. Toma todas las decisiones y aprueba los pagos desde su celular.`,
            'Lucía Gómez Pardo: su hermana, dueña del 15 % restante.',
            `${contadora.nombre}: ${contadora.rol.toLowerCase()}. Registra los ajustes de cierre de cada mes.`,
            `${auxiliar.nombre}: ${auxiliar.rol.toLowerCase()}. Registra las facturas de proveedores y prepara los pagos.`,
          ],
        },
        {
          titulo: 'Por qué hay un encargo nuevo',
          parrafos: [
            `${revisorAnterior.nombre} fue el revisor fiscal de 2023 a 2025. Renunció en febrero de 2026 por diferencias con la administración sobre el costo de ventas y la utilidad de 2025. En marzo, la asamblea nombró a tu firma.`,
          ],
        },
        {
          titulo: 'Lo que viene',
          parrafos: [
            'Harás la visita interina con corte al 30 de septiembre y la final al 31 de diciembre de 2026. El dictamen se firmará a finales de febrero de 2027.',
            'Empieza revisando el expediente: la socia quiere tus primeras impresiones del cliente.',
          ],
        },
      ],
    },
  ],
}

/** Cada lección sin playground recibe su ejercicio del caso. */
function conEjercicios(m: ModuloCurso): ModuloCurso {
  return { ...m, lecciones: m.lecciones.map((l) => (EJERCICIOS_CASO[l.id] && !l.practica ? { ...l, ejercicio: EJERCICIOS_CASO[l.id] } : l)) }
}

export const MODULOS_CURSO: ModuloCurso[] = [F0, F1, F2, F3, F4, F5].map(conEjercicios)

export const LECCIONES_CURSO: Leccion[] = MODULOS_CURSO.flatMap((m) => m.lecciones)

export function leccionPorId(id: string): { modulo: ModuloCurso; leccion: Leccion; indice: number } | null {
  const indice = LECCIONES_CURSO.findIndex((l) => l.id === id)
  if (indice < 0) return null
  const leccion = LECCIONES_CURSO[indice]
  const modulo = MODULOS_CURSO.find((m) => m.lecciones.includes(leccion))!
  return { modulo, leccion, indice }
}

export function moduloPorId(id: string): ModuloCurso | null {
  return MODULOS_CURSO.find((m) => m.id === id) ?? null
}

// ─── Progreso ────────────────────────────────────────────────────────────────

/** Progreso del curso. En la v1 vive en el navegador (localStorage); la forma no depende de eso. */
export type ProgresoAcademia = {
  leidas: string[]
  practicadas: string[]
  /** Lecciones cuyo ejercicio del caso ya se resolvió. */
  ejercicios: string[]
  /** Por módulo: mejor resultado del quiz del checkpoint (la clave se conserva por compatibilidad). */
  repasos: Record<string, { aciertos: number; total: number }>
}

export const PROGRESO_VACIO: ProgresoAcademia = { leidas: [], practicadas: [], ejercicios: [], repasos: {} }

/** El quiz del checkpoint se aprueba con el 80 % de aciertos (4 de 5). */
export function checkpointAprobado(r: { aciertos: number; total: number } | undefined): boolean {
  return !!r && r.total > 0 && r.aciertos >= Math.ceil(r.total * 0.8)
}

/** El checkpoint de una fase se abre cuando todas sus lecciones están completas. */
export function checkpointDisponible(m: ModuloCurso, p: ProgresoAcademia): boolean {
  return !!m.checkpoint && m.lecciones.every((l) => leccionCompleta(l, p))
}

/** ¿Ya se hizo la parte práctica de la lección (playground o ejercicio del caso)? */
export function practicaHecha(l: Leccion, p: ProgresoAcademia): boolean {
  if (l.practica) return p.practicadas.includes(l.id)
  if (l.ejercicio) return p.ejercicios.includes(l.id)
  return true
}

/**
 * Avance del curso en %. Cada lección vale 1 por leerla y 1 más por su práctica o ejercicio;
 * cada checkpoint de fase vale 1.
 */
export function avanceCurso(p: ProgresoAcademia): { hechos: number; total: number; pct: number } {
  let total = 0
  let hechos = 0
  for (const l of LECCIONES_CURSO) {
    total += 1
    if (p.leidas.includes(l.id)) hechos += 1
    if (l.practica || l.ejercicio) {
      total += 1
      if (practicaHecha(l, p)) hechos += 1
    }
  }
  for (const m of MODULOS_CURSO.filter((x) => x.checkpoint)) {
    total += 1
    if (checkpointAprobado(p.repasos[m.id])) hechos += 1
  }
  return { hechos, total, pct: total ? Math.round((hechos / total) * 100) : 0 }
}

/** Una lección está completa cuando se leyó y se hizo su práctica o su ejercicio. */
export function leccionCompleta(l: Leccion, p: ProgresoAcademia): boolean {
  return p.leidas.includes(l.id) && practicaHecha(l, p)
}

export type EstadoBloqueo =
  | { desbloqueada: true }
  | { desbloqueada: false; motivo: 'leccion'; requiere: Leccion }
  | { desbloqueada: false; motivo: 'checkpoint'; requiere: ModuloCurso }

/**
 * El curso se recorre en orden: una lección se abre al completar la anterior, y el primer módulo
 * de cada fase exige además aprobar el checkpoint de la fase anterior.
 */
export function estadoBloqueo(leccionId: string, p: ProgresoAcademia): EstadoBloqueo {
  const encontrada = leccionPorId(leccionId)
  if (!encontrada || encontrada.indice === 0) return { desbloqueada: true }
  const previa = LECCIONES_CURSO[encontrada.indice - 1]
  if (!leccionCompleta(previa, p)) return { desbloqueada: false, motivo: 'leccion', requiere: previa }
  const moduloPrevio = leccionPorId(previa.id)!.modulo
  if (moduloPrevio.id !== encontrada.modulo.id && moduloPrevio.checkpoint && !checkpointAprobado(p.repasos[moduloPrevio.id])) {
    return { desbloqueada: false, motivo: 'checkpoint', requiere: moduloPrevio }
  }
  return { desbloqueada: true }
}

/** Lo próximo por hacer: la siguiente lección o, si la fase ya está hecha, su checkpoint pendiente. */
export type PasoCurso = { tipo: 'leccion'; leccion: Leccion } | { tipo: 'checkpoint'; modulo: ModuloCurso }

export function siguientePaso(p: ProgresoAcademia): PasoCurso | null {
  for (const m of MODULOS_CURSO) {
    const leccion = m.lecciones.find((l) => !leccionCompleta(l, p))
    if (leccion) return estadoBloqueo(leccion.id, p).desbloqueada ? { tipo: 'leccion', leccion } : null
    if (m.checkpoint && !checkpointAprobado(p.repasos[m.id])) return { tipo: 'checkpoint', modulo: m }
  }
  return null
}

export function rutaCheckpoint(m: ModuloCurso): string {
  return `/academia/fase/${m.id}/checkpoint`
}

/** Resultado de la verificación de una práctica (lo devuelve el backend). */
export type VerificacionPractica = {
  completa: boolean
  criterios: { ok: boolean; mensaje: string }[]
}
