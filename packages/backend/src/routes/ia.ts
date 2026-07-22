/**
 * Funciones de IA (LLM vía OpenRouter) sobre una auditoría:
 *  - GET  /ia/estado                              → disponibilidad
 *  - POST /auditorias/:id/ia/sugerir-riesgos      → riesgos sugeridos con contexto real
 *  - POST /auditorias/:id/ia/analisis-balance     → lectura analítica del balance (NIA 520)
 *  - POST /auditorias/:id/ia/asistente            → asistente NIA con contexto del encargo
 *  - POST /papeles/:papelId/ia/redactar           → borrador de procedimiento/hallazgos/conclusión
 *
 * Todas responden 503 IA_NO_DISPONIBLE cuando no hay API key, salvo
 * sugerir-riesgos, que cae al catálogo estático por sector (fallback).
 */
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, isNull, lte } from 'drizzle-orm'
import { db } from '../db/client'
import {
  auditorias, empresas, materialidades, riesgos, papelesTrabajo,
  cuentasBalance, cuentasBalanceComparativo, balanceMeta, entendimientoPeriodo,
} from '../db/schema'
import { esClaseBalance } from '@auditorya/types'
import { authMiddleware } from '../middleware/auth'
import { iaDisponible, completarJSON, completarTexto, MODELO, type MensajeChat } from '../lib/llm'
import { sugerirRiesgos } from '../lib/ia'
import { registrarEvento } from '../lib/eventos'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const AREAS = [
  'efectivo', 'cartera', 'inventarios', 'propiedad_planta_equipo', 'proveedores',
  'nomina', 'impuestos', 'ingresos', 'gastos', 'patrimonio', 'otro',
] as const

const ERROR_IA = {
  code: 'IA_NO_DISPONIBLE',
  message: 'Las funciones de IA no están disponibles: configura OPENROUTER_API_KEY en el backend',
} as const

// ─── Helpers de contexto ─────────────────────────────────────────────────────

async function cargarAuditoria(auditoriaId: string, firmaId: string) {
  const [row] = await db
    .select({ auditoria: auditorias, empresa: empresas })
    .from(auditorias)
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(auditorias.id, auditoriaId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

/** Resumen compacto del balance para dar contexto a Claude sin gastar tokens de más. */
async function resumenBalance(auditoriaId: string): Promise<string> {
  const cuentas = await db
    .select()
    .from(cuentasBalance)
    .where(and(eq(cuentasBalance.auditoriaId, auditoriaId), lte(cuentasBalance.nivel, 4), isNull(cuentasBalance.tercero)))
    .orderBy(cuentasBalance.codigo)

  if (cuentas.length === 0) return ''

  const [mat] = await db.select().from(materialidades).where(eq(materialidades.auditoriaId, auditoriaId))
  const umbral = mat ? Number(mat.materialidadDesempeno || mat.materialidad) : null

  // Misma base de comparación que el análisis del balance: comparativo real del
  // año anterior si está cargado; sin él, el saldo inicial solo sirve en cuentas
  // de balance (en resultado no hay base y no se reporta variación).
  const comparativoRows = await db
    .select()
    .from(cuentasBalanceComparativo)
    .where(and(eq(cuentasBalanceComparativo.auditoriaId, auditoriaId), lte(cuentasBalanceComparativo.nivel, 4)))
  const compPorCodigo = new Map(comparativoRows.map((r) => [r.codigo, Number(r.saldo)]))
  const compCargado = comparativoRows.length > 0
  const [meta] = await db.select().from(balanceMeta).where(eq(balanceMeta.auditoriaId, auditoriaId))

  const filas = cuentas
    .map((ct) => {
      const actual = Number(ct.saldoActual)
      const base = compCargado
        ? (compPorCodigo.get(ct.codigo) ?? 0)
        : esClaseBalance(ct.codigo) ? Number(ct.saldoInicial) : null
      const varPct = base !== null && base !== 0 ? ((actual - base) / Math.abs(base)) * 100 : null
      return { ct, actual, base, varPct }
    })
    // Prioriza cuentas relevantes: significativas o con variación fuerte.
    .filter(({ actual, base, varPct }) =>
      (umbral !== null && Math.abs(actual) > umbral) ||
      (varPct !== null && Math.abs(varPct) >= 30) ||
      (base === 0 && actual !== 0),
    )
    .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))
    .slice(0, 40)
    .map(({ ct, actual, base, varPct }) => {
      const cmp = base !== null
        ? `, base ${Math.round(base).toLocaleString('es-CO')}${varPct !== null ? `, variación ${varPct.toFixed(0)}%` : base === 0 && actual !== 0 ? ' (cuenta nueva)' : ''}`
        : ' (sin base de comparación)'
      return `${ct.codigo} ${ct.nombre ?? ''}: actual ${Math.round(actual).toLocaleString('es-CO')}${cmp}`
    })

  const encabezado = umbral !== null
    ? `Materialidad de desempeño: ${Math.round(umbral).toLocaleString('es-CO')} COP.`
    : 'Materialidad aún no calculada.'
  const periodo = meta?.corteDesde || meta?.corteHasta
    ? `Período del balance: ${meta?.corteDesde ?? '?'} a ${meta?.corteHasta ?? '?'}.`
    : 'Período del balance no declarado.'
  const notaBase = compCargado
    ? 'La "base" de cada cuenta es el saldo al mismo corte del año anterior (balance comparativo).'
    : 'No hay balance comparativo del año anterior: la "base" es el saldo inicial del período y solo aplica a cuentas de balance (activo/pasivo/patrimonio); las cuentas de resultado no traen variación.'

  return `${encabezado}\n${periodo}\n${notaBase}\nCuentas destacadas del balance de prueba (PUC Colombia, saldos en COP):\n${filas.join('\n')}`
}

async function contextoEncargo(auditoriaId: string, firmaId: string) {
  const row = await cargarAuditoria(auditoriaId, firmaId)
  if (!row) return null

  const [ent] = await db
    .select()
    .from(entendimientoPeriodo)
    .where(eq(entendimientoPeriodo.auditoriaId, auditoriaId))

  const { empresa, auditoria } = row
  const lineas = [
    `Empresa: ${empresa.nombre} (NIT ${empresa.nit}). Sector: ${empresa.sector}.`,
    empresa.actividadEconomica ? `Actividad económica: ${empresa.actividadEconomica}.` : '',
    `Marco contable: ${empresa.marcoContable}. Período auditado: ${auditoria.fechaInicio} a ${auditoria.fechaFin}.`,
    `Tipo de servicio: ${auditoria.tipoServicio === 'auditoria_interna' ? 'auditoría interna (IPPF)' : 'revisoría fiscal / auditoría externa (NIA)'}.`,
    empresa.modeloNegocio ? `Modelo de negocio: ${empresa.modeloNegocio}` : '',
    empresa.entornoRegulatorio ? `Entorno regulatorio: ${empresa.entornoRegulatorio}` : '',
    ent?.cambiosSignificativos ? `Cambios significativos del período: ${ent.cambiosSignificativos}` : '',
    ent?.eventosSignificativos ? `Eventos significativos del período: ${ent.eventosSignificativos}` : '',
  ].filter(Boolean)

  return { row, texto: lineas.join('\n') }
}

const SYSTEM_AUDITOR = `Eres un auditor externo colombiano con 20 años de experiencia en firmas de auditoría, experto en Normas Internacionales de Auditoría (NIA), NIIF y normativa colombiana (revisoría fiscal, Ley 43 de 1990, Código de Comercio arts. 207-209, PUC).
Escribes en español profesional, preciso y conciso. Tus respuestas son un apoyo al juicio del auditor, nunca lo reemplazan.`

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GET /ia/estado
app.get('/ia/estado', (c) => {
  return c.json({ data: { disponible: iaDisponible(), modelo: iaDisponible() ? MODELO : null } })
})

const RiesgoIASchema = z.array(
  z.object({
    area: z.enum(AREAS),
    descripcion: z.string().min(10),
    riesgoInherente: z.enum(['bajo', 'medio', 'alto']),
    respuestaPlaneada: z.string().min(10),
  }),
).min(1).max(15)

// POST /auditorias/:id/ia/sugerir-riesgos — con contexto real; fallback catálogo
app.post('/auditorias/:id/ia/sugerir-riesgos', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const ctx = await contextoEncargo(id, user.firmaId)
  if (!ctx) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  // Sin API key: catálogo estático por sector (comportamiento previo).
  if (!iaDisponible()) {
    const catalogo = sugerirRiesgos(ctx.row.empresa.sector)
    return c.json({ data: { fuente: 'catalogo', riesgos: catalogo } })
  }

  const balance = await resumenBalance(id)
  const prompt = `Identifica los riesgos de incorrección material (NIA 315) más relevantes para esta auditoría.

CONTEXTO DEL ENCARGO:
${ctx.texto}
${balance ? `\nDATOS FINANCIEROS:\n${balance}` : '\n(No hay balance de prueba cargado; básate en el sector y el contexto.)'}

Devuelve SOLO un array JSON (sin texto adicional) de 5 a 10 riesgos, ordenados de mayor a menor prioridad. Cada elemento:
{"area": una de [${AREAS.join(', ')}], "descripcion": "riesgo específico citando cifras o cuentas cuando existan datos", "riesgoInherente": "bajo"|"medio"|"alto", "respuestaPlaneada": "procedimiento de auditoría concreto"}`

  try {
    const crudo = await completarJSON<unknown>({ system: SYSTEM_AUDITOR, prompt, inicioJson: '[' })
    const parseado = RiesgoIASchema.safeParse(crudo)
    if (!parseado.success) throw new Error('Respuesta de IA con formato inesperado')

    registrarEvento(user, {
      accion: 'ia.sugerir_riesgos',
      entidad: 'auditoria',
      entidadId: id,
      auditoriaId: id,
      detalle: { cantidad: parseado.data.length, conBalance: !!balance },
    })

    return c.json({ data: { fuente: 'ia', riesgos: parseado.data } })
  } catch (err) {
    console.error('[ia] sugerir-riesgos falló, usando catálogo:', (err as Error).message)
    const catalogo = sugerirRiesgos(ctx.row.empresa.sector)
    return c.json({ data: { fuente: 'catalogo', riesgos: catalogo } })
  }
})

// POST /auditorias/:id/ia/analisis-balance — lectura analítica (NIA 520)
app.post('/auditorias/:id/ia/analisis-balance', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const ctx = await contextoEncargo(id, user.firmaId)
  if (!ctx) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  if (!iaDisponible()) return c.json({ error: ERROR_IA }, 503)

  const balance = await resumenBalance(id)
  if (!balance) {
    return c.json({ error: { code: 'SIN_BALANCE', message: 'Carga primero el balance de prueba' } }, 409)
  }

  const respuesta = await completarTexto({
    system: SYSTEM_AUDITOR,
    mensajes: [{
      role: 'user',
      content: `Realiza una revisión analítica preliminar (NIA 520) de este balance de prueba. Estructura tu respuesta en:
1. Lectura general de la situación financiera
2. Variaciones y saldos que ameritan atención del auditor (explica por qué)
3. Posibles riesgos de incorrección material que se desprenden de los datos
4. Procedimientos sugeridos

CONTEXTO:
${ctx.texto}

${balance}`,
    }],
    maxTokens: 2500,
  })

  registrarEvento(user, { accion: 'ia.analisis_balance', entidad: 'auditoria', entidadId: id, auditoriaId: id })

  return c.json({ data: { analisis: respuesta } })
})

// POST /auditorias/:id/ia/asistente — asistente NIA con contexto del encargo
app.post(
  '/auditorias/:id/ia/asistente',
  zValidator(
    'json',
    z.object({
      pregunta: z.string().min(3).max(4000),
      historial: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) }))
        .max(20)
        .optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const id = c.req.param('id')
    const { pregunta, historial } = c.req.valid('json')

    const ctx = await contextoEncargo(id, user.firmaId)
    if (!ctx) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    if (!iaDisponible()) return c.json({ error: ERROR_IA }, 503)

    // Estado actual del encargo para respuestas situadas.
    const [riesgosRows, papelesRows] = await Promise.all([
      db.select({ area: riesgos.area, combinado: riesgos.riesgoCombinado }).from(riesgos).where(eq(riesgos.auditoriaId, id)),
      db.select({ estado: papelesTrabajo.estado }).from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)),
    ])

    const estado = `Estado del encargo: fase ${ctx.row.auditoria.estado}; ${riesgosRows.length} riesgos identificados (${riesgosRows.filter((r) => r.combinado === 'alto').length} altos); ${papelesRows.length} papeles de trabajo (${papelesRows.filter((p) => p.estado === 'aprobado').length} aprobados); materialidad ${ctx.row.auditoria.materialidadAprobada ? 'aprobada' : 'pendiente'}.`

    const mensajes: MensajeChat[] = [...(historial ?? []), { role: 'user', content: pregunta }]

    const respuesta = await completarTexto({
      system: `${SYSTEM_AUDITOR}

Actúas como asistente del equipo de auditoría dentro de la plataforma AuditorYa. Respondes dudas sobre NIA, procedimientos, normativa colombiana y sobre este encargo en particular. Si te preguntan algo fuera del ámbito de auditoría/contabilidad, redirige amablemente al tema.

CONTEXTO DEL ENCARGO:
${ctx.texto}
${estado}`,
      mensajes,
      maxTokens: 1500,
    })

    registrarEvento(user, { accion: 'ia.asistente', entidad: 'auditoria', entidadId: id, auditoriaId: id })

    return c.json({ data: { respuesta } })
  },
)

// POST /papeles/:papelId/ia/redactar — borrador de un campo del papel de trabajo
app.post(
  '/papeles/:papelId/ia/redactar',
  zValidator(
    'json',
    z.object({
      campo: z.enum(['procedimiento', 'alcance', 'hallazgos', 'conclusion']),
      indicaciones: z.string().max(2000).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const papelId = c.req.param('papelId')
    const { campo, indicaciones } = c.req.valid('json')

    if (!iaDisponible()) return c.json({ error: ERROR_IA }, 503)

    const [row] = await db
      .select({ papel: papelesTrabajo, auditoria: auditorias, empresa: empresas })
      .from(papelesTrabajo)
      .innerJoin(auditorias, eq(papelesTrabajo.auditoriaId, auditorias.id))
      .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
      .where(and(eq(papelesTrabajo.id, papelId), eq(empresas.firmaId, user.firmaId)))
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel de trabajo no encontrado' } }, 404)

    if (row.papel.estado === 'aprobado') {
      return c.json({ error: { code: 'PAPEL_APROBADO', message: 'El papel ya está aprobado' } }, 409)
    }

    let riesgoTexto = ''
    if (row.papel.riesgoId) {
      const [r] = await db.select().from(riesgos).where(eq(riesgos.id, row.papel.riesgoId))
      if (r) riesgoTexto = `Riesgo que atiende este papel: [${r.riesgoCombinado.toUpperCase()}] ${r.descripcion}`
    }

    const ETIQUETA: Record<typeof campo, string> = {
      procedimiento: 'el PROCEDIMIENTO de auditoría (pasos concretos, muestra, fuentes de evidencia)',
      alcance: 'el ALCANCE del trabajo (período cubierto, cuentas, muestra, límites)',
      hallazgos: 'los HALLAZGOS (redacción objetiva de lo observado; si no hay datos, deja la estructura con marcadores [___])',
      conclusion: 'la CONCLUSIÓN del papel de trabajo (juicio profesional sobre el objetivo, referencia a la evidencia)',
    }

    const texto = await completarTexto({
      system: SYSTEM_AUDITOR,
      mensajes: [{
        role: 'user',
        content: `Redacta ${ETIQUETA[campo]} para este papel de trabajo (NIA 230). Devuelve solo el texto listo para pegar, sin encabezados ni comentarios.

Empresa: ${row.empresa.nombre} — sector ${row.empresa.sector}, marco ${row.empresa.marcoContable}, período ${row.auditoria.fechaInicio} a ${row.auditoria.fechaFin}.
Papel de trabajo: "${row.papel.titulo}" — área: ${row.papel.area}.
${riesgoTexto}
${row.papel.procedimiento && campo !== 'procedimiento' ? `Procedimiento ya documentado: ${row.papel.procedimiento}` : ''}
${row.papel.hallazgos && campo === 'conclusion' ? `Hallazgos documentados: ${row.papel.hallazgos}` : ''}
${indicaciones ? `Indicaciones del auditor: ${indicaciones}` : ''}`,
      }],
      maxTokens: 1200,
    })

    registrarEvento(user, {
      accion: 'ia.redactar_papel',
      entidad: 'papel_trabajo',
      entidadId: papelId,
      auditoriaId: row.papel.auditoriaId,
      detalle: { campo },
    })

    return c.json({ data: { texto: texto.trim() } })
  },
)

export default app
