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
  controlesCoso,
  tareas,
  usuarios,
  riesgos,
  solicitudesPbc,
  notasRevision,
  muestras,
  hallazgos,
  papelesSnapshots,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { esSocioResponsable, ERROR_NO_SOCIO_RESPONSABLE } from '../lib/permisos'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { areaValidaParaFirma, ERROR_AREA_INVALIDA } from '../lib/areas'
import { registrarEvento } from '../lib/eventos'
import { storage, firmarDescarga } from '../lib/storage'
import { createHash, randomUUID } from 'node:crypto'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const COMPONENTES = [
  'ambiente_control', 'evaluacion_riesgos', 'actividades_control',
  'informacion_comunicacion', 'supervision',
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Carga auditoría + empresa verificando pertenencia a la firma. */
async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias, empresa: empresas })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

/** Carga un papel de trabajo verificando que su auditoría sea de la firma. */
async function cargarPapel(papelId: string, firmaId: string) {
  const [row] = await db
    .select({ papel: papelesTrabajo, auditoria: auditorias })
    .from(papelesTrabajo)
    .innerJoin(auditorias, eq(papelesTrabajo.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(papelesTrabajo.id, papelId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

/** Carga una tarea verificando que su auditoría pertenezca a la firma. */
async function cargarTarea(tareaId: string, firmaId: string) {
  const [row] = await db
    .select({ tarea: tareas })
    .from(tareas)
    .innerJoin(auditorias, eq(tareas.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(tareas.id, tareaId), eq(empresas.firmaId, firmaId)))
  return row?.tarea ?? null
}

/** Verifica que un usuario pertenezca a la firma (para asignar tareas). */
async function usuarioDeFirma(usuarioId: string, firmaId: string) {
  const [u] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.id, usuarioId), eq(usuarios.firmaId, firmaId)))
  return !!u
}

// ─── Papeles de trabajo (NIA 230) ────────────────────────────────────────────

// GET /auditorias/:id/papeles
app.get('/auditorias/:id/papeles', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db
    .select()
    .from(papelesTrabajo)
    .where(eq(papelesTrabajo.auditoriaId, id))
    .orderBy(desc(papelesTrabajo.createdAt))

  return c.json({ data: lista })
})

// GET /auditorias/:id/cronograma — tareas + pruebas (papeles) unificadas para el timeline
app.get('/auditorias/:id/cronograma', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const [ts, ps] = await Promise.all([
    db.select().from(tareas).where(eq(tareas.auditoriaId, id)),
    db.select().from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)),
  ])

  const estadoTarea: Record<string, string> = { pendiente: 'pendiente', en_progreso: 'en_progreso', completada: 'completado' }
  const estadoPapel: Record<string, string> = { borrador: 'pendiente', en_revision: 'en_progreso', aprobado: 'completado' }

  const items = [
    ...ts.map((t) => ({
      id: t.id,
      tipo: 'tarea' as const,
      titulo: t.titulo,
      area: t.area,
      responsable: t.asignadoA,
      fechaInicio: t.fechaInicio,
      fechaFin: t.vencimiento,
      estado: estadoTarea[t.estado] ?? 'pendiente',
    })),
    ...ps.map((p) => ({
      id: p.id,
      tipo: 'prueba' as const,
      titulo: p.titulo,
      area: p.area,
      responsable: p.asignadoA,
      fechaInicio: p.fechaInicio,
      fechaFin: p.fechaFin,
      estado: estadoPapel[p.estado] ?? 'pendiente',
    })),
  ]

  return c.json({ data: items })
})

// POST /auditorias/:id/papeles — Regla: requiere materialidad aprobada (fase ejecución)
app.post(
  '/auditorias/:id/papeles',
  zValidator(
    'json',
    z.object({
      area: z.string().min(2).max(80),
      titulo: z.string().min(3),
      procedimiento: z.string().optional(),
      alcance: z.string().optional(),
      hallazgos: z.string().optional(),
      conclusion: z.string().optional(),
      riesgoId: z.string().uuid().optional(),
      // Documentos que la prueba necesita del cliente → generan la lista PBC.
      documentosRequeridos: z.array(z.string().min(2)).optional(),
      // Cronograma
      fechaInicio: z.string().datetime().optional().or(z.literal('')),
      fechaFin: z.string().datetime().optional().or(z.literal('')),
      asignadoA: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const { firmaId, sub } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (!row.auditoria.materialidadAprobada) {
      return c.json(
        {
          error: {
            code: 'MATERIALIDAD_NO_APROBADA',
            message: 'No se puede ejecutar (crear papeles de trabajo) sin aprobar la materialidad',
          },
        },
        409,
      )
    }

    if (body.asignadoA && !(await usuarioDeFirma(body.asignadoA, firmaId))) {
      return c.json(
        { error: { code: 'USUARIO_INVALIDO', message: 'El responsable no pertenece a la firma' } },
        400,
      )
    }

    if (!(await areaValidaParaFirma(firmaId, body.area))) {
      return c.json({ error: ERROR_AREA_INVALIDA }, 400)
    }

    // Anti-duplicado: no crear el mismo papel (mismo título) dos veces para un riesgo.
    if (body.riesgoId) {
      const [dup] = await db
        .select({ id: papelesTrabajo.id })
        .from(papelesTrabajo)
        .where(and(
          eq(papelesTrabajo.auditoriaId, id),
          eq(papelesTrabajo.riesgoId, body.riesgoId),
          eq(papelesTrabajo.titulo, body.titulo),
        ))
      if (dup) {
        return c.json(
          { error: { code: 'PAPEL_DUPLICADO', message: `Ya existe un papel "${body.titulo}" para este riesgo.` } },
          409,
        )
      }
    }

    const [papel] = await db
      .insert(papelesTrabajo)
      .values({
        auditoriaId: id,
        area: body.area,
        titulo: body.titulo,
        riesgoId: body.riesgoId ?? null,
        procedimiento: body.procedimiento ?? null,
        alcance: body.alcance ?? null,
        hallazgos: body.hallazgos ?? null,
        conclusion: body.conclusion ?? null,
        fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
        fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
        asignadoA: body.asignadoA ?? null,
        preparadoPor: sub,
      })
      .returning()

    // Genera las solicitudes PBC de los documentos requeridos por la prueba.
    if (body.documentosRequeridos && body.documentosRequeridos.length > 0) {
      await db.insert(solicitudesPbc).values(
        body.documentosRequeridos.map((descripcion) => ({
          auditoriaId: id,
          papelTrabajoId: papel.id,
          descripcion,
        })),
      )
    }

    registrarEvento(c.get('user'), {
      accion: 'papel.crear',
      entidad: 'papel_trabajo',
      entidadId: papel.id,
      auditoriaId: id,
      detalle: { titulo: papel.titulo, area: papel.area, riesgoId: papel.riesgoId },
    })

    return c.json({ data: papel }, 201)
  },
)

// GET /papeles/:papelId — incluye evidencias
app.get('/papeles/:papelId', async (c) => {
  const { firmaId } = c.get('user')
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  const evs = await db
    .select()
    .from(evidencias)
    .where(eq(evidencias.papelTrabajoId, papelId))
    .orderBy(desc(evidencias.createdAt))

  return c.json({ data: { ...row.papel, evidencias: evs } })
})

// PUT /papeles/:papelId — editar contenido. Un papel aprobado no se edita salvo reapertura.
app.put(
  '/papeles/:papelId',
  zValidator(
    'json',
    z.object({
      area: z.string().min(2).max(80).optional(),
      titulo: z.string().min(3).optional(),
      procedimiento: z.string().optional(),
      alcance: z.string().optional(),
      hallazgos: z.string().optional(),
      conclusion: z.string().optional(),
      estado: z.enum(['borrador', 'en_revision']).optional(),
      fechaInicio: z.string().datetime().optional().or(z.literal('')),
      fechaFin: z.string().datetime().optional().or(z.literal('')),
      asignadoA: z.string().uuid().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    const row = await cargarPapel(papelId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)
    if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (row.papel.estado === 'aprobado') {
      return c.json(
        {
          error: {
            code: 'PAPEL_APROBADO',
            message: 'Un papel de trabajo aprobado no puede editarse. Reábrelo primero.',
          },
        },
        409,
      )
    }

    if (body.asignadoA && !(await usuarioDeFirma(body.asignadoA, firmaId))) {
      return c.json(
        { error: { code: 'USUARIO_INVALIDO', message: 'El responsable no pertenece a la firma' } },
        400,
      )
    }

    if (body.area && !(await areaValidaParaFirma(firmaId, body.area))) {
      return c.json({ error: ERROR_AREA_INVALIDA }, 400)
    }

    const updates: Record<string, string | Date | null> = {}
    if (body.area) updates.area = body.area
    if (body.titulo) updates.titulo = body.titulo
    if (body.procedimiento !== undefined) updates.procedimiento = body.procedimiento || null
    if (body.alcance !== undefined) updates.alcance = body.alcance || null
    if (body.hallazgos !== undefined) updates.hallazgos = body.hallazgos || null
    if (body.conclusion !== undefined) updates.conclusion = body.conclusion || null
    if (body.estado) updates.estado = body.estado
    if (body.fechaInicio !== undefined) updates.fechaInicio = body.fechaInicio ? new Date(body.fechaInicio) : null
    if (body.fechaFin !== undefined) updates.fechaFin = body.fechaFin ? new Date(body.fechaFin) : null
    if (body.asignadoA !== undefined) updates.asignadoA = body.asignadoA || null

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db
      .update(papelesTrabajo)
      .set(updates)
      .where(eq(papelesTrabajo.id, papelId))
      .returning()

    registrarEvento(c.get('user'), {
      accion: 'papel.editar',
      entidad: 'papel_trabajo',
      entidadId: papelId,
      auditoriaId: row.papel.auditoriaId,
      detalle: { titulo: actualizado.titulo, campos: Object.keys(updates) },
    })

    return c.json({ data: actualizado })
  },
)

// PATCH /papeles/:papelId/pasos — marca/edita un paso del checklist de la guía.
// Merge server-side por índice para no pisar el resto del checklist.
app.patch(
  '/papeles/:papelId/pasos',
  zValidator(
    'json',
    z.object({
      indice: z.number().int().min(0),
      hecho: z.boolean().optional(),
      nota: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    const row = await cargarPapel(papelId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)
    if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (row.papel.estado === 'aprobado') {
      return c.json(
        { error: { code: 'PAPEL_APROBADO', message: 'Un papel aprobado no puede editarse. Reábrelo primero.' } },
        409,
      )
    }

    const pasos = { ...(row.papel.pasosEstado ?? {}) }
    const clave = String(body.indice)
    const actual = pasos[clave] ?? { hecho: false, nota: null }
    pasos[clave] = {
      hecho: body.hecho ?? actual.hecho,
      nota: body.nota !== undefined ? body.nota || null : actual.nota,
    }

    const [actualizado] = await db
      .update(papelesTrabajo)
      .set({ pasosEstado: pasos })
      .where(eq(papelesTrabajo.id, papelId))
      .returning()

    return c.json({ data: actualizado })
  },
)

// POST /papeles/:papelId/aprobar — Regla: solo el socio responsable. Para aprobar
// se exige: papel en revisión, conclusión escrita, evidencia real (archivo o enlace)
// y notas de revisión resueltas (NIA 220/230/500). Al aprobar se toma un snapshot
// inmutable del papel y su evidencia: reabrir y editar ya no destruye el rastro.
app.post('/papeles/:papelId/aprobar', async (c) => {
  const user = c.get('user')
  const { firmaId, sub } = user
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  if (!esSocioResponsable(user, row.auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }
  if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  if (row.papel.estado !== 'en_revision') {
    return c.json(
      {
        error: {
          code: 'PAPEL_NO_EN_REVISION',
          message: 'El papel debe enviarse a revisión antes de aprobarse (NIA 220).',
        },
      },
      409,
    )
  }

  if (!(row.papel.conclusion ?? '').trim()) {
    return c.json(
      { error: { code: 'SIN_CONCLUSION', message: 'El papel necesita una conclusión documentada antes de aprobarse (NIA 230).' } },
      409,
    )
  }

  const evidenciasPapel = await db
    .select()
    .from(evidencias)
    .where(eq(evidencias.papelTrabajoId, papelId))
  const conSoporte = evidenciasPapel.filter((e) => e.archivoKey || e.enlaceExterno)
  if (conSoporte.length === 0) {
    return c.json(
      {
        error: {
          code: 'SIN_EVIDENCIA',
          message: 'El papel necesita al menos una evidencia con archivo adjunto o enlace antes de aprobarse (NIA 500).',
        },
      },
      409,
    )
  }

  const notasAbiertas = await db
    .select({ id: notasRevision.id })
    .from(notasRevision)
    .where(and(eq(notasRevision.papelTrabajoId, papelId), eq(notasRevision.estado, 'abierta')))
  if (notasAbiertas.length > 0) {
    return c.json(
      { error: { code: 'NOTAS_ABIERTAS', message: `El papel tiene ${notasAbiertas.length} nota(s) de revisión sin resolver.` } },
      409,
    )
  }

  // Aprobación + snapshot en la misma transacción: o quedan ambos, o ninguno.
  const aprobado = await db.transaction(async (tx) => {
    const [p] = await tx
      .update(papelesTrabajo)
      .set({ estado: 'aprobado', aprobadoPor: sub, aprobadoAt: new Date() })
      .where(eq(papelesTrabajo.id, papelId))
      .returning()

    await tx.insert(papelesSnapshots).values({
      papelTrabajoId: papelId,
      auditoriaId: p.auditoriaId,
      aprobadoPor: sub,
      contenido: {
        papel: {
          titulo: p.titulo,
          area: p.area,
          riesgoId: p.riesgoId,
          procedimiento: p.procedimiento,
          alcance: p.alcance,
          hallazgos: p.hallazgos,
          conclusion: p.conclusion,
          pasosEstado: p.pasosEstado,
          preparadoPor: p.preparadoPor,
          aprobadoAt: p.aprobadoAt,
        },
        evidencias: evidenciasPapel.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          tipo: e.tipo,
          descripcion: e.descripcion,
          enlaceExterno: e.enlaceExterno,
          archivoNombre: e.archivoNombre,
          archivoHash: e.archivoHash,
          archivoTamano: e.archivoTamano,
        })),
      },
    })

    return p
  })

  registrarEvento(user, {
    accion: 'papel.aprobar',
    entidad: 'papel_trabajo',
    entidadId: papelId,
    auditoriaId: row.papel.auditoriaId,
    detalle: { titulo: row.papel.titulo, area: row.papel.area, evidencias: conSoporte.length },
  })

  return c.json({ data: aprobado })
})

// POST /papeles/:papelId/reabrir — vuelve a borrador (solo socio)
app.post('/papeles/:papelId/reabrir', async (c) => {
  const user = c.get('user')
  const { firmaId } = user
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  if (!esSocioResponsable(user, row.auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }
  if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  // El snapshot tomado al aprobar se conserva: la reapertura no borra el rastro.
  const [reabierto] = await db
    .update(papelesTrabajo)
    .set({ estado: 'borrador', aprobadoPor: null, aprobadoAt: null })
    .where(eq(papelesTrabajo.id, papelId))
    .returning()

  registrarEvento(user, {
    accion: 'papel.reabrir',
    entidad: 'papel_trabajo',
    entidadId: papelId,
    auditoriaId: row.papel.auditoriaId,
    detalle: { titulo: row.papel.titulo },
  })

  return c.json({ data: reabierto })
})

// DELETE /papeles/:papelId — borra el papel y sus evidencias
app.delete('/papeles/:papelId', async (c) => {
  const user = c.get('user')
  const { firmaId } = user
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)
  if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  if (row.papel.estado === 'aprobado') {
    return c.json(
      { error: { code: 'PAPEL_APROBADO', message: 'No se puede eliminar un papel aprobado' } },
      409,
    )
  }

  // Archivos físicos de la evidencia: se recogen antes para limpiarlos del storage tras el commit.
  const claves = (
    await db
      .select({ key: evidencias.archivoKey })
      .from(evidencias)
      .where(eq(evidencias.papelTrabajoId, papelId))
  )
    .map((e) => e.key)
    .filter((k): k is string => !!k)

  // Limpieza de dependencias antes de borrar el papel (evita violar llaves foráneas).
  await db.transaction(async (tx) => {
    await tx.delete(solicitudesPbc).where(eq(solicitudesPbc.papelTrabajoId, papelId)) // ref → evidencias
    await tx.delete(evidencias).where(eq(evidencias.papelTrabajoId, papelId))
    await tx.delete(notasRevision).where(eq(notasRevision.papelTrabajoId, papelId))
    await tx.delete(muestras).where(eq(muestras.papelTrabajoId, papelId)) // los ítems caen por cascade
    await tx.delete(papelesSnapshots).where(eq(papelesSnapshots.papelTrabajoId, papelId))
    // Las tareas y hallazgos se conservan como sueltos (no se pierde el trabajo).
    await tx.update(tareas).set({ papelTrabajoId: null }).where(eq(tareas.papelTrabajoId, papelId))
    await tx.update(hallazgos).set({ papelTrabajoId: null }).where(eq(hallazgos.papelTrabajoId, papelId))
    await tx.delete(papelesTrabajo).where(eq(papelesTrabajo.id, papelId))
  })

  // Limpieza best-effort de los archivos en disco/S3 (fuera de la transacción).
  for (const key of claves) await storage.eliminar(key).catch(() => {})

  registrarEvento(user, {
    accion: 'papel.eliminar',
    entidad: 'papel_trabajo',
    entidadId: papelId,
    auditoriaId: row.papel.auditoriaId,
    detalle: { titulo: row.papel.titulo, area: row.papel.area, estado: row.papel.estado },
  })

  return c.json({ data: { id: papelId } })
})

// ─── Evidencias (metadata) ───────────────────────────────────────────────────

// POST /papeles/:papelId/evidencias
app.post(
  '/papeles/:papelId/evidencias',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2),
      descripcion: z.string().optional(),
      tipo: z.enum(['documento', 'confirmacion', 'conciliacion', 'calculo', 'foto', 'otro']),
      enlaceExterno: z.string().url().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    const row = await cargarPapel(papelId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)
    if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (row.papel.estado === 'aprobado') {
      return c.json(
        { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la evidencia de un papel aprobado' } },
        409,
      )
    }

    const [evidencia] = await db
      .insert(evidencias)
      .values({
        papelTrabajoId: papelId,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        tipo: body.tipo,
        enlaceExterno: body.enlaceExterno || null,
      })
      .returning()

    registrarEvento(user, {
      accion: 'evidencia.crear',
      entidad: 'evidencia',
      entidadId: evidencia.id,
      auditoriaId: row.papel.auditoriaId,
      detalle: { nombre: body.nombre, tipo: body.tipo, papelId },
    })

    return c.json({ data: evidencia }, 201)
  },
)

// DELETE /papeles/:papelId/evidencias/:evidenciaId
app.delete('/papeles/:papelId/evidencias/:evidenciaId', async (c) => {
  const user = c.get('user')
  const papelId = c.req.param('papelId')
  const evidenciaId = c.req.param('evidenciaId')

  const row = await cargarPapel(papelId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)
  if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  if (row.papel.estado === 'aprobado') {
    return c.json(
      { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la evidencia de un papel aprobado' } },
      409,
    )
  }

  const [eliminada] = await db
    .delete(evidencias)
    .where(and(eq(evidencias.id, evidenciaId), eq(evidencias.papelTrabajoId, papelId)))
    .returning()

  if (!eliminada) return c.json({ error: { code: 'NOT_FOUND', message: 'Evidencia no encontrada' } }, 404)

  // Borra también el archivo físico, si lo había.
  if (eliminada.archivoKey) await storage.eliminar(eliminada.archivoKey)

  registrarEvento(user, {
    accion: 'evidencia.eliminar',
    entidad: 'evidencia',
    entidadId: evidenciaId,
    auditoriaId: row.papel.auditoriaId,
    detalle: { nombre: eliminada.nombre, teniaArchivo: !!eliminada.archivoKey, papelId },
  })

  return c.json({ data: { id: evidenciaId } })
})

// ─── Archivos de evidencia ───────────────────────────────────────────────────

const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024 // 20 MB

/** Carga una evidencia verificando pertenencia (papel → auditoría → firma). */
async function cargarEvidencia(evidenciaId: string, firmaId: string) {
  const [row] = await db
    .select({ evidencia: evidencias, papel: papelesTrabajo })
    .from(evidencias)
    .innerJoin(papelesTrabajo, eq(evidencias.papelTrabajoId, papelesTrabajo.id))
    .innerJoin(auditorias, eq(papelesTrabajo.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(evidencias.id, evidenciaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// POST /evidencias/:evidenciaId/archivo — sube el archivo adjunto (multipart)
app.post('/evidencias/:evidenciaId/archivo', async (c) => {
  const user = c.get('user')
  const evidenciaId = c.req.param('evidenciaId')

  const row = await cargarEvidencia(evidenciaId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Evidencia no encontrada' } }, 404)
  if (await encargoCerrado(row.papel.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  if (row.papel.estado === 'aprobado') {
    return c.json(
      { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la evidencia de un papel aprobado' } },
      409,
    )
  }

  const body = await c.req.parseBody()
  const archivo = body['archivo']
  if (!(archivo instanceof File)) {
    return c.json({ error: { code: 'ARCHIVO_REQUERIDO', message: 'Adjunta el archivo en el campo "archivo"' } }, 400)
  }
  if (archivo.size > MAX_ARCHIVO_BYTES) {
    return c.json({ error: { code: 'ARCHIVO_MUY_GRANDE', message: 'El archivo supera el límite de 20 MB' } }, 413)
  }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const hash = createHash('sha256').update(contenido).digest('hex')
  const extension = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const key = `evidencias/${row.papel.auditoriaId}/${randomUUID()}.${extension}`

  // Reemplaza el archivo anterior si existía.
  if (row.evidencia.archivoKey) await storage.eliminar(row.evidencia.archivoKey)
  await storage.guardar(key, contenido)

  const [actualizada] = await db
    .update(evidencias)
    .set({
      archivoKey: key,
      archivoNombre: archivo.name,
      archivoMime: archivo.type || 'application/octet-stream',
      archivoTamano: archivo.size,
      archivoHash: hash,
      subidoPor: user.sub,
    })
    .where(eq(evidencias.id, evidenciaId))
    .returning()

  registrarEvento(user, {
    accion: 'evidencia.subir_archivo',
    entidad: 'evidencia',
    entidadId: evidenciaId,
    auditoriaId: row.papel.auditoriaId,
    detalle: { nombre: archivo.name, tamano: archivo.size, hash },
  })

  return c.json({ data: actualizada }, 201)
})

// GET /evidencias/:evidenciaId/descarga — genera la URL firmada (15 min)
app.get('/evidencias/:evidenciaId/descarga', async (c) => {
  const { firmaId } = c.get('user')
  const evidenciaId = c.req.param('evidenciaId')

  const row = await cargarEvidencia(evidenciaId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Evidencia no encontrada' } }, 404)
  if (!row.evidencia.archivoKey) {
    return c.json({ error: { code: 'SIN_ARCHIVO', message: 'Esta evidencia no tiene archivo adjunto' } }, 404)
  }

  const { key, exp, sig } = firmarDescarga(row.evidencia.archivoKey)
  const params = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
    nombre: row.evidencia.archivoNombre ?? 'archivo',
    mime: row.evidencia.archivoMime ?? 'application/octet-stream',
  })

  return c.json({ data: { url: `/archivos?${params.toString()}`, expiraEn: 15 * 60 } })
})

// ─── Control interno COSO (5 componentes) ────────────────────────────────────

// GET /auditorias/:id/coso
app.get('/auditorias/:id/coso', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db
    .select()
    .from(controlesCoso)
    .where(eq(controlesCoso.auditoriaId, id))

  return c.json({ data: lista })
})

// PUT /auditorias/:id/coso/:componente — upsert por componente
app.put(
  '/auditorias/:id/coso/:componente',
  zValidator(
    'json',
    z.object({
      calificacion: z.enum(['efectivo', 'con_deficiencias', 'deficiente']),
      observaciones: z.string().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const componente = c.req.param('componente') as (typeof COMPONENTES)[number]
    const body = c.req.valid('json')

    if (!COMPONENTES.includes(componente)) {
      return c.json({ error: { code: 'COMPONENTE_INVALIDO', message: 'Componente COSO no válido' } }, 400)
    }

    const row = await cargarAuditoria(id, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const [existente] = await db
      .select()
      .from(controlesCoso)
      .where(and(eq(controlesCoso.auditoriaId, id), eq(controlesCoso.componente, componente)))

    let resultado
    if (existente) {
      ;[resultado] = await db
        .update(controlesCoso)
        .set({ calificacion: body.calificacion, observaciones: body.observaciones ?? null })
        .where(eq(controlesCoso.id, existente.id))
        .returning()
    } else {
      ;[resultado] = await db
        .insert(controlesCoso)
        .values({
          auditoriaId: id,
          componente,
          calificacion: body.calificacion,
          observaciones: body.observaciones ?? null,
        })
        .returning()
    }

    registrarEvento(user, {
      accion: 'coso.evaluar',
      entidad: 'control_coso',
      entidadId: resultado.id,
      auditoriaId: id,
      detalle: { componente, calificacion: body.calificacion },
    })

    return c.json({ data: resultado })
  },
)

// ─── Tareas por área ─────────────────────────────────────────────────────────

// GET /auditorias/:id/tareas
app.get('/auditorias/:id/tareas', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db
    .select()
    .from(tareas)
    .where(eq(tareas.auditoriaId, id))
    .orderBy(desc(tareas.createdAt))

  return c.json({ data: lista })
})

// POST /auditorias/:id/tareas — Regla: requiere materialidad aprobada (fase ejecución)
app.post(
  '/auditorias/:id/tareas',
  zValidator(
    'json',
    z.object({
      area: z.string().min(2).max(80),
      titulo: z.string().min(3),
      descripcion: z.string().optional(),
      asignadoA: z.string().uuid(),
      fechaInicio: z.string().datetime().optional().or(z.literal('')),
      vencimiento: z.string().datetime().optional().or(z.literal('')),
      riesgoId: z.string().uuid().optional(),
      papelTrabajoId: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (!row.auditoria.materialidadAprobada) {
      return c.json(
        {
          error: {
            code: 'MATERIALIDAD_NO_APROBADA',
            message: 'No se pueden asignar tareas hasta aprobar la materialidad',
          },
        },
        409,
      )
    }

    if (!(await usuarioDeFirma(body.asignadoA, firmaId))) {
      return c.json(
        { error: { code: 'USUARIO_INVALIDO', message: 'El responsable no pertenece a la firma' } },
        400,
      )
    }

    if (!(await areaValidaParaFirma(firmaId, body.area))) {
      return c.json({ error: ERROR_AREA_INVALIDA }, 400)
    }

    const [tarea] = await db
      .insert(tareas)
      .values({
        auditoriaId: id,
        area: body.area,
        titulo: body.titulo,
        descripcion: body.descripcion ?? null,
        riesgoId: body.riesgoId ?? null,
        papelTrabajoId: body.papelTrabajoId ?? null,
        asignadoA: body.asignadoA,
        fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
        vencimiento: body.vencimiento ? new Date(body.vencimiento) : null,
      })
      .returning()

    registrarEvento(c.get('user'), {
      accion: 'tarea.crear',
      entidad: 'tarea',
      entidadId: tarea.id,
      auditoriaId: id,
      detalle: { titulo: tarea.titulo, area: tarea.area, asignadoA: tarea.asignadoA },
    })

    return c.json({ data: tarea }, 201)
  },
)

// GET /papeles/:papelId/tareas — asignaciones que cuelgan de un papel
app.get('/papeles/:papelId/tareas', async (c) => {
  const { firmaId } = c.get('user')
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  const lista = await db
    .select()
    .from(tareas)
    .where(eq(tareas.papelTrabajoId, papelId))
    .orderBy(desc(tareas.createdAt))

  return c.json({ data: lista })
})

// PUT /tareas/:tareaId
app.put(
  '/tareas/:tareaId',
  zValidator(
    'json',
    z.object({
      area: z.string().min(2).max(80).optional(),
      titulo: z.string().min(3).optional(),
      descripcion: z.string().optional(),
      asignadoA: z.string().uuid().optional(),
      estado: z.enum(['pendiente', 'en_progreso', 'completada']).optional(),
      fechaInicio: z.string().datetime().optional().or(z.literal('')),
      vencimiento: z.string().datetime().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const tareaId = c.req.param('tareaId')
    const body = c.req.valid('json')

    const tarea = await cargarTarea(tareaId, firmaId)
    if (!tarea) return c.json({ error: { code: 'NOT_FOUND', message: 'Tarea no encontrada' } }, 404)
    if (await encargoCerrado(tarea.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    if (body.asignadoA && !(await usuarioDeFirma(body.asignadoA, firmaId))) {
      return c.json(
        { error: { code: 'USUARIO_INVALIDO', message: 'El responsable no pertenece a la firma' } },
        400,
      )
    }

    if (body.area && !(await areaValidaParaFirma(firmaId, body.area))) {
      return c.json({ error: ERROR_AREA_INVALIDA }, 400)
    }

    const updates: Record<string, string | Date | null> = {}
    if (body.area) updates.area = body.area
    if (body.titulo) updates.titulo = body.titulo
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion || null
    if (body.asignadoA) updates.asignadoA = body.asignadoA
    if (body.estado) updates.estado = body.estado
    if (body.fechaInicio !== undefined) {
      updates.fechaInicio = body.fechaInicio ? new Date(body.fechaInicio) : null
    }
    if (body.vencimiento !== undefined) {
      updates.vencimiento = body.vencimiento ? new Date(body.vencimiento) : null
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizada] = await db
      .update(tareas)
      .set(updates)
      .where(eq(tareas.id, tareaId))
      .returning()

    registrarEvento(c.get('user'), {
      accion: 'tarea.editar',
      entidad: 'tarea',
      entidadId: tareaId,
      auditoriaId: tarea.auditoriaId,
      detalle: { campos: Object.keys(updates) },
    })

    return c.json({ data: actualizada })
  },
)

// ─── Respuestas al riesgo (enlace riesgo → tarea/papel) ──────────────────────

// GET /auditorias/:id/riesgos-respuestas — conteo de respuestas por riesgo
app.get('/auditorias/:id/riesgos-respuestas', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const ps = await db
    .select({ riesgoId: papelesTrabajo.riesgoId })
    .from(papelesTrabajo)
    .where(eq(papelesTrabajo.auditoriaId, id))

  // La respuesta al riesgo son las pruebas (papeles). Las tareas cuelgan del papel.
  const mapa: Record<string, { papeles: number }> = {}
  for (const p of ps) if (p.riesgoId) (mapa[p.riesgoId] ??= { papeles: 0 }).papeles++

  return c.json({ data: mapa })
})

// GET /riesgos/:riesgoId/respuestas — tareas y papeles que atienden un riesgo
app.get('/riesgos/:riesgoId/respuestas', async (c) => {
  const { firmaId } = c.get('user')
  const riesgoId = c.req.param('riesgoId')

  const [own] = await db
    .select({ id: riesgos.id })
    .from(riesgos)
    .innerJoin(auditorias, eq(riesgos.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(riesgos.id, riesgoId), eq(empresas.firmaId, firmaId)))
  if (!own) return c.json({ error: { code: 'NOT_FOUND', message: 'Riesgo no encontrado' } }, 404)

  const ps = await db
    .select()
    .from(papelesTrabajo)
    .where(eq(papelesTrabajo.riesgoId, riesgoId))
    .orderBy(desc(papelesTrabajo.createdAt))

  // Conteo de tareas por papel (un papel puede tener varias asignaciones).
  const tareasRows = await db
    .select({ papelTrabajoId: tareas.papelTrabajoId })
    .from(tareas)
    .where(eq(tareas.riesgoId, riesgoId))
  const numTareas: Record<string, number> = {}
  for (const t of tareasRows) if (t.papelTrabajoId) numTareas[t.papelTrabajoId] = (numTareas[t.papelTrabajoId] ?? 0) + 1

  const papeles = ps.map((p) => ({ ...p, numTareas: numTareas[p.id] ?? 0 }))
  return c.json({ data: { papeles } })
})

// DELETE /tareas/:tareaId
app.delete('/tareas/:tareaId', async (c) => {
  const user = c.get('user')
  const tareaId = c.req.param('tareaId')

  const tarea = await cargarTarea(tareaId, user.firmaId)
  if (!tarea) return c.json({ error: { code: 'NOT_FOUND', message: 'Tarea no encontrada' } }, 404)
  if (await encargoCerrado(tarea.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  await db.delete(tareas).where(eq(tareas.id, tareaId))

  registrarEvento(user, {
    accion: 'tarea.eliminar',
    entidad: 'tarea',
    entidadId: tareaId,
    auditoriaId: tarea.auditoriaId,
    detalle: { titulo: tarea.titulo, estado: tarea.estado },
  })

  return c.json({ data: { id: tareaId } })
})

export default app
