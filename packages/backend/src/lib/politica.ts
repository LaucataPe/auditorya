/**
 * Aceptación de la política de tratamiento de datos (Ley 1581): versión vigente, su hash
 * y el registro de cada aceptación. La tabla es solo de inserción.
 */
import { createHash } from 'node:crypto'
import type { Context } from 'hono'
import { and, eq } from 'drizzle-orm'
import { POLITICA_DATOS, contenidoPolitica } from '@auditorya/types'
import { db } from '../db/client'
import { aceptacionesPolitica } from '../db/schema'

export const HASH_POLITICA = createHash('sha256').update(contenidoPolitica()).digest('hex')

export function ipDeSolicitud(c: Context): string | null {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || null
}

export async function politicaAceptada(usuarioId: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: aceptacionesPolitica.id })
    .from(aceptacionesPolitica)
    .where(
      and(
        eq(aceptacionesPolitica.usuarioId, usuarioId),
        eq(aceptacionesPolitica.documento, POLITICA_DATOS.documento),
        eq(aceptacionesPolitica.version, POLITICA_DATOS.version),
      ),
    )
  return !!fila
}

/** Guarda la aceptación de la versión vigente. Idempotente: aceptar dos veces no duplica la prueba. */
export async function registrarAceptacion(
  c: Context,
  quien: { usuarioId: string; firmaId: string },
): Promise<void> {
  await db
    .insert(aceptacionesPolitica)
    .values({
      firmaId: quien.firmaId,
      usuarioId: quien.usuarioId,
      documento: POLITICA_DATOS.documento,
      version: POLITICA_DATOS.version,
      hashTexto: HASH_POLITICA,
      textoAceptacion: POLITICA_DATOS.textoAceptacion,
      ip: ipDeSolicitud(c),
      userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
    })
    .onConflictDoNothing()
}
