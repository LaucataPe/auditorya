import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
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
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
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
    const user = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const auditoria = await cargarAuditoria(id, user.firmaId)
    if (!auditoria) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    // El PBC es parte de la ejecución: requiere la materialidad aprobada.
    if (!auditoria.materialidadAprobada) {
      return c.json(
        { error: { code: 'MATERIALIDAD_NO_APROBADA', message: 'No se pueden solicitar documentos (PBC) sin aprobar la materialidad' } },
        409,
      )
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

    registrarEvento(user, {
      accion: 'pbc.crear',
      entidad: 'solicitud_pbc',
      auditoriaId: id,
      detalle: { cantidad: creadas.length, papelId: body.papelTrabajoId ?? null },
    })

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
    const user = c.get('user')
    const solicitudId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarSolicitud(solicitudId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } }, 404)
    if (await encargoCerrado(row.solicitud.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

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

    registrarEvento(user, {
      accion: 'pbc.editar',
      entidad: 'solicitud_pbc',
      entidadId: solicitudId,
      auditoriaId: row.solicitud.auditoriaId,
      detalle: { campos: Object.keys(updates), estado: actualizada.estado },
    })

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
  if (await encargoCerrado(row.solicitud.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

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
  const user = c.get('user')
  const solicitudId = c.req.param('id')

  const row = await cargarSolicitud(solicitudId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Solicitud no encontrada' } }, 404)
  if (await encargoCerrado(row.solicitud.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  await db.delete(solicitudesPbc).where(eq(solicitudesPbc.id, solicitudId))

  // Si la evidencia se creó al marcar "recibido" y nunca recibió archivo ni enlace,
  // era un placeholder de esta solicitud: se limpia para no dejar evidencia fantasma.
  if (row.solicitud.evidenciaId) {
    const [ev] = await db.select().from(evidencias).where(eq(evidencias.id, row.solicitud.evidenciaId))
    if (ev && !ev.archivoKey && !ev.enlaceExterno) {
      // Best-effort: si otra solicitud aún la referencia, se conserva.
      await db.delete(evidencias).where(eq(evidencias.id, ev.id)).catch(() => {})
    }
  }

  registrarEvento(user, {
    accion: 'pbc.eliminar',
    entidad: 'solicitud_pbc',
    entidadId: solicitudId,
    auditoriaId: row.solicitud.auditoriaId,
    detalle: { descripcion: row.solicitud.descripcion, estado: row.solicitud.estado },
  })

  return c.json({ data: { id: solicitudId } })
})

export default app
