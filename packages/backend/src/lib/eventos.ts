/**
 * Pista de auditoría (audit trail). Registra acciones relevantes de forma
 * asíncrona y tolerante a fallos: un error al registrar el evento nunca
 * debe romper la operación principal.
 */
import { db } from '../db/client'
import { eventos } from '../db/schema'
import type { JwtPayload } from './jwt'

export type EventoInput = {
  accion: string // 'papel.aprobar', 'materialidad.aprobar', 'informe.generar', ...
  entidad: string // 'papel_trabajo', 'materialidad', 'informe', 'balance', ...
  entidadId?: string | null
  auditoriaId?: string | null
  empresaId?: string | null
  detalle?: Record<string, unknown>
}

export function registrarEvento(user: Pick<JwtPayload, 'sub' | 'firmaId'>, ev: EventoInput): void {
  db.insert(eventos)
    .values({
      firmaId: user.firmaId,
      usuarioId: user.sub,
      auditoriaId: ev.auditoriaId ?? null,
      empresaId: ev.empresaId ?? null,
      accion: ev.accion,
      entidad: ev.entidad,
      entidadId: ev.entidadId ?? null,
      detalle: ev.detalle ?? null,
    })
    .then(() => {})
    .catch((err) => {
      console.error('[eventos] no se pudo registrar', ev.accion, err?.message)
    })
}
