export type ComponenteCoso =
  | 'ambiente_control'
  | 'evaluacion_riesgos'
  | 'actividades_control'
  | 'informacion_comunicacion'
  | 'supervision'

export type CalificacionCoso = 'efectivo' | 'con_deficiencias' | 'deficiente'

export type ControlCoso = {
  id: string
  auditoriaId: string
  componente: ComponenteCoso
  calificacion: CalificacionCoso
  observaciones: string | null
  createdAt: string
}

export const COMPONENTES_COSO: ComponenteCoso[] = [
  'ambiente_control',
  'evaluacion_riesgos',
  'actividades_control',
  'informacion_comunicacion',
  'supervision',
]
