import type { AreaRiesgo } from './riesgo'

export type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada'

export type Tarea = {
  id: string
  auditoriaId: string
  area: AreaRiesgo
  titulo: string
  descripcion: string | null
  riesgoId: string | null
  papelTrabajoId: string | null
  asignadoA: string
  estado: EstadoTarea
  fechaInicio: string | null
  vencimiento: string | null
  createdAt: string
}
