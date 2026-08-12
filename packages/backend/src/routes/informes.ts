import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import {
  auditorias,
  empresas,
  firmas,
  informes,
  controlesCoso,
  papelesTrabajo,
  hallazgos,
  hallazgosAI,
  entendimientoPeriodo,
  materialidades,
  riesgos,
  tareas,
  usuarios,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { esSocioResponsable, ERROR_NO_SOCIO_RESPONSABLE } from '../lib/permisos'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { registrarEvento } from '../lib/eventos'
import { generarContenido } from '../lib/plantillas-informe'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const TIPOS_RF = ['dictamen', 'carta_control_interno', 'carta_representaciones'] as const
const TIPOS_AI = ['informe_ai'] as const
const TIPOS_PLANEACION = ['memo_planeacion', 'carta_encargo'] as const
const TIPOS = [...TIPOS_RF, ...TIPOS_AI, ...TIPOS_PLANEACION] as const
// Documentos de planeación exentos del gate de materialidad
const TIPOS_SIN_GATE = new Set<string>(['memo_planeacion', 'carta_encargo'])

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
    const user = c.get('user')
    const { firmaId } = user
    const id = c.req.param('id')
    const tipo = c.req.param('tipo') as (typeof TIPOS)[number]
    const { tipoOpinion } = c.req.valid('json')

    if (!TIPOS.includes(tipo as (typeof TIPOS)[number])) {
      return c.json({ error: { code: 'TIPO_INVALIDO', message: 'Tipo de informe no válido' } }, 400)
    }

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    // La gate de materialidad solo aplica a Revisoría Fiscal; los documentos de planeación
    // (carta de encargo, memo) se eximen porque se generan antes de aprobar la materialidad.
    if (
      row.auditoria.tipoServicio === 'revisoria_fiscal' &&
      !TIPOS_SIN_GATE.has(tipo) &&
      !row.auditoria.materialidadAprobada
    ) {
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

    let deficienciasCoso: { titulo: string; calificacion: string; observaciones: string | null }[] = []
    let hallazgosNarrativa: { area: string; titulo: string; hallazgos: string | null }[] = []
    let deficienciasHallazgos: { area: string; condicion: string; criterio: string | null; causa: string | null; efecto: string | null; recomendacion: string | null; severidad: string }[] = []
    let hallazgosAIData: { titulo: string; nivelRiesgo: string; condicion: string; criterio: string; causa: string; efecto: string; recomendacion: string }[] = []

    // Datos de planeación para el memo (NIA 300)
    let memoData: {
      socioNombre?: string
      entendimiento?: { cambiosSignificativos: string | null; eventosSignificativos: string | null; notas: string | null; sinCambios: boolean } | null
      materialidad?: { baseCalculo: string; montoBase: string; porcentaje: string; materialidad: string; porcentajeDesempeno: string; materialidadDesempeno: string; justificacion: string | null; aprobada: boolean } | null
      riesgosResumen?: { area: string; descripcion: string; combinado: string; respuesta: string | null }[]
      cosoResumen?: { titulo: string; calificacion: string; observaciones: string | null }[]
      cronogramaResumen?: { total: number; agendados: number; desde: string | null; hasta: string | null } | null
    } = {}

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
      hallazgosNarrativa = papeles
        .filter((p) => (p.hallazgos ?? '').trim().length > 0)
        .map((p) => ({ area: AREA_LABEL[p.area] ?? p.area, titulo: p.titulo, hallazgos: p.hallazgos }))

      // Hallazgos estructurados tipo "deficiencia de control" → carta NIA 265.
      // Las incorrecciones no entran aquí (van a la hoja de ajustes / dictamen).
      const deficiencias = await db
        .select()
        .from(hallazgos)
        .where(and(eq(hallazgos.auditoriaId, id), eq(hallazgos.tipo, 'deficiencia')))
        .orderBy(desc(hallazgos.createdAt))
      deficienciasHallazgos = deficiencias.map((h) => ({
        area: AREA_LABEL[h.area] ?? h.area,
        condicion: h.descripcion,
        criterio: h.criterio,
        causa: h.causa,
        efecto: h.efecto,
        recomendacion: h.recomendacion,
        severidad: h.severidad,
      }))
    }

    if (tipo === 'informe_ai') {
      const hAI = await db.select().from(hallazgosAI).where(eq(hallazgosAI.auditoriaId, id))
      hallazgosAIData = hAI.map((h) => ({
        titulo: h.titulo,
        nivelRiesgo: h.nivelRiesgo,
        condicion: h.condicion,
        criterio: h.criterio,
        causa: h.causa,
        efecto: h.efecto,
        recomendacion: h.recomendacion,
      }))
    }

    if (tipo === 'memo_planeacion') {
      const ORDEN: Record<string, number> = { alto: 0, medio: 1, bajo: 2 }
      const [ent, mat, rs, coso, ts, ps, socio] = await Promise.all([
        db.select().from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, id)),
        db.select().from(materialidades).where(eq(materialidades.auditoriaId, id)),
        db.select().from(riesgos).where(eq(riesgos.auditoriaId, id)),
        db.select().from(controlesCoso).where(eq(controlesCoso.auditoriaId, id)),
        db.select().from(tareas).where(eq(tareas.auditoriaId, id)),
        db.select().from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)),
        db.select().from(usuarios).where(eq(usuarios.id, row.auditoria.socioId)),
      ])

      const inicios = [
        ...ts.map((t) => t.fechaInicio),
        ...ps.map((p) => p.fechaInicio),
      ].filter((d): d is Date => !!d).map((d) => d.getTime())
      const fines = [
        ...ts.map((t) => t.vencimiento),
        ...ps.map((p) => p.fechaFin),
      ].filter((d): d is Date => !!d).map((d) => d.getTime())
      const agendados =
        ts.filter((t) => t.fechaInicio && t.vencimiento).length +
        ps.filter((p) => p.fechaInicio && p.fechaFin).length

      memoData = {
        socioNombre: socio[0]?.nombre,
        entendimiento: ent[0]
          ? { cambiosSignificativos: ent[0].cambiosSignificativos, eventosSignificativos: ent[0].eventosSignificativos, notas: ent[0].notas, sinCambios: ent[0].sinCambios }
          : null,
        materialidad: mat[0]
          ? { baseCalculo: mat[0].baseCalculo, montoBase: mat[0].montoBase, porcentaje: mat[0].porcentaje, materialidad: mat[0].materialidad, porcentajeDesempeno: mat[0].porcentajeDesempeno, materialidadDesempeno: mat[0].materialidadDesempeno, justificacion: mat[0].justificacion, aprobada: mat[0].aprobada }
          : null,
        riesgosResumen: rs
          .slice()
          .sort((a, b) => (ORDEN[a.riesgoCombinado] ?? 3) - (ORDEN[b.riesgoCombinado] ?? 3))
          .map((r) => ({ area: AREA_LABEL[r.area] ?? r.area, descripcion: r.descripcion, combinado: r.riesgoCombinado, respuesta: r.respuestaPlaneada })),
        cosoResumen: coso.map((x) => ({ titulo: COMPONENTE_LABEL[x.componente] ?? x.componente, calificacion: x.calificacion, observaciones: x.observaciones })),
        cronogramaResumen: {
          total: ts.length + ps.length,
          agendados,
          desde: inicios.length ? new Date(Math.min(...inicios)).toISOString() : null,
          hasta: fines.length ? new Date(Math.max(...fines)).toISOString() : null,
        },
      }
    }

    if (tipo === 'carta_encargo') {
      const [socio] = await db.select().from(usuarios).where(eq(usuarios.id, row.auditoria.socioId))
      memoData = { socioNombre: socio?.nombre }
    }

    const contenido = generarContenido(tipo as (typeof TIPOS)[number], {
      firmaNombre: firma?.nombre ?? '',
      firmaCiudad: firma?.ciudad ?? '',
      empresaNombre: row.empresa.nombre,
      empresaNit: row.empresa.nit,
      marcoContable: row.empresa.marcoContable,
      periodo: String(new Date(row.auditoria.fechaFin + 'T00:00:00').getFullYear()),
      tipoOpinion: tipo === 'dictamen' ? tipoOpinion ?? 'limpia' : null,
      deficienciasCoso,
      hallazgos: hallazgosNarrativa,
      deficienciasHallazgos,
      hallazgosAI: hallazgosAIData,
      ...memoData,
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

    registrarEvento(user, {
      accion: 'informe.generar',
      entidad: 'informe',
      entidadId: resultado.id,
      auditoriaId: id,
      detalle: { tipo, tipoOpinion: valores.tipoOpinion, regenerado: !!existente },
    })

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
    const user = c.get('user')
    const informeId = c.req.param('informeId')
    const body = c.req.valid('json')

    const row = await cargarInforme(informeId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Informe no encontrado' } }, 404)
    if (await encargoCerrado(row.informe.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

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

    registrarEvento(user, {
      accion: 'informe.editar',
      entidad: 'informe',
      entidadId: informeId,
      auditoriaId: row.informe.auditoriaId,
      detalle: { tipo: row.informe.tipo, campos: Object.keys(updates) },
    })

    return c.json({ data: actualizado })
  },
)

// POST /informes/:informeId/aprobar — Regla: solo el socio responsable
app.post('/informes/:informeId/aprobar', async (c) => {
  const user = c.get('user')
  const { firmaId, sub } = user
  const informeId = c.req.param('informeId')

  const row = await cargarInforme(informeId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Informe no encontrado' } }, 404)

  if (!esSocioResponsable(user, row.auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }
  if (await encargoCerrado(row.informe.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  const [aprobado] = await db
    .update(informes)
    .set({ estado: 'aprobado', aprobadoPor: sub, aprobadoAt: new Date() })
    .where(eq(informes.id, informeId))
    .returning()

  registrarEvento(user, {
    accion: 'informe.aprobar',
    entidad: 'informe',
    entidadId: informeId,
    auditoriaId: row.informe.auditoriaId,
    detalle: { tipo: row.informe.tipo, tipoOpinion: row.informe.tipoOpinion },
  })

  return c.json({ data: aprobado })
})

// POST /informes/:informeId/reabrir — vuelve a borrador (solo socio)
app.post('/informes/:informeId/reabrir', async (c) => {
  const user = c.get('user')
  const { firmaId } = user
  const informeId = c.req.param('informeId')

  const row = await cargarInforme(informeId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Informe no encontrado' } }, 404)

  if (!esSocioResponsable(user, row.auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }
  if (await encargoCerrado(row.informe.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

  const [reabierto] = await db
    .update(informes)
    .set({ estado: 'borrador', aprobadoPor: null, aprobadoAt: null })
    .where(eq(informes.id, informeId))
    .returning()

  registrarEvento(user, {
    accion: 'informe.reabrir',
    entidad: 'informe',
    entidadId: informeId,
    auditoriaId: row.informe.auditoriaId,
    detalle: { tipo: row.informe.tipo },
  })

  return c.json({ data: reabierto })
})

export default app
