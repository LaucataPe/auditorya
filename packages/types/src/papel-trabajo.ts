import type { AreaRiesgo } from './riesgo'

export type EstadoPapel = 'borrador' | 'en_revision' | 'aprobado'

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
  estado: EstadoPapel
  preparadoPor: string
  aprobadoPor: string | null
  aprobadoAt: string | null
  createdAt: string
}

export type PapelTrabajoConEvidencias = PapelTrabajo & {
  evidencias: Evidencia[]
}
