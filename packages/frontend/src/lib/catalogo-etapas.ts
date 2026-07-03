/** Normativa aplicable y tips prácticos por paso del encargo. Alimenta la card de apoyo (derecha). */

export type Norma = { codigo: string; titulo: string }

export type EtapaInfo = {
  normas: Norma[]
  tips: string[]
}

export const CATALOGO_ETAPAS: Record<string, EtapaInfo> = {
  // ── Revisoría Fiscal (NIA) ──
  carta_encargo: {
    normas: [{ codigo: 'NIA 210', titulo: 'Acuerdo de los términos del encargo de auditoría' }],
    tips: [
      'Formaliza el alcance, las responsabilidades y los términos antes de iniciar el trabajo.',
      'Es un documento de planeación: se puede generar sin materialidad aprobada.',
    ],
  },
  entendimiento: {
    normas: [{ codigo: 'NIA 315', titulo: 'Identificación y valoración de los riesgos de incorrección material' }],
    tips: [
      'Documenta el sector, el marco contable y los cambios del período: es la base para identificar riesgos.',
      'Un buen entendimiento evita riesgos genéricos: conecta cada factor del negocio con una posible incorrección.',
    ],
  },
  balance: {
    normas: [{ codigo: 'NIA 520', titulo: 'Procedimientos analíticos' }],
    tips: [
      'Compara saldos contra el período anterior y contra el sector para detectar variaciones inusuales.',
      'Las variaciones que no puedas explicar son candidatas a riesgo: llévalas al paso de Riesgos.',
    ],
  },
  riesgos: {
    normas: [
      { codigo: 'NIA 315', titulo: 'Identificación y valoración de riesgos' },
      { codigo: 'NIA 330', titulo: 'Respuestas del auditor a los riesgos valorados' },
    ],
    tips: [
      'Todo riesgo alto necesita una respuesta planeada (prueba) antes de pasar a ejecución.',
      'Vincula cada riesgo a una aserción y a un área: eso guía qué evidencia buscar después.',
    ],
  },
  control_interno: {
    normas: [
      { codigo: 'NIA 315', titulo: 'Entendimiento del control interno' },
      { codigo: 'COSO 2013', titulo: 'Marco integrado de control interno (5 componentes)' },
    ],
    tips: [
      'Evalúa los 5 componentes COSO: ambiente, evaluación de riesgos, actividades, información y monitoreo.',
      'Las deficiencias significativas alimentan la carta de control interno (NIA 265).',
    ],
  },
  materialidad: {
    normas: [{ codigo: 'NIA 320', titulo: 'Importancia relativa (materialidad) en la planificación y ejecución' }],
    tips: [
      'Elige una base razonable (activos, ingresos o patrimonio) según el foco de los usuarios del informe.',
      'La materialidad debe aprobarla el socio: ese es el gate que habilita la ejecución.',
    ],
  },
  cronograma: {
    normas: [{ codigo: 'NIA 300', titulo: 'Planificación de la auditoría (naturaleza, oportunidad y alcance)' }],
    tips: [
      'El cronograma cubre la "oportunidad" de la NIA 300: cuándo se ejecuta cada tarea y prueba.',
      'Define fechas de inicio/fin y responsable por hito para comparar lo planeado con lo real.',
    ],
  },
  memo: {
    normas: [{ codigo: 'NIA 300', titulo: 'Planificación de la auditoría (estrategia global y plan)' }],
    tips: [
      'El memo consolida entendimiento, materialidad, riesgos, control interno y cronograma en un solo documento.',
      'Es el gate de planeación: debe aprobarlo el socio responsable antes de pasar a ejecución.',
    ],
  },
  tareas: {
    normas: [
      { codigo: 'NIA 300', titulo: 'Planificación de la auditoría' },
      { codigo: 'NIA 220', titulo: 'Gestión de la calidad del encargo' },
    ],
    tips: [
      'Asigna cada área al miembro del equipo con la competencia adecuada.',
      'La naturaleza, oportunidad y alcance de las tareas debe responder a los riesgos valorados.',
    ],
  },
  papeles: {
    normas: [{ codigo: 'NIA 230', titulo: 'Documentación de auditoría' }],
    tips: [
      'Un tercero debería poder entender el trabajo realizado, la evidencia y la conclusión solo con el papel.',
      'Solo el socio responsable puede aprobar los papeles de trabajo.',
    ],
  },
  pbc: {
    normas: [{ codigo: 'NIA 500', titulo: 'Evidencia de auditoría' }],
    tips: [
      'La evidencia debe ser suficiente y adecuada: relevante para la aserción y fiable en su origen.',
      'Ancla cada documento recibido a la prueba que lo requiere para mantener la trazabilidad.',
    ],
  },
  informes: {
    normas: [
      { codigo: 'NIA 700', titulo: 'Formación de la opinión y dictamen' },
      { codigo: 'NIA 265', titulo: 'Comunicación de deficiencias de control interno' },
      { codigo: 'NIA 580', titulo: 'Manifestaciones escritas' },
    ],
    tips: [
      'La opinión debe sustentarse en la evidencia acumulada en los papeles de trabajo.',
      'El dictamen lo aprueba el socio responsable; las cartas (control interno y representaciones) lo acompañan.',
    ],
  },
  cierre: {
    normas: [
      { codigo: 'NIA 560', titulo: 'Hechos posteriores al cierre' },
      { codigo: 'NIA 570', titulo: 'Empresa en funcionamiento (negocio en marcha)' },
      { codigo: 'NIA 220', titulo: 'Revisión de calidad y cierre del socio' },
    ],
    tips: [
      'Evalúa hechos posteriores y la hipótesis de negocio en marcha antes de cerrar.',
      'El socio no puede cerrar el encargo si quedan notas de revisión abiertas.',
    ],
  },

  // ── Auditoría Interna (IIA – Normas Globales 2024 / IPPF) ──
  alcance: {
    normas: [{ codigo: 'IIA – IPPF 2024', titulo: 'Planificación del trabajo: objetivos y alcance' }],
    tips: [
      'Define objetivos, alcance y criterios del trabajo alineados con los riesgos de la organización.',
      'Un alcance claro delimita qué áreas y procesos se revisan en programas de trabajo.',
    ],
  },
  programas: {
    normas: [{ codigo: 'IIA – IPPF 2024', titulo: 'Programa de trabajo y ejecución del encargo' }],
    tips: [
      'Cada programa detalla los procedimientos que respaldan los objetivos del trabajo.',
      'Documenta la evidencia obtenida a medida que ejecutas cada procedimiento.',
    ],
  },
  hallazgos: {
    normas: [{ codigo: 'IIA – IPPF 2024', titulo: 'Comunicación de resultados' }],
    tips: [
      'Estructura cada hallazgo con condición, criterio, causa y efecto, más una recomendación accionable.',
      'Define responsable y fecha de seguimiento para cada recomendación.',
    ],
  },
  informe_ai: {
    normas: [{ codigo: 'IIA – IPPF 2024', titulo: 'Comunicación y seguimiento del progreso' }],
    tips: [
      'El informe consolida objetivos, alcance, hallazgos y recomendaciones para la dirección.',
      'Incluye el plan de seguimiento de las acciones acordadas.',
    ],
  },
}
