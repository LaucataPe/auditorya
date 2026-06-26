import type { AreaRiesgo } from './riesgo'

export type EstadoTarea = 'pendiente' | 'en_progreso' | 'completada'

export type Tarea = {
  id: string
  auditoriaId: string
  area: AreaRiesgo
  titulo: string
  descripcion: string | null
  asignadoA: string
  estado: EstadoTarea
  vencimiento: string | null
  createdAt: string
}
