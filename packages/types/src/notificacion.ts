/**
 * Notificaciones in-app del equipo. Se generan en el backend al asignar trabajo,
 * mover papeles por el ciclo de revisión o interactuar con notas de revisión.
 * Nunca se notifica al propio actor de la acción.
 */
export const TIPOS_NOTIFICACION = [
  'tarea_asignada',
  'papel_asignado',
  'papel_en_revision',
  'papel_aprobado',
  'papel_reabierto',
  'nota_creada',
  'nota_resuelta',
  'nota_reabierta',
  'obligacion_asignada',
] as const

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number]

export type Notificacion = {
  id: string
  tipo: TipoNotificacion
  mensaje: string
  // Enlaces para navegar al lugar de la acción (pueden faltar según el tipo).
  empresaId: string | null
  auditoriaId: string | null
  papelTrabajoId: string | null
  empresaNombre: string | null
  leidaAt: string | null
  createdAt: string
}

export type BandejaNotificaciones = {
  items: Notificacion[]
  noLeidas: number
}
