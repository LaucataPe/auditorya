import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import {
  auditorias,
  empresas,
  firmas,
  informes,
  controlesCoso,
  papelesTrabajo,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { generarContenido } from '../lib/plantillas-informe'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const TIPOS = ['dictamen', 'carta_control_interno', 'carta_representaciones'] as const

const COMPONENTE_LABEL: Record<string, string> = {
  ambiente_control: 'Ambiente de control',
  evaluacion_riesgos: 'Evaluación de riesgos',
  actividades_control: 'Actividades de control',
  informacion_comunicacion: 'Información y comunicación',
  supervision: 'Supervisión / Monitoreo',
}

const AREA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', cartera: 'Cartera', inventarios: 'Inventarios',
  propiedad_planta_equipo: 'Propiedad, planta y equipo', proveedores: 'Proveedores',
  nomina: 'Nómina', impuestos: 'Impuestos', ingresos: 'Ingresos', gastos: 'Gastos',
  patrimonio: 'Patrimonio', otro: 'Otro',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias, empresa: empresas })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

async function cargarInforme(informeId: string, firmaId: string) {
  const [row] = await db
    .select({ informe: informes, auditoria: auditorias })
    .from(informes)
    .innerJoin(auditorias, eq(informes.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(informes.id, informeId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GET /auditorias/:id/informes
app.get('/auditorias/:id/informes', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db.select().from(informes).where(eq(informes.auditoriaId, id))
  return c.json({ data: lista })
})

// POST /auditorias/:id/informes/:tipo/generar — crea/regenera el borrador desde plantilla
app.post(
  '/auditorias/:id/informes/:tipo/generar',
  zValidator(
    'json',
    z.object({
      tipoOpinion: z.enum(['limpia', 'con_salvedades', 'negativa', 'abstencion']).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const tipo = c.req.param('tipo') as (typeof TIPOS)[number]
    const { tipoOpinion } = c.req.valid('json')

    if (!TIPOS.includes(tipo)) {
      return c.json({ error: { code: 'TIPO_INVALIDO', message: 'Tipo de informe no válido' } }, 400)
    }

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

    if (!row.auditoria.materialidadAprobada) {
      return c.json(
        {
          error: {
            code: 'MATERIALIDAD_NO_APROBADA',
            message: 'Completa la planificación (materialidad aprobada) antes de generar informes',
          },
        },
        409,
      )
    }

    const [existente] = await db
      .select()
      .from(informes)
      .where(and(eq(informes.auditoriaId, id), eq(informes.tipo, tipo)))

    if (existente?.estado === 'aprobado') {
      return c.json(
        { error: { code: 'INFORME_APROBADO', message: 'El informe ya fue aprobado. Reábrelo para regenerarlo.' } },
        409,
      )
    }

    const [firma] = await db.select().from(firmas).where(eq(firmas.id, firmaId))

    // Contexto para la carta de control interno: deficiencias COSO + hallazgos
    let deficienciasCoso: { titulo: string; calificacion: string; observaciones: string | null }[] = []
    let hallazgos: { area: string; titulo: string; hallazgos: string | null }[] = []
    if (tipo === 'carta_control_interno') {
      const coso = await db
        .select()
        .from(controlesCoso)
        .where(
          and(
            eq(controlesCoso.auditoriaId, id),
            inArray(controlesCoso.calificacion, ['con_deficiencias', 'deficiente']),
          ),
        )
      deficienciasCoso = coso.map((x) => ({
        titulo: COMPONENTE_LABEL[x.componente] ?? x.componente,
        calificacion: x.calificacion,
        observaciones: x.observaciones,
      }))

      const papeles = await db
        .select()
        .from(papelesTrabajo)
        .where(eq(papelesTrabajo.auditoriaId, id))
      hallazgos = papeles
        .filter((p) => (p.hallazgos ?? '').trim().length > 0)
        .map((p) => ({ area: AREA_LABEL[p.area] ?? p.area, titulo: p.titulo, hallazgos: p.hallazgos }))
    }

    const contenido = generarContenido(tipo, {
      firmaNombre: firma?.nombre ?? '',
      firmaCiudad: firma?.ciudad ?? '',
      empresaNombre: row.empresa.nombre,
      empresaNit: row.empresa.nit,
      marcoContable: row.empresa.marcoContable,
      periodo: row.auditoria.periodo,
      tipoOpinion: tipo === 'dictamen' ? tipoOpinion ?? 'limpia' : null,
      deficienciasCoso,
      hallazgos,
    })

    const valores = {
      contenido,
      tipoOpinion: tipo === 'dictamen' ? tipoOpinion ?? 'limpia' : null,
      estado: 'borrador' as const,
    }

    let resultado
    if (existente) {
      ;[resultado] = await db
        .update(informes)
        .set(valores)
        .where(eq(informes.id, existente.id))
        .returning()
    } else {
      ;[resultado] = await db
        .insert(informes)
        .values({ auditoriaId: id, tipo, ...valores })
        .returning()
    }

    return c.json({ data: resultado })
  },
)

// PUT /informes/:informeId — editar contenido / tipo de opinión
app.put(
  '/informes/:informeId',
  zValidator(
    'json',
    z.object({
      contenido: z.record(z.string(), z.string()).optional(),
      tipoOpinion: z.enum(['limpia', 'con_salvedades', 'negativa', 'abstencion']).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const informeId = c.req.param('informeId')
    const body = c.req.valid('json')

    const row = await cargarInforme(informeId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Informe no encontrado' } }, 404)

    if (row.informe.estado === 'aprobado') {
      return c.json(
        { error: { code: 'INFORME_APROBADO', message: 'Un informe aprobado no puede editarse. Reábrelo primero.' } },
        409,
      )
    }

    const updates: Record<string, unknown> = {}
    if (body.contenido) updates.contenido = body.contenido
    if (body.tipoOpinion !== undefined) updates.tipoOpinion = body.tipoOpinion

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db
      .update(informes)
      .set(updates)
      .where(eq(informes.id, informeId))
      .returning()

    return c.json({ data: actualizado })
  },
)

// POST /informes/:informeId/aprobar — Regla: solo el socio responsable
app.post('/informes/:informeId/aprobar', async (c) => {
  const { firmaId, sub, rol } = c.get('user')
  const informeId = c.req.param('informeId')

  const row = await cargarInforme(informeId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Informe no encontrado' } }, 404)

  if (rol !== 'socio') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el socio responsable puede aprobar el informe' } },
      403,
    )
  }

  const [aprobado] = await db
    .update(informes)
    .set({ estado: 'aprobado', aprobadoPor: sub, aprobadoAt: new Date() })
    .where(eq(informes.id, informeId))
    .returning()

  return c.json({ data: aprobado })
})

// POST /informes/:informeId/reabrir — vuelve a borrador (solo socio)
app.post('/informes/:informeId/reabrir', async (c) => {
  const { firmaId, rol } = c.get('user')
  const informeId = c.req.param('informeId')

  const row = await cargarInforme(informeId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Informe no encontrado' } }, 404)

  if (rol !== 'socio') {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el socio responsable puede reabrir el informe' } },
      403,
    )
  }

  const [reabierto] = await db
    .update(informes)
    .set({ estado: 'borrador', aprobadoPor: null, aprobadoAt: null })
    .where(eq(informes.id, informeId))
    .returning()

  return c.json({ data: reabierto })
})

export default app
