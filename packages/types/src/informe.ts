export type TipoInforme = 'dictamen' | 'carta_control_interno' | 'carta_representaciones'

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

export const TIPO_INFORME_LABEL: Record<TipoInforme, string> = {
  dictamen: 'Dictamen del auditor (NIA 700)',
  carta_control_interno: 'Carta de control interno (NIA 265)',
  carta_representaciones: 'Carta de representaciones (NIA 580)',
}

export const TIPO_OPINION_LABEL: Record<TipoOpinion, string> = {
  limpia: 'Opinión sin salvedades (limpia)',
  con_salvedades: 'Opinión con salvedades',
  negativa: 'Opinión negativa',
  abstencion: 'Abstención de opinión',
}
