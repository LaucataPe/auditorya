/**
 * Notificaciones in-app del equipo. Mismo diseño que la pista de auditoría
 * (lib/eventos): asíncronas y tolerantes a fallos — un error al notificar
 * nunca rompe la operación principal. Nunca se notifica al propio actor.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { auditorias, notificaciones } from '../db/schema'
import type { TipoNotificacion } from '@auditorya/types'
import type { JwtPayload } from './jwt'

export type NotificacionInput = {
  /** Destinatario. Si es null/undefined o coincide con el actor, no se crea nada. */
  para: string | null | undefined
  tipo: TipoNotificacion
  mensaje: string
  auditoriaId?: string | null
  /** Si falta y hay auditoriaId, se resuelve desde la auditoría (para el enlace). */
  empresaId?: string | null
  papelTrabajoId?: string | null
}

export function notificar(actor: Pick<JwtPayload, 'sub' | 'firmaId'>, n: NotificacionInput): void {
  const para = n.para
  if (!para || para === actor.sub) return
  void (async () => {
    let empresaId = n.empresaId ?? null
    if (!empresaId && n.auditoriaId) {
      const [a] = await db
        .select({ empresaId: auditorias.empresaId })
        .from(auditorias)
        .where(eq(auditorias.id, n.auditoriaId))
      empresaId = a?.empresaId ?? null
    }
    await db.insert(notificaciones).values({
      firmaId: actor.firmaId,
      usuarioId: para,
      tipo: n.tipo,
      mensaje: n.mensaje,
      empresaId,
      auditoriaId: n.auditoriaId ?? null,
      papelTrabajoId: n.papelTrabajoId ?? null,
    })
  })().catch((err) => {
    console.error('[notificaciones] no se pudo notificar', n.tipo, err?.message)
  })
}

/**
 * Notifica a varios destinatarios (deduplicados) el mismo aviso.
 * Útil para avisar al asignado y al preparador de un papel a la vez.
 */
export function notificarVarios(
  actor: Pick<JwtPayload, 'sub' | 'firmaId'>,
  destinatarios: Array<string | null | undefined>,
  aviso: Omit<NotificacionInput, 'para'>,
): void {
  for (const para of new Set(destinatarios)) notificar(actor, { ...aviso, para })
}
