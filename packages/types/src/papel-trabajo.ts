import type { AreaRiesgo } from './riesgo'

export type EstadoPapel = 'borrador' | 'en_revision' | 'aprobado'

/** Estado de un paso del programa (guía NIA 330/500) dentro del checklist del papel. */
export type PasoEstado = { hecho: boolean; nota: string | null }
/** Checklist del papel: índice del paso en el catálogo → estado. */
export type PasosEstado = Record<string, PasoEstado>

export type TipoEvidencia =
  | 'documento'
  | 'confirmacion'
  | 'conciliacion'
  | 'calculo'
  | 'foto'
  | 'otro'

export type Evidencia = {
  id: string
  papelTrabajoId: string
  nombre: string
  descripcion: string | null
  tipo: TipoEvidencia
  enlaceExterno: string | null
  createdAt: string
}

export type PapelTrabajo = {
  id: string
  auditoriaId: string
  area: AreaRiesgo
  titulo: string
  procedimiento: string | null
  alcance: string | null
  hallazgos: string | null
  conclusion: string | null
  pasosEstado: PasosEstado
  estado: EstadoPapel
  fechaInicio: string | null
  fechaFin: string | null
  asignadoA: string | null
  preparadoPor: string
  aprobadoPor: string | null
  aprobadoAt: string | null
  createdAt: string
}

export type PapelTrabajoConEvidencias = PapelTrabajo & {
  evidencias: Evidencia[]
}
