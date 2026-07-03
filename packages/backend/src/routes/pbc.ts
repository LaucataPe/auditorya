import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import {
  auditorias,
  empresas,
  papelesTrabajo,
  evidencias,
  solicitudesPbc,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// ─── Helpers (verifican pertenencia a la firma) ──────────────────────────────

async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row?.auditoria ?? null
}

async function cargarSolicitud(solicitudId: string, firmaId: string) {
  const [row] = await db
    .select({ solicitud: solicitudesPbc, auditoria: auditorias })
    .from(solicitudesPbc)
    .innerJoin(auditorias, eq(solicitudesPbc.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(solicitudesPbc.id, solicitudId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GET /auditorias/:id/pbc — lista consolidada (con datos del papel asociado)
app.get('/auditorias/:id/pbc', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  if (!(await cargarAuditoria(id, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const lista = await db
    .select({
      id: solicitudesPbc.id,
      auditoriaId: solicitudesPbc.auditoriaId,
      papelTrabajoId: solicitudesPbc.papelTrabajoId,
      descripcion: solicitudesPbc.descripcion,
      estado: solicitudesPbc.estado,
      evidenciaId: solicitudesPbc.evidenciaId,
      notas: solicitudesPbc.notas,
      fechaLimite: solicitudesPbc.fechaLimite,
      createdAt: solicitudesPbc.createdAt,
      papelTitulo: papelesTrabajo.titulo,
      papelArea: papelesTrabajo.area,
      evidenciaArchivoNombre: evidencias.archivoNombre,
      evidenciaArchivoTamano: evidencias.archivoTamano,
    })
    .from(solicitudesPbc)
    .leftJoin(papelesTrabajo, eq(solicitudesPbc.papelTrabajoId, papelesTrabajo.id))
    .leftJoin(evidencias, eq(solicitudesPbc.evidenciaId, evidencias.id))
    .where(eq(solicitudesPbc.auditoriaId, id))
    .orderBy(desc(solicitudesPbc.createdAt))

  return c.json({ data: lista })
})

// POST /auditorias/:id/pbc — crear una o varias solicitudes
app.post(
  '/auditorias/:id/pbc',
  zValidator(
    'json',
    z.object({
      papelTrabajoId: z.string().uuid().optional(),
      descripcion: z.string().min(2).optional(),
      descripciones: z.array(z.string().min(2)).optional(),
      fechaLimite: z.string().datetime().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    if (!(await cargarAuditoria(id, firmaId))) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const descripciones = body.descripciones ?? (body.descripcion ? [body.descripcion] : [])
    if (descripciones.length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Indica al menos una descripción' } }, 400)
    }

    const fechaLimite = body.fechaLimite ? new Date(body.fechaLimite) : null
    const creadas = await db
      .insert(solicitudesPbc)
      .values(
        descripciones.map((descripcion) => ({
          auditoriaId: id,
          papelTrabajoId: body.papelTrabajoId ?? null,
          descripcion,
          fechaLimite,
        })),
      )
      .returning()

    return c.json({ data: creadas }, 201)
  },
)

// PUT /pbc/:id — editar descripción / estado / notas / fecha límite
app.put(
  '/pbc/:id',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().min(2).optional(),
      estado: z.enum(['solicitado', 'recibido', 'no_aplica']).optional(),
      notas: z.string().optional(),
      fechaLimite: z.string().datetime().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const solicitudId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarSolicitud(solicitudId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } }, 404)

    const updates: Record<string, string | Date | null> = {}
    if (body.descripcion) updates.descripcion = body.descripcion
    if (body.estado) updates.estado = body.estado
    if (body.notas !== undefined) updates.notas = body.notas || null
    if (body.fechaLimite !== undefined) {
      updates.fechaLimite = body.fechaLimite ? new Date(body.fechaLimite) : null
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizada] = await db
      .update(solicitudesPbc)
      .set(updates)
      .where(eq(solicitudesPbc.id, solicitudId))
      .returning()

    return c.json({ data: actualizada })
  },
)

// POST /pbc/:id/recibir — marca recibido y crea la evidencia en el papel asociado
app.post('/pbc/:id/recibir', async (c) => {
  const user = c.get('user')
  const { firmaId } = user
  const solicitudId = c.req.param('id')

  const row = await cargarSolicitud(solicitudId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } }, 404)

  if (!row.solicitud.papelTrabajoId) {
    return c.json(
      {
        error: {
          code: 'SIN_PAPEL',
          message: 'La solicitud no está asociada a un papel de trabajo; no se puede vincular la evidencia',
        },
      },
      409,
    )
  }

  // Si ya tiene evidencia vinculada, solo confirmamos el estado.
  let evidenciaId = row.solicitud.evidenciaId
  if (!evidenciaId) {
    const [evidencia] = await db
      .insert(evidencias)
      .values({
        papelTrabajoId: row.solicitud.papelTrabajoId,
        nombre: row.solicitud.descripcion,
        descripcion: 'Documento recibido del cliente (PBC)',
        tipo: 'documento',
        subidoPor: user.sub,
      })
      .returning()
    evidenciaId = evidencia.id
  }

  const [actualizada] = await db
    .update(solicitudesPbc)
    .set({ estado: 'recibido', evidenciaId })
    .where(eq(solicitudesPbc.id, solicitudId))
    .returning()

  registrarEvento(user, {
    accion: 'pbc.recibir',
    entidad: 'solicitud_pbc',
    entidadId: solicitudId,
    auditoriaId: row.solicitud.auditoriaId,
    detalle: { descripcion: row.solicitud.descripcion, evidenciaId },
  })

  return c.json({ data: { ...actualizada, evidenciaId } })
})

// DELETE /pbc/:id
app.delete('/pbc/:id', async (c) => {
  const { firmaId } = c.get('user')
  const solicitudId = c.req.param('id')

  const row = await cargarSolicitud(solicitudId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } }, 404)

  await db.delete(solicitudesPbc).where(eq(solicitudesPbc.id, solicitudId))
  return c.json({ data: { id: solicitudId } })
})

export default app
