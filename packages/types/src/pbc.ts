/**
 * PBC (Prepared By Client) — documentos que la firma solicita al cliente para
 * ejecutar una prueba/papel de trabajo. Cierra el hilo riesgo → prueba →
 * documento → evidencia → conclusión.
 */

export type EstadoPbc = 'solicitado' | 'recibido' | 'no_aplica'

export const ESTADO_PBC_LABEL: Record<EstadoPbc, string> = {
  solicitado: 'Solicitado',
  recibido: 'Recibido',
  no_aplica: 'No aplica',
}

export type SolicitudPbc = {
  id: string
  auditoriaId: string
  papelTrabajoId: string | null
  descripcion: string
  estado: EstadoPbc
  evidenciaId: string | null
  notas: string | null
  fechaLimite: string | null
  createdAt: string
}

/** SolicitudPbc enriquecida con datos del papel y del archivo de la evidencia vinculada. */
export type SolicitudPbcConPapel = SolicitudPbc & {
  papelTitulo: string | null
  papelArea: string | null
  evidenciaArchivoNombre: string | null
  evidenciaArchivoTamano: number | null
}
