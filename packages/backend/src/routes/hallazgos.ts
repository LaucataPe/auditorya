import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { auditorias, empresas, papelesTrabajo, hallazgos, ajustes } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
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

async function cargarPapel(papelId: string, firmaId: string) {
  const [row] = await db
    .select({ papel: papelesTrabajo })
    .from(papelesTrabajo)
    .innerJoin(auditorias, eq(papelesTrabajo.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(papelesTrabajo.id, papelId), eq(empresas.firmaId, firmaId)))
  return row?.papel ?? null
}

async function cargarHallazgo(hallazgoId: string, firmaId: string) {
  const [row] = await db
    .select({ hallazgo: hallazgos, auditoria: auditorias })
    .from(hallazgos)
    .innerJoin(auditorias, eq(hallazgos.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(hallazgos.id, hallazgoId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// GET /auditorias/:id/hallazgos — consolidado (con título del papel de origen)
app.get('/auditorias/:id/hallazgos', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')
  if (!(await cargarAuditoria(id, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }
  const lista = await db
    .select({
      id: hallazgos.id,
      auditoriaId: hallazgos.auditoriaId,
      papelTrabajoId: hallazgos.papelTrabajoId,
      area: hallazgos.area,
      cuentaCodigo: hallazgos.cuentaCodigo,
      descripcion: hallazgos.descripcion,
      criterio: hallazgos.criterio,
      causa: hallazgos.causa,
      efecto: hallazgos.efecto,
      recomendacion: hallazgos.recomendacion,
      monto: hallazgos.monto,
      tipo: hallazgos.tipo,
      severidad: hallazgos.severidad,
      estado: hallazgos.estado,
      ajusteId: hallazgos.ajusteId,
      comunicadoAt: hallazgos.comunicadoAt,
      corregidoAt: hallazgos.corregidoAt,
      createdAt: hallazgos.createdAt,
      papelTitulo: papelesTrabajo.titulo,
    })
    .from(hallazgos)
    .leftJoin(papelesTrabajo, eq(hallazgos.papelTrabajoId, papelesTrabajo.id))
    .where(eq(hallazgos.auditoriaId, id))
    .orderBy(desc(hallazgos.createdAt))
  return c.json({ data: lista })
})

// GET /papeles/:papelId/hallazgos — hallazgos de un papel
app.get('/papeles/:papelId/hallazgos', async (c) => {
  const { firmaId } = c.get('user')
  const papelId = c.req.param('papelId')
  if (!(await cargarPapel(papelId, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Papel no encontrado' } }, 404)
  }
  const lista = await db
    .select()
    .from(hallazgos)
    .where(eq(hallazgos.papelTrabajoId, papelId))
    .orderBy(desc(hallazgos.createdAt))
  return c.json({ data: lista })
})

// POST /papeles/:papelId/hallazgos — crear hallazgo desde un papel
app.post(
  '/papeles/:papelId/hallazgos',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().min(2),
      criterio: z.string().optional(),
      causa: z.string().optional(),
      efecto: z.string().optional(),
      recomendacion: z.string().optional(),
      cuentaCodigo: z.string().optional(),
      monto: z.number().nullable().optional(),
      tipo: z.enum(['incorreccion', 'deficiencia']).optional(),
      severidad: z.enum(['alta', 'media', 'baja']).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    const papel = await cargarPapel(papelId, user.firmaId)
    if (!papel) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel no encontrado' } }, 404)

    const [creado] = await db
      .insert(hallazgos)
      .values({
        auditoriaId: papel.auditoriaId,
        papelTrabajoId: papelId,
        area: papel.area,
        cuentaCodigo: body.cuentaCodigo || null,
        descripcion: body.descripcion,
        criterio: body.criterio || null,
        causa: body.causa || null,
        efecto: body.efecto || null,
        recomendacion: body.recomendacion || null,
        monto: body.monto != null ? String(body.monto) : null,
        tipo: body.tipo ?? 'incorreccion',
        severidad: body.severidad ?? 'media',
      })
      .returning()

    registrarEvento(user, {
      accion: 'hallazgo.crear',
      entidad: 'hallazgo',
      entidadId: creado.id,
      auditoriaId: papel.auditoriaId,
      detalle: { descripcion: body.descripcion, tipo: creado.tipo },
    })

    return c.json({ data: creado }, 201)
  },
)

// PUT /hallazgos/:id — editar / cambiar estado
app.put(
  '/hallazgos/:id',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().min(2).optional(),
      criterio: z.string().optional(),
      causa: z.string().optional(),
      efecto: z.string().optional(),
      recomendacion: z.string().optional(),
      cuentaCodigo: z.string().optional(),
      monto: z.number().nullable().optional(),
      tipo: z.enum(['incorreccion', 'deficiencia']).optional(),
      severidad: z.enum(['alta', 'media', 'baja']).optional(),
      estado: z.enum(['abierto', 'comunicado', 'corregido', 'no_corregido']).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const hallazgoId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarHallazgo(hallazgoId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)

    const updates: Record<string, unknown> = {}
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion
    if (body.criterio !== undefined) updates.criterio = body.criterio || null
    if (body.causa !== undefined) updates.causa = body.causa || null
    if (body.efecto !== undefined) updates.efecto = body.efecto || null
    if (body.recomendacion !== undefined) updates.recomendacion = body.recomendacion || null
    if (body.cuentaCodigo !== undefined) updates.cuentaCodigo = body.cuentaCodigo || null
    if (body.monto !== undefined) updates.monto = body.monto != null ? String(body.monto) : null
    if (body.tipo !== undefined) updates.tipo = body.tipo
    if (body.severidad !== undefined) updates.severidad = body.severidad
    if (body.estado !== undefined) {
      updates.estado = body.estado
      if (body.estado === 'comunicado' && !row.hallazgo.comunicadoAt) updates.comunicadoAt = new Date()
      if (body.estado === 'corregido') updates.corregidoAt = new Date()
    }
    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db.update(hallazgos).set(updates).where(eq(hallazgos.id, hallazgoId)).returning()
    return c.json({ data: actualizado })
  },
)

// POST /hallazgos/:id/llevar-a-ajuste — escala una incorrección no corregida a la hoja de ajustes
app.post('/hallazgos/:id/llevar-a-ajuste', async (c) => {
  const user = c.get('user')
  const hallazgoId = c.req.param('id')

  const row = await cargarHallazgo(hallazgoId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)
  const h = row.hallazgo

  if (h.tipo !== 'incorreccion') {
    return c.json({ error: { code: 'NO_APLICA', message: 'Solo las incorrecciones se llevan a la hoja de ajustes. Las deficiencias de control van a la carta de control interno.' } }, 409)
  }
  if (h.monto == null || Number(h.monto) === 0) {
    return c.json({ error: { code: 'SIN_MONTO', message: 'El hallazgo necesita un monto para convertirse en ajuste.' } }, 400)
  }
  if (h.ajusteId) {
    return c.json({ error: { code: 'YA_ESCALADO', message: 'Este hallazgo ya tiene un ajuste asociado.' } }, 409)
  }

  const [ajuste] = await db
    .insert(ajustes)
    .values({
      auditoriaId: h.auditoriaId,
      descripcion: h.descripcion,
      cuentaCodigo: h.cuentaCodigo,
      monto: h.monto,
      tipo: 'factual',
      efecto: 'resultado',
      corregido: false,
    })
    .returning()

  const [actualizado] = await db
    .update(hallazgos)
    .set({ ajusteId: ajuste.id, estado: 'no_corregido' })
    .where(eq(hallazgos.id, hallazgoId))
    .returning()

  registrarEvento(user, {
    accion: 'hallazgo.escalar_ajuste',
    entidad: 'hallazgo',
    entidadId: hallazgoId,
    auditoriaId: h.auditoriaId,
    detalle: { ajusteId: ajuste.id, monto: Number(h.monto) },
  })

  return c.json({ data: { hallazgo: actualizado, ajuste } }, 201)
})

// DELETE /hallazgos/:id
app.delete('/hallazgos/:id', async (c) => {
  const { firmaId } = c.get('user')
  const hallazgoId = c.req.param('id')

  const row = await cargarHallazgo(hallazgoId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)

  await db.delete(hallazgos).where(eq(hallazgos.id, hallazgoId))
  return c.json({ data: { id: hallazgoId } })
})

export default app
