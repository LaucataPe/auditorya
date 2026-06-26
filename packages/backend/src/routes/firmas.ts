import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { firmas } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// GET /firmas/mia
app.get('/mia', async (c) => {
  const { firmaId } = c.get('user')
  const [firma] = await db.select().from(firmas).where(eq(firmas.id, firmaId))
  if (!firma) return c.json({ error: { code: 'NOT_FOUND', message: 'Firma no encontrada' } }, 404)
  return c.json({ data: firma })
})

// PUT /firmas/mia
app.put(
  '/mia',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2).optional(),
      nit: z.string().min(5).optional(),
      ciudad: z.string().min(2).optional(),
    }),
  ),
  async (c) => {
    const { firmaId, rol } = c.get('user')
    if (rol !== 'socio') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede actualizar la firma' } }, 403)
    }

    const body = c.req.valid('json')
    if (Object.keys(body).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [firma] = await db.update(firmas).set(body).where(eq(firmas.id, firmaId)).returning()
    return c.json({ data: firma })
  },
)

export default app
