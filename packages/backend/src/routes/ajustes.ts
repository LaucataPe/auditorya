import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { auditorias, empresas, materialidades, ajustes } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import { evaluarOpinion } from '@auditorya/types'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row?.auditoria ?? null
}

async function cargarAjuste(ajusteId: string, firmaId: string) {
  const [row] = await db
    .select({ ajuste: ajustes, auditoria: auditorias })
    .from(ajustes)
    .innerJoin(auditorias, eq(ajustes.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(ajustes.id, ajusteId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

/** Materialidad general de la auditoría (base de comparación de la opinión). */
async function materialidadDe(auditoriaId: string): Promise<number | null> {
  const [mat] = await db.select().from(materialidades).where(eq(materialidades.auditoriaId, auditoriaId))
  return mat ? Number(mat.materialidad) : null
}

/** Devuelve la lista + la evaluación de opinión recalculada. */
async function armarHoja(auditoriaId: string) {
  const [lista, materialidad] = await Promise.all([
    db.select().from(ajustes).where(eq(ajustes.auditoriaId, auditoriaId)).orderBy(desc(ajustes.createdAt)),
    materialidadDe(auditoriaId),
  ])
  const evaluacion = evaluarOpinion(
    lista.map((a) => ({ monto: Number(a.monto), corregido: a.corregido, efecto: a.efecto })),
    materialidad,
  )
  return { ajustes: lista, materialidad, evaluacion }
}

// GET /auditorias/:id/ajustes — hoja de ajustes + evaluación de opinión
app.get('/auditorias/:id/ajustes', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  if (!(await cargarAuditoria(id, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }
  return c.json({ data: await armarHoja(id) })
})

// POST /auditorias/:id/ajustes — registrar un ajuste
app.post(
  '/auditorias/:id/ajustes',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().min(2),
      cuentaCodigo: z.string().optional(),
      monto: z.number(),
      tipo: z.enum(['factual', 'juicio', 'proyectado']).optional(),
      efecto: z.enum(['resultado', 'patrimonio', 'reclasificacion']).optional(),
      corregido: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    if (!(await cargarAuditoria(id, user.firmaId))) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const [creado] = await db
      .insert(ajustes)
      .values({
        auditoriaId: id,
        descripcion: body.descripcion,
        cuentaCodigo: body.cuentaCodigo || null,
        monto: String(body.monto),
        tipo: body.tipo ?? 'factual',
        efecto: body.efecto ?? 'resultado',
        corregido: body.corregido ?? false,
      })
      .returning()

    registrarEvento(user, {
      accion: 'ajuste.crear',
      entidad: 'ajuste',
      entidadId: creado.id,
      auditoriaId: id,
      detalle: { descripcion: body.descripcion, monto: body.monto, efecto: creado.efecto },
    })

    return c.json({ data: await armarHoja(id) }, 201)
  },
)

// PUT /ajustes/:id — editar / marcar corregido
app.put(
  '/ajustes/:id',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().min(2).optional(),
      cuentaCodigo: z.string().optional(),
      monto: z.number().optional(),
      tipo: z.enum(['factual', 'juicio', 'proyectado']).optional(),
      efecto: z.enum(['resultado', 'patrimonio', 'reclasificacion']).optional(),
      corregido: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const ajusteId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAjuste(ajusteId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Ajuste no encontrado' } }, 404)

    const updates: Record<string, unknown> = {}
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion
    if (body.cuentaCodigo !== undefined) updates.cuentaCodigo = body.cuentaCodigo || null
    if (body.monto !== undefined) updates.monto = String(body.monto)
    if (body.tipo !== undefined) updates.tipo = body.tipo
    if (body.efecto !== undefined) updates.efecto = body.efecto
    if (body.corregido !== undefined) updates.corregido = body.corregido
    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    await db.update(ajustes).set(updates).where(eq(ajustes.id, ajusteId))
    return c.json({ data: await armarHoja(row.auditoria.id) })
  },
)

// DELETE /ajustes/:id
app.delete('/ajustes/:id', async (c) => {
  const { firmaId } = c.get('user')
  const ajusteId = c.req.param('id')

  const row = await cargarAjuste(ajusteId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Ajuste no encontrado' } }, 404)

  await db.delete(ajustes).where(eq(ajustes.id, ajusteId))
  return c.json({ data: await armarHoja(row.auditoria.id) })
})

export default app
