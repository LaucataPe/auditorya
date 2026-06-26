import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/client'
import { firmas, usuarios } from '../db/schema'
import { signToken } from '../lib/jwt'
import { superadminMiddleware } from '../middleware/superadmin'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

const SA_COOKIE = 'sa_token; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800'

// POST /superadmin/login
app.post(
  '/login',
  zValidator('json', z.object({ email: z.string().email(), password: z.string() })),
  async (c) => {
    const { email, password } = c.req.valid('json')

    const saEmail = process.env.SUPERADMIN_EMAIL
    const saPassword = process.env.SUPERADMIN_PASSWORD

    if (!saEmail || !saPassword) {
      return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Superadmin no configurado' } }, 500)
    }

    if (email !== saEmail || password !== saPassword) {
      return c.json({ error: { code: 'CREDENCIALES_INVALIDAS', message: 'Credenciales incorrectas' } }, 401)
    }

    const token = signToken({ sub: 'superadmin', firmaId: '', rol: 'superadmin' })
    c.header('Set-Cookie', `sa_token=${token}; ${SA_COOKIE}`)
    return c.json({ data: { email: saEmail } })
  },
)

// POST /superadmin/logout
app.post('/logout', (c) => {
  c.header('Set-Cookie', 'sa_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0')
  return c.json({ data: null })
})

// — Rutas protegidas (middleware aplicado ruta a ruta para garantizar cobertura) —

// GET /superadmin/firmas — lista todas las firmas con conteo de usuarios y empresas
app.get('/firmas', superadminMiddleware, async (c) => {
  const lista = await db
    .select({
      id: firmas.id,
      nombre: firmas.nombre,
      nit: firmas.nit,
      ciudad: firmas.ciudad,
      createdAt: firmas.createdAt,
      totalUsuarios: sql<number>`(select count(*) from usuarios where usuarios.firma_id = firmas.id)::int`,
    })
    .from(firmas)
    .orderBy(firmas.createdAt)

  return c.json({ data: lista })
})

// POST /superadmin/firmas — crea una firma nueva con su primer usuario
app.post(
  '/firmas',
  superadminMiddleware,
  zValidator(
    'json',
    z.object({
      firma: z.object({ nombre: z.string().min(2), nit: z.string().min(5), ciudad: z.string().min(2) }),
      usuario: z.object({ nombre: z.string().min(2), email: z.string().email(), password: z.string().min(8) }),
    }),
  ),
  async (c) => {
    const { firma: firmaData, usuario: usuarioData } = c.req.valid('json')

    const [firmaExiste] = await db.select().from(firmas).where(eq(firmas.nit, firmaData.nit))
    if (firmaExiste) {
      return c.json({ error: { code: 'NIT_DUPLICADO', message: 'Ya existe una firma con ese NIT' } }, 409)
    }

    const [emailExiste] = await db.select().from(usuarios).where(eq(usuarios.email, usuarioData.email))
    if (emailExiste) {
      return c.json({ error: { code: 'EMAIL_DUPLICADO', message: 'Ya existe un usuario con ese email' } }, 409)
    }

    const [firma] = await db.insert(firmas).values(firmaData).returning()
    const passwordHash = await bcrypt.hash(usuarioData.password, 12)
    const [usuario] = await db
      .insert(usuarios)
      .values({ ...usuarioData, passwordHash, firmaId: firma.id, rol: 'socio' })
      .returning({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol, createdAt: usuarios.createdAt })

    return c.json({ data: { firma, usuario } }, 201)
  },
)

// GET /superadmin/firmas/:id/usuarios
app.get('/firmas/:id/usuarios', superadminMiddleware, async (c) => {
  const firmaId = c.req.param('id')
  const miembros = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol, createdAt: usuarios.createdAt })
    .from(usuarios)
    .where(eq(usuarios.firmaId, firmaId))
  return c.json({ data: miembros })
})

export default app
