import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, desc, eq, ne } from 'drizzle-orm'
import { db } from '../db/client'
import {
  auditorias,
  empresas,
  papelesTrabajo,
  notasRevision,
  cierresAuditoria,
  informes,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { esSocioResponsable, ERROR_NO_SOCIO_RESPONSABLE } from '../lib/permisos'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { registrarEvento } from '../lib/eventos'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function cargarNota(notaId: string, firmaId: string) {
  const [row] = await db
    .select({ nota: notasRevision })
    .from(notasRevision)
    .innerJoin(auditorias, eq(notasRevision.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(notasRevision.id, notaId), eq(empresas.firmaId, firmaId)))
  return row?.nota ?? null
}

// ─── Notas de revisión (NIA 220) ─────────────────────────────────────────────

// GET /auditorias/:id/notas-revision — lista consolidada (con datos del papel)
app.get('/auditorias/:id/notas-revision', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  if (!(await cargarAuditoria(id, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const lista = await db
    .select({
      id: notasRevision.id,
      auditoriaId: notasRevision.auditoriaId,
      papelTrabajoId: notasRevision.papelTrabajoId,
      texto: notasRevision.texto,
      estado: notasRevision.estado,
      respuesta: notasRevision.respuesta,
      creadoPor: notasRevision.creadoPor,
      resueltoPor: notasRevision.resueltoPor,
      resueltoAt: notasRevision.resueltoAt,
      createdAt: notasRevision.createdAt,
      papelTitulo: papelesTrabajo.titulo,
      papelArea: papelesTrabajo.area,
    })
    .from(notasRevision)
    .leftJoin(papelesTrabajo, eq(notasRevision.papelTrabajoId, papelesTrabajo.id))
    .where(eq(notasRevision.auditoriaId, id))
    .orderBy(desc(notasRevision.createdAt))

  return c.json({ data: lista })
})

// POST /papeles/:papelId/notas-revision — crear nota sobre un papel
app.post(
  '/papeles/:papelId/notas-revision',
  zValidator('json', z.object({ texto: z.string().min(2) })),
  async (c) => {
    const user = c.get('user')
    const papelId = c.req.param('papelId')
    const { texto } = c.req.valid('json')

    const papel = await cargarPapel(papelId, user.firmaId)
    if (!papel) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)
    if (await encargoCerrado(papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const [nota] = await db
      .insert(notasRevision)
      .values({ auditoriaId: papel.auditoriaId, papelTrabajoId: papelId, texto, creadoPor: user.sub })
      .returning()

    registrarEvento(user, {
      accion: 'nota_revision.crear',
      entidad: 'nota_revision',
      entidadId: nota.id,
      auditoriaId: papel.auditoriaId,
      detalle: { papelId },
    })

    return c.json({ data: nota }, 201)
  },
)

// PUT /notas-revision/:id — editar texto/respuesta o cambiar estado (resolver/reabrir)
app.put(
  '/notas-revision/:id',
  zValidator(
    'json',
    z.object({
      texto: z.string().min(2).optional(),
      respuesta: z.string().optional(),
      estado: z.enum(['abierta', 'resuelta']).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const notaId = c.req.param('id')
    const body = c.req.valid('json')

    const nota = await cargarNota(notaId, user.firmaId)
    if (!nota) return c.json({ error: { code: 'NOT_FOUND', message: 'Nota no encontrada' } }, 404)
    if (await encargoCerrado(nota.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const updates: Record<string, string | Date | null> = {}
    if (body.texto) updates.texto = body.texto
    if (body.respuesta !== undefined) updates.respuesta = body.respuesta || null
    if (body.estado) {
      updates.estado = body.estado
      if (body.estado === 'resuelta') {
        updates.resueltoPor = user.sub
        updates.resueltoAt = new Date()
      } else {
        updates.resueltoPor = null
        updates.resueltoAt = null
      }
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizada] = await db
      .update(notasRevision)
      .set(updates)
      .where(eq(notasRevision.id, notaId))
      .returning()

    if (body.estado && body.estado !== nota.estado) {
      registrarEvento(user, {
        accion: body.estado === 'resuelta' ? 'nota_revision.resolver' : 'nota_revision.reabrir',
        entidad: 'nota_revision',
        entidadId: notaId,
        auditoriaId: nota.auditoriaId,
        detalle: { papelId: nota.papelTrabajoId },
      })
    }

    return c.json({ data: actualizada })
  },
)

// DELETE /notas-revision/:id
app.delete('/notas-revision/:id', async (c) => {
  const user = c.get('user')
  const notaId = c.req.param('id')

  const nota = await cargarNota(notaId, user.firmaId)
  if (!nota) return c.json({ error: { code: 'NOT_FOUND', message: 'Nota no encontrada' } }, 404)
  if (await encargoCerrado(nota.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  await db.delete(notasRevision).where(eq(notasRevision.id, notaId))

  registrarEvento(user, {
    accion: 'nota_revision.eliminar',
    entidad: 'nota_revision',
    entidadId: notaId,
    auditoriaId: nota.auditoriaId,
    detalle: { papelId: nota.papelTrabajoId, estado: nota.estado },
  })

  return c.json({ data: { id: notaId } })
})

// ─── Cierre del encargo (NIA 560 / 570 / 220) ────────────────────────────────

async function obtenerCierre(auditoriaId: string) {
  const [existente] = await db.select().from(cierresAuditoria).where(eq(cierresAuditoria.auditoriaId, auditoriaId))
  if (existente) return existente
  const [creado] = await db.insert(cierresAuditoria).values({ auditoriaId }).returning()
  return creado
}

// GET /auditorias/:id/cierre
app.get('/auditorias/:id/cierre', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  if (!(await cargarAuditoria(id, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const cierre = await obtenerCierre(id)
  return c.json({ data: cierre })
})

// PUT /auditorias/:id/cierre — actualizar campos del checklist
app.put(
  '/auditorias/:id/cierre',
  zValidator(
    'json',
    z.object({
      hechosPosteriores: z.string().optional(),
      hechosPosterioresEvaluado: z.boolean().optional(),
      negocioMarcha: z.string().optional(),
      negocioMarchaEvaluado: z.boolean().optional(),
      revisionCalidad: z.string().optional(),
      revisionCalidadCompleta: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    if (!(await cargarAuditoria(id, user.firmaId))) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const cierre = await obtenerCierre(id)
    if (cierre.cerrado) {
      return c.json({ error: { code: 'CIERRE_HECHO', message: 'El encargo ya está cerrado. Reábrelo para editarlo.' } }, 409)
    }

    const updates: Record<string, string | boolean | null> = {}
    if (body.hechosPosteriores !== undefined) updates.hechosPosteriores = body.hechosPosteriores || null
    if (body.hechosPosterioresEvaluado !== undefined) updates.hechosPosterioresEvaluado = body.hechosPosterioresEvaluado
    if (body.negocioMarcha !== undefined) updates.negocioMarcha = body.negocioMarcha || null
    if (body.negocioMarchaEvaluado !== undefined) updates.negocioMarchaEvaluado = body.negocioMarchaEvaluado
    if (body.revisionCalidad !== undefined) updates.revisionCalidad = body.revisionCalidad || null
    if (body.revisionCalidadCompleta !== undefined) updates.revisionCalidadCompleta = body.revisionCalidadCompleta

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db
      .update(cierresAuditoria)
      .set(updates)
      .where(eq(cierresAuditoria.id, cierre.id))
      .returning()

    registrarEvento(user, {
      accion: 'cierre.checklist',
      entidad: 'cierre_auditoria',
      entidadId: cierre.id,
      auditoriaId: id,
      detalle: { campos: Object.keys(updates) },
    })

    return c.json({ data: actualizado })
  },
)

// POST /auditorias/:id/cierre/cerrar — Regla: solo el socio. Para cerrar se exige:
// sin notas de revisión abiertas, todos los papeles aprobados (RF), checklist NIA
// 560/570/220 completo y el informe final (dictamen / informe AI) aprobado.
// Al cerrar, el encargo pasa a estado 'finalizada' y su archivo queda congelado.
app.post('/auditorias/:id/cierre/cerrar', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const auditoria = await cargarAuditoria(id, user.firmaId)
  if (!auditoria) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  if (!esSocioResponsable(user, auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }

  const abiertas = await db
    .select({ id: notasRevision.id })
    .from(notasRevision)
    .where(and(eq(notasRevision.auditoriaId, id), eq(notasRevision.estado, 'abierta')))
  if (abiertas.length > 0) {
    return c.json(
      { error: { code: 'NOTAS_ABIERTAS', message: `Hay ${abiertas.length} nota(s) de revisión sin resolver. Resuélvelas antes de cerrar.` } },
      409,
    )
  }

  // Todos los papeles de trabajo deben estar aprobados antes de ensamblar el archivo (NIA 230).
  const sinAprobar = await db
    .select({ id: papelesTrabajo.id })
    .from(papelesTrabajo)
    .where(and(eq(papelesTrabajo.auditoriaId, id), ne(papelesTrabajo.estado, 'aprobado')))
  if (sinAprobar.length > 0) {
    return c.json(
      { error: { code: 'PAPELES_SIN_APROBAR', message: `Hay ${sinAprobar.length} papel(es) de trabajo sin aprobar. Apruébalos o elimínalos antes de cerrar.` } },
      409,
    )
  }

  const cierre = await obtenerCierre(id)
  const faltantes: string[] = []
  if (!cierre.hechosPosterioresEvaluado) faltantes.push('hechos posteriores (NIA 560)')
  if (!cierre.negocioMarchaEvaluado) faltantes.push('negocio en marcha (NIA 570)')
  if (!cierre.revisionCalidadCompleta) faltantes.push('revisión de calidad (NIA 220)')
  if (faltantes.length > 0) {
    return c.json(
      { error: { code: 'CHECKLIST_INCOMPLETO', message: `Completa el checklist de cierre antes de cerrar: ${faltantes.join(', ')}.` } },
      409,
    )
  }

  // El informe final del encargo debe estar aprobado por el socio.
  const tipoFinal = auditoria.tipoServicio === 'auditoria_interna' ? 'informe_ai' : 'dictamen'
  const [informeFinal] = await db
    .select({ estado: informes.estado })
    .from(informes)
    .where(and(eq(informes.auditoriaId, id), eq(informes.tipo, tipoFinal)))
  if (informeFinal?.estado !== 'aprobado') {
    const nombre = tipoFinal === 'dictamen' ? 'el dictamen (NIA 700)' : 'el informe de auditoría interna'
    return c.json(
      { error: { code: 'INFORME_NO_APROBADO', message: `No se puede cerrar el encargo sin aprobar ${nombre}.` } },
      409,
    )
  }

  const [cerrado] = await db
    .update(cierresAuditoria)
    .set({ cerrado: true, cerradoPor: user.sub, cerradoAt: new Date() })
    .where(eq(cierresAuditoria.id, cierre.id))
    .returning()

  await db.update(auditorias).set({ estado: 'finalizada' }).where(eq(auditorias.id, id))

  registrarEvento(user, {
    accion: 'cierre.cerrar',
    entidad: 'cierre_auditoria',
    entidadId: cierre.id,
    auditoriaId: id,
    detalle: { informeFinal: tipoFinal, estado: 'finalizada' },
  })

  return c.json({ data: cerrado })
})

// POST /auditorias/:id/cierre/reabrir — solo el socio
app.post('/auditorias/:id/cierre/reabrir', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const auditoria = await cargarAuditoria(id, user.firmaId)
  if (!auditoria) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  if (!esSocioResponsable(user, auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }

  const cierre = await obtenerCierre(id)
  const [reabierto] = await db
    .update(cierresAuditoria)
    .set({ cerrado: false, cerradoPor: null, cerradoAt: null })
    .where(eq(cierresAuditoria.id, cierre.id))
    .returning()

  // El encargo vuelve a revisión: dejó de ser un archivo cerrado.
  await db.update(auditorias).set({ estado: 'revision' }).where(eq(auditorias.id, id))

  registrarEvento(user, {
    accion: 'cierre.reabrir',
    entidad: 'cierre_auditoria',
    entidadId: cierre.id,
    auditoriaId: id,
    detalle: { estado: 'revision' },
  })

  return c.json({ data: reabierto })
})

export default app
