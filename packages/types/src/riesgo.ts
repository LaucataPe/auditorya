export type AreaRiesgo =
  | 'efectivo'
  | 'cartera'
  | 'inventarios'
  | 'propiedad_planta_equipo'
  | 'proveedores'
  | 'nomina'
  | 'impuestos'
  | 'ingresos'
  | 'gastos'
  | 'patrimonio'
  | 'otro'

export type NivelRiesgo = 'bajo' | 'medio' | 'alto'

export type OrigenRiesgo = 'manual' | 'sugerido'

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
