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
  marcoContable: MarcoContable
  estadoEncargo: EstadoEncargo
  createdAt: string
}
