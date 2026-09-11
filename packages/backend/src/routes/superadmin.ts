import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { asc, eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { createHash, timingSafeEqual } from 'node:crypto'
import { db } from '../db/client'
import { firmas, usuarios, permisos, prefijosAreas } from '../db/schema'
import { AREAS_BASE, PREFIJO_AREA_BASE } from '@auditorya/types'
import { signToken } from '../lib/jwt'
import { superadminMiddleware } from '../middleware/superadmin'
import { seedRolesFirma } from '../lib/roles'
import { excedeLimite, limpiarLimite } from '../lib/rate-limit'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

// Igual que la cookie de sesión normal: Secure + SameSite=None en producción.
const esProd = process.env.NODE_ENV === 'production'
const SA_COOKIE_OPTS = esProd
  ? 'HttpOnly; Path=/; SameSite=None; Secure; Max-Age=28800'
  : 'HttpOnly; Path=/; SameSite=Lax; Max-Age=28800'

/** Comparación en tiempo constante sobre hashes (evita fugas por longitud). */
function igualSeguro(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

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

    // Mismo rate-limit que el login normal, por IP.
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
    const claveLimite = `sa-login:${ip}`
    if (excedeLimite(claveLimite)) {
      return c.json(
        { error: { code: 'DEMASIADOS_INTENTOS', message: 'Demasiados intentos. Espera unos minutos.' } },
        429,
      )
    }

    const emailOk = igualSeguro(email, saEmail)
    const passwordOk = igualSeguro(password, saPassword)
    if (!emailOk || !passwordOk) {
      return c.json({ error: { code: 'CREDENCIALES_INVALIDAS', message: 'Credenciales incorrectas' } }, 401)
    }
    limpiarLimite(claveLimite)

    const token = signToken({ sub: 'superadmin', firmaId: '', rol: 'superadmin' })
    c.header('Set-Cookie', `sa_token=${token}; ${SA_COOKIE_OPTS}`)
    return c.json({ data: { email: saEmail } })
  },
)

// POST /superadmin/logout
app.post('/logout', (c) => {
  c.header(
    'Set-Cookie',
    esProd
      ? 'sa_token=; HttpOnly; Path=/; SameSite=None; Secure; Max-Age=0'
      : 'sa_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
  )
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
      agenteHabilitado: firmas.agenteHabilitado,
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
    const rolesPorNivel = await seedRolesFirma(firma.id)
    const passwordHash = await bcrypt.hash(usuarioData.password, 12)
    const [usuario] = await db
      .insert(usuarios)
      .values({ ...usuarioData, passwordHash, firmaId: firma.id, rol: 'socio', rolId: rolesPorNivel.socio })
      .returning({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol, createdAt: usuarios.createdAt })

    return c.json({ data: { firma, usuario } }, 201)
  },
)

// PATCH /superadmin/firmas/:id/agente — habilita o deshabilita el modo agéntico para la firma.
// Solo afecta encargos NUEVOS: los existentes conservan su bandera agente_activado.
app.patch(
  '/firmas/:id/agente',
  superadminMiddleware,
  zValidator('json', z.object({ habilitado: z.boolean() })),
  async (c) => {
    const id = c.req.param('id')
    const { habilitado } = c.req.valid('json')
    const [firma] = await db
      .update(firmas)
      .set({ agenteHabilitado: habilitado })
      .where(eq(firmas.id, id))
      .returning({ id: firmas.id, nombre: firmas.nombre, agenteHabilitado: firmas.agenteHabilitado })
    if (!firma) return c.json({ error: { code: 'NOT_FOUND', message: 'Firma no encontrada' } }, 404)
    console.log(`[superadmin] modo agéntico ${habilitado ? 'habilitado' : 'deshabilitado'} para la firma ${firma.nombre}`)
    return c.json({ data: firma })
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

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo global de permisos (CRUD del superadmin). Un permiso nuevo solo surte
// efecto real si el backend tiene un gate que lo verifica; los sembrados sí.
// ─────────────────────────────────────────────────────────────────────────────
const CLAVE_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/

// GET /superadmin/permisos
app.get('/permisos', superadminMiddleware, async (c) => {
  const filas = await db.select().from(permisos).orderBy(asc(permisos.orden), asc(permisos.clave))
  return c.json({ data: filas })
})

// POST /superadmin/permisos
app.post(
  '/permisos',
  superadminMiddleware,
  zValidator(
    'json',
    z.object({
      clave: z.string().regex(CLAVE_RE, 'Formato: recurso.accion (minúsculas, p. ej. "empresa.crear")'),
      grupo: z.string().min(2),
      label: z.string().min(2),
      descripcion: z.string().default(''),
      orden: z.number().int().default(0),
    }),
  ),
  async (c) => {
    const body = c.req.valid('json')
    const [existe] = await db.select({ clave: permisos.clave }).from(permisos).where(eq(permisos.clave, body.clave))
    if (existe) {
      return c.json({ error: { code: 'CLAVE_DUPLICADA', message: 'Ya existe un permiso con esa clave' } }, 409)
    }
    const [nuevo] = await db.insert(permisos).values(body).returning()
    return c.json({ data: nuevo }, 201)
  },
)

// PUT /superadmin/permisos/:clave  (la clave es inmutable)
app.put(
  '/permisos/:clave',
  superadminMiddleware,
  zValidator(
    'json',
    z.object({
      grupo: z.string().min(2).optional(),
      label: z.string().min(2).optional(),
      descripcion: z.string().optional(),
      activo: z.boolean().optional(),
      orden: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const clave = c.req.param('clave')
    const body = c.req.valid('json')
    const [actualizado] = await db.update(permisos).set(body).where(eq(permisos.clave, clave)).returning()
    if (!actualizado) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Permiso no encontrado' } }, 404)
    }
    return c.json({ data: actualizado })
  },
)

// DELETE /superadmin/permisos/:clave  (cascada: lo remueve de todos los roles)
app.delete('/permisos/:clave', superadminMiddleware, async (c) => {
  const clave = c.req.param('clave')
  const [borrado] = await db.delete(permisos).where(eq(permisos.clave, clave)).returning({ clave: permisos.clave })
  if (!borrado) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Permiso no encontrado' } }, 404)
  }
  return c.json({ data: { clave: borrado.clave } })
})

// ─── Prefijos de referenciación (índices de papeles, NIA 230) ─────────────────
// Overrides globales sobre el catálogo base. Solo afectan papeles nuevos: los
// índices ya asignados no se renumeran.

/** Catálogo base con el prefijo vigente (override si existe, defecto si no). */
async function catalogoConPrefijos() {
  const overrides = await db.select().from(prefijosAreas)
  const porClave = new Map(overrides.map((o) => [o.clave, o.prefijo]))
  return AREAS_BASE.map((a) => ({
    clave: a.clave,
    nombre: a.nombre,
    prefijoDefecto: a.prefijo,
    prefijo: porClave.get(a.clave) ?? a.prefijo,
    personalizado: porClave.has(a.clave),
  }))
}

// GET /superadmin/prefijos-areas
app.get('/prefijos-areas', superadminMiddleware, async (c) => {
  return c.json({ data: await catalogoConPrefijos() })
})

// PUT /superadmin/prefijos-areas/:clave — cambia el prefijo de un área base
app.put(
  '/prefijos-areas/:clave',
  superadminMiddleware,
  zValidator(
    'json',
    z.object({
      prefijo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/, 'Usa 1 a 4 letras mayúsculas o dígitos'),
    }),
  ),
  async (c) => {
    const clave = c.req.param('clave')
    const { prefijo } = c.req.valid('json')

    if (!(clave in PREFIJO_AREA_BASE)) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'El área no existe en el catálogo base' } }, 404)
    }

    // Sin prefijos repetidos entre áreas base: dos áreas con la misma letra
    // compartirían la serie de consecutivos y el archivo se vuelve ilegible.
    const catalogo = await catalogoConPrefijos()
    const choque = catalogo.find((a) => a.clave !== clave && a.prefijo === prefijo)
    if (choque) {
      return c.json(
        { error: { code: 'PREFIJO_DUPLICADO', message: `El prefijo "${prefijo}" ya lo usa ${choque.nombre}` } },
        409,
      )
    }

    if (prefijo === PREFIJO_AREA_BASE[clave]) {
      // Volver al defecto = quitar el override.
      await db.delete(prefijosAreas).where(eq(prefijosAreas.clave, clave))
    } else {
      await db
        .insert(prefijosAreas)
        .values({ clave, prefijo })
        .onConflictDoUpdate({ target: prefijosAreas.clave, set: { prefijo, updatedAt: new Date() } })
    }

    return c.json({ data: (await catalogoConPrefijos()).find((a) => a.clave === clave) })
  },
)

// DELETE /superadmin/prefijos-areas/:clave — restaura el prefijo por defecto
app.delete('/prefijos-areas/:clave', superadminMiddleware, async (c) => {
  const clave = c.req.param('clave')
  if (!(clave in PREFIJO_AREA_BASE)) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'El área no existe en el catálogo base' } }, 404)
  }
  await db.delete(prefijosAreas).where(eq(prefijosAreas.clave, clave))
  return c.json({ data: { clave, prefijo: PREFIJO_AREA_BASE[clave] } })
})

export default app
