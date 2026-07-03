export type MarcoContable = 'NIIF' | 'NIIF_PYMES' | 'PCGA'

export type EstadoEncargo = 'pendiente' | 'aceptado' | 'rechazado'

export type Empresa = {
  id: string
  firmaId: string
  nombre: string
  nit: string
  sector: string
  ciiu: string | null
  actividadEconomica: string | null
  ciudad: string | null
  modeloNegocio: string | null
  estructura: string | null
  personasClave: string | null
  entornoRegulatorio: string | null
  sistemaContable: string | null
  marcoContable: MarcoContable
  estadoEncargo: EstadoEncargo
  createdAt: string
}
