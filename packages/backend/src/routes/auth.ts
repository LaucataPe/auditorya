import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '../db/client'
import { firmas, usuarios } from '../db/schema'
import { signToken } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth'

const app = new Hono()

const COOKIE_OPTS = 'HttpOnly; Path=/; SameSite=Lax; Max-Age=604800'

// POST /auth/registro
app.post(
  '/registro',
  zValidator(
    'json',
    z.object({
      firma: z.object({
        nombre: z.string().min(2),
        nit: z.string().min(5),
        ciudad: z.string().min(2),
      }),
      usuario: z.object({
        nombre: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
      }),
    }),
  ),
  async (c) => {
    const { firma: firmaData, usuario: usuarioData } = c.req.valid('json')

    // Unicidad
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
      .returning()

    const token = signToken({ sub: usuario.id, firmaId: firma.id, rol: 'socio' })
    c.header('Set-Cookie', `token=${token}; ${COOKIE_OPTS}`)

    const { passwordHash: _, ...usuarioSafe } = usuario
    return c.json({ data: { usuario: usuarioSafe, firma } }, 201)
  },
)

// POST /auth/login
app.post(
  '/login',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }),
  ),
  async (c) => {
    const { email, password } = c.req.valid('json')

    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email))
    if (!usuario) {
      return c.json({ error: { code: 'CREDENCIALES_INVALIDAS', message: 'Email o contraseña incorrectos' } }, 401)
    }

    const ok = await bcrypt.compare(password, usuario.passwordHash)
    if (!ok) {
      return c.json({ error: { code: 'CREDENCIALES_INVALIDAS', message: 'Email o contraseña incorrectos' } }, 401)
    }

    const [firma] = await db.select().from(firmas).where(eq(firmas.id, usuario.firmaId))

    const token = signToken({ sub: usuario.id, firmaId: usuario.firmaId, rol: usuario.rol })
    c.header('Set-Cookie', `token=${token}; ${COOKIE_OPTS}`)

    const { passwordHash: _, ...usuarioSafe } = usuario
    return c.json({ data: { usuario: usuarioSafe, firma } })
  },
)

// POST /auth/logout
app.post('/logout', (c) => {
  c.header('Set-Cookie', 'token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0')
  return c.json({ data: null })
})

// GET /auth/me
app.get('/me', authMiddleware, async (c) => {
  const { sub, firmaId } = c.get('user')

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, sub))
  if (!usuario) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado' } }, 404)
  }

  const [firma] = await db.select().from(firmas).where(eq(firmas.id, firmaId))

  const { passwordHash: _, ...usuarioSafe } = usuario
  return c.json({ data: { usuario: usuarioSafe, firma } })
})

export default app
