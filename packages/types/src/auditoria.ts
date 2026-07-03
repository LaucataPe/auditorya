export type TipoServicio = 'revisoria_fiscal' | 'auditoria_interna'

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
  tipoServicio: TipoServicio
  tipo: TipoAuditoria | null
  estado: EstadoAuditoria
  materialidadAprobada: boolean
  createdAt: string
}

export const TIPO_SERVICIO_LABEL: Record<TipoServicio, string> = {
  revisoria_fiscal: 'Revisoría Fiscal',
  auditoria_interna: 'Auditoría Interna',
}
