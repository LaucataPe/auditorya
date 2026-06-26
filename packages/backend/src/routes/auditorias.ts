import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { auditorias, empresas, materialidades, riesgos } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { sugerirRiesgos } from '../lib/ia'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Carga una auditoría verificando que su empresa pertenezca a la firma del usuario. */
async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias, empresa: empresas })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

const NIVEL_PESO = { bajo: 1, medio: 2, alto: 3 } as const
type Nivel = keyof typeof NIVEL_PESO

/**
 * Combina riesgo inherente y de control en el riesgo combinado (RMM).
 * Matriz: suma 2→bajo, 3-4→medio, 5-6→alto.
 */
function combinarRiesgo(inherente: Nivel, control: Nivel): Nivel {
  const suma = NIVEL_PESO[inherente] + NIVEL_PESO[control]
  if (suma <= 2) return 'bajo'
  if (suma <= 4) return 'medio'
  return 'alto'
}

// ─── Auditorías (CRUD) ───────────────────────────────────────────────────────

// GET /empresas/:empresaId/auditorias
app.get('/empresas/:empresaId/auditorias', async (c) => {
  const { firmaId } = c.get('user')
  const empresaId = c.req.param('empresaId')

  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, empresaId), eq(empresas.firmaId, firmaId)))

  if (!empresa) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  const lista = await db
    .select()
    .from(auditorias)
    .where(eq(auditorias.empresaId, empresaId))
    .orderBy(desc(auditorias.createdAt))

  return c.json({ data: lista })
})

// POST /empresas/:empresaId/auditorias — Regla: solo si el encargo fue aceptado
app.post(
  '/empresas/:empresaId/auditorias',
  zValidator(
    'json',
    z.object({
      periodo: z.string().min(4),
      tipo: z.enum(['financiera', 'integral', 'especial']),
      socioId: z.string().uuid(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const empresaId = c.req.param('empresaId')
    const body = c.req.valid('json')

    const [empresa] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.id, empresaId), eq(empresas.firmaId, firmaId)))

    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    if (empresa.estadoEncargo !== 'aceptado') {
      return c.json(
        {
          error: {
            code: 'ENCARGO_NO_ACEPTADO',
            message: 'No se puede crear una auditoría si el encargo no ha sido aceptado',
          },
        },
        409,
      )
    }

    const [auditoria] = await db
      .insert(auditorias)
      .values({ empresaId, socioId: body.socioId, periodo: body.periodo, tipo: body.tipo })
      .returning()

    return c.json({ data: auditoria }, 201)
  },
)

// GET /auditorias/:id
app.get('/auditorias/:id', async (c) => {
  const { firmaId } = c.get('user')
  const row = await cargarAuditoria(c.req.param('id'), firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }
  return c.json({ data: { ...row.auditoria, empresa: row.empresa } })
})

// PUT /auditorias/:id — avanzar de fase. Regla: no pasar a ejecución sin materialidad aprobada
app.put(
  '/auditorias/:id',
  zValidator(
    'json',
    z.object({
      estado: z.enum(['planificacion', 'ejecucion', 'revision', 'finalizada']),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const { estado } = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const avanzaAEjecucionOmas = ['ejecucion', 'revision', 'finalizada'].includes(estado)
    if (avanzaAEjecucionOmas && !row.auditoria.materialidadAprobada) {
      return c.json(
        {
          error: {
            code: 'MATERIALIDAD_NO_APROBADA',
            message: 'No se puede ejecutar la auditoría hasta aprobar la materialidad',
          },
        },
        409,
      )
    }

    const [actualizada] = await db
      .update(auditorias)
      .set({ estado })
      .where(eq(auditorias.id, id))
      .returning()

    return c.json({ data: actualizada })
  },
)

// ─── Materialidad (NIA 320) ──────────────────────────────────────────────────

// GET /auditorias/:id/materialidad
app.get('/auditorias/:id/materialidad', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const [materialidad] = await db
    .select()
    .from(materialidades)
    .where(eq(materialidades.auditoriaId, id))

  return c.json({ data: materialidad ?? null })
})

// POST /auditorias/:id/materialidad — crea o actualiza (upsert). Resetea la aprobación.
app.post(
  '/auditorias/:id/materialidad',
  zValidator(
    'json',
    z.object({
      baseCalculo: z.enum(['activos', 'ingresos', 'utilidad_antes_impuestos', 'patrimonio']),
      montoBase: z.number().positive(),
      porcentaje: z.number().positive().max(100),
      porcentajeDesempeno: z.number().positive().max(100),
      justificacion: z.string().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const materialidad = body.montoBase * (body.porcentaje / 100)
    const materialidadDesempeno = materialidad * (body.porcentajeDesempeno / 100)

    const valores = {
      baseCalculo: body.baseCalculo,
      montoBase: body.montoBase.toFixed(2),
      porcentaje: body.porcentaje.toFixed(2),
      materialidad: materialidad.toFixed(2),
      porcentajeDesempeno: body.porcentajeDesempeno.toFixed(2),
      materialidadDesempeno: materialidadDesempeno.toFixed(2),
      justificacion: body.justificacion ?? null,
      // Cualquier cambio invalida una aprobación previa.
      aprobada: false,
      aprobadaPor: null,
      aprobadaAt: null,
    }

    const [existente] = await db
      .select()
      .from(materialidades)
      .where(eq(materialidades.auditoriaId, id))

    let resultado
    if (existente) {
      ;[resultado] = await db
        .update(materialidades)
        .set(valores)
        .where(eq(materialidades.auditoriaId, id))
        .returning()
    } else {
      ;[resultado] = await db
        .insert(materialidades)
        .values({ auditoriaId: id, ...valores })
        .returning()
    }

    // Si se reedita, la auditoría vuelve a quedar bloqueada para ejecución.
    await db
      .update(auditorias)
      .set({ materialidadAprobada: false })
      .where(eq(auditorias.id, id))

    return c.json({ data: resultado })
  },
)

// POST /auditorias/:id/materialidad/aprobar — Regla: solo el socio responsable
app.post('/auditorias/:id/materialidad/aprobar', async (c) => {
  const { firmaId, sub, rol } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  if (rol !== 'socio') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el socio responsable puede aprobar la materialidad' } },
      403,
    )
  }

  const [materialidad] = await db
    .select()
    .from(materialidades)
    .where(eq(materialidades.auditoriaId, id))

  if (!materialidad) {
    return c.json(
      { error: { code: 'SIN_MATERIALIDAD', message: 'Primero debes calcular la materialidad' } },
      409,
    )
  }

  const [aprobada] = await db
    .update(materialidades)
    .set({ aprobada: true, aprobadaPor: sub, aprobadaAt: new Date() })
    .where(eq(materialidades.auditoriaId, id))
    .returning()

  await db
    .update(auditorias)
    .set({ materialidadAprobada: true })
    .where(eq(auditorias.id, id))

  return c.json({ data: aprobada })
})

// ─── Riesgos (NIA 315) ───────────────────────────────────────────────────────

const AREAS = [
  'efectivo',
  'cartera',
  'inventarios',
  'propiedad_planta_equipo',
  'proveedores',
  'nomina',
  'impuestos',
  'ingresos',
  'gastos',
  'patrimonio',
  'otro',
] as const

// GET /auditorias/:id/riesgos
app.get('/auditorias/:id/riesgos', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const lista = await db
    .select()
    .from(riesgos)
    .where(eq(riesgos.auditoriaId, id))
    .orderBy(desc(riesgos.createdAt))

  return c.json({ data: lista })
})

// POST /auditorias/:id/riesgos
app.post(
  '/auditorias/:id/riesgos',
  zValidator(
    'json',
    z.object({
      area: z.enum(AREAS),
      descripcion: z.string().min(3),
      riesgoInherente: z.enum(['bajo', 'medio', 'alto']),
      riesgoControl: z.enum(['bajo', 'medio', 'alto']),
      respuestaPlaneada: z.string().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const [riesgo] = await db
      .insert(riesgos)
      .values({
        auditoriaId: id,
        area: body.area,
        descripcion: body.descripcion,
        riesgoInherente: body.riesgoInherente,
        riesgoControl: body.riesgoControl,
        riesgoCombinado: combinarRiesgo(body.riesgoInherente, body.riesgoControl),
        respuestaPlaneada: body.respuestaPlaneada ?? null,
        origen: 'manual',
      })
      .returning()

    return c.json({ data: riesgo }, 201)
  },
)

// PUT /auditorias/:id/riesgos/:riesgoId
app.put(
  '/auditorias/:id/riesgos/:riesgoId',
  zValidator(
    'json',
    z.object({
      area: z.enum(AREAS).optional(),
      descripcion: z.string().min(3).optional(),
      riesgoInherente: z.enum(['bajo', 'medio', 'alto']).optional(),
      riesgoControl: z.enum(['bajo', 'medio', 'alto']).optional(),
      respuestaPlaneada: z.string().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const riesgoId = c.req.param('riesgoId')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    const [existente] = await db
      .select()
      .from(riesgos)
      .where(and(eq(riesgos.id, riesgoId), eq(riesgos.auditoriaId, id)))

    if (!existente) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Riesgo no encontrado' } }, 404)
    }

    const inherente = body.riesgoInherente ?? existente.riesgoInherente
    const control = body.riesgoControl ?? existente.riesgoControl

    const [actualizado] = await db
      .update(riesgos)
      .set({
        ...(body.area && { area: body.area }),
        ...(body.descripcion && { descripcion: body.descripcion }),
        riesgoInherente: inherente,
        riesgoControl: control,
        riesgoCombinado: combinarRiesgo(inherente, control),
        ...(body.respuestaPlaneada !== undefined && { respuestaPlaneada: body.respuestaPlaneada }),
      })
      .where(eq(riesgos.id, riesgoId))
      .returning()

    return c.json({ data: actualizado })
  },
)

// DELETE /auditorias/:id/riesgos/:riesgoId
app.delete('/auditorias/:id/riesgos/:riesgoId', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')
  const riesgoId = c.req.param('riesgoId')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const [eliminado] = await db
    .delete(riesgos)
    .where(and(eq(riesgos.id, riesgoId), eq(riesgos.auditoriaId, id)))
    .returning()

  if (!eliminado) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Riesgo no encontrado' } }, 404)
  }

  return c.json({ data: { id: riesgoId } })
})

// POST /auditorias/:id/riesgos/sugerir — IA stub: inserta riesgos típicos del sector
app.post('/auditorias/:id/riesgos/sugerir', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const sugerencias = sugerirRiesgos(row.empresa.sector)
  if (sugerencias.length === 0) {
    return c.json({ data: [] })
  }

  const insertados = await db
    .insert(riesgos)
    .values(
      sugerencias.map((s) => ({
        auditoriaId: id,
        area: s.area,
        descripcion: s.descripcion,
        riesgoInherente: s.riesgoInherente,
        // El control aún no se ha evaluado; se asume 'alto' por defecto hasta que el auditor lo ajuste.
        riesgoControl: 'alto' as const,
        riesgoCombinado: combinarRiesgo(s.riesgoInherente, 'alto'),
        respuestaPlaneada: s.respuestaPlaneada,
        origen: 'sugerido' as const,
      })),
    )
    .returning()

  return c.json({ data: insertados }, 201)
})

export default app
