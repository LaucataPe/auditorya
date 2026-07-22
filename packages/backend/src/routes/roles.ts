import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import { rolesFirma, rolPermisos, permisos, usuarios } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// Gestionar roles equivale al permiso 'roles.gestionar' → reservado al socio.
function exigeGestionRoles(rol: string) {
  return rol === 'socio'
}

// Valida que las claves pedidas existan en el catálogo y estén activas.
async function validarPermisos(claves: string[]): Promise<string[] | null> {
  const unicas = [...new Set(claves)]
  if (unicas.length === 0) return []
  const filas = await db
    .select({ clave: permisos.clave })
    .from(permisos)
    .where(and(inArray(permisos.clave, unicas), eq(permisos.activo, true)))
  if (filas.length !== unicas.length) return null
  return unicas
}

// GET /firmas/mia/permisos — catálogo activo para el selector de la firma
app.get('/mia/permisos', async (c) => {
  const filas = await db
    .select({ clave: permisos.clave, grupo: permisos.grupo, label: permisos.label, descripcion: permisos.descripcion, orden: permisos.orden })
    .from(permisos)
    .where(eq(permisos.activo, true))
    .orderBy(asc(permisos.orden), asc(permisos.clave))
  return c.json({ data: filas })
})

// GET /firmas/mia/roles — roles de la firma con sus permisos y conteo de miembros
app.get('/mia/roles', async (c) => {
  const { firmaId } = c.get('user')

  const roles = await db
    .select()
    .from(rolesFirma)
    .where(eq(rolesFirma.firmaId, firmaId))
    .orderBy(asc(rolesFirma.createdAt))

  const ids = roles.map((r) => r.id)
  const perms = ids.length
    ? await db.select().from(rolPermisos).where(inArray(rolPermisos.rolId, ids))
    : []
  const miembros = ids.length
    ? await db.select({ id: usuarios.id, rolId: usuarios.rolId }).from(usuarios).where(eq(usuarios.firmaId, firmaId))
    : []

  const data = roles.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    nivel: r.nivel,
    esSistema: r.esSistema,
    createdAt: r.createdAt,
    permisos: perms.filter((p) => p.rolId === r.id).map((p) => p.permiso),
    miembros: miembros.filter((m) => m.rolId === r.id).length,
  }))

  return c.json({ data })
})

// POST /firmas/mia/roles
app.post(
  '/mia/roles',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2),
      nivel: z.enum(['socio', 'gerente', 'senior', 'asistente']),
      permisos: z.array(z.string()).default([]),
    }),
  ),
  async (c) => {
    const { firmaId, rol } = c.get('user')
    if (!exigeGestionRoles(rol)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede gestionar roles' } }, 403)
    }

    const { nombre, nivel, permisos: claves } = c.req.valid('json')

    const validas = await validarPermisos(claves)
    if (validas === null) {
      return c.json({ error: { code: 'PERMISO_INVALIDO', message: 'Uno o más permisos no existen o están inactivos' } }, 400)
    }

    const [existe] = await db
      .select({ id: rolesFirma.id })
      .from(rolesFirma)
      .where(and(eq(rolesFirma.firmaId, firmaId), eq(rolesFirma.nombre, nombre)))
    if (existe) {
      return c.json({ error: { code: 'NOMBRE_DUPLICADO', message: 'Ya existe un rol con ese nombre' } }, 409)
    }

    const [rolNuevo] = await db.insert(rolesFirma).values({ firmaId, nombre, nivel, esSistema: false }).returning()
    if (validas.length) {
      await db.insert(rolPermisos).values(validas.map((permiso) => ({ rolId: rolNuevo.id, permiso })))
    }

    return c.json({ data: { ...rolNuevo, permisos: validas, miembros: 0 } }, 201)
  },
)

// PUT /firmas/mia/roles/:id
app.put(
  '/mia/roles/:id',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2).optional(),
      nivel: z.enum(['socio', 'gerente', 'senior', 'asistente']).optional(),
      permisos: z.array(z.string()).optional(),
    }),
  ),
  async (c) => {
    const { firmaId, rol } = c.get('user')
    if (!exigeGestionRoles(rol)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede gestionar roles' } }, 403)
    }

    const id = c.req.param('id')
    const body = c.req.valid('json')

    const [rolActual] = await db.select().from(rolesFirma).where(eq(rolesFirma.id, id))
    if (!rolActual || rolActual.firmaId !== firmaId) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Rol no encontrado' } }, 404)
    }

    // En roles de sistema el nombre y el nivel están bloqueados (respaldo de
    // seguridad); solo se pueden ajustar sus permisos.
    if (rolActual.esSistema && (body.nombre !== undefined || body.nivel !== undefined)) {
      return c.json({ error: { code: 'ROL_SISTEMA', message: 'No se puede cambiar el nombre ni el nivel de un rol de sistema' } }, 403)
    }

    if (body.nombre && body.nombre !== rolActual.nombre) {
      const [dup] = await db
        .select({ id: rolesFirma.id })
        .from(rolesFirma)
        .where(and(eq(rolesFirma.firmaId, firmaId), eq(rolesFirma.nombre, body.nombre)))
      if (dup) {
        return c.json({ error: { code: 'NOMBRE_DUPLICADO', message: 'Ya existe un rol con ese nombre' } }, 409)
      }
    }

    if (body.nombre || body.nivel) {
      await db
        .update(rolesFirma)
        .set({ ...(body.nombre && { nombre: body.nombre }), ...(body.nivel && { nivel: body.nivel }) })
        .where(eq(rolesFirma.id, id))
    }

    let permisosFinales: string[] | undefined
    if (body.permisos !== undefined) {
      const validas = await validarPermisos(body.permisos)
      if (validas === null) {
        return c.json({ error: { code: 'PERMISO_INVALIDO', message: 'Uno o más permisos no existen o están inactivos' } }, 400)
      }
      await db.delete(rolPermisos).where(eq(rolPermisos.rolId, id))
      if (validas.length) {
        await db.insert(rolPermisos).values(validas.map((permiso) => ({ rolId: id, permiso })))
      }
      permisosFinales = validas
    }

    const [actualizado] = await db.select().from(rolesFirma).where(eq(rolesFirma.id, id))
    if (permisosFinales === undefined) {
      const perms = await db.select({ permiso: rolPermisos.permiso }).from(rolPermisos).where(eq(rolPermisos.rolId, id))
      permisosFinales = perms.map((p) => p.permiso)
    }

    return c.json({ data: { ...actualizado, permisos: permisosFinales } })
  },
)

// DELETE /firmas/mia/roles/:id
app.delete('/mia/roles/:id', async (c) => {
  const { firmaId, rol } = c.get('user')
  if (!exigeGestionRoles(rol)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede gestionar roles' } }, 403)
  }

  const id = c.req.param('id')
  const [rolActual] = await db.select().from(rolesFirma).where(eq(rolesFirma.id, id))
  if (!rolActual || rolActual.firmaId !== firmaId) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Rol no encontrado' } }, 404)
  }
  if (rolActual.esSistema) {
    return c.json({ error: { code: 'ROL_SISTEMA', message: 'No se puede eliminar un rol de sistema' } }, 403)
  }

  const [enUso] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.rolId, id))
  if (enUso) {
    return c.json({ error: { code: 'ROL_EN_USO', message: 'Hay miembros con este rol; reasígnalos antes de eliminarlo' } }, 409)
  }

  await db.delete(rolesFirma).where(eq(rolesFirma.id, id))
  return c.json({ data: { id } })
})

export default app
