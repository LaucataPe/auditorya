/**
 * Política de tratamiento de datos:
 *  - GET  /politica/vigente        → versión y hash vigentes (público)
 *  - GET  /politica/estado         → ¿el usuario aceptó la versión vigente?
 *  - POST /politica/aceptar        → registra la aceptación (fecha, IP, navegador, versión, hash)
 *  - GET  /politica/aceptaciones   → quién aceptó qué y cuándo, en la firma (solo socio)
 */
import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { POLITICA_DATOS } from '@auditorya/types'
import { db } from '../db/client'
import { aceptacionesPolitica, usuarios } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import { HASH_POLITICA, politicaAceptada, registrarAceptacion } from '../lib/politica'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.get('/vigente', (c) =>
  c.json({ data: { version: POLITICA_DATOS.version, vigenteDesde: POLITICA_DATOS.vigenteDesde, hash: HASH_POLITICA } }),
)

app.use('*', authMiddleware)

app.get('/estado', async (c) => {
  const user = c.get('user')
  return c.json({
    data: { version: POLITICA_DATOS.version, aceptada: await politicaAceptada(user.sub) },
  })
})

app.post('/aceptar', async (c) => {
  const user = c.get('user')
  const yaAceptada = await politicaAceptada(user.sub)
  if (!yaAceptada) {
    await registrarAceptacion(c, { usuarioId: user.sub, firmaId: user.firmaId })
    registrarEvento(user, {
      accion: 'politica.aceptar',
      entidad: 'politica_datos',
      detalle: { version: POLITICA_DATOS.version, hash: HASH_POLITICA },
    })
  }
  return c.json({ data: { version: POLITICA_DATOS.version, aceptada: true } })
})

app.get('/aceptaciones', async (c) => {
  const { firmaId, rol } = c.get('user')
  if (rol !== 'socio') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede ver las aceptaciones' } }, 403)
  }
  const filas = await db
    .select({
      id: aceptacionesPolitica.id,
      usuario: usuarios.nombre,
      email: usuarios.email,
      version: aceptacionesPolitica.version,
      hashTexto: aceptacionesPolitica.hashTexto,
      ip: aceptacionesPolitica.ip,
      createdAt: aceptacionesPolitica.createdAt,
    })
    .from(aceptacionesPolitica)
    .innerJoin(usuarios, eq(aceptacionesPolitica.usuarioId, usuarios.id))
    .where(eq(aceptacionesPolitica.firmaId, firmaId))
    .orderBy(desc(aceptacionesPolitica.createdAt))
  return c.json({ data: filas })
})

export default app
