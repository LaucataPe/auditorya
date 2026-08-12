import { and, eq } from 'drizzle-orm'
import { AREAS_BASE_CLAVES } from '@auditorya/types'
import { db } from '../db/client'
import { areasFirma } from '../db/schema'

export const ERROR_AREA_INVALIDA = {
  code: 'AREA_INVALIDA',
  message: 'El área/ciclo no existe: usa una del catálogo base o un ciclo creado por tu firma',
}

/** ¿La clave es del catálogo base o un ciclo propio de la firma? */
export async function areaValidaParaFirma(firmaId: string, area: string): Promise<boolean> {
  if (AREAS_BASE_CLAVES.includes(area)) return true
  const [row] = await db
    .select({ id: areasFirma.id })
    .from(areasFirma)
    .where(and(eq(areasFirma.firmaId, firmaId), eq(areasFirma.clave, area)))
    .limit(1)
  return !!row
}
