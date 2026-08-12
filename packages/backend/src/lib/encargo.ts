/**
 * Reglas transversales del encargo. Un encargo cerrado (cierres_auditoria.cerrado)
 * congela su archivo (NIA 230): ninguna mutación del encargo es válida hasta que
 * el socio responsable lo reabra. Toda ruta que escriba datos de un encargo debe
 * pasar por `encargoCerrado()` antes de mutar.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { cierresAuditoria } from '../db/schema'

export const ERROR_ENCARGO_CERRADO = {
  code: 'ENCARGO_CERRADO',
  message:
    'El encargo está cerrado y su archivo no puede modificarse (NIA 230). El socio responsable debe reabrirlo primero.',
} as const

export async function encargoCerrado(auditoriaId: string): Promise<boolean> {
  const [cierre] = await db
    .select({ cerrado: cierresAuditoria.cerrado })
    .from(cierresAuditoria)
    .where(eq(cierresAuditoria.auditoriaId, auditoriaId))
  return cierre?.cerrado ?? false
}
