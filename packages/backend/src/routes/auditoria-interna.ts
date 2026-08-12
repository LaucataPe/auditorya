import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { auditorias, empresas, programasAI, hallazgosAI, usuarios } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { registrarEvento } from '../lib/eventos'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias, empresa: empresas })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// ─── Programas de trabajo ────────────────────────────────────────────────────

// GET /auditorias/:id/ai/programas
app.get('/auditorias/:id/ai/programas', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db
    .select({
      programa: programasAI,
      asignado: { id: usuarios.id, nombre: usuarios.nombre },
    })
    .from(programasAI)
    .leftJoin(usuarios, eq(programasAI.asignadoA, usuarios.id))
    .where(eq(programasAI.auditoriaId, id))

  return c.json({ data: lista })
})

// POST /auditorias/:id/ai/programas
app.post(
  '/auditorias/:id/ai/programas',
  zValidator(
    'json',
    z.object({
      area: z.string().min(2),
      objetivo: z.string().optional(),
      alcance: z.string().optional(),
      asignadoA: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId } = user
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (body.asignadoA) {
      const [u] = await db
        .select()
        .from(usuarios)
        .where(and(eq(usuarios.id, body.asignadoA), eq(usuarios.firmaId, firmaId)))
      if (!u) return c.json({ error: { code: 'USER_NOT_FOUND', message: 'Usuario no pertenece a la firma' } }, 404)
    }

    const [programa] = await db
      .insert(programasAI)
      .values({
        auditoriaId: id,
        area: body.area,
        objetivo: body.objetivo ?? null,
        alcance: body.alcance ?? null,
        asignadoA: body.asignadoA ?? null,
      })
      .returning()

    registrarEvento(user, {
      accion: 'programa_ai.crear',
      entidad: 'programa_ai',
      entidadId: programa.id,
      auditoriaId: id,
      detalle: { area: programa.area },
    })

    return c.json({ data: programa }, 201)
  },
)

// PUT /auditorias/:id/ai/programas/:programaId
app.put(
  '/auditorias/:id/ai/programas/:programaId',
  zValidator(
    'json',
    z.object({
      area: z.string().min(2).optional(),
      objetivo: z.string().optional(),
      alcance: z.string().optional(),
      estado: z.enum(['no_iniciado', 'en_progreso', 'completado']).optional(),
      asignadoA: z.string().uuid().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId } = user
    const id = c.req.param('id')
    const programaId = c.req.param('programaId')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const [programa] = await db
      .select()
      .from(programasAI)
      .where(and(eq(programasAI.id, programaId), eq(programasAI.auditoriaId, id)))
    if (!programa) return c.json({ error: { code: 'NOT_FOUND', message: 'Programa no encontrado' } }, 404)

    if (body.asignadoA) {
      const [u] = await db
        .select()
        .from(usuarios)
        .where(and(eq(usuarios.id, body.asignadoA), eq(usuarios.firmaId, firmaId)))
      if (!u) return c.json({ error: { code: 'USER_NOT_FOUND', message: 'Usuario no pertenece a la firma' } }, 404)
    }

    const updates: Record<string, unknown> = {}
    if (body.area !== undefined) updates.area = body.area
    if (body.objetivo !== undefined) updates.objetivo = body.objetivo
    if (body.alcance !== undefined) updates.alcance = body.alcance
    if (body.estado !== undefined) updates.estado = body.estado
    if (body.asignadoA !== undefined) updates.asignadoA = body.asignadoA

    const [actualizado] = await db
      .update(programasAI)
      .set(updates)
      .where(eq(programasAI.id, programaId))
      .returning()

    registrarEvento(user, {
      accion: 'programa_ai.editar',
      entidad: 'programa_ai',
      entidadId: programaId,
      auditoriaId: id,
      detalle: { campos: Object.keys(updates), estado: actualizado.estado },
    })

    return c.json({ data: actualizado })
  },
)

// DELETE /auditorias/:id/ai/programas/:programaId
app.delete('/auditorias/:id/ai/programas/:programaId', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const programaId = c.req.param('programaId')

  const row = await cargarAuditoria(id, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  const [deleted] = await db
    .delete(programasAI)
    .where(and(eq(programasAI.id, programaId), eq(programasAI.auditoriaId, id)))
    .returning()

  if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Programa no encontrado' } }, 404)

  registrarEvento(user, {
    accion: 'programa_ai.eliminar',
    entidad: 'programa_ai',
    entidadId: programaId,
    auditoriaId: id,
    detalle: { area: deleted.area },
  })

  return c.json({ data: deleted })
})

// ─── Hallazgos ───────────────────────────────────────────────────────────────

// GET /auditorias/:id/ai/hallazgos
app.get('/auditorias/:id/ai/hallazgos', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db
    .select()
    .from(hallazgosAI)
    .where(eq(hallazgosAI.auditoriaId, id))

  return c.json({ data: lista })
})

const hallazgoSchema = z.object({
  programaId: z.string().uuid().nullable().optional(),
  titulo: z.string().min(3),
  condicion: z.string().min(5),
  criterio: z.string().min(5),
  causa: z.string().min(5),
  efecto: z.string().min(5),
  nivelRiesgo: z.enum(['alto', 'medio', 'bajo']),
  recomendacion: z.string().min(5),
  respuestaAdministracion: z.string().optional(),
  responsableGestion: z.string().optional(),
  fechaCompromiso: z.string().datetime({ offset: true }).optional(),
  estadoSeguimiento: z.enum(['pendiente', 'en_proceso', 'implementado', 'aceptado_riesgo']).optional(),
})

// POST /auditorias/:id/ai/hallazgos
app.post(
  '/auditorias/:id/ai/hallazgos',
  zValidator('json', hallazgoSchema),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const [hallazgo] = await db
      .insert(hallazgosAI)
      .values({
        auditoriaId: id,
        programaId: body.programaId ?? null,
        titulo: body.titulo,
        condicion: body.condicion,
        criterio: body.criterio,
        causa: body.causa,
        efecto: body.efecto,
        nivelRiesgo: body.nivelRiesgo,
        recomendacion: body.recomendacion,
        respuestaAdministracion: body.respuestaAdministracion ?? null,
        responsableGestion: body.responsableGestion ?? null,
        fechaCompromiso: body.fechaCompromiso ? new Date(body.fechaCompromiso) : null,
        estadoSeguimiento: body.estadoSeguimiento ?? 'pendiente',
      })
      .returning()

    registrarEvento(user, {
      accion: 'hallazgo_ai.crear',
      entidad: 'hallazgo_ai',
      entidadId: hallazgo.id,
      auditoriaId: id,
      detalle: { titulo: hallazgo.titulo, nivelRiesgo: hallazgo.nivelRiesgo },
    })

    return c.json({ data: hallazgo }, 201)
  },
)

// PUT /auditorias/:id/ai/hallazgos/:hallazgoId
app.put(
  '/auditorias/:id/ai/hallazgos/:hallazgoId',
  zValidator('json', hallazgoSchema.partial()),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const hallazgoId = c.req.param('hallazgoId')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const [existente] = await db
      .select()
      .from(hallazgosAI)
      .where(and(eq(hallazgosAI.id, hallazgoId), eq(hallazgosAI.auditoriaId, id)))
    if (!existente) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)

    const updates: Record<string, unknown> = { ...body }
    if (body.fechaCompromiso) updates.fechaCompromiso = new Date(body.fechaCompromiso)

    const [actualizado] = await db
      .update(hallazgosAI)
      .set(updates)
      .where(eq(hallazgosAI.id, hallazgoId))
      .returning()

    registrarEvento(user, {
      accion: 'hallazgo_ai.editar',
      entidad: 'hallazgo_ai',
      entidadId: hallazgoId,
      auditoriaId: id,
      detalle: { campos: Object.keys(updates), estadoSeguimiento: actualizado.estadoSeguimiento },
    })

    return c.json({ data: actualizado })
  },
)

// DELETE /auditorias/:id/ai/hallazgos/:hallazgoId
app.delete('/auditorias/:id/ai/hallazgos/:hallazgoId', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const hallazgoId = c.req.param('hallazgoId')

  const row = await cargarAuditoria(id, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  const [deleted] = await db
    .delete(hallazgosAI)
    .where(and(eq(hallazgosAI.id, hallazgoId), eq(hallazgosAI.auditoriaId, id)))
    .returning()

  if (!deleted) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)

  registrarEvento(user, {
    accion: 'hallazgo_ai.eliminar',
    entidad: 'hallazgo_ai',
    entidadId: hallazgoId,
    auditoriaId: id,
    detalle: { titulo: deleted.titulo },
  })

  return c.json({ data: deleted })
})

export default app
