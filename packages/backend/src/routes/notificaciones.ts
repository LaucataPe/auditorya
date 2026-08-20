import { Hono } from 'hono'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { empresas, notificaciones } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// GET /notificaciones — bandeja del usuario: últimas 50 + contador de no leídas
app.get('/notificaciones', async (c) => {
  const { sub } = c.get('user')

  const [items, [conteo]] = await Promise.all([
    db
      .select({
        id: notificaciones.id,
        tipo: notificaciones.tipo,
        mensaje: notificaciones.mensaje,
        empresaId: notificaciones.empresaId,
        auditoriaId: notificaciones.auditoriaId,
        papelTrabajoId: notificaciones.papelTrabajoId,
        empresaNombre: empresas.nombre,
        leidaAt: notificaciones.leidaAt,
        createdAt: notificaciones.createdAt,
      })
      .from(notificaciones)
      .leftJoin(empresas, eq(notificaciones.empresaId, empresas.id))
      .where(eq(notificaciones.usuarioId, sub))
      .orderBy(desc(notificaciones.createdAt))
      .limit(50),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notificaciones)
      .where(and(eq(notificaciones.usuarioId, sub), isNull(notificaciones.leidaAt))),
  ])

  return c.json({ data: { items, noLeidas: conteo?.n ?? 0 } })
})

// POST /notificaciones/leer-todas — marca toda la bandeja como leída
app.post('/notificaciones/leer-todas', async (c) => {
  const { sub } = c.get('user')

  await db
    .update(notificaciones)
    .set({ leidaAt: new Date() })
    .where(and(eq(notificaciones.usuarioId, sub), isNull(notificaciones.leidaAt)))

  return c.json({ data: { ok: true } })
})

// POST /notificaciones/:id/leer — marca una como leída (solo las propias)
app.post('/notificaciones/:id/leer', async (c) => {
  const { sub } = c.get('user')
  const id = c.req.param('id')

  const [row] = await db
    .update(notificaciones)
    .set({ leidaAt: new Date() })
    .where(and(eq(notificaciones.id, id), eq(notificaciones.usuarioId, sub)))
    .returning()

  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Notificación no encontrada' } }, 404)
  return c.json({ data: row })
})

export default app
