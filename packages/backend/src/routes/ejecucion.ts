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
  controlesCoso,
  tareas,
  usuarios,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const AREAS = [
  'efectivo', 'cartera', 'inventarios', 'propiedad_planta_equipo', 'proveedores',
  'nomina', 'impuestos', 'ingresos', 'gastos', 'patrimonio', 'otro',
] as const

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

// POST /auditorias/:id/papeles — Regla: requiere materialidad aprobada (fase ejecución)
app.post(
  '/auditorias/:id/papeles',
  zValidator(
    'json',
    z.object({
      area: z.enum(AREAS),
      titulo: z.string().min(3),
      procedimiento: z.string().optional(),
      alcance: z.string().optional(),
      hallazgos: z.string().optional(),
      conclusion: z.string().optional(),
    }),
  ),
  async (c) => {
    const { firmaId, sub } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

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

    const [papel] = await db
      .insert(papelesTrabajo)
      .values({
        auditoriaId: id,
        area: body.area,
        titulo: body.titulo,
        procedimiento: body.procedimiento ?? null,
        alcance: body.alcance ?? null,
        hallazgos: body.hallazgos ?? null,
        conclusion: body.conclusion ?? null,
        preparadoPor: sub,
      })
      .returning()

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
      area: z.enum(AREAS).optional(),
      titulo: z.string().min(3).optional(),
      procedimiento: z.string().optional(),
      alcance: z.string().optional(),
      hallazgos: z.string().optional(),
      conclusion: z.string().optional(),
      estado: z.enum(['borrador', 'en_revision']).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    const row = await cargarPapel(papelId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

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

    const updates: Record<string, string | null> = {}
    if (body.area) updates.area = body.area
    if (body.titulo) updates.titulo = body.titulo
    if (body.procedimiento !== undefined) updates.procedimiento = body.procedimiento || null
    if (body.alcance !== undefined) updates.alcance = body.alcance || null
    if (body.hallazgos !== undefined) updates.hallazgos = body.hallazgos || null
    if (body.conclusion !== undefined) updates.conclusion = body.conclusion || null
    if (body.estado) updates.estado = body.estado

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db
      .update(papelesTrabajo)
      .set(updates)
      .where(eq(papelesTrabajo.id, papelId))
      .returning()

    return c.json({ data: actualizado })
  },
)

// POST /papeles/:papelId/aprobar — Regla: solo el socio responsable
app.post('/papeles/:papelId/aprobar', async (c) => {
  const { firmaId, sub, rol } = c.get('user')
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  if (rol !== 'socio') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el socio responsable puede aprobar papeles de trabajo' } },
      403,
    )
  }

  const [aprobado] = await db
    .update(papelesTrabajo)
    .set({ estado: 'aprobado', aprobadoPor: sub, aprobadoAt: new Date() })
    .where(eq(papelesTrabajo.id, papelId))
    .returning()

  return c.json({ data: aprobado })
})

// POST /papeles/:papelId/reabrir — vuelve a borrador (solo socio)
app.post('/papeles/:papelId/reabrir', async (c) => {
  const { firmaId, rol } = c.get('user')
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  if (rol !== 'socio') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el socio responsable puede reabrir un papel aprobado' } },
      403,
    )
  }

  const [reabierto] = await db
    .update(papelesTrabajo)
    .set({ estado: 'borrador', aprobadoPor: null, aprobadoAt: null })
    .where(eq(papelesTrabajo.id, papelId))
    .returning()

  return c.json({ data: reabierto })
})

// DELETE /papeles/:papelId — borra el papel y sus evidencias
app.delete('/papeles/:papelId', async (c) => {
  const { firmaId } = c.get('user')
  const papelId = c.req.param('papelId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  if (row.papel.estado === 'aprobado') {
    return c.json(
      { error: { code: 'PAPEL_APROBADO', message: 'No se puede eliminar un papel aprobado' } },
      409,
    )
  }

  await db.delete(evidencias).where(eq(evidencias.papelTrabajoId, papelId))
  await db.delete(papelesTrabajo).where(eq(papelesTrabajo.id, papelId))

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
    const { firmaId } = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    const row = await cargarPapel(papelId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

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

    return c.json({ data: evidencia }, 201)
  },
)

// DELETE /papeles/:papelId/evidencias/:evidenciaId
app.delete('/papeles/:papelId/evidencias/:evidenciaId', async (c) => {
  const { firmaId } = c.get('user')
  const papelId = c.req.param('papelId')
  const evidenciaId = c.req.param('evidenciaId')

  const row = await cargarPapel(papelId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

  const [eliminada] = await db
    .delete(evidencias)
    .where(and(eq(evidencias.id, evidenciaId), eq(evidencias.papelTrabajoId, papelId)))
    .returning()

  if (!eliminada) return c.json({ error: { code: 'NOT_FOUND', message: 'Evidencia no encontrada' } }, 404)

  return c.json({ data: { id: evidenciaId } })
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
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const componente = c.req.param('componente') as (typeof COMPONENTES)[number]
    const body = c.req.valid('json')

    if (!COMPONENTES.includes(componente)) {
      return c.json({ error: { code: 'COMPONENTE_INVALIDO', message: 'Componente COSO no válido' } }, 400)
    }

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

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
      area: z.enum(AREAS),
      titulo: z.string().min(3),
      descripcion: z.string().optional(),
      asignadoA: z.string().uuid(),
      vencimiento: z.string().datetime().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

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

    const [tarea] = await db
      .insert(tareas)
      .values({
        auditoriaId: id,
        area: body.area,
        titulo: body.titulo,
        descripcion: body.descripcion ?? null,
        asignadoA: body.asignadoA,
        vencimiento: body.vencimiento ? new Date(body.vencimiento) : null,
      })
      .returning()

    return c.json({ data: tarea }, 201)
  },
)

// PUT /tareas/:tareaId
app.put(
  '/tareas/:tareaId',
  zValidator(
    'json',
    z.object({
      area: z.enum(AREAS).optional(),
      titulo: z.string().min(3).optional(),
      descripcion: z.string().optional(),
      asignadoA: z.string().uuid().optional(),
      estado: z.enum(['pendiente', 'en_progreso', 'completada']).optional(),
      vencimiento: z.string().datetime().optional().or(z.literal('')),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const tareaId = c.req.param('tareaId')
    const body = c.req.valid('json')

    const tarea = await cargarTarea(tareaId, firmaId)
    if (!tarea) return c.json({ error: { code: 'NOT_FOUND', message: 'Tarea no encontrada' } }, 404)

    if (body.asignadoA && !(await usuarioDeFirma(body.asignadoA, firmaId))) {
      return c.json(
        { error: { code: 'USUARIO_INVALIDO', message: 'El responsable no pertenece a la firma' } },
        400,
      )
    }

    const updates: Record<string, string | Date | null> = {}
    if (body.area) updates.area = body.area
    if (body.titulo) updates.titulo = body.titulo
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion || null
    if (body.asignadoA) updates.asignadoA = body.asignadoA
    if (body.estado) updates.estado = body.estado
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

    return c.json({ data: actualizada })
  },
)

// DELETE /tareas/:tareaId
app.delete('/tareas/:tareaId', async (c) => {
  const { firmaId } = c.get('user')
  const tareaId = c.req.param('tareaId')

  const tarea = await cargarTarea(tareaId, firmaId)
  if (!tarea) return c.json({ error: { code: 'NOT_FOUND', message: 'Tarea no encontrada' } }, 404)

  await db.delete(tareas).where(eq(tareas.id, tareaId))
  return c.json({ data: { id: tareaId } })
})

export default app
