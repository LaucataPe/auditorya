export type DecisionEncargo = 'aceptado' | 'rechazado'

export type RespuestasEvaluacion = Record<string, 'si' | 'no'>

export type EvaluacionAceptacion = {
  id: string
  empresaId: string
  respuestas: RespuestasEvaluacion
  hayAmenazas: boolean
  decision: DecisionEncargo
  evaluadoPor: string
  createdAt: string
}
