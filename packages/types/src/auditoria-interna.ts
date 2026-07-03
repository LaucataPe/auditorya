export type EstadoProgramaAI = 'no_iniciado' | 'en_progreso' | 'completado'

export type NivelRiesgoAI = 'alto' | 'medio' | 'bajo'

export type EstadoSeguimientoAI =
  | 'pendiente'
  | 'en_proceso'
  | 'implementado'
  | 'aceptado_riesgo'

export type ProgramaAI = {
  id: string
  auditoriaId: string
  area: string
  objetivo: string | null
  alcance: string | null
  estado: EstadoProgramaAI
  asignadoA: string | null
  createdAt: string
}

export type HallazgoAI = {
  id: string
  auditoriaId: string
  programaId: string | null
  titulo: string
  condicion: string
  criterio: string
  causa: string
  efecto: string
  nivelRiesgo: NivelRiesgoAI
  recomendacion: string
  respuestaAdministracion: string | null
  responsableGestion: string | null
  fechaCompromiso: string | null
  estadoSeguimiento: EstadoSeguimientoAI
  createdAt: string
}

export const ESTADO_PROGRAMA_LABEL: Record<EstadoProgramaAI, string> = {
  no_iniciado: 'No iniciado',
  en_progreso: 'En progreso',
  completado: 'Completado',
}

export const NIVEL_RIESGO_AI_LABEL: Record<NivelRiesgoAI, string> = {
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
}

export const ESTADO_SEGUIMIENTO_LABEL: Record<EstadoSeguimientoAI, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  implementado: 'Implementado',
  aceptado_riesgo: 'Riesgo aceptado',
}
