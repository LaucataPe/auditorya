import { and, eq } from 'drizzle-orm'
import { ROLES_SISTEMA, type Nivel } from '@auditorya/types'
import { db } from '../db/client'
import { rolesFirma, rolPermisos } from '../db/schema'

// Siembra los roles de sistema (Socio/Gerente/Senior/Asistente) con sus permisos
// por defecto para una firma recién creada. Devuelve el mapa nivel → rolId para
// que el llamador asigne el `rolId` del usuario creado.
export async function seedRolesFirma(firmaId: string): Promise<Record<Nivel, string>> {
  const roles = await db
    .insert(rolesFirma)
    .values(
      ROLES_SISTEMA.map((r) => ({
        firmaId,
        nombre: r.nombre,
        nivel: r.nivel,
        esSistema: true,
      })),
    )
    .returning({ id: rolesFirma.id, nivel: rolesFirma.nivel })

  const porNivel = Object.fromEntries(roles.map((r) => [r.nivel, r.id])) as Record<Nivel, string>

  const filas = ROLES_SISTEMA.flatMap((r) =>
    r.permisos.map((permiso) => ({ rolId: porNivel[r.nivel], permiso })),
  )
  if (filas.length > 0) await db.insert(rolPermisos).values(filas)

  return porNivel
}

// Devuelve el id del rol de sistema de un nivel para una firma. Si la firma es
// anterior a la migración de roles y aún no tiene el rol sembrado, siembra los
// roles de sistema y reintenta.
export async function rolSistemaId(firmaId: string, nivel: Nivel): Promise<string> {
  const [rol] = await db
    .select({ id: rolesFirma.id })
    .from(rolesFirma)
    .where(and(eq(rolesFirma.firmaId, firmaId), eq(rolesFirma.nivel, nivel), eq(rolesFirma.esSistema, true)))

  if (rol) return rol.id

  const porNivel = await seedRolesFirma(firmaId)
  return porNivel[nivel]
}
