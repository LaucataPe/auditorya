export type TipoInforme = 'dictamen' | 'carta_control_interno' | 'carta_representaciones' | 'informe_ai' | 'memo_planeacion' | 'carta_encargo'

export type TipoOpinion = 'limpia' | 'con_salvedades' | 'negativa' | 'abstencion'

export type EstadoInforme = 'borrador' | 'aprobado'

export type Informe = {
  id: string
  auditoriaId: string
  tipo: TipoInforme
  tipoOpinion: TipoOpinion | null
  contenido: Record<string, string>
  estado: EstadoInforme
  aprobadoPor: string | null
  aprobadoAt: string | null
  createdAt: string
}

export type SeccionInforme = { key: string; label: string }

/** Estructura (orden + etiquetas) de cada tipo de informe. Compartida front/back. */
export const SECCIONES_INFORME: Record<TipoInforme, SeccionInforme[]> = {
  carta_encargo: [
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'objetivo_alcance', label: 'Objetivo y alcance de la auditoría' },
    { key: 'responsabilidad_auditor', label: 'Responsabilidades del auditor' },
    { key: 'responsabilidad_administracion', label: 'Responsabilidades de la administración' },
    { key: 'forma_informes', label: 'Forma y contenido de los informes a emitir' },
    { key: 'otros_asuntos', label: 'Otros asuntos (honorarios, independencia, acceso a la información)' },
    { key: 'firma', label: 'Aceptación y firma' },
  ],
  memo_planeacion: [
    { key: 'objetivo_alcance', label: 'Objetivo y alcance del encargo' },
    { key: 'entendimiento', label: 'Entendimiento de la entidad y su entorno (NIA 315)' },
    { key: 'materialidad', label: 'Materialidad (NIA 320)' },
    { key: 'riesgos_significativos', label: 'Riesgos identificados y respuesta (NIA 315/330)' },
    { key: 'enfoque', label: 'Estrategia global y enfoque de auditoría' },
    { key: 'control_interno', label: 'Evaluación preliminar del control interno (COSO)' },
    { key: 'cronograma', label: 'Oportunidad — cronograma y hitos' },
    { key: 'equipo_recursos', label: 'Equipo del encargo y recursos' },
    { key: 'firma', label: 'Aprobación (socio responsable)' },
  ],
  informe_ai: [
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'resumen_ejecutivo', label: 'Resumen ejecutivo' },
    { key: 'objetivo_alcance', label: 'Objetivo y alcance' },
    { key: 'metodologia', label: 'Metodología' },
    { key: 'hallazgos_consolidados', label: 'Hallazgos y recomendaciones' },
    { key: 'conclusion', label: 'Conclusión general' },
    { key: 'plan_seguimiento', label: 'Plan de seguimiento' },
    { key: 'firma', label: 'Firma y fecha' },
  ],
  dictamen: [
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'parrafo_opinion', label: 'Opinión' },
    { key: 'fundamento_opinion', label: 'Fundamento de la opinión' },
    { key: 'parrafo_enfasis', label: 'Párrafo de énfasis (opcional)' },
    { key: 'responsabilidad_administracion', label: 'Responsabilidades de la administración' },
    { key: 'responsabilidad_auditor', label: 'Responsabilidades del auditor' },
    { key: 'otros_requerimientos', label: 'Informe sobre otros requerimientos legales' },
    { key: 'firma', label: 'Firma y fecha' },
  ],
  carta_control_interno: [
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'introduccion', label: 'Introducción' },
    { key: 'deficiencias', label: 'Deficiencias identificadas' },
    { key: 'recomendaciones', label: 'Recomendaciones' },
    { key: 'cierre', label: 'Cierre' },
    { key: 'firma', label: 'Firma y fecha' },
  ],
  carta_representaciones: [
    { key: 'destinatario', label: 'Destinatario (al auditor / revisor fiscal)' },
    { key: 'introduccion', label: 'Introducción' },
    { key: 'declaraciones', label: 'Declaraciones de la administración' },
    { key: 'informacion_proporcionada', label: 'Información proporcionada' },
    { key: 'cierre', label: 'Cierre' },
    { key: 'firma', label: 'Firma (representante legal)' },
  ],
}

/* ── Contenido enriquecido ────────────────────────────────────────────────
   Los informes de este catálogo se editan con el editor de texto enriquecido
   (formato acotado: negrita/cursiva/subrayado/listas) y guardan HTML en
   `contenido`; el resto sigue guardando texto plano. El backend sanitiza el
   HTML contra ETIQUETAS_INFORME_ENRIQUECIDO al guardar. */

export const TIPOS_INFORME_ENRIQUECIDO: TipoInforme[] = ['dictamen']

/** Etiquetas HTML permitidas en el contenido enriquecido (sin atributos). */
export const ETIQUETAS_INFORME_ENRIQUECIDO = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li']

/** Heurística: distingue HTML del editor de texto plano legado en una sección. */
export function esHtmlInforme(valor: string): boolean {
  return /^\s*</.test(valor)
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Convierte texto plano legado (borradores de plantilla) a párrafos HTML para el editor. */
export function textoPlanoAHtml(texto: string): string {
  const parrafos = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => `<p>${escaparHtml(l)}</p>`)
  return parrafos.join('') || '<p></p>'
}

/** true si el HTML del editor no tiene texto real (p. ej. '<p></p>'). */
export function htmlInformeVacio(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').trim().length === 0
}

export const TIPO_INFORME_LABEL: Record<TipoInforme, string> = {
  carta_encargo: 'Carta de encargo (NIA 210)',
  memo_planeacion: 'Memorando de planeación (NIA 300)',
  dictamen: 'Dictamen del auditor (NIA 700)',
  carta_control_interno: 'Carta de control interno (NIA 265)',
  carta_representaciones: 'Carta de representaciones (NIA 580)',
  informe_ai: 'Informe de Auditoría Interna (IIA IPPF)',
}

export const TIPO_OPINION_LABEL: Record<TipoOpinion, string> = {
  limpia: 'Opinión sin salvedades (limpia)',
  con_salvedades: 'Opinión con salvedades',
  negativa: 'Opinión negativa',
  abstencion: 'Abstención de opinión',
}
