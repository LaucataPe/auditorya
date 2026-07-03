/**
 * Cierre del encargo y notas de revisión.
 * - Notas de revisión (NIA 220): observaciones del revisor sobre un papel, que el preparador resuelve.
 * - Cierre (NIA 560 hechos posteriores, NIA 570 negocio en marcha, NIA 220 revisión de calidad).
 */

export type EstadoNotaRevision = 'abierta' | 'resuelta'

export const ESTADO_NOTA_LABEL: Record<EstadoNotaRevision, string> = {
  abierta: 'Abierta',
  resuelta: 'Resuelta',
}

export type NotaRevision = {
  id: string
  auditoriaId: string
  papelTrabajoId: string
  texto: string
  estado: EstadoNotaRevision
  respuesta: string | null
  creadoPor: string
  resueltoPor: string | null
  resueltoAt: string | null
  createdAt: string
}

/** Nota enriquecida con datos del papel (para la vista consolidada). */
export type NotaRevisionConPapel = NotaRevision & {
  papelTitulo: string | null
  papelArea: string | null
}

export type CierreAuditoria = {
  id: string
  auditoriaId: string
  hechosPosteriores: string | null
  hechosPosterioresEvaluado: boolean
  negocioMarcha: string | null
  negocioMarchaEvaluado: boolean
  revisionCalidad: string | null
  revisionCalidadCompleta: boolean
  cerrado: boolean
  cerradoPor: string | null
  cerradoAt: string | null
  createdAt: string
}
