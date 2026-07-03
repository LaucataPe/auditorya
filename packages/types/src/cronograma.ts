import type { AreaRiesgo } from './riesgo'

/**
 * Cronograma / hoja de ruta (NIA 300 — oportunidad). Vista unificada de las tareas
 * y pruebas (papeles) agendables de una auditoría, con sus fechas y responsable.
 */
export type TipoItemCronograma = 'tarea' | 'prueba'

/** Estado normalizado para el timeline (color del avance). */
export type EstadoCronograma = 'pendiente' | 'en_progreso' | 'completado'

export type ItemCronograma = {
  id: string
  tipo: TipoItemCronograma
  titulo: string
  area: AreaRiesgo
  responsable: string | null
  fechaInicio: string | null
  fechaFin: string | null
  estado: EstadoCronograma
}
