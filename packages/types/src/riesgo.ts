/**
 * Clave del área/ciclo: una del catálogo base (AREAS_BASE en areas.ts) o una
 * propia de la firma (tabla areas_firma). Abierta a string por los ciclos propios.
 */
export type AreaRiesgo = string

export type NivelRiesgo = 'bajo' | 'medio' | 'alto'

const PESO_NIVEL: Record<NivelRiesgo, number> = { bajo: 1, medio: 2, alto: 3 }

/**
 * Combina riesgo inherente y de control en el riesgo combinado (RMM).
 * Matriz: suma ≤2 → bajo, 3-4 → medio, ≥5 → alto.
 */
export function nivelCombinado(inherente: NivelRiesgo, control: NivelRiesgo): NivelRiesgo {
  const suma = PESO_NIVEL[inherente] + PESO_NIVEL[control]
  if (suma <= 2) return 'bajo'
  if (suma <= 4) return 'medio'
  return 'alto'
}

export type OrigenRiesgo = 'manual' | 'sugerido' | 'analitico'

export type Riesgo = {
  id: string
  auditoriaId: string
  area: AreaRiesgo
  descripcion: string
  riesgoInherente: NivelRiesgo
  riesgoControl: NivelRiesgo
  riesgoCombinado: NivelRiesgo
  respuestaPlaneada: string | null
  origen: OrigenRiesgo
  createdAt: string
}

export type RiesgoSugerido = {
  area: AreaRiesgo
  descripcion: string
  riesgoInherente: NivelRiesgo
  respuestaPlaneada: string
}

/** Riesgo candidato derivado del análisis del balance (cuentas significativas / inusuales). */
export type RiesgoCandidato = {
  codigo: string
  cuentaNombre: string | null
  area: AreaRiesgo
  descripcion: string
  riesgoInherente: NivelRiesgo
  respuestaPlaneada: string
  motivo: 'significativa' | 'anomalia' | 'ambas'
}
