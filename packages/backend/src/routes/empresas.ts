import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { empresas, evaluacionesAceptacion } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { sectorDesdeCiiu, SECTOR_LABEL } from '@auditorya/types'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

/** Si el CIIU es válido, devuelve el sector legible derivado; si no, null. */
function sectorPorCiiu(ciiu?: string | null): string | null {
  if (!ciiu) return null
  const derivado = sectorDesdeCiiu(ciiu)
  return derivado ? SECTOR_LABEL[derivado] : null
}

// GET /empresas
app.get('/', async (c) => {
  const { firmaId } = c.get('user')
  const estado = c.req.query('estado') as 'pendiente' | 'aceptado' | 'rechazado' | undefined

  const conditions = [eq(empresas.firmaId, firmaId)]
  if (estado) conditions.push(eq(empresas.estadoEncargo, estado))

  const lista = await db
    .select()
    .from(empresas)
    .where(and(...conditions))
    .orderBy(empresas.createdAt)

  return c.json({ data: lista })
})

// POST /empresas
app.post(
  '/',
  zValidator(
    'json',
    z
      .object({
        nombre: z.string().min(2),
        nit: z.string().min(5),
        sector: z.string().min(2).optional(),
        ciiu: z.string().optional(),
        actividadEconomica: z.string().optional(),
        ciudad: z.string().optional(),
        marcoContable: z.enum(['NIIF', 'NIIF_PYMES', 'PCGA']),
      })
      // Debe poderse determinar el sector: o viene explícito, o por un CIIU válido.
      .refine((d) => !!d.sector || !!sectorDesdeCiiu(d.ciiu ?? ''), {
        message: 'Indica el sector económico o un código CIIU válido',
        path: ['ciiu'],
      }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const body = c.req.valid('json')

    const [existe] = await db.select().from(empresas).where(eq(empresas.nit, body.nit))
    if (existe) {
      return c.json({ error: { code: 'NIT_DUPLICADO', message: 'Ya existe una empresa con ese NIT' } }, 409)
    }

    // El CIIU manda sobre el sector escrito; si no hay CIIU válido, se usa el sector indicado.
    const sectorFinal = sectorPorCiiu(body.ciiu) ?? body.sector!

    const [empresa] = await db
      .insert(empresas)
      .values({
        firmaId,
        nombre: body.nombre,
        nit: body.nit,
        sector: sectorFinal,
        ciiu: body.ciiu || null,
        actividadEconomica: body.actividadEconomica || null,
        ciudad: body.ciudad || null,
        marcoContable: body.marcoContable,
        estadoEncargo: 'pendiente',
      })
      .returning()

    return c.json({ data: empresa }, 201)
  },
)

// PUT /empresas/:id
app.put(
  '/:id',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2).optional(),
      nit: z.string().min(5).optional(),
      sector: z.string().min(2).optional(),
      ciiu: z.string().optional(),
      actividadEconomica: z.string().optional(),
      ciudad: z.string().optional(),
      marcoContable: z.enum(['NIIF', 'NIIF_PYMES', 'PCGA']).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const [empresa] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    if (body.nit && body.nit !== empresa.nit) {
      const [duplicado] = await db.select().from(empresas).where(eq(empresas.nit, body.nit))
      if (duplicado) {
        return c.json({ error: { code: 'NIT_DUPLICADO', message: 'Ya existe una empresa con ese NIT' } }, 409)
      }
    }

    const updates: Record<string, string | null> = {}
    if (body.nombre) updates.nombre = body.nombre
    if (body.nit) updates.nit = body.nit
    if (body.marcoContable) updates.marcoContable = body.marcoContable
    if (body.actividadEconomica !== undefined) updates.actividadEconomica = body.actividadEconomica || null
    if (body.ciudad !== undefined) updates.ciudad = body.ciudad || null

    // El CIIU (si cambia) redefine el sector derivado; si no, respeta el sector indicado.
    if (body.ciiu !== undefined) {
      updates.ciiu = body.ciiu || null
      const derivado = sectorPorCiiu(body.ciiu)
      if (derivado) updates.sector = derivado
      else if (body.sector) updates.sector = body.sector
    } else if (body.sector) {
      updates.sector = body.sector
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizada] = await db
      .update(empresas)
      .set(updates)
      .where(eq(empresas.id, id))
      .returning()

    return c.json({ data: actualizada })
  },
)

// GET /empresas/:id
app.get('/:id', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

  if (!empresa) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  return c.json({ data: empresa })
})

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación de aceptación del encargo (NIA 200 / NICC 1 - ISQM 1) — Fase 2
// ─────────────────────────────────────────────────────────────────────────────

// GET /empresas/:id/evaluacion — última evaluación registrada (o null)
app.get('/:id/evaluacion', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

  if (!empresa) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  const [evaluacion] = await db
    .select()
    .from(evaluacionesAceptacion)
    .where(eq(evaluacionesAceptacion.empresaId, id))
    .orderBy(desc(evaluacionesAceptacion.createdAt))
    .limit(1)

  return c.json({ data: evaluacion ?? null })
})

// POST /empresas/:id/evaluacion — registra la evaluación y fija el estado del encargo
app.post(
  '/:id/evaluacion',
  zValidator(
    'json',
    z.object({
      respuestas: z.record(z.string(), z.enum(['si', 'no'])),
      decision: z.enum(['aceptado', 'rechazado']),
    }),
  ),
  async (c) => {
    const { firmaId, sub } = c.get('user')
    const id = c.req.param('id')
    const { respuestas, decision } = c.req.valid('json')

    const [empresa] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    const hayAmenazas = Object.values(respuestas).some((v) => v === 'si')

    const [evaluacion] = await db
      .insert(evaluacionesAceptacion)
      .values({ empresaId: id, respuestas, hayAmenazas, decision, evaluadoPor: sub })
      .returning()

    const [empresaActualizada] = await db
      .update(empresas)
      .set({ estadoEncargo: decision })
      .where(eq(empresas.id, id))
      .returning()

    return c.json({ data: { evaluacion, empresa: empresaActualizada } }, 201)
  },
)

export default app
