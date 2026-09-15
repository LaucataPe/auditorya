/**
 * Modo agéntico — rutas nuevas (las existentes no cambian):
 *  - GET  /auditorias/:id/agente/resumen                → contadores "Te toca / Hecho", por paso, última corrida
 *  - GET  /auditorias/:id/agente/propuestas?paso=&estado= → propuestas con bitácora
 *  - POST /auditorias/:id/agente/corridas               → corre el procedimiento de balance (0 tokens)
 *  - POST /auditorias/:id/agente/corridas/riesgos       → propone riesgos desde hallazgos, entendimiento, COSO y sector (0 tokens)
 *  - POST /propuestas/:id/decidir                       → aprobar / ajustar / omitir / descartar / retomar
 * Todas exigen encargo con agente_activado.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { zValidator } from '../lib/validacion'
import { db } from '../db/client'
import {
  auditorias, empresas, usuarios, materialidades, corridasAgente, propuestasAgente, bitacoraAgente,
  documentosEmpresa, entendimientoPeriodo, memoriaEmpresaAgente, cuentasBalance, cuentasBalanceComparativo, riesgos,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { esSocioResponsable } from '../lib/permisos'
import { registrarEvento } from '../lib/eventos'
import { correrProcedimientoBalance, intentosAgotados } from '../lib/agente/corrida-balance'
import { correrIdentificacionRiesgosEncargo, hayCorridaRiesgos, PROCEDIMIENTO_RIESGOS } from '../lib/agente/corrida-riesgos'
import { areaValidaParaFirma, ERROR_AREA_INVALIDA } from '../lib/areas'
import type { JwtPayload } from '../lib/jwt'
import { nivelCombinado, type LineaBitacora, type PropuestaAgente, type CorridaAgente, type ResumenAgente, type ArranqueAgente, type ContenidoPropuesta } from '@auditorya/types'

const app = new Hono<{ Variables: { user: JwtPayload } }>()
app.use('*', authMiddleware)

const ERROR_AGENTE_NO_ACTIVADO = { code: 'AGENTE_NO_ACTIVADO', message: 'Este encargo no tiene activado el acompañamiento del agente' } as const

async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias, empresa: empresas })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

async function bitacoraDe(filtro: { propuestaIds?: string[]; corridaId?: string }): Promise<Map<string, LineaBitacora[]>> {
  const out = new Map<string, LineaBitacora[]>()
  const cond = filtro.propuestaIds
    ? (filtro.propuestaIds.length ? inArray(bitacoraAgente.propuestaId, filtro.propuestaIds) : sql`false`)
    : and(eq(bitacoraAgente.corridaId, filtro.corridaId!), sql`${bitacoraAgente.propuestaId} is null`)
  const rows = await db
    .select({ b: bitacoraAgente, usuarioNombre: usuarios.nombre })
    .from(bitacoraAgente)
    .leftJoin(usuarios, eq(bitacoraAgente.usuarioId, usuarios.id))
    .where(cond)
    .orderBy(asc(bitacoraAgente.numero), asc(bitacoraAgente.createdAt))
  for (const { b, usuarioNombre } of rows) {
    const key = b.propuestaId ?? b.corridaId ?? ''
    const arr = out.get(key) ?? []
    arr.push({ numero: b.numero, tipo: b.tipo, texto: b.texto, referencia: b.referencia, actor: b.actor, usuarioNombre, createdAt: b.createdAt.toISOString() })
    out.set(key, arr)
  }
  return out
}

function aPropuesta(row: typeof propuestasAgente.$inferSelect, bitacora: LineaBitacora[], desbloquea?: { codigo: string | null; titulo: string } | null): PropuestaAgente {
  return {
    id: row.id, auditoriaId: row.auditoriaId, corridaId: row.corridaId, paso: row.paso, tipo: row.tipo, codigo: row.codigo, titulo: row.titulo,
    cuentaCodigo: row.cuentaCodigo, monto: row.monto == null ? null : Number(row.monto), severidad: row.severidad, certeza: row.certeza,
    reglas: row.reglas, datos: row.datos, contenido: row.contenido as PropuestaAgente['contenido'], estado: row.estado,
    desbloqueaId: row.desbloqueaId, desbloqueaCodigo: desbloquea?.codigo ?? null, desbloqueaTitulo: desbloquea?.titulo ?? null,
    entidadDestino: row.entidadDestino, entidadDestinoId: row.entidadDestinoId, decididaPor: row.decididaPor,
    decididaAt: row.decididaAt?.toISOString() ?? null, motivoDecision: row.motivoDecision, orden: row.orden, createdAt: row.createdAt.toISOString(), bitacora,
  }
}

async function ultimaCorrida(auditoriaId: string, procedimiento: string = 'balance'): Promise<CorridaAgente | null> {
  const [c] = await db
    .select().from(corridasAgente)
    .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, procedimiento)))
    .orderBy(desc(corridasAgente.createdAt)).limit(1)
  if (!c) return null
  const bit = (await bitacoraDe({ corridaId: c.id })).get(c.id) ?? []
  return {
    id: c.id, procedimiento: c.procedimiento, estado: c.estado, archivoNombre: c.archivoNombre, filas: c.filas, filasHoja: c.filasHoja,
    filasResumen: c.filasResumen, parametros: c.parametros, resultado: c.resultado, error: c.error,
    iniciadaAt: c.iniciadaAt?.toISOString() ?? null, terminadaAt: c.terminadaAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), bitacora: bit,
  }
}

// GET /auditorias/:id/agente/resumen
app.get('/auditorias/:id/agente/resumen', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')
  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!row.auditoria.agenteActivado) {
    const vacio: ResumenAgente = { activado: false, teToca: 0, hecho: 0, porPaso: {}, corrida: null, corridaRiesgos: null }
    return c.json({ data: vacio })
  }
  const filas = await db
    .select({ paso: propuestasAgente.paso, estado: propuestasAgente.estado, humana: sql<boolean>`${propuestasAgente.decididaPor} is not null`, n: sql<number>`count(*)::int` })
    .from(propuestasAgente).where(eq(propuestasAgente.auditoriaId, id)).groupBy(propuestasAgente.paso, propuestasAgente.estado, sql`${propuestasAgente.decididaPor} is not null`)
  const porPaso: ResumenAgente['porPaso'] = {}
  let teToca = 0, decididas = 0
  for (const f of filas) {
    const p = (porPaso[f.paso] ??= { pendientes: 0, decididas: 0 })
    if (f.estado === 'propuesta') { p.pendientes += f.n; teToca += f.n }
    // Solo cuentan las decisiones de personas: lo que el agente reemplazó en una corrida nueva no tiene decidida_por.
    else if (f.humana && (f.estado === 'aprobada' || f.estado === 'ajustada' || f.estado === 'descartada')) { p.decididas += f.n; decididas += f.n }
  }
  // "Hecho" = lo que hizo el agente en la última corrida + las decisiones tomadas por personas.
  const [corrida, corridaRiesgos] = await Promise.all([ultimaCorrida(id), ultimaCorrida(id, PROCEDIMIENTO_RIESGOS)])
  const data: ResumenAgente = { activado: true, teToca, hecho: (corrida?.bitacora.length ?? 0) + (corridaRiesgos?.bitacora.length ?? 0) + decididas, porPaso, corrida, corridaRiesgos }
  return c.json({ data })
})

// GET /auditorias/:id/agente/propuestas?paso=balance&estado=propuesta|todas
app.get('/auditorias/:id/agente/propuestas', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')
  const paso = c.req.query('paso') ?? null
  const estado = c.req.query('estado') ?? 'propuesta'
  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!row.auditoria.agenteActivado) return c.json({ error: ERROR_AGENTE_NO_ACTIVADO }, 409)

  const conds = [eq(propuestasAgente.auditoriaId, id)]
  if (paso) conds.push(eq(propuestasAgente.paso, paso))
  if (estado !== 'todas') conds.push(eq(propuestasAgente.estado, estado as typeof propuestasAgente.$inferSelect.estado))
  const rows = await db.select().from(propuestasAgente).where(and(...conds)).orderBy(asc(propuestasAgente.orden), asc(propuestasAgente.createdAt))
  const bit = await bitacoraDe({ propuestaIds: rows.map((r) => r.id) })
  const desbloqueaIds = rows.map((r) => r.desbloqueaId).filter((x): x is string => !!x)
  const refs = desbloqueaIds.length
    ? await db.select({ id: propuestasAgente.id, codigo: propuestasAgente.codigo, titulo: propuestasAgente.titulo }).from(propuestasAgente).where(inArray(propuestasAgente.id, desbloqueaIds))
    : []
  const refPorId = new Map(refs.map((r) => [r.id, r]))
  return c.json({ data: rows.map((r) => aPropuesta(r, bit.get(r.id) ?? [], r.desbloqueaId ? refPorId.get(r.desbloqueaId) ?? null : null)) })
})

// POST /auditorias/:id/agente/corridas — corre (o vuelve a correr) la validación del balance
app.post('/auditorias/:id/agente/corridas', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const row = await cargarAuditoria(id, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!row.auditoria.agenteActivado) return c.json({ error: ERROR_AGENTE_NO_ACTIVADO }, 409)
  if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)
  if (await intentosAgotados(id)) {
    return c.json({ error: { code: 'AGENTE_INTENTOS_AGOTADOS', message: 'La revisión del balance falló tres veces seguidas. Revisa el balance importado o contacta soporte.' } }, 409)
  }
  try {
    const r = await correrProcedimientoBalance(id, user)
    return c.json({ data: r }, 201)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al correr la revisión'
    const sinBalance = msg.includes('no tiene balance')
    return c.json({ error: { code: sinBalance ? 'SIN_BALANCE' : 'AGENTE_ERROR', message: sinBalance ? msg : 'La revisión del balance no pudo completarse. Quedó registrada para reintentar.' } }, sinBalance ? 409 : 500)
  }
})

// POST /auditorias/:id/agente/corridas/riesgos — propone (o vuelve a proponer) los riesgos del encargo
app.post('/auditorias/:id/agente/corridas/riesgos', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const row = await cargarAuditoria(id, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!row.auditoria.agenteActivado) return c.json({ error: ERROR_AGENTE_NO_ACTIVADO }, 409)
  if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)
  try {
    const r = await correrIdentificacionRiesgosEncargo(id, user)
    return c.json({ data: r }, 201)
  } catch {
    return c.json({ error: { code: 'AGENTE_ERROR', message: 'La propuesta de riesgos no pudo completarse. Quedó registrada para reintentar.' } }, 500)
  }
})

// POST /propuestas/:id/decidir
app.post(
  '/propuestas/:id/decidir',
  zValidator('json', z.object({
    decision: z.enum(['aprobar', 'ajustar', 'omitir', 'descartar', 'retomar']),
    motivo: z.string().max(1000).optional(),
    ajustes: z.object({
      titulo: z.string().min(3).optional(),
      descripcion: z.string().optional(),
      severidad: z.enum(['alta', 'media', 'baja']).optional(),
      /** Para tipo materialidad: valores elegidos por el socio. */
      materialidad: z.object({ montoBase: z.number().positive(), porcentaje: z.number().positive().max(100), porcentajeDesempeno: z.number().positive().max(100) }).optional(),
      /** Para tipo riesgo: valores elegidos por el auditor. */
      riesgo: z.object({
        area: z.string().min(2).max(80).optional(),
        riesgoInherente: z.enum(['bajo', 'medio', 'alto']).optional(),
        riesgoControl: z.enum(['bajo', 'medio', 'alto']).optional(),
        respuestaPlaneada: z.string().max(2000).optional(),
      }).optional(),
    }).optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const { decision, motivo, ajustes } = c.req.valid('json')

    const [p] = await db.select().from(propuestasAgente).where(eq(propuestasAgente.id, id))
    if (!p) return c.json({ error: { code: 'NOT_FOUND', message: 'Propuesta no encontrada' } }, 404)
    const row = await cargarAuditoria(p.auditoriaId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Propuesta no encontrada' } }, 404)
    if (await encargoCerrado(p.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const abierta = p.estado === 'propuesta' || p.estado === 'omitida'
    if (decision === 'retomar') {
      if (p.estado !== 'omitida') return c.json({ error: { code: 'ESTADO_INVALIDO', message: 'Solo se retoma una propuesta omitida' } }, 409)
    } else if (!abierta) {
      return c.json({ error: { code: 'ESTADO_INVALIDO', message: 'Esta propuesta ya fue decidida' } }, 409)
    }

    const [usuario] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, user.sub))
    const nombre = usuario?.nombre ?? 'Usuario'
    let texto = ''
    let set: Partial<typeof propuestasAgente.$inferInsert> = {}
    let aviso: string | null = null

    if (decision === 'omitir') { set = { estado: 'omitida' }; texto = `${nombre} omitió la propuesta por ahora${motivo ? `: ${motivo}` : ''}.` }
    if (decision === 'retomar') { set = { estado: 'propuesta' }; texto = `${nombre} retomó la propuesta.` }
    if (decision === 'descartar') { set = { estado: 'descartada', motivoDecision: motivo ?? null }; texto = `${nombre} descartó la propuesta${motivo ? `: ${motivo}` : ''}.` }
    if (decision === 'ajustar') {
      const contenido = { ...(p.contenido as Record<string, unknown>) }
      if (ajustes?.descripcion) contenido.descripcion = ajustes.descripcion
      set = { estado: 'ajustada', motivoDecision: motivo ?? null, titulo: ajustes?.titulo ?? p.titulo, severidad: ajustes?.severidad ?? p.severidad, contenido }
      const cambios = [ajustes?.titulo ? 'título' : null, ajustes?.descripcion ? 'descripción' : null, ajustes?.severidad ? `severidad → ${ajustes.severidad}` : null].filter(Boolean).join(', ')
      texto = `${nombre} aprobó con ajustes (${cambios || 'sin cambios de texto'})${motivo ? `: ${motivo}` : ''}.`
    }
    if (decision === 'aprobar') {
      set = { estado: 'aprobada', motivoDecision: motivo ?? null }
      texto = `${nombre} aprobó la propuesta${motivo ? `: ${motivo}` : ''}.`
    }

    // Materialidad: al aprobar (o ajustar) se escribe en la tabla de siempre. Si quien decide es el
    // socio responsable, queda aprobada en el mismo clic; si no, queda calculada y pendiente de él.
    if (p.tipo === 'materialidad' && (decision === 'aprobar' || decision === 'ajustar')) {
      const prop = (p.contenido as { materialidad?: { baseCalculo: 'activos' | 'ingresos' | 'utilidad_antes_impuestos' | 'patrimonio'; montoBase: number; porcentaje: number; porcentajeDesempeno: number; justificacion: string } }).materialidad
      if (!prop) return c.json({ error: { code: 'PROPUESTA_INVALIDA', message: 'La propuesta no trae valores de materialidad' } }, 409)
      const montoBase = ajustes?.materialidad?.montoBase ?? prop.montoBase
      const porcentaje = ajustes?.materialidad?.porcentaje ?? prop.porcentaje
      const porcentajeDesempeno = ajustes?.materialidad?.porcentajeDesempeno ?? prop.porcentajeDesempeno
      const materialidad = montoBase * (porcentaje / 100)
      const materialidadDesempeno = materialidad * (porcentajeDesempeno / 100)
      const socio = esSocioResponsable(user, row.auditoria)
      const valores = {
        baseCalculo: prop.baseCalculo, montoBase: montoBase.toFixed(2), porcentaje: porcentaje.toFixed(2), materialidad: materialidad.toFixed(2),
        porcentajeDesempeno: porcentajeDesempeno.toFixed(2), materialidadDesempeno: materialidadDesempeno.toFixed(2),
        justificacion: `${prop.justificacion} Propuesta por el agente y ${socio ? 'aprobada' : 'confirmada'} por ${nombre}.`,
        aprobada: socio, aprobadaPor: socio ? user.sub : null, aprobadaAt: socio ? new Date() : null,
      }
      const [existente] = await db.select({ id: materialidades.id }).from(materialidades).where(eq(materialidades.auditoriaId, p.auditoriaId))
      const [mat] = existente
        ? await db.update(materialidades).set(valores).where(eq(materialidades.auditoriaId, p.auditoriaId)).returning()
        : await db.insert(materialidades).values({ auditoriaId: p.auditoriaId, ...valores }).returning()
      await db.update(auditorias).set({ materialidadAprobada: socio }).where(eq(auditorias.id, p.auditoriaId))
      set.entidadDestino = 'materialidad'; set.entidadDestinoId = mat.id
      texto += socio ? ` Materialidad ${valores.materialidad} escrita y aprobada.` : ` Materialidad ${valores.materialidad} escrita; falta la aprobación del socio responsable.`
      aviso = socio ? null : 'La materialidad quedó calculada. Solo el socio responsable puede aprobarla.'
      registrarEvento(user, { accion: socio ? 'materialidad.aprobar' : 'materialidad.calcular', entidad: 'materialidad', entidadId: mat.id, auditoriaId: p.auditoriaId, detalle: { materialidad: valores.materialidad, base: valores.baseCalculo, origen: 'agente' } })
    }

    // Riesgo: aprobar (o ajustar) escribe en la matriz de riesgos de siempre, con su respuesta planeada.
    if (p.tipo === 'riesgo' && (decision === 'aprobar' || decision === 'ajustar')) {
      const prop = (p.contenido as ContenidoPropuesta).riesgo
      if (!prop) return c.json({ error: { code: 'PROPUESTA_INVALIDA', message: 'La propuesta no trae valores de riesgo' } }, 409)
      const area = ajustes?.riesgo?.area ?? prop.area
      if (!(await areaValidaParaFirma(user.firmaId, area))) return c.json({ error: ERROR_AREA_INVALIDA }, 400)
      const inherente = ajustes?.riesgo?.riesgoInherente ?? prop.riesgoInherente
      const control = ajustes?.riesgo?.riesgoControl ?? prop.riesgoControl
      const combinado = nivelCombinado(inherente, control)
      const respuesta = ajustes?.riesgo?.respuestaPlaneada ?? prop.respuestaPlaneada
      const descripcion = ajustes?.descripcion ?? (p.contenido as ContenidoPropuesta).descripcion ?? p.titulo
      const [riesgo] = await db.insert(riesgos).values({
        auditoriaId: p.auditoriaId, area, descripcion, riesgoInherente: inherente, riesgoControl: control, riesgoCombinado: combinado,
        respuestaPlaneada: respuesta || null, origen: prop.fuente.tipo === 'hallazgo' ? 'analitico' : 'sugerido',
      }).returning()
      set.entidadDestino = 'riesgo'; set.entidadDestinoId = riesgo.id
      set.contenido = { ...(set.contenido ?? (p.contenido as Record<string, unknown>)), riesgo: { ...prop, area, riesgoInherente: inherente, riesgoControl: control, riesgoCombinado: combinado, respuestaPlaneada: respuesta } }
      texto += ` Riesgo ${combinado} en ${area} escrito en la matriz de riesgos.`
      registrarEvento(user, { accion: 'riesgo.crear', entidad: 'riesgo', entidadId: riesgo.id, auditoriaId: p.auditoriaId, detalle: { area, combinado, origen: 'agente', fuente: prop.fuente.tipo, codigo: p.codigo } })
    }

    // Entendimiento: aprobar (o ajustar) el juicio confirma el entendimiento del período en la tabla de siempre.
    const destino = (p.contenido as { destino?: string }).destino
    if (p.tipo === 'juicio' && destino === 'entendimiento' && (decision === 'aprobar' || decision === 'ajustar')) {
      const [ent] = await db.select().from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, p.auditoriaId))
      const cambios = ajustes?.descripcion ?? ent?.cambiosSignificativos ?? null
      const valores = { cambiosSignificativos: cambios, sinCambios: !cambios, confirmado: true }
      const [row2] = ent
        ? await db.update(entendimientoPeriodo).set(valores).where(eq(entendimientoPeriodo.auditoriaId, p.auditoriaId)).returning()
        : await db.insert(entendimientoPeriodo).values({ auditoriaId: p.auditoriaId, ...valores }).returning()
      set.entidadDestino = 'entendimiento'; set.entidadDestinoId = row2.id
      texto += ' Entendimiento del período confirmado.'
      registrarEvento(user, { accion: 'entendimiento.guardar', entidad: 'entendimiento_periodo', entidadId: row2.id, auditoriaId: p.auditoriaId, detalle: { confirmado: true, origen: 'agente' } })
    }

    const [actualizada] = await db
      .update(propuestasAgente)
      .set({ ...set, decididaPor: decision === 'retomar' ? null : user.sub, decididaAt: decision === 'retomar' ? null : new Date() })
      .where(eq(propuestasAgente.id, id)).returning()

    const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${bitacoraAgente.numero}),0)::int` }).from(bitacoraAgente).where(eq(bitacoraAgente.propuestaId, id))
    await db.insert(bitacoraAgente).values({ auditoriaId: p.auditoriaId, propuestaId: id, corridaId: p.corridaId, numero: Number(max) + 1, tipo: 'humano', texto, referencia: { decision }, actor: 'usuario', usuarioId: user.sub })

    registrarEvento(user, { accion: `propuesta.${decision}`, entidad: 'propuesta_agente', entidadId: id, auditoriaId: p.auditoriaId, detalle: { tipo: p.tipo, codigo: p.codigo, motivo: motivo ?? null } })

    // El agente sigue solo: con la materialidad decidida propone los riesgos, y si ya los propuso,
    // cada hallazgo del balance que decidas los vuelve a calcular (lo decidido se conserva).
    let riesgosPropuestos: number | null = null
    if (decision === 'aprobar' || decision === 'ajustar' || decision === 'descartar') {
      try {
        if (p.tipo === 'materialidad' && (decision === 'aprobar' || decision === 'ajustar')) {
          riesgosPropuestos = (await correrIdentificacionRiesgosEncargo(p.auditoriaId, user)).propuestas
        } else if (p.tipo === 'hallazgo' && p.paso === 'balance' && (await hayCorridaRiesgos(p.auditoriaId))) {
          riesgosPropuestos = (await correrIdentificacionRiesgosEncargo(p.auditoriaId, user)).propuestas
        }
      } catch (err) {
        console.error('[agente] no se pudieron proponer riesgos tras la decisión', p.auditoriaId, (err as Error).message)
      }
    }

    const bit = (await bitacoraDe({ propuestaIds: [id] })).get(id) ?? []
    return c.json({ data: aPropuesta(actualizada, bit), aviso, riesgosPropuestos })
  },
)

// ─── Arranque guiado ─────────────────────────────────────────────────────────

const ORDEN_PASOS = ['entendimiento', 'balance', 'materialidad', 'riesgos', 'pbc']

// GET /auditorias/:id/agente/arranque
app.get('/auditorias/:id/agente/arranque', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')
  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!row.auditoria.agenteActivado) return c.json({ error: ERROR_AGENTE_NO_ACTIVADO }, 409)
  const e = row.empresa
  const [docs, [ent], memoria, [bal], [comp], pendientes] = await Promise.all([
    db.select({ tipo: documentosEmpresa.tipo }).from(documentosEmpresa).where(eq(documentosEmpresa.empresaId, e.id)),
    db.select().from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, id)),
    db.select().from(memoriaEmpresaAgente).where(eq(memoriaEmpresaAgente.empresaId, e.id)),
    db.select({ id: cuentasBalance.id }).from(cuentasBalance).where(eq(cuentasBalance.auditoriaId, id)).limit(1),
    db.select({ id: cuentasBalanceComparativo.id }).from(cuentasBalanceComparativo).where(eq(cuentasBalanceComparativo.auditoriaId, id)).limit(1),
    db.select().from(propuestasAgente).where(and(eq(propuestasAgente.auditoriaId, id), eq(propuestasAgente.estado, 'propuesta'))).orderBy(asc(propuestasAgente.orden)),
  ])
  const tipos = new Set(docs.map((d) => d.tipo))
  const corrida = await ultimaCorrida(id)
  const primera = [...pendientes].sort((a, b) => ORDEN_PASOS.indexOf(a.paso) - ORDEN_PASOS.indexOf(b.paso) || a.orden - b.orden)[0] ?? null
  const mat = pendientes.find((p) => p.tipo === 'materialidad')
  const data: ArranqueAgente = {
    completado: !!row.auditoria.arranqueCompletadoAt,
    empresa: { nombre: e.nombre, sector: e.sector, ciiu: e.ciiu, actividadEconomica: e.actividadEconomica, marcoContable: e.marcoContable, ciudad: e.ciudad },
    documentos: { rut: tipos.has('rut'), camaraComercio: tipos.has('camara_comercio'), estadosAnteriores: tipos.has('estados_financieros_anteriores') },
    entendimiento: ent ? { cambiosSignificativos: ent.cambiosSignificativos, sinCambios: ent.sinCambios, confirmado: ent.confirmado } : null,
    memoria: Object.fromEntries(memoria.map((m) => [m.clave, m.valor])),
    balanceCargado: !!bal, comparativoCargado: !!comp, corrida,
    teToca: pendientes.length,
    hallazgosAltos: pendientes.filter((p) => p.tipo === 'hallazgo' && p.severidad === 'alta').length,
    materialidadPropuesta: mat?.monto != null ? Number(mat.monto) : null,
    documentosPedidos: pendientes.filter((p) => p.tipo === 'documento').length,
    primeraDecision: primera ? { paso: primera.paso, codigo: primera.codigo, titulo: primera.titulo, severidad: primera.severidad, monto: primera.monto == null ? null : Number(primera.monto) } : null,
  }
  return c.json({ data })
})

// POST /auditorias/:id/agente/arranque/empresa — lo que el auditor sabe de la empresa este año
app.post(
  '/auditorias/:id/agente/arranque/empresa',
  zValidator('json', z.object({
    cambios: z.string().max(4000).optional(),
    provisionaRenta: z.enum(['mensual', 'cierre', 'no_se']).optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const { cambios, provisionaRenta } = c.req.valid('json')
    const row = await cargarAuditoria(id, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (!row.auditoria.agenteActivado) return c.json({ error: ERROR_AGENTE_NO_ACTIVADO }, 409)
    if (await encargoCerrado(id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)

    const texto = (cambios ?? '').trim()
    const [usuario] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, user.sub))
    const nombre = usuario?.nombre ?? 'El auditor'

    // Entendimiento del período: con cambios queda pendiente de confirmar; sin cambios queda confirmado.
    const valores = texto
      ? { cambiosSignificativos: texto, sinCambios: false, confirmado: false }
      : { cambiosSignificativos: null, sinCambios: true, confirmado: true }
    const [ent] = await db.select().from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, id))
    const [entRow] = ent
      ? await db.update(entendimientoPeriodo).set(valores).where(eq(entendimientoPeriodo.auditoriaId, id)).returning()
      : await db.insert(entendimientoPeriodo).values({ auditoriaId: id, ...valores }).returning()
    registrarEvento(user, { accion: 'entendimiento.guardar', entidad: 'entendimiento_periodo', entidadId: entRow.id, auditoriaId: id, detalle: { ...valores, origen: 'arranque' } })

    // Reemplaza un juicio de entendimiento abierto de un arranque anterior.
    await db.update(propuestasAgente)
      .set({ estado: 'descartada', motivoDecision: 'Reemplazada al repetir el arranque', decididaAt: new Date() })
      .where(and(eq(propuestasAgente.auditoriaId, id), eq(propuestasAgente.paso, 'entendimiento'), eq(propuestasAgente.estado, 'propuesta')))

    if (texto) {
      const e = row.empresa
      const [p] = await db.insert(propuestasAgente).values({
        auditoriaId: id, paso: 'entendimiento', tipo: 'juicio', codigo: 'E-01',
        titulo: 'Confirmar el entendimiento del período',
        datos: [
          { etiqueta: 'Sector', valor: e.sector + (e.ciiu ? ` · CIIU ${e.ciiu}` : '') },
          { etiqueta: 'Marco contable', valor: e.marcoContable },
          { etiqueta: 'Período', valor: `${row.auditoria.fechaInicio} a ${row.auditoria.fechaFin}` },
        ],
        contenido: {
          descripcion: texto,
          norma: 'NIA 315 · El entendimiento de la entidad y su entorno es la base para identificar riesgos de incorrección material.',
          para: 'Con esto confirmado, leo el balance sabiendo qué cambió este año y lo tengo en cuenta al clasificar los riesgos.',
          destino: 'entendimiento',
        },
        reglas: ['P-01'], orden: 0,
      }).returning({ id: propuestasAgente.id })
      const lineas = [
        { tipo: 'lectura' as const, texto: `Leí la ficha de ${e.nombre}: sector ${e.sector}${e.ciiu ? `, CIIU ${e.ciiu}` : ''}, marco ${e.marcoContable}.`, referencia: { paso: 'P-01', norma: 'NIA 315' } },
        { tipo: 'humano' as const, texto: `${nombre} reportó cambios del período en el arranque del encargo.`, referencia: { paso: 'P-01' } },
        { tipo: 'clasificacion' as const, texto: 'Dejé el entendimiento como propuesta para que lo confirmes o lo ajustes antes de seguir.', referencia: { norma: 'NIA 315' } },
      ]
      let n = 0
      for (const l of lineas) { n++; await db.insert(bitacoraAgente).values({ auditoriaId: id, propuestaId: p.id, numero: n, tipo: l.tipo, texto: l.texto, referencia: l.referencia, actor: l.tipo === 'humano' ? 'usuario' : 'agente', usuarioId: l.tipo === 'humano' ? user.sub : null }) }
    }

    if (provisionaRenta && provisionaRenta !== 'no_se') {
      await db.insert(memoriaEmpresaAgente)
        .values({ empresaId: row.empresa.id, clave: 'provisiona_renta', valor: { valor: provisionaRenta, fuente: 'arranque' }, actualizadoPor: user.sub })
        .onConflictDoUpdate({ target: [memoriaEmpresaAgente.empresaId, memoriaEmpresaAgente.clave], set: { valor: { valor: provisionaRenta, fuente: 'arranque' }, actualizadoPor: user.sub, updatedAt: new Date() } })
    }

    return c.json({ data: { entendimiento: { cambiosSignificativos: entRow.cambiosSignificativos, sinCambios: entRow.sinCambios, confirmado: entRow.confirmado }, pendienteConfirmar: !!texto } })
  },
)

// POST /auditorias/:id/agente/arranque/completar
app.post('/auditorias/:id/agente/arranque/completar', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  const row = await cargarAuditoria(id, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!row.auditoria.arranqueCompletadoAt) {
    await db.update(auditorias).set({ arranqueCompletadoAt: new Date() }).where(eq(auditorias.id, id))
    registrarEvento(user, { accion: 'agente.arranque_completado', entidad: 'auditoria', entidadId: id, auditoriaId: id })
  }
  return c.json({ data: { completado: true } })
})

export default app
