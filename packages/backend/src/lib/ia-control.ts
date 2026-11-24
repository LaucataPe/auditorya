/**
 * Control de IA: la firma (socio) puede apagarla entera y cada cliente puede no
 * autorizarla. Se consulta antes de CUALQUIER envío de contenido hacia el LLM.
 */
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { empresas, firmas } from '../db/schema'

export type EstadoIA = { permitida: true } | { permitida: false; motivo: 'firma' | 'empresa'; message: string }

export const MENSAJE_IA_FIRMA = 'La IA está desactivada para tu firma. El socio puede activarla en Firma → Inteligencia artificial.'
export const MENSAJE_IA_EMPRESA = 'Este cliente no autoriza el uso de IA con su información. Se puede cambiar en la información de la empresa.'

export async function estadoIAFirma(firmaId: string): Promise<boolean> {
  const [f] = await db.select({ ia: firmas.iaHabilitada }).from(firmas).where(eq(firmas.id, firmaId))
  return f?.ia ?? false
}

/** ¿Se puede enviar información de esta empresa al LLM? Consulta firma y cliente. */
export async function estadoIA(firmaId: string, empresaId: string): Promise<EstadoIA> {
  const [row] = await db
    .select({ firma: firmas.iaHabilitada, empresa: empresas.iaPermitida })
    .from(empresas)
    .innerJoin(firmas, eq(empresas.firmaId, firmas.id))
    .where(and(eq(empresas.id, empresaId), eq(empresas.firmaId, firmaId)))
  if (!row || !row.firma) return { permitida: false, motivo: 'firma', message: MENSAJE_IA_FIRMA }
  if (!row.empresa) return { permitida: false, motivo: 'empresa', message: MENSAJE_IA_EMPRESA }
  return { permitida: true }
}

export function errorIADesactivada(e: Extract<EstadoIA, { permitida: false }>) {
  return { code: 'IA_DESACTIVADA', message: e.message } as const
}
