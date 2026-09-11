/**
 * Modo agéntico — rutas nuevas (las existentes no cambian):
 *  - GET  /auditorias/:id/agente/resumen                → contadores "Te toca / Hecho", por paso, última corrida
 *  - GET  /auditorias/:id/agente/propuestas?paso=&estado= → propuestas con bitácora
 *  - POST /auditorias/:id/agente/corridas               → corre el procedimiento de balance (0 tokens)
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
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { esSocioResponsable } from '../lib/permisos'
import { registrarEvento } from '../lib/eventos'
import { correrProcedimientoBalance, intentosAgotados } from '../lib/agente/corrida-balance'
import type { JwtPayload } from '../lib/jwt'
import type { LineaBitacora, PropuestaAgente, CorridaAgente, ResumenAgente } from '@auditorya/types'

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

async function ultimaCorrida(auditoriaId: string): Promise<CorridaAgente | null> {
  const [c] = await db
    .select().from(corridasAgente)
    .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, 'balance')))
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
    const vacio: ResumenAgente = { activado: false, teToca: 0, hecho: 0, porPaso: {}, corrida: null }
    return c.json({ data: vacio })
  }
  const filas = await db
    .select({ paso: propuestasAgente.paso, estado: propuestasAgente.estado, n: sql<number>`count(*)::int` })
    .from(propuestasAgente).where(eq(propuestasAgente.auditoriaId, id)).groupBy(propuestasAgente.paso, propuestasAgente.estado)
  const porPaso: ResumenAgente['porPaso'] = {}
  let teToca = 0, decididas = 0
  for (const f of filas) {
    const p = (porPaso[f.paso] ??= { pendientes: 0, decididas: 0 })
    if (f.estado === 'propuesta') { p.pendientes += f.n; teToca += f.n }
    else if (f.estado === 'aprobada' || f.estado === 'ajustada' || f.estado === 'descartada') { p.decididas += f.n; decididas += f.n }
  }
  // "Hecho" = lo que hizo el agente en la última corrida + las decisiones tomadas por personas.
  const corrida = await ultimaCorrida(id)
  const data: ResumenAgente = { activado: true, teToca, hecho: (corrida?.bitacora.length ?? 0) + decididas, porPaso, corrida }
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

    const [actualizada] = await db
      .update(propuestasAgente)
      .set({ ...set, decididaPor: decision === 'retomar' ? null : user.sub, decididaAt: decision === 'retomar' ? null : new Date() })
      .where(eq(propuestasAgente.id, id)).returning()

    const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${bitacoraAgente.numero}),0)::int` }).from(bitacoraAgente).where(eq(bitacoraAgente.propuestaId, id))
    await db.insert(bitacoraAgente).values({ auditoriaId: p.auditoriaId, propuestaId: id, corridaId: p.corridaId, numero: Number(max) + 1, tipo: 'humano', texto, referencia: { decision }, actor: 'usuario', usuarioId: user.sub })

    registrarEvento(user, { accion: `propuesta.${decision}`, entidad: 'propuesta_agente', entidadId: id, auditoriaId: p.auditoriaId, detalle: { tipo: p.tipo, codigo: p.codigo, motivo: motivo ?? null } })

    const bit = (await bitacoraDe({ propuestaIds: [id] })).get(id) ?? []
    return c.json({ data: aPropuesta(actualizada, bit), aviso })
  },
)

export default app
