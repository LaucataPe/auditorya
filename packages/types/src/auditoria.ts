export type TipoAuditoria = 'financiera' | 'integral' | 'especial'

export type EstadoAuditoria =
  | 'planificacion'
  | 'ejecucion'
  | 'revision'
  | 'finalizada'

export type Auditoria = {
  id: string
  empresaId: string
  socioId: string
  periodo: string
  tipo: TipoAuditoria
  estado: EstadoAuditoria
  materialidadAprobada: boolean
  createdAt: string
}
