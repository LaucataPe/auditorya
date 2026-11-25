/**
 * Sistema de gestión de calidad de la firma (NIGC 1 / ISQM 1, aplicación anticipada;
 * cubre también los elementos del NICC 1 vigente en Colombia).
 *
 * Modelo: 8 componentes → objetivos de calidad → riesgos de calidad → respuestas.
 * La firma arranca con el catálogo base de abajo (precargado la primera vez que abre
 * el tab) y lo adapta. Una vez al año, el responsable evalúa el sistema con corte a
 * una fecha (¶53-54): marca cada componente como revisado y concluye.
 */
import type { DocumentoFirmaCalidad, ResumenDocumentoCalidad } from './calidad-formatos'
import type { ManualCalidadResumen } from './calidad-manual'

export const COMPONENTES_CALIDAD = [
  {
    clave: 'valoracion_riesgos',
    titulo: 'Valoración de riesgos de la firma',
    ref: '¶23-27',
    descripcion: 'Cómo la firma fija objetivos, identifica y valora riesgos y diseña respuestas.',
    simple:
      'La firma piensa qué puede salir mal en su trabajo y decide qué hacer para evitarlo. Es el motor de todo el sistema: los demás componentes salen de aquí.',
    jcc: 'Que el sistema esté documentado y que se haya actualizado cuando la firma cambió: nuevos clientes, socios o normas.',
  },
  {
    clave: 'gobierno_liderazgo',
    titulo: 'Gobierno y liderazgo',
    ref: '¶28',
    descripcion: 'Compromiso con la calidad, responsabilidades y recursos asignados por la dirección.',
    simple:
      'Los socios dejan claro, por escrito y con hechos, que la calidad va primero, y nombran a alguien que responda por el sistema.',
    jcc: 'La declaración de liderazgo firmada, la designación del responsable y que los socios se evalúen también por calidad.',
  },
  {
    clave: 'etica',
    titulo: 'Ética e independencia',
    ref: '¶29',
    descripcion: 'Cumplimiento del Código de Ética, incluida la independencia.',
    simple:
      'Nadie del equipo puede tener intereses o relaciones con un cliente que le quiten objetividad, y todos deben conocer el Código de Ética.',
    jcc: 'La política firmada, las confirmaciones anuales de independencia y la evidencia de la capacitación en ética.',
  },
  {
    clave: 'aceptacion_continuidad',
    titulo: 'Aceptación y continuidad',
    ref: '¶30',
    descripcion: 'Decisiones sobre aceptar o continuar relaciones con clientes y encargos.',
    simple:
      'Antes de aceptar un cliente, o de seguir con él otro año, la firma revisa si es íntegro, si es independiente y si tiene cómo atenderlo bien.',
    jcc: 'Las evaluaciones de aceptación y de continuidad de cada cliente, hechas antes de empezar el trabajo.',
  },
  {
    clave: 'realizacion_encargos',
    titulo: 'Realización de encargos',
    ref: '¶31',
    descripcion: 'Dirección, supervisión, revisión, consultas, diferencias de opinión y documentación.',
    simple:
      'El trabajo se supervisa y se revisa, se consulta cuando hay dudas y el archivo queda completo y protegido al terminar.',
    jcc: 'Papeles revisados, notas de revisión resueltas, revisión de calidad en los encargos que la requieren y archivos cerrados a tiempo.',
  },
  {
    clave: 'recursos',
    titulo: 'Recursos',
    ref: '¶32',
    descripcion: 'Personas competentes, recursos tecnológicos e intelectuales y proveedores.',
    simple:
      'La firma tiene gente preparada, la asigna según su experiencia y usa herramientas confiables.',
    jcc: 'El plan de capacitación con evidencia de asistencia y cómo se decide quién va en cada encargo.',
  },
  {
    clave: 'informacion_comunicacion',
    titulo: 'Información y comunicación',
    ref: '¶33',
    descripcion: 'Información oportuna dentro de la firma y con terceros sobre el sistema de calidad.',
    simple:
      'Todo el equipo sabe cuáles son las políticas de calidad y se entera cuando cambian.',
    jcc: 'La constancia de que las políticas se comunicaron al personal, con fecha y asistentes.',
  },
  {
    clave: 'seguimiento',
    titulo: 'Seguimiento y corrección',
    ref: '¶35-47',
    descripcion: 'Seguimiento del sistema, inspección de encargos terminados y corrección de deficiencias.',
    simple:
      'La firma revisa su propio trabajo terminado, atiende las quejas y corrige lo que encuentra.',
    jcc: 'El plan de inspección, los encargos inspeccionados en el ciclo, el registro de quejas y las acciones correctivas.',
  },
] as const

export type ComponenteCalidad = (typeof COMPONENTES_CALIDAD)[number]['clave']

export const COMPONENTES_CALIDAD_CLAVES = COMPONENTES_CALIDAD.map((c) => c.clave) as [
  ComponenteCalidad,
  ...ComponenteCalidad[],
]

// ─── Base normativa ─────────────────────────────────────────────────────────

/**
 * Traducción oficial al español de la NIGC 1 publicada por IFAC (pronunciamiento final, dic. 2020).
 * El texto tiene derechos de autor de IFAC: aquí solo se citan los apartados con un resumen propio
 * y se enlaza al documento, sin reproducirlo. `#page=` abre el PDF en la página del apartado.
 */
export const NIGC1_URL = 'https://www.ifac.org/system/files/publications/files/ISQM-1-Final-Standard_ES_Secure_0.pdf'

/** Dónde rige hoy en Colombia: la NICC 1, incorporada en el marco técnico de aseguramiento. */
export const FUENTE_NICC1_COLOMBIA = 'Anexo 4 del Decreto Único Reglamentario 2420 de 2015 (normas de aseguramiento de la información)'

export type NormativaComponente = {
  /** Página del PDF de la NIGC 1 donde empieza el requerimiento principal. */
  pagina: number
  /** Apartados de la NIGC 1, cada uno con un resumen en palabras propias (no es la cita textual). */
  apartados: { ref: string; resumen: string }[]
  /** Apartados equivalentes de la NICC 1 o, si no hay, por qué. Verificados contra el texto de la IAASB. */
  nicc1: string
}

export const NORMATIVA_CALIDAD: Record<ComponenteCalidad, NormativaComponente> = {
  valoracion_riesgos: {
    pagina: 11,
    apartados: [
      { ref: '¶23', resumen: 'Diseñar un proceso para fijar objetivos, valorar riesgos y responder a ellos.' },
      { ref: '¶24', resumen: 'Fijar los objetivos de calidad de la norma y los adicionales que la firma necesite.' },
      { ref: '¶25', resumen: 'Identificar y valorar los riesgos según las circunstancias de la firma y de sus encargos.' },
      { ref: '¶26', resumen: 'Diseñar respuestas a esos riesgos, incluidas las del ¶34.' },
      { ref: '¶27', resumen: 'Detectar cambios en la firma o en sus encargos y ajustar objetivos, riesgos y respuestas.' },
    ],
    nicc1: 'Sin equivalente: el enfoque por riesgos es nuevo en la NIGC 1.',
  },
  gobierno_liderazgo: {
    pagina: 12,
    apartados: [
      { ref: '¶28(a)', resumen: 'Una cultura de compromiso con la calidad y con el interés público en toda la firma.' },
      { ref: '¶28(b)', resumen: 'Los dirigentes responden por la calidad.' },
      { ref: '¶28(c)', resumen: 'Los dirigentes demuestran ese compromiso con sus actuaciones.' },
      { ref: '¶28(d)', resumen: 'Una estructura y una asignación de funciones adecuadas para el sistema.' },
      { ref: '¶28(e)', resumen: 'Los recursos se planifican y asignan en coherencia con la calidad.' },
      { ref: '¶20-22', resumen: 'Asignar la responsabilidad última (socio director) y la operativa del sistema, de la independencia y del seguimiento.' },
      { ref: '¶56', resumen: 'Evaluar periódicamente el desempeño de esos responsables.' },
    ],
    nicc1: '¶18-19 (responsabilidades de liderazgo).',
  },
  etica: {
    pagina: 13,
    apartados: [
      { ref: '¶29(a)', resumen: 'La firma y su personal conocen y cumplen los requerimientos de ética, incluida la independencia.' },
      { ref: '¶29(b)', resumen: 'Lo mismo para la red y los proveedores de servicios sujetos a esos requerimientos.' },
      { ref: '¶34(a)', resumen: 'Políticas para detectar y atender amenazas e incumplimientos de ética.' },
      { ref: '¶34(b)', resumen: 'Confirmación documentada de independencia de todo el personal, al menos una vez al año.' },
    ],
    nicc1: '¶20-25 (la confirmación anual de independencia está en el ¶24).',
  },
  aceptacion_continuidad: {
    pagina: 13,
    apartados: [
      { ref: '¶30(a)', resumen: 'Aceptar o continuar con información suficiente sobre el encargo y la integridad del cliente, y con capacidad para hacerlo conforme a las normas.' },
      { ref: '¶30(b)', resumen: 'Que las prioridades financieras u operativas no lleven a aceptar lo que no se debe.' },
      { ref: '¶34(d)', resumen: 'Qué hacer si después de aceptar aparece información que habría llevado a rechazar, o si la ley obliga a aceptar.' },
    ],
    nicc1: '¶26-28.',
  },
  realizacion_encargos: {
    pagina: 14,
    apartados: [
      { ref: '¶31(a)', resumen: 'Los equipos conocen y cumplen sus responsabilidades; el socio responde por la calidad del encargo.' },
      { ref: '¶31(b)', resumen: 'Dirección, supervisión y revisión adecuadas al encargo.' },
      { ref: '¶31(c)', resumen: 'Juicio profesional y, cuando aplica, escepticismo profesional.' },
      { ref: '¶31(d)', resumen: 'Consultas sobre cuestiones complejas o controvertidas.' },
      { ref: '¶31(e)', resumen: 'Las diferencias de opinión se ponen en conocimiento y se resuelven.' },
      { ref: '¶31(f)', resumen: 'La documentación del encargo se compila a tiempo y se conserva.' },
      { ref: '¶34(f)', resumen: 'Revisión de la calidad del encargo (NIGC 2) en cotizadas, cuando la ley la exija o cuando la firma la decida.' },
    ],
    nicc1: '¶32-47: consultas ¶34, revisión de control de calidad ¶35-42, diferencias de opinión ¶43-44, documentación ¶45-47.',
  },
  recursos: {
    pagina: 14,
    apartados: [
      { ref: '¶32(a)', resumen: 'Personal contratado, formado y retenido con la competencia necesaria.' },
      { ref: '¶32(b)', resumen: 'El personal se evalúa y se reconoce por su compromiso con la calidad.' },
      { ref: '¶32(c)', resumen: 'Personas externas cuando el personal propio no alcanza.' },
      { ref: '¶32(d)', resumen: 'Equipos y socio de cada encargo con competencia y tiempo suficientes.' },
      { ref: '¶32(e)', resumen: 'Personas competentes para las actividades del sistema de calidad.' },
      { ref: '¶32(f)', resumen: 'Recursos tecnológicos adecuados.' },
      { ref: '¶32(g)', resumen: 'Recursos intelectuales (metodologías, guías) adecuados y acordes con las normas.' },
      { ref: '¶32(h)', resumen: 'Proveedores de servicios adecuados.' },
    ],
    nicc1: '¶29-31 (recursos humanos).',
  },
  informacion_comunicacion: {
    pagina: 15,
    apartados: [
      { ref: '¶33(a)', resumen: 'Un sistema de información con datos relevantes y fiables.' },
      { ref: '¶33(b)', resumen: 'Una cultura en la que el personal comparte información.' },
      { ref: '¶33(c)', resumen: 'La información fluye dentro de la firma y con los equipos de los encargos.' },
      { ref: '¶33(d)', resumen: 'Se comunica a terceros cuando la ley lo exige o para explicar el sistema.' },
      { ref: '¶34(e)', resumen: 'Políticas sobre comunicación externa del sistema de calidad.' },
    ],
    nicc1: 'Sin elemento propio: es un componente nuevo de la NIGC 1.',
  },
  seguimiento: {
    pagina: 17,
    apartados: [
      { ref: '¶35-37', resumen: 'Actividades de seguimiento que permitan detectar deficiencias.' },
      { ref: '¶38', resumen: 'Inspección de encargos terminados, con al menos uno de cada socio de forma cíclica.' },
      { ref: '¶40-45', resumen: 'Evaluar hallazgos y deficiencias y tomar medidas correctoras.' },
      { ref: '¶46-47', resumen: 'Comunicar los resultados del seguimiento.' },
      { ref: '¶34(c)', resumen: 'Recibir, investigar y resolver quejas y denuncias.' },
      { ref: '¶53-54', resumen: 'Evaluación anual del sistema por el responsable último, con su conclusión.' },
    ],
    nicc1: '¶48-56 (quejas y denuncias en los ¶55-56).',
  },
}

/**
 * Funciones de AuditorYa que ya cumplen una respuesta. Solo se listan las que existen:
 * una respuesta vinculada se muestra como "cubierta por AuditorYa".
 */
export const VINCULOS_CALIDAD = {
  aceptacion: 'Evaluación de aceptación del cliente',
  notas_revision: 'Notas de revisión por papel de trabajo',
  aprobacion_socio: 'Aprobación de papeles y dictamen solo por el socio responsable',
  revision_calidad_cierre: 'Revisión de calidad en el cierre del encargo',
  cierre_encargo: 'Cierre del encargo que congela el archivo',
  pista_auditoria: 'Pista de auditoría inmutable',
  archivos_firmados: 'Evidencia con descarga por URL firmada',
  roles_permisos: 'Roles y permisos por firma',
  evaluacion_anual: 'Evaluación anual del sistema en AuditorYa',
  cambios_relevantes: 'Registro de cambios relevantes en AuditorYa',
} as const

export type VinculoCalidad = keyof typeof VINCULOS_CALIDAD

export const VINCULOS_CALIDAD_CLAVES = Object.keys(VINCULOS_CALIDAD) as [VinculoCalidad, ...VinculoCalidad[]]

export type RespuestaBase = { clave: string; descripcion: string; vinculo?: VinculoCalidad }
export type RiesgoBase = { clave: string; descripcion: string; respuestas: RespuestaBase[] }
export type ObjetivoBase = {
  clave: string
  componente: ComponenteCalidad
  texto: string
  riesgos: RiesgoBase[]
}

/**
 * Catálogo base para una firma pequeña o mediana colombiana. Los objetivos resumen
 * los que exige la norma; los riesgos y respuestas son un punto de partida típico
 * que la firma debe ajustar a su realidad (¶25: los riesgos son propios de cada firma).
 * Las claves son estables: identifican la fila precargada aunque la firma edite su texto.
 */
export const CATALOGO_CALIDAD: ObjetivoBase[] = [
  // ── Valoración de riesgos ────────────────────────────────────────────────────
  {
    clave: 'vr.proceso',
    componente: 'valoracion_riesgos',
    texto:
      'La firma establece objetivos de calidad, identifica y valora los riesgos para alcanzarlos y diseña respuestas, y los actualiza cuando cambian sus circunstancias.',
    riesgos: [
      {
        clave: 'vr.proceso.r1',
        descripcion:
          'Cambios en la firma o en sus clientes (sector regulado nuevo, salida de un socio, norma nueva) no se reflejan en el sistema.',
        respuestas: [
          {
            clave: 'vr.proceso.r1.a',
            descripcion:
              'Registro de cada cambio relevante (socios, clientes, normas) con los componentes que afecta y la decisión tomada, ajustando el sistema cuando corresponde.',
            vinculo: 'cambios_relevantes',
          },
        ],
      },
    ],
  },
  // ── Gobierno y liderazgo ─────────────────────────────────────────────────────
  {
    clave: 'gl.compromiso',
    componente: 'gobierno_liderazgo',
    texto:
      'La dirección demuestra compromiso con la calidad y asume la responsabilidad última del sistema de gestión de calidad.',
    riesgos: [
      {
        clave: 'gl.compromiso.r1',
        descripcion: 'Las metas comerciales o de honorarios se priorizan sobre la calidad de los encargos.',
        respuestas: [
          {
            clave: 'gl.compromiso.r1.a',
            descripcion: 'Declaración de liderazgo sobre la calidad firmada por el socio director y comunicada al equipo.',
          },
          {
            clave: 'gl.compromiso.r1.b',
            descripcion: 'La evaluación de desempeño de socios incluye criterios de calidad, no solo de facturación.',
          },
        ],
      },
    ],
  },
  {
    clave: 'gl.responsabilidades',
    componente: 'gobierno_liderazgo',
    texto:
      'Las responsabilidades sobre el sistema de calidad están asignadas a personas con experiencia, tiempo y autoridad suficientes.',
    riesgos: [
      {
        clave: 'gl.responsabilidades.r1',
        descripcion: 'Nadie tiene asignada formalmente la responsabilidad operativa del sistema de calidad.',
        respuestas: [
          {
            clave: 'gl.responsabilidades.r1.a',
            descripcion: 'Designación del responsable del sistema de calidad en AuditorYa.',
          },
        ],
      },
    ],
  },
  // ── Ética e independencia ────────────────────────────────────────────────────
  {
    clave: 'et.cumplimiento',
    componente: 'etica',
    texto:
      'La firma y su personal comprenden y cumplen los requerimientos de ética aplicables, incluida la independencia.',
    riesgos: [
      {
        clave: 'et.cumplimiento.r1',
        descripcion: 'Un miembro del equipo tiene un interés o una relación con un cliente que la firma desconoce.',
        respuestas: [
          {
            clave: 'et.cumplimiento.r1.a',
            descripcion: 'Confirmación anual de independencia de todo el personal.',
          },
          {
            clave: 'et.cumplimiento.r1.b',
            descripcion: 'Preguntas de independencia y conflictos en la evaluación de aceptación de cada cliente.',
            vinculo: 'aceptacion',
          },
        ],
      },
      {
        clave: 'et.cumplimiento.r2',
        descripcion: 'El personal no conoce el Código de Ética ni sus actualizaciones.',
        respuestas: [
          {
            clave: 'et.cumplimiento.r2.a',
            descripcion: 'Adopción formal del Código de Ética (IESBA) y capacitación anual con registro de asistencia.',
          },
        ],
      },
    ],
  },
  // ── Aceptación y continuidad ─────────────────────────────────────────────────
  {
    clave: 'ac.decisiones',
    componente: 'aceptacion_continuidad',
    texto:
      'La firma acepta o continúa relaciones con clientes solo con información suficiente sobre su naturaleza, la integridad de la administración y su capacidad para atender el encargo.',
    riesgos: [
      {
        clave: 'ac.decisiones.r1',
        descripcion: 'Se acepta un cliente sin evaluar la integridad de la administración ni los conflictos de interés.',
        respuestas: [
          {
            clave: 'ac.decisiones.r1.a',
            descripcion: 'Evaluación de aceptación obligatoria antes de crear cualquier encargo.',
            vinculo: 'aceptacion',
          },
        ],
      },
      {
        clave: 'ac.decisiones.r2',
        descripcion: 'Se continúa con un cliente recurrente sin reevaluar cambios desde el encargo anterior.',
        respuestas: [
          {
            clave: 'ac.decisiones.r2.a',
            descripcion: 'Evaluación de continuidad por vigencia antes de crear el encargo del nuevo período.',
          },
        ],
      },
    ],
  },
  // ── Realización de encargos ──────────────────────────────────────────────────
  {
    clave: 're.supervision',
    componente: 'realizacion_encargos',
    texto:
      'Los equipos están debidamente dirigidos y supervisados, y el trabajo es revisado por miembros con más experiencia.',
    riesgos: [
      {
        clave: 're.supervision.r1',
        descripcion: 'Papeles de trabajo sin revisión antes de concluir sobre el área.',
        respuestas: [
          {
            clave: 're.supervision.r1.a',
            descripcion: 'Notas de revisión por papel que el preparador debe resolver.',
            vinculo: 'notas_revision',
          },
          {
            clave: 're.supervision.r1.b',
            descripcion: 'Solo el socio responsable aprueba papeles de trabajo y el dictamen.',
            vinculo: 'aprobacion_socio',
          },
        ],
      },
    ],
  },
  {
    clave: 're.juicio',
    componente: 'realizacion_encargos',
    texto:
      'Se ejerce el juicio profesional y el escepticismo adecuados, se consulta en asuntos difíciles y las diferencias de opinión se resuelven antes del informe.',
    riesgos: [
      {
        clave: 're.juicio.r1',
        descripcion: 'Un encargo de riesgo alto se emite sin una segunda mirada objetiva.',
        respuestas: [
          {
            clave: 're.juicio.r1.a',
            descripcion: 'Revisión de calidad del encargo (NIGC 2) para los encargos que la firma defina, antes del dictamen.',
            vinculo: 'revision_calidad_cierre',
          },
        ],
      },
    ],
  },
  {
    clave: 're.documentacion',
    componente: 'realizacion_encargos',
    texto:
      'La documentación del encargo se compila oportunamente después de la fecha del informe y se conserva protegida y confidencial.',
    riesgos: [
      {
        clave: 're.documentacion.r1',
        descripcion: 'El archivo del encargo se modifica después de emitido el informe.',
        respuestas: [
          {
            clave: 're.documentacion.r1.a',
            descripcion: 'Cierre del encargo que congela el archivo y pista de auditoría de cada cambio.',
            vinculo: 'cierre_encargo',
          },
        ],
      },
      {
        clave: 're.documentacion.r2',
        descripcion: 'Acceso no autorizado a la evidencia de los clientes.',
        respuestas: [
          {
            clave: 're.documentacion.r2.a',
            descripcion: 'Evidencia almacenada sin acceso público y descargada solo por URL firmada de 15 minutos.',
            vinculo: 'archivos_firmados',
          },
        ],
      },
    ],
  },
  // ── Recursos ─────────────────────────────────────────────────────────────────
  {
    clave: 'rc.personas',
    componente: 'recursos',
    texto:
      'La firma cuenta con personal competente y lo asigna a los encargos según su experiencia, y mantiene su formación actualizada.',
    riesgos: [
      {
        clave: 'rc.personas.r1',
        descripcion: 'Se asigna a un encargo de un sector especializado personal sin la experiencia necesaria.',
        respuestas: [
          {
            clave: 'rc.personas.r1.a',
            descripcion: 'El socio aprueba la conformación del equipo de cada encargo según la complejidad del cliente.',
          },
        ],
      },
      {
        clave: 'rc.personas.r2',
        descripcion: 'El personal no completa su educación continua.',
        respuestas: [
          {
            clave: 'rc.personas.r2.a',
            descripcion: 'Plan anual de capacitación con registro de horas por persona.',
          },
        ],
      },
    ],
  },
  {
    clave: 'rc.tecnologia',
    componente: 'recursos',
    texto: 'Los recursos tecnológicos que usa la firma son apropiados y su uso está controlado.',
    riesgos: [
      {
        clave: 'rc.tecnologia.r1',
        descripcion: 'Personas sin autorización modifican información de los encargos.',
        respuestas: [
          {
            clave: 'rc.tecnologia.r1.a',
            descripcion: 'Roles y permisos por firma y registro de quién hizo cada cambio.',
            vinculo: 'roles_permisos',
          },
        ],
      },
    ],
  },
  // ── Información y comunicación ───────────────────────────────────────────────
  {
    clave: 'ic.interna',
    componente: 'informacion_comunicacion',
    texto:
      'La firma obtiene, genera y comunica información oportuna sobre el sistema de calidad a su personal y, cuando corresponde, a terceros.',
    riesgos: [
      {
        clave: 'ic.interna.r1',
        descripcion: 'El equipo no conoce las políticas de calidad vigentes ni sus cambios.',
        respuestas: [
          {
            clave: 'ic.interna.r1.a',
            descripcion: 'Comunicación de las políticas y de cada cambio relevante al personal, con constancia de recibido.',
          },
        ],
      },
    ],
  },
  // ── Seguimiento y corrección ─────────────────────────────────────────────────
  {
    clave: 'sg.proceso',
    componente: 'seguimiento',
    texto:
      'La firma hace seguimiento del sistema, incluida la inspección cíclica de encargos terminados, y corrige oportunamente las deficiencias.',
    riesgos: [
      {
        clave: 'sg.proceso.r1',
        descripcion: 'Deficiencias en los encargos se repiten porque no se inspeccionan los encargos terminados.',
        respuestas: [
          {
            clave: 'sg.proceso.r1.a',
            descripcion: 'Inspección de al menos un encargo terminado de cada socio en un ciclo máximo de 3 años.',
          },
        ],
      },
      {
        clave: 'sg.proceso.r2',
        descripcion: 'Quejas o denuncias sobre el trabajo de la firma no se investigan.',
        respuestas: [
          {
            clave: 'sg.proceso.r2.a',
            descripcion: 'Canal de quejas y denuncias con registro de la investigación y su resolución.',
          },
        ],
      },
      {
        clave: 'sg.proceso.r3',
        descripcion: 'Nadie evalúa el sistema en su conjunto, así que sus deficiencias no llegan a una conclusión ni a un plan.',
        respuestas: [
          {
            clave: 'sg.proceso.r3.a',
            descripcion:
              'Evaluación anual del sistema por el responsable, con su conclusión, las deficiencias y las acciones correctivas (¶53-54).',
            vinculo: 'evaluacion_anual',
          },
        ],
      },
    ],
  },
]

// ─── Tipos que expone la API ─────────────────────────────────────────────────

export type ObjetivoCalidad = {
  id: string
  componente: ComponenteCalidad
  texto: string
  baseClave: string | null
  activo: boolean
}

export type RiesgoCalidad = {
  id: string
  objetivoId: string
  descripcion: string
  baseClave: string | null
  activo: boolean
}

export type RespuestaCalidad = {
  id: string
  riesgoId: string
  descripcion: string
  vinculo: VinculoCalidad | null
  baseClave: string | null
  activo: boolean
  evidenciaNombre: string | null
  evidenciaAt: string | null
}

export type RevisionComponente = { porId: string; porNombre: string; at: string; nota: string | null }

/** Conclusión de la evaluación anual (¶54). */
export type ResultadoEvaluacionCalidad = 'razonable' | 'razonable_salvo' | 'no_razonable'

export const RESULTADO_EVALUACION_LABEL: Record<ResultadoEvaluacionCalidad, string> = {
  razonable: 'El sistema proporciona seguridad razonable',
  razonable_salvo: 'Seguridad razonable, salvo deficiencias graves no generalizadas',
  no_razonable: 'El sistema no proporciona seguridad razonable',
}

export type EvaluacionCalidad = {
  id: string
  anio: number
  fechaCorte: string
  componentesRevisados: Partial<Record<ComponenteCalidad, RevisionComponente>>
  resultado: ResultadoEvaluacionCalidad | null
  conclusion: string | null
  deficiencias: string | null
  concluidoPorNombre: string | null
  concluidoAt: string | null
}

export type CambioCalidad = {
  id: string
  accion: string
  detalle: Record<string, unknown> | null
  usuarioNombre: string | null
  createdAt: string
}

/** Cambios que obligan a mirar de nuevo el sistema (¶27). */
export const TIPOS_CAMBIO_RELEVANTE = {
  socio: 'Salida o ingreso de un socio',
  personal: 'Cambio en el personal clave',
  cliente: 'Cliente nuevo de un sector regulado o de mayor riesgo',
  norma: 'Norma o regulación nueva',
  queja: 'Queja, sanción o hallazgo externo',
  otro: 'Otro cambio en la firma',
} as const

export type TipoCambioRelevante = keyof typeof TIPOS_CAMBIO_RELEVANTE

export const TIPOS_CAMBIO_RELEVANTE_CLAVES = Object.keys(TIPOS_CAMBIO_RELEVANTE) as [
  TipoCambioRelevante,
  ...TipoCambioRelevante[],
]

export type DecisionCambioRelevante = 'ajustado' | 'sin_ajustes'

export const DECISION_CAMBIO_LABEL: Record<DecisionCambioRelevante, string> = {
  ajustado: 'Se ajustó el sistema',
  sin_ajustes: 'No requiere ajustes',
}

export type CambioRelevante = {
  id: string
  /** Cuándo ocurrió (YYYY-MM-DD). */
  fecha: string
  tipo: TipoCambioRelevante
  descripcion: string
  componentes: ComponenteCalidad[]
  /** null = registrado pero todavía sin evaluar. */
  decision: DecisionCambioRelevante | null
  justificacion: string | null
  evaluadoPorNombre: string | null
  evaluadoAt: string | null
  creadoPorNombre: string | null
  /** Cuándo se registró: lo que se compara con la fecha de revisión del componente. */
  createdAt: string
}

export type SistemaCalidad = {
  responsable: { id: string; nombre: string } | null
  /** El usuario puede editar objetivos/riesgos/respuestas y marcar componentes. */
  puedeGestionar: boolean
  /** El usuario puede concluir o reabrir la evaluación anual. */
  puedeConcluir: boolean
  objetivos: ObjetivoCalidad[]
  riesgos: RiesgoCalidad[]
  respuestas: RespuestaCalidad[]
  evaluacion: EvaluacionCalidad
  anteriores: { anio: number; resultado: ResultadoEvaluacionCalidad | null; concluidoAt: string | null }[]
  cambios: CambioCalidad[]
  /** Formatos creados (los que no aparecen están sin crear). */
  documentos: ResumenDocumentoCalidad[]
  /** Versiones del manual de calidad, de la más reciente a la más antigua. */
  manuales: ManualCalidadResumen[]
  /** Cambios relevantes ocurridos en el año de la evaluación, del más reciente al más antiguo. */
  cambiosRelevantes: CambioRelevante[]
  /** Manuales y políticas que la firma ya tenía, del más reciente al más antiguo. */
  documentosFirma: DocumentoFirmaCalidad[]
}

// ─── Reglas ─────────────────────────────────────────────────────────────────

export type EstadoComponenteCalidad = 'revisado' | 'atencion' | 'pendiente'

/**
 * Estado de un componente en la evaluación del año. "Atención" pesa más que
 * "revisado": un riesgo activo sin ninguna respuesta activa es un hueco del diseño.
 */
export function estadoComponenteCalidad(
  componente: ComponenteCalidad,
  datos: Pick<SistemaCalidad, 'objetivos' | 'riesgos' | 'respuestas'>,
  revisados: EvaluacionCalidad['componentesRevisados'],
): EstadoComponenteCalidad {
  if (riesgosSinRespuesta(componente, datos).length > 0) return 'atencion'
  return revisados[componente] ? 'revisado' : 'pendiente'
}

/** Riesgos activos del componente (bajo objetivos activos) sin respuesta activa. */
export function riesgosSinRespuesta(
  componente: ComponenteCalidad,
  { objetivos, riesgos, respuestas }: Pick<SistemaCalidad, 'objetivos' | 'riesgos' | 'respuestas'>,
): RiesgoCalidad[] {
  const objetivosIds = new Set(objetivos.filter((o) => o.activo && o.componente === componente).map((o) => o.id))
  const conRespuesta = new Set(respuestas.filter((r) => r.activo).map((r) => r.riesgoId))
  return riesgos.filter((r) => r.activo && objetivosIds.has(r.objetivoId) && !conRespuesta.has(r.id))
}

/** Componentes que faltan por revisar para poder concluir la evaluación anual. */
export function componentesPorRevisar(
  revisados: EvaluacionCalidad['componentesRevisados'],
): ComponenteCalidad[] {
  return COMPONENTES_CALIDAD_CLAVES.filter((c) => !revisados[c])
}

/** Fecha de corte por defecto de la evaluación del año. */
export function fechaCorteCalidad(anio: number): string {
  return `${anio}-12-31`
}

/** Días calendario entre `hoy` y la fecha de corte (negativo si ya pasó). */
export function diasParaCorte(fechaCorte: string, hoy: Date): number {
  const [y, m, d] = fechaCorte.split('-').map(Number)
  const corte = Date.UTC(y, m - 1, d)
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((corte - base) / 86_400_000)
}

/**
 * Cambios relevantes registrados DESPUÉS de que el componente se marcó como revisado en el año:
 * la revisión no los tuvo en cuenta. Solo es un aviso; no desmarca nada (decisión de Laura).
 */
export function cambiosPosterioresARevision(
  componente: ComponenteCalidad,
  sistema: Pick<SistemaCalidad, 'evaluacion' | 'cambiosRelevantes'>,
): CambioRelevante[] {
  const revision = sistema.evaluacion.componentesRevisados[componente]
  if (!revision) return []
  return sistema.cambiosRelevantes.filter((x) => x.componentes.includes(componente) && x.createdAt > revision.at)
}
