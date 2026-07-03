/**
 * Plantillas de informes (Fase 5). Generan un borrador editable con redacción
 * estándar según NIA 700 / 265 / 580 y el contexto de la auditoría.
 *
 * No reemplazan el juicio del auditor: producen un punto de partida que el
 * usuario revisa y ajusta antes de aprobar.
 */
import type { TipoInforme, TipoOpinion } from '@auditorya/types'

const MARCO_LABEL: Record<string, string> = {
  NIIF: 'las Normas Internacionales de Información Financiera (NIIF)',
  NIIF_PYMES: 'la NIIF para las Pymes',
  PCGA: 'los principios de contabilidad generalmente aceptados en Colombia',
}

export type ContextoInforme = {
  firmaNombre: string
  firmaCiudad: string
  empresaNombre: string
  empresaNit: string
  marcoContable: string
  periodo: string
  tipoOpinion?: TipoOpinion | null
  deficienciasCoso?: { titulo: string; calificacion: string; observaciones: string | null }[]
  hallazgos?: { area: string; titulo: string; hallazgos: string | null }[]
  hallazgosAI?: {
    titulo: string
    nivelRiesgo: string
    condicion: string
    criterio: string
    causa: string
    efecto: string
    recomendacion: string
  }[]
  // Memorando de planeación (NIA 300)
  socioNombre?: string
  entendimiento?: {
    cambiosSignificativos: string | null
    eventosSignificativos: string | null
    notas: string | null
    sinCambios: boolean
  } | null
  materialidad?: {
    baseCalculo: string
    montoBase: string
    porcentaje: string
    materialidad: string
    porcentajeDesempeno: string
    materialidadDesempeno: string
    justificacion: string | null
    aprobada: boolean
  } | null
  riesgosResumen?: { area: string; descripcion: string; combinado: string; respuesta: string | null }[]
  cosoResumen?: { titulo: string; calificacion: string; observaciones: string | null }[]
  cronogramaResumen?: { total: number; agendados: number; desde: string | null; hasta: string | null } | null
}

const BASE_MATERIALIDAD_LABEL: Record<string, string> = {
  activos: 'activos totales',
  ingresos: 'ingresos operacionales',
  utilidad_antes_impuestos: 'utilidad antes de impuestos',
  patrimonio: 'patrimonio',
}

function fmtMoneda(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '[___]'
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
}

function cartaEncargo(ctx: ContextoInforme): Record<string, string> {
  return {
    destinatario: `Señores\nJunta Directiva / Representante Legal de ${ctx.empresaNombre} (NIT ${ctx.empresaNit})\n\nAsunto: Términos del encargo de auditoría de los estados financieros por el período ${ctx.periodo}.`,
    objetivo_alcance: `Ustedes nos han solicitado auditar los estados financieros de ${ctx.empresaNombre}, que comprenden el estado de situación financiera al 31 de diciembre de ${ctx.periodo} y los correspondientes estados de resultados, de cambios en el patrimonio y de flujos de efectivo por el año terminado en esa fecha, así como las notas explicativas. Nos complace confirmar los términos del encargo mediante la presente carta. La auditoría se realizará con el objetivo de expresar una opinión sobre los estados financieros, de conformidad con ${marco(ctx)}.`,
    responsabilidad_auditor: `Realizaremos la auditoría de conformidad con las Normas Internacionales de Auditoría (NIA). Dichas normas exigen que cumplamos los requerimientos de ética y que planifiquemos y ejecutemos la auditoría para obtener una seguridad razonable sobre si los estados financieros están libres de incorrección material. Una auditoría conlleva la aplicación de procedimientos para obtener evidencia sobre los importes y la información revelada; los procedimientos dependen de nuestro juicio profesional, incluida la valoración de los riesgos de incorrección material. Por la naturaleza de la auditoría y otras limitaciones inherentes, junto con las del control interno, existe un riesgo inevitable de que algunas incorrecciones materiales no se detecten, aun cuando la auditoría se planifique y ejecute adecuadamente conforme a las NIA.`,
    responsabilidad_administracion: `La auditoría se realizará sobre la base de que la administración reconoce y comprende que es responsable de: (a) la preparación y presentación fiel de los estados financieros de conformidad con ${marco(ctx)}; (b) el control interno que considere necesario para permitir la preparación de estados financieros libres de incorrección material debida a fraude o error; y (c) proporcionarnos acceso a toda la información relevante (registros, documentación y demás), la información adicional que solicitemos y acceso sin restricción a las personas de la entidad de las que consideremos necesario obtener evidencia.`,
    forma_informes: `Como resultado de nuestro trabajo emitiremos un informe (dictamen) con nuestra opinión sobre los estados financieros y, cuando corresponda, la comunicación de las deficiencias de control interno (NIA 265) y demás informes exigidos por la normativa aplicable al revisor fiscal. La forma y el contenido de nuestros informes podrán variar en función de los hallazgos.`,
    otros_asuntos: `Honorarios: [indique los honorarios acordados y la forma de facturación].\nIndependencia: confirmamos que mantenemos independencia respecto de la entidad conforme al Código de Ética aplicable.\nEquipo: el encargo estará bajo la responsabilidad del socio ${ctx.socioNombre ?? '[___]'}.\nVigencia: esta carta será efectiva para el período auditado y los sucesivos, salvo que se modifique o se dé por terminada.`,
    firma: `Agradecemos firmar y devolver la copia adjunta de esta carta para indicar su conocimiento y acuerdo con los términos aquí descritos.\n\nAtentamente,\n\n${ctx.firmaNombre}\n${ctx.socioNombre ?? '[Nombre del socio / Revisor Fiscal]'}\n${ctx.firmaCiudad}, [fecha]\n\nAceptado en nombre de ${ctx.empresaNombre}:\n\n_______________________________\n[Nombre y cargo del Representante Legal] — [fecha]`,
  }
}

function memoPlaneacion(ctx: ContextoInforme): Record<string, string> {
  const ent = ctx.entendimiento
  const entendimientoTexto = ent
    ? ent.sinCambios
      ? 'La administración confirmó que no hubo cambios significativos en la entidad ni en su entorno respecto del período anterior. Se mantiene el entendimiento del negocio del archivo permanente.'
      : [
          ent.cambiosSignificativos ? `Cambios significativos: ${ent.cambiosSignificativos}` : '',
          ent.eventosSignificativos ? `Eventos significativos del período: ${ent.eventosSignificativos}` : '',
          ent.notas ? `Notas: ${ent.notas}` : '',
        ].filter(Boolean).join('\n\n') || '[Documente el entendimiento de la entidad y su entorno.]'
    : '[Pendiente: confirme el entendimiento de la entidad y su entorno en la pestaña de Entendimiento.]'

  const mat = ctx.materialidad
  const materialidadTexto = mat
    ? `Se determinó la materialidad para los estados financieros en su conjunto tomando como referencia ${BASE_MATERIALIDAD_LABEL[mat.baseCalculo] ?? mat.baseCalculo} por ${fmtMoneda(mat.montoBase)}, aplicando un ${mat.porcentaje}%:\n` +
      `• Materialidad global: ${fmtMoneda(mat.materialidad)}\n` +
      `• Materialidad de desempeño (${mat.porcentajeDesempeno}%): ${fmtMoneda(mat.materialidadDesempeno)}\n` +
      (mat.justificacion ? `\nJustificación: ${mat.justificacion}` : '') +
      `\n\nEstado: ${mat.aprobada ? 'aprobada por el socio responsable.' : 'pendiente de aprobación.'}`
    : '[Pendiente: calcule la materialidad (NIA 320) en la pestaña de Materialidad.]'

  const riesgos = ctx.riesgosResumen ?? []
  const riesgosTexto = riesgos.length > 0
    ? riesgos
        .map((r) => `• [${r.area} — riesgo ${r.combinado}] ${r.descripcion}\n   Respuesta planeada: ${r.respuesta?.trim() || '[definir procedimiento]'}`)
        .join('\n')
    : '[Pendiente: identifique los riesgos por área (NIA 315) en la pestaña de Riesgos.]'

  const coso = ctx.cosoResumen ?? []
  const cosoTexto = coso.length > 0
    ? coso
        .map((c) => `• ${c.titulo}: ${c.calificacion.replace('_', ' ')}${c.observaciones ? ` — ${c.observaciones}` : ''}`)
        .join('\n')
    : '[Pendiente: evalúe los cinco componentes del control interno (COSO) en la pestaña de Control interno.]'

  const cron = ctx.cronogramaResumen
  const cronogramaTexto = cron && cron.total > 0
    ? `El plan contempla ${cron.total} actividad(es) entre tareas y pruebas, de las cuales ${cron.agendados} están agendadas. ` +
      `Ventana de ejecución prevista: del ${fmtFecha(cron.desde)} al ${fmtFecha(cron.hasta)}. ` +
      'El detalle y el seguimiento se llevan en la pestaña de Cronograma.'
    : '[Pendiente: agende las tareas y pruebas en la pestaña de Cronograma para definir la oportunidad del trabajo.]'

  return {
    objetivo_alcance: `El objetivo del encargo es obtener seguridad razonable sobre si los estados financieros de ${ctx.empresaNombre} (NIT ${ctx.empresaNit}) por el período ${ctx.periodo} están libres de incorrección material y expresar una opinión de conformidad con ${marco(ctx)}. El alcance comprende la auditoría de los estados financieros y el cumplimiento de las responsabilidades del revisor fiscal conforme a las Normas Internacionales de Auditoría (NIA) y a la normativa colombiana aplicable.`,
    entendimiento: entendimientoTexto,
    materialidad: materialidadTexto,
    riesgos_significativos: riesgosTexto,
    enfoque: `La estrategia global combina pruebas de controles y procedimientos sustantivos (de detalle y analíticos) según la evaluación de riesgos por área. Para las áreas de mayor riesgo se privilegian procedimientos sustantivos de detalle sobre muestras representativas; para las demás, procedimientos analíticos y pruebas de recorrido. El enfoque se ajustará conforme evolucione la ejecución.`,
    control_interno: cosoTexto,
    cronograma: cronogramaTexto,
    equipo_recursos: `Socio responsable del encargo: ${ctx.socioNombre ?? '[___]'}. El equipo asignado y la distribución de tiempos se detallan en el Cronograma. Se prevé la supervisión y revisión del trabajo por parte del socio conforme a la NIA 220.`,
    firma: `Preparado y aprobado por:\n\n${ctx.socioNombre ?? '[Nombre del socio responsable]'}\nSocio responsable — ${ctx.firmaNombre}\n${ctx.firmaCiudad}, [fecha de aprobación]`,
  }
}

function marco(ctx: ContextoInforme) {
  return MARCO_LABEL[ctx.marcoContable] ?? ctx.marcoContable
}

function parrafoOpinion(ctx: ContextoInforme): string {
  const base = `Hemos auditado los estados financieros de ${ctx.empresaNombre}, que comprenden el estado de situación financiera al 31 de diciembre de ${ctx.periodo}, y los correspondientes estados de resultados, de cambios en el patrimonio y de flujos de efectivo por el año terminado en esa fecha, así como las notas explicativas.`
  switch (ctx.tipoOpinion) {
    case 'con_salvedades':
      return `${base}\n\nEn nuestra opinión, excepto por los efectos del asunto descrito en la sección "Fundamento de la opinión con salvedades", los estados financieros adjuntos presentan razonablemente, en todos los aspectos materiales, la situación financiera de ${ctx.empresaNombre} al 31 de diciembre de ${ctx.periodo}, de conformidad con ${marco(ctx)}.`
    case 'negativa':
      return `${base}\n\nEn nuestra opinión, debido a la significatividad del asunto descrito en la sección "Fundamento de la opinión negativa", los estados financieros adjuntos NO presentan razonablemente la situación financiera de ${ctx.empresaNombre} al 31 de diciembre de ${ctx.periodo}, de conformidad con ${marco(ctx)}.`
    case 'abstencion':
      return `${base}\n\nNo expresamos una opinión sobre los estados financieros adjuntos de ${ctx.empresaNombre}. Debido a la significatividad del asunto descrito en la sección "Fundamento de la abstención de opinión", no hemos podido obtener evidencia de auditoría suficiente y adecuada que proporcione una base para una opinión de auditoría.`
    default:
      return `${base}\n\nEn nuestra opinión, los estados financieros adjuntos presentan razonablemente, en todos los aspectos materiales, la situación financiera de ${ctx.empresaNombre} al 31 de diciembre de ${ctx.periodo}, así como sus resultados y flujos de efectivo por el año terminado en esa fecha, de conformidad con ${marco(ctx)}.`
  }
}

function fundamentoOpinion(ctx: ContextoInforme): string {
  const estandar = `Llevamos a cabo nuestra auditoría de conformidad con las Normas Internacionales de Auditoría (NIA). Nuestras responsabilidades de acuerdo con dichas normas se describen más adelante. Somos independientes de ${ctx.empresaNombre} de conformidad con el Código de Ética para profesionales de la contabilidad, y hemos cumplido las demás responsabilidades éticas. Consideramos que la evidencia de auditoría obtenida proporciona una base suficiente y adecuada para nuestra opinión.`
  if (ctx.tipoOpinion && ctx.tipoOpinion !== 'limpia') {
    return `[Describa aquí el asunto que motiva la modificación de la opinión: naturaleza, cuentas afectadas y, cuando sea cuantificable, su efecto en los estados financieros.]\n\n${estandar}`
  }
  return estandar
}

function dictamen(ctx: ContextoInforme): Record<string, string> {
  return {
    destinatario: `A los señores Accionistas de ${ctx.empresaNombre}`,
    parrafo_opinion: parrafoOpinion(ctx),
    fundamento_opinion: fundamentoOpinion(ctx),
    parrafo_enfasis: '',
    responsabilidad_administracion: `La administración es responsable de la preparación y presentación fiel de los estados financieros de conformidad con ${marco(ctx)}, y del control interno que considere necesario para permitir la preparación de estados financieros libres de incorrección material, debida a fraude o error. En la preparación, la administración es responsable de evaluar la capacidad de la entidad para continuar como negocio en marcha.`,
    responsabilidad_auditor: `Nuestros objetivos son obtener una seguridad razonable de que los estados financieros en su conjunto están libres de incorrección material, debida a fraude o error, y emitir un informe que contenga nuestra opinión. La seguridad razonable es un alto grado de seguridad, pero no garantiza que una auditoría realizada conforme a las NIA detecte siempre una incorrección material cuando existe.`,
    otros_requerimientos: `Además, con base en el alcance de nuestra auditoría, conceptuamos que durante el año ${ctx.periodo} la contabilidad de la entidad se llevó de conformidad con las normas legales y la técnica contable; las operaciones registradas se ajustan a los estatutos y a las decisiones de los órganos sociales; la correspondencia, los comprobantes y los libros se llevan y conservan debidamente; y se observaron las medidas de control interno y de conservación de activos (artículo 209 del Código de Comercio).`,
    firma: `${ctx.firmaNombre}\n[Nombre del Revisor Fiscal / Contador Público]\nT.P. No. __________\n${ctx.firmaCiudad}, [fecha de emisión]`,
  }
}

function cartaControlInterno(ctx: ContextoInforme): Record<string, string> {
  const items: string[] = []
  for (const d of ctx.deficienciasCoso ?? []) {
    const cal = d.calificacion === 'deficiente' ? 'Deficiente' : 'Con deficiencias'
    items.push(`• ${d.titulo} (${cal}): ${d.observaciones?.trim() || 'Ver detalle en papeles de trabajo.'}`)
  }
  for (const h of ctx.hallazgos ?? []) {
    if (h.hallazgos?.trim()) items.push(`• [${h.area}] ${h.titulo}: ${h.hallazgos.trim()}`)
  }
  const deficiencias =
    items.length > 0
      ? items.join('\n')
      : 'No se identificaron deficiencias significativas en el control interno que debieran comunicarse.'

  return {
    destinatario: `A la Junta Directiva y a la Administración de ${ctx.empresaNombre}`,
    introduccion: `En relación con nuestra auditoría de los estados financieros de ${ctx.empresaNombre} por el año terminado el 31 de diciembre de ${ctx.periodo}, consideramos el control interno relevante para la preparación de los estados financieros con el fin de diseñar procedimientos de auditoría apropiados a las circunstancias, y no con el propósito de expresar una opinión sobre la eficacia del control interno. En cumplimiento de la NIA 265, a continuación comunicamos las deficiencias identificadas durante nuestro trabajo.`,
    deficiencias,
    recomendaciones: `Recomendamos a la administración implementar planes de acción para subsanar las deficiencias anteriores, asignando responsables y fechas de cumplimiento, y fortaleciendo los controles clave en las áreas señaladas.`,
    cierre: `Esta comunicación se dirige exclusivamente a la Junta Directiva y a la administración de la entidad, y no debe ser utilizada para ningún otro propósito ni distribuida a terceros.`,
    firma: `${ctx.firmaNombre}\n[Nombre del Revisor Fiscal / Contador Público]\nT.P. No. __________\n${ctx.firmaCiudad}, [fecha de emisión]`,
  }
}

function cartaRepresentaciones(ctx: ContextoInforme): Record<string, string> {
  return {
    destinatario: `Señores\n${ctx.firmaNombre}\nRevisor Fiscal / Auditor Independiente\nLa ciudad`,
    introduccion: `Esta carta de representación se proporciona en relación con su auditoría de los estados financieros de ${ctx.empresaNombre} (NIT ${ctx.empresaNit}) por el año terminado el 31 de diciembre de ${ctx.periodo}, preparados de conformidad con ${marco(ctx)}, con el propósito de expresar una opinión sobre si presentan razonablemente, en todos los aspectos materiales, la situación financiera de la entidad.`,
    declaraciones: `Confirmamos, según nuestro leal saber y entender y habiendo efectuado las indagaciones que consideramos necesarias, las siguientes manifestaciones:\n• Somos responsables de la preparación y presentación fiel de los estados financieros de conformidad con el marco de información financiera aplicable.\n• Hemos registrado y reflejado todas las transacciones en los estados financieros.\n• Somos responsables del diseño e implementación del control interno para prevenir y detectar fraude y error.\n• No tenemos conocimiento de fraudes o sospechas de fraude que afecten a la entidad.\n• Hemos revelado todos los litigios, reclamaciones y pasivos contingentes conocidos.\n• Hemos cumplido con las disposiciones legales y reglamentarias aplicables.`,
    informacion_proporcionada: `Les hemos proporcionado acceso a toda la información relevante (registros, documentación y demás asuntos), la información adicional que nos solicitaron, y acceso sin restricciones a las personas de la entidad de quienes consideraron necesario obtener evidencia de auditoría.`,
    cierre: `Atentamente,`,
    firma: `_______________________________\n[Nombre del Representante Legal]\nRepresentante Legal — ${ctx.empresaNombre}\nNIT ${ctx.empresaNit}\n[fecha]`,
  }
}

function informeAI(ctx: ContextoInforme): Record<string, string> {
  const hallazgosTexto = (ctx.hallazgosAI ?? [])
    .map((h, i) => {
      const nivel = h.nivelRiesgo.toUpperCase()
      return `Hallazgo ${i + 1} — ${h.titulo} [Riesgo: ${nivel}]\nCondición: ${h.condicion}\nCriterio: ${h.criterio}\nCausa: ${h.causa}\nEfecto: ${h.efecto}\nRecomendación: ${h.recomendacion}`
    })
    .join('\n\n')

  return {
    destinatario: `A la Presidencia / Junta Directiva de ${ctx.empresaNombre}`,
    resumen_ejecutivo: `En cumplimiento del plan de auditoría interna para el período ${ctx.periodo}, se realizó el presente encargo con el objetivo de evaluar el diseño y efectividad operacional de los controles internos y procesos auditados. Se identificaron ${ctx.hallazgosAI?.length ?? 0} hallazgo(s) que requieren atención.`,
    objetivo_alcance: `Objetivo: Evaluar el diseño y la efectividad operativa de los controles y procesos seleccionados en el plan de auditoría para el período ${ctx.periodo}.\n\nAlcance: [Describa aquí las áreas, procesos y período cubierto por el encargo. Indique cualquier exclusión relevante.]`,
    metodologia: `El trabajo de campo se realizó de conformidad con las Normas Internacionales para el Ejercicio Profesional de la Auditoría Interna (NIEPAI) del Instituto de Auditores Internos (IIA). Las técnicas utilizadas incluyeron: revisión documental, entrevistas con el personal clave, pruebas de controles y análisis de datos.`,
    hallazgos_consolidados: hallazgosTexto || 'No se identificaron hallazgos significativos durante el período auditado.',
    conclusion: `Con base en el trabajo realizado, el equipo de auditoría interna concluye que [opinión general sobre el estado de los controles y procesos auditados]. Los hallazgos comunicados requieren atención prioritaria por parte de la administración.`,
    plan_seguimiento: `La administración deberá presentar un plan de acción para cada hallazgo dentro de los [30] días hábiles siguientes a la recepción de este informe. El equipo de auditoría interna realizará seguimiento al cumplimiento del plan de acción en el próximo período.`,
    firma: `${ctx.firmaNombre}\n[Nombre del Auditor Interno / Jefe de Auditoría Interna]\n${ctx.firmaCiudad}, [fecha de emisión]`,
  }
}

export function generarContenido(tipo: TipoInforme, ctx: ContextoInforme): Record<string, string> {
  switch (tipo) {
    case 'carta_encargo':
      return cartaEncargo(ctx)
    case 'memo_planeacion':
      return memoPlaneacion(ctx)
    case 'dictamen':
      return dictamen(ctx)
    case 'carta_control_interno':
      return cartaControlInterno(ctx)
    case 'carta_representaciones':
      return cartaRepresentaciones(ctx)
    case 'informe_ai':
      return informeAI(ctx)
  }
}
