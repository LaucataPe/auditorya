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

export function generarContenido(tipo: TipoInforme, ctx: ContextoInforme): Record<string, string> {
  switch (tipo) {
    case 'dictamen':
      return dictamen(ctx)
    case 'carta_control_interno':
      return cartaControlInterno(ctx)
    case 'carta_representaciones':
      return cartaRepresentaciones(ctx)
  }
}
