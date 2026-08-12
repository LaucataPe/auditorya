import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/client'
import { usuarios, rolesFirma } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// GET /firmas/mia/usuarios
app.get('/mia/usuarios', async (c) => {
  const { firmaId } = c.get('user')

  const miembros = await db
    .select({
      id: usuarios.id,
      firmaId: usuarios.firmaId,
      nombre: usuarios.nombre,
      email: usuarios.email,
      rol: usuarios.rol,
      rolId: usuarios.rolId,
      rolNombre: rolesFirma.nombre,
      createdAt: usuarios.createdAt,
    })
    .from(usuarios)
    .leftJoin(rolesFirma, eq(usuarios.rolId, rolesFirma.id))
    .where(eq(usuarios.firmaId, firmaId))

  return c.json({ data: miembros })
})

// POST /firmas/mia/usuarios
app.post(
  '/mia/usuarios',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      rolId: z.string().uuid(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId, rol: rolActual } = user

    if (rolActual !== 'socio' && rolActual !== 'gerente') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio o gerente pueden añadir miembros' } }, 403)
    }

    const { nombre, email, password, rolId } = c.req.valid('json')

    // El rol debe pertenecer a la firma; su nivel es el respaldo de seguridad.
    const [rolElegido] = await db
      .select()
      .from(rolesFirma)
      .where(and(eq(rolesFirma.id, rolId), eq(rolesFirma.firmaId, firmaId)))
    if (!rolElegido) {
      return c.json({ error: { code: 'ROL_INVALIDO', message: 'El rol no existe en esta firma' } }, 400)
    }

    // Solo un socio puede otorgar el nivel socio (evita la escalada gerente → socio).
    if (rolElegido.nivel === 'socio' && rolActual !== 'socio') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo un socio puede otorgar el nivel de socio' } }, 403)
    }

    const [existe] = await db.select().from(usuarios).where(eq(usuarios.email, email))
    if (existe) {
      return c.json({ error: { code: 'EMAIL_DUPLICADO', message: 'Ya existe un usuario con ese email' } }, 409)
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [nuevo] = await db
      .insert(usuarios)
      .values({ nombre, email, passwordHash, rol: rolElegido.nivel, rolId: rolElegido.id, firmaId })
      .returning({
        id: usuarios.id,
        firmaId: usuarios.firmaId,
        nombre: usuarios.nombre,
        email: usuarios.email,
        rol: usuarios.rol,
        rolId: usuarios.rolId,
        createdAt: usuarios.createdAt,
      })

    registrarEvento(user, {
      accion: 'usuario.crear',
      entidad: 'usuario',
      entidadId: nuevo.id,
      detalle: { email: nuevo.email, rol: rolElegido.nivel, rolNombre: rolElegido.nombre },
    })

    return c.json({ data: { ...nuevo, rolNombre: rolElegido.nombre } }, 201)
  },
)

// PUT /firmas/mia/usuarios/:id
app.put(
  '/mia/usuarios/:id',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2).optional(),
      rolId: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId, rol: rolActual, sub } = user

    if (rolActual !== 'socio' && rolActual !== 'gerente') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio o gerente pueden editar miembros' } }, 403)
    }

    const id = c.req.param('id')
    const body = c.req.valid('json')

    // Verifica que el usuario pertenezca a la misma firma
    const [miembro] = await db.select().from(usuarios).where(eq(usuarios.id, id))
    if (!miembro || miembro.firmaId !== firmaId) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } }, 404)
    }

    // Solo el socio puede cambiar el rol de otro socio
    if (body.rolId && miembro.rol === 'socio' && rolActual !== 'socio') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede modificar el rol de otro socio' } }, 403)
    }

    // No se puede cambiar el propio rol
    if (body.rolId && miembro.id === sub) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'No puedes cambiar tu propio rol' } }, 403)
    }

    // El rol elegido debe pertenecer a la firma; su nivel es el respaldo.
    let rolElegido: typeof rolesFirma.$inferSelect | undefined
    if (body.rolId) {
      ;[rolElegido] = await db
        .select()
        .from(rolesFirma)
        .where(and(eq(rolesFirma.id, body.rolId), eq(rolesFirma.firmaId, firmaId)))
      if (!rolElegido) {
        return c.json({ error: { code: 'ROL_INVALIDO', message: 'El rol no existe en esta firma' } }, 400)
      }
      // Solo un socio puede otorgar el nivel socio (evita la escalada gerente → socio).
      if (rolElegido.nivel === 'socio' && rolActual !== 'socio') {
        return c.json({ error: { code: 'FORBIDDEN', message: 'Solo un socio puede otorgar el nivel de socio' } }, 403)
      }
    }

    const [actualizado] = await db
      .update(usuarios)
      .set({
        ...(body.nombre && { nombre: body.nombre }),
        ...(rolElegido && { rol: rolElegido.nivel, rolId: rolElegido.id }),
      })
      .where(eq(usuarios.id, id))
      .returning({
        id: usuarios.id,
        firmaId: usuarios.firmaId,
        nombre: usuarios.nombre,
        email: usuarios.email,
        rol: usuarios.rol,
        rolId: usuarios.rolId,
        createdAt: usuarios.createdAt,
      })

    registrarEvento(user, {
      accion: 'usuario.editar',
      entidad: 'usuario',
      entidadId: id,
      detalle: {
        campos: Object.keys(body),
        ...(rolElegido ? { rolAnterior: miembro.rol, rolNuevo: rolElegido.nivel, rolNombre: rolElegido.nombre } : {}),
      },
    })

    return c.json({ data: { ...actualizado, rolNombre: rolElegido?.nombre } })
  },
)

export default app
