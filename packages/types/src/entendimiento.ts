export type EntendimientoPeriodo = {
  id: string
  auditoriaId: string
  cambiosSignificativos: string | null
  eventosSignificativos: string | null
  notas: string | null
  sinCambios: boolean
  confirmado: boolean
  createdAt: string
}
