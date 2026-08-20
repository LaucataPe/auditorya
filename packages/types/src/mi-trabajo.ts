/**
 * "Mi trabajo": vista transversal por usuario de sus pendientes en todos los
 * encargos activos de la firma (tareas asignadas, papeles a su cargo y notas
 * de revisión abiertas que le conciernen).
 */
import type { EstadoTarea } from './tarea'
import type { EstadoPapel } from './papel-trabajo'

export type MiTrabajoTarea = {
  id: string
  titulo: string
  area: string
  estado: EstadoTarea
  fechaInicio: string | null
  vencimiento: string | null
  auditoriaId: string
  empresaId: string
  empresaNombre: string
}

export type MiTrabajoPapel = {
  id: string
  titulo: string
  area: string
  estado: EstadoPapel
  fechaFin: string | null
  auditoriaId: string
  empresaId: string
  empresaNombre: string
  /** Notas de revisión abiertas sobre este papel. */
  notasAbiertas: number
}

export type MiTrabajoNota = {
  id: string
  texto: string
  createdAt: string
  papelTrabajoId: string
  papelTitulo: string | null
  auditoriaId: string
  empresaId: string
  empresaNombre: string
  creadoPorNombre: string | null
  /** 'por_resolver' = nota ajena sobre un papel mío; 'creada_por_mi' = espera respuesta de otro. */
  origen: 'por_resolver' | 'creada_por_mi'
}

export type MiTrabajo = {
  tareas: MiTrabajoTarea[]
  papeles: MiTrabajoPapel[]
  notas: MiTrabajoNota[]
}
