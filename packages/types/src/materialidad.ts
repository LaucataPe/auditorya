export type BaseCalculoMaterialidad =
  | 'activos'
  | 'ingresos'
  | 'utilidad_antes_impuestos'
  | 'patrimonio'

export type Materialidad = {
  id: string
  auditoriaId: string
  baseCalculo: BaseCalculoMaterialidad
  montoBase: string
  porcentaje: string
  materialidad: string
  porcentajeDesempeno: string
  materialidadDesempeno: string
  justificacion: string | null
  aprobada: boolean
  aprobadaPor: string | null
  aprobadaAt: string | null
  createdAt: string
}
