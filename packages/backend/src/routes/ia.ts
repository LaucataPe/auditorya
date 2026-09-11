/**
 * Funciones de IA (LLM vía OpenRouter) sobre una auditoría:
 *  - GET  /ia/estado                              → disponibilidad
 *  - POST /auditorias/:id/ia/sugerir-riesgos      → riesgos sugeridos con contexto real
 *  - POST /auditorias/:id/ia/analisis-balance     → lectura analítica del balance (NIA 520)
 *  - POST /auditorias/:id/ia/asistente            → asistente NIA con contexto del encargo
 *  - POST /papeles/:papelId/ia/redactar           → borrador de procedimiento/hallazgos/conclusión
 *  - POST /papeles/:papelId/ia/hallazgo           → los cinco atributos del hallazgo redactados
 *
 * Todas responden 503 IA_NO_DISPONIBLE cuando no hay API key, salvo
 * sugerir-riesgos, que cae al catálogo estático por sector (fallback).
 */
import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, eq, isNull, lte } from 'drizzle-orm'
import { db } from '../db/client'
import { createHash, randomUUID } from 'node:crypto'
import {
  auditorias, empresas, materialidades, riesgos, papelesTrabajo,
  cuentasBalance, cuentasBalanceComparativo, balanceMeta, entendimientoPeriodo,
  obligacionesTributarias, revisionesTributarias, adjuntosTributarios,
} from '../db/schema'
import {
  esClaseBalance, AREAS_BASE_CLAVES, CIFRAS_CATALOGO, IMPUESTOS_CATALOGO, LECTURA_FORMULARIO,
  aplicarLecturaFormulario, etiquetaPeriodo, nombreObligacion,
  TIPO_HALLAZGO_LABEL, SEVERIDAD_HALLAZGO_LABEL,
} from '@auditorya/types'
import { authMiddleware } from '../middleware/auth'
import {
  iaDisponible, completarJSON, completarJSONArchivo, completarTexto, MODELO,
  type ArchivoLLM, type MensajeChat,
} from '../lib/llm'
import { storage } from '../lib/storage'
import { sugerirRiesgos } from '../lib/ia'
import { registrarEvento } from '../lib/eventos'
import { excedeLimite } from '../lib/rate-limit'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// Solo claves del catálogo base: las sugerencias de IA no usan ciclos propios de la firma.
const AREAS = AREAS_BASE_CLAVES as [string, ...string[]]

const ERROR_IA = {
  code: 'IA_NO_DISPONIBLE',
  message: 'Las funciones de IA no están disponibles: configura OPENROUTER_API_KEY en el backend',
} as const

const ERROR_IA_FALLO = {
  code: 'IA_ERROR',
  message: 'El servicio de IA no respondió correctamente. Inténtalo de nuevo en unos momentos.',
} as const

// Cuota por usuario: protege la API key de la firma de bucles y abuso de coste.
const LIMITE_IA = { max: 30, ventanaMs: 10 * 60 * 1000 } // 30 llamadas / 10 min

function excedeCuotaIA(userId: string): boolean {
  return excedeLimite(`ia:${userId}`, LIMITE_IA.max, LIMITE_IA.ventanaMs)
}

const ERROR_CUOTA_IA = {
  code: 'IA_CUOTA',
  message: 'Has alcanzado el límite de llamadas de IA por ahora. Espera unos minutos.',
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
  if (excedeCuotaIA(user.sub)) return c.json({ error: ERROR_CUOTA_IA }, 429)

  const balance = await resumenBalance(id)
  if (!balance) {
    return c.json({ error: { code: 'SIN_BALANCE', message: 'Carga primero el balance de prueba' } }, 409)
  }

  let respuesta: string
  try {
    respuesta = await completarTexto({
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
  } catch (err) {
    console.error('[ia] analisis-balance falló:', (err as Error).message)
    return c.json({ error: ERROR_IA_FALLO }, 502)
  }

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
    if (excedeCuotaIA(user.sub)) return c.json({ error: ERROR_CUOTA_IA }, 429)

    // Estado actual del encargo para respuestas situadas.
    const [riesgosRows, papelesRows] = await Promise.all([
      db.select({ area: riesgos.area, combinado: riesgos.riesgoCombinado }).from(riesgos).where(eq(riesgos.auditoriaId, id)),
      db.select({ estado: papelesTrabajo.estado }).from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)),
    ])

    const estado = `Estado del encargo: fase ${ctx.row.auditoria.estado}; ${riesgosRows.length} riesgos identificados (${riesgosRows.filter((r) => r.combinado === 'alto').length} altos); ${papelesRows.length} papeles de trabajo (${papelesRows.filter((p) => p.estado === 'aprobado').length} aprobados); materialidad ${ctx.row.auditoria.materialidadAprobada ? 'aprobada' : 'pendiente'}.`

    const mensajes: MensajeChat[] = [...(historial ?? []), { role: 'user', content: pregunta }]

    let respuesta: string
    try {
      respuesta = await completarTexto({
        system: `${SYSTEM_AUDITOR}

Actúas como asistente del equipo de auditoría dentro de la plataforma AuditorYa. Respondes dudas sobre NIA, procedimientos, normativa colombiana y sobre este encargo en particular. Si te preguntan algo fuera del ámbito de auditoría/contabilidad, redirige amablemente al tema.

CONTEXTO DEL ENCARGO:
${ctx.texto}
${estado}`,
        mensajes,
        maxTokens: 1500,
      })
    } catch (err) {
      console.error('[ia] asistente falló:', (err as Error).message)
      return c.json({ error: ERROR_IA_FALLO }, 502)
    }

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
    if (excedeCuotaIA(user.sub)) return c.json({ error: ERROR_CUOTA_IA }, 429)

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

    let texto: string
    try {
      texto = await completarTexto({
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
    } catch (err) {
      console.error('[ia] redactar falló:', (err as Error).message)
      return c.json({ error: ERROR_IA_FALLO }, 502)
    }

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

// ─── Hallazgo de papel de trabajo: pule los cinco atributos ──────────────────

const HallazgoPapelIASchema = z.object({
  descripcion: z.string(),
  criterio: z.string(),
  causa: z.string(),
  efecto: z.string(),
  recomendacion: z.string(),
})

// POST /papeles/:papelId/ia/hallazgo — a partir del borrador del auditor
// devuelve los cinco atributos del hallazgo (condición · criterio · causa ·
// efecto + recomendación) redactados en lenguaje técnico de auditoría.
app.post(
  '/papeles/:papelId/ia/hallazgo',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().trim().min(5).max(2000),
      criterio: z.string().max(2000).optional(),
      causa: z.string().max(2000).optional(),
      efecto: z.string().max(2000).optional(),
      recomendacion: z.string().max(2000).optional(),
      tipo: z.enum(['incorreccion', 'deficiencia']).optional(),
      severidad: z.enum(['alta', 'media', 'baja']).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const papelId = c.req.param('papelId')
    const body = c.req.valid('json')

    if (!iaDisponible()) return c.json({ error: ERROR_IA }, 503)
    if (excedeCuotaIA(user.sub)) return c.json({ error: ERROR_CUOTA_IA }, 429)

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
      if (r) riesgoTexto = `Riesgo que atiende el papel: [${r.riesgoCombinado.toUpperCase()}] ${r.descripcion}`
    }

    const prompt = `Un auditor está documentando un hallazgo en el papel de trabajo "${row.papel.titulo}" (área ${row.papel.area}) de la auditoría a ${row.empresa.nombre} — sector ${row.empresa.sector}, marco ${row.empresa.marcoContable}, período ${row.auditoria.fechaInicio} a ${row.auditoria.fechaFin}.
${riesgoTexto}
${row.papel.procedimiento ? `Procedimiento aplicado: ${row.papel.procedimiento}` : ''}
${body.tipo ? `Tipo de hallazgo: ${TIPO_HALLAZGO_LABEL[body.tipo]}` : ''}${body.severidad ? ` — severidad ${SEVERIDAD_HALLAZGO_LABEL[body.severidad]}` : ''}

Borrador del auditor:
- Condición: ${body.descripcion}
- Criterio: ${body.criterio?.trim() || '(vacío)'}
- Causa: ${body.causa?.trim() || '(vacío)'}
- Efecto: ${body.efecto?.trim() || '(vacío)'}
- Recomendación: ${body.recomendacion?.trim() || '(vacío)'}

Devuelve un objeto JSON con exactamente estas claves, cada una con el texto listo para pegar (uno o dos párrafos cortos, sin encabezados ni viñetas):
- "descripcion": la CONDICIÓN — el hecho observado, objetivo y concreto. Conserva TODOS los datos del borrador (cuentas, cuantías, fechas, terceros); nunca inventes cifras.
- "criterio": el CRITERIO — la NIA, norma contable del marco aplicable, norma colombiana o política interna que se incumple, con una frase del deber ser. Si no estás seguro de la referencia exacta, cítala de forma general; NUNCA inventes números de artículo o de párrafo.
- "causa": la CAUSA — por qué ocurrió (falla de control, ausencia de política, error de registro…).
- "efecto": el EFECTO — impacto en las cifras o en la confiabilidad de la información; cuantifícalo solo si el borrador aporta el dato.
- "recomendacion": la RECOMENDACIÓN accionable para la administración (corrección del registro si procede y ajuste del control para que no se repita).

Si un campo del borrador venía vacío, propón una redacción coherente con la condición; cuando te falte un dato para completarla, déjalo como marcador [___] en lugar de suponerlo.`

    let sugerencia: z.infer<typeof HallazgoPapelIASchema>
    try {
      const crudo = await completarJSON<unknown>({
        system: SYSTEM_AUDITOR,
        prompt,
        inicioJson: '{',
        maxTokens: 1500,
      })
      sugerencia = HallazgoPapelIASchema.parse(crudo)
    } catch (err) {
      console.error('[ia] hallazgo de papel falló:', (err as Error).message)
      return c.json({ error: ERROR_IA_FALLO }, 502)
    }

    registrarEvento(user, {
      accion: 'ia.redactar_hallazgo_papel',
      entidad: 'papel_trabajo',
      entidadId: papelId,
      auditoriaId: row.papel.auditoriaId,
    })

    return c.json({
      data: {
        descripcion: sugerencia.descripcion.trim(),
        criterio: sugerencia.criterio.trim(),
        causa: sugerencia.causa.trim(),
        efecto: sugerencia.efecto.trim(),
        recomendacion: sugerencia.recomendacion.trim(),
      },
    })
  },
)

// ─── Hallazgos tributarios: redacción del hallazgo y la recomendación ────────

const HallazgoTributarioIASchema = z.object({
  descripcion: z.string().min(10),
  recomendacion: z.string().min(10),
})

// POST /tributario/revisiones/:id/ia/hallazgo — a partir del borrador del
// auditor devuelve el hallazgo pulido y la recomendación. El hallazgo
// tributario no lleva criterio como campo aparte (ver hallazgos_tributarios).
app.post(
  '/tributario/revisiones/:id/ia/hallazgo',
  zValidator(
    'json',
    z.object({
      descripcion: z.string().trim().min(5).max(2000),
      recomendacion: z.string().max(1000).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const revisionId = c.req.param('id')
    const body = c.req.valid('json')

    if (!iaDisponible()) return c.json({ error: ERROR_IA }, 503)
    if (excedeCuotaIA(user.sub)) return c.json({ error: ERROR_CUOTA_IA }, 429)

    const [row] = await db
      .select({ revision: revisionesTributarias, obligacion: obligacionesTributarias, empresa: empresas })
      .from(revisionesTributarias)
      .innerJoin(obligacionesTributarias, eq(revisionesTributarias.obligacionId, obligacionesTributarias.id))
      .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
      .where(and(eq(revisionesTributarias.id, revisionId), eq(empresas.firmaId, user.firmaId)))
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    if (row.revision.estado === 'revisada') {
      return c.json({ error: { code: 'REVISION_SELLADA', message: 'La revisión ya fue firmada' } }, 409)
    }

    const impuesto = IMPUESTOS_CATALOGO[row.obligacion.tipo]
    const periodo = `${etiquetaPeriodo(row.obligacion.periodicidad, row.revision.periodo)} ${row.obligacion.anioFiscal}`

    const prompt = `Un revisor fiscal está documentando un hallazgo en la revisión de ${nombreObligacion(row.obligacion)} (${impuesto.descripcion}), período ${periodo}, de la empresa ${row.empresa.nombre} (sector ${row.empresa.sector}).

Borrador del auditor (situación encontrada): ${body.descripcion}
${body.recomendacion ? `Recomendación ya anotada: ${body.recomendacion}` : ''}

Devuelve un objeto JSON con exactamente estas claves:
- "descripcion": el hallazgo redactado en lenguaje técnico de auditoría, objetivo y concreto (qué se encontró, cuantía si la hay). Conserva TODOS los datos del borrador; no inventes cifras.
- "recomendacion": la recomendación accionable para el cliente (corrección de la declaración si procede, ajuste del proceso o control para que no se repita). Si citas una norma tributaria colombiana y no estás seguro del artículo exacto, referénciala de forma general — NUNCA inventes números de artículo.`

    let sugerencia: z.infer<typeof HallazgoTributarioIASchema>
    try {
      const crudo = await completarJSON<unknown>({
        system: SYSTEM_AUDITOR,
        prompt,
        inicioJson: '{',
        maxTokens: 1200,
      })
      sugerencia = HallazgoTributarioIASchema.parse(crudo)
    } catch (err) {
      console.error('[ia] hallazgo tributario falló:', (err as Error).message)
      return c.json({ error: ERROR_IA_FALLO }, 502)
    }

    registrarEvento(user, {
      accion: 'ia.redactar_hallazgo_tributario',
      entidad: 'revision_tributaria',
      entidadId: revisionId,
      empresaId: row.obligacion.empresaId,
      detalle: { obligacion: nombreObligacion(row.obligacion), periodo: row.revision.periodo },
    })

    return c.json({ data: sugerencia })
  },
)

// ─── Lectura del borrador de la declaración (cifras del período) ─────────────

const MIMES_BORRADOR = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const MAX_BORRADOR_BYTES = 10 * 1024 * 1024 // el archivo viaja en base64 al LLM

const LecturaBorradorSchema = z.object({
  renglones: z.record(z.number().nullable()),
  advertencias: z.array(z.string()).max(20).optional(),
})

const CasillasSchema = z.object({ casillas: z.record(z.number().nullable()) })

/**
 * Transcribe las casillas del formulario. Los PDF se intentan primero con el
 * parser de texto gratuito; si no extrae ningún valor (formularios MUISCA con
 * campos XFA o PDFs escaneados) o falla, se reintenta con OCR (mistral-ocr).
 */
async function transcribirCasillas(archivo: ArchivoLLM, prompt: string): Promise<Record<string, number | null>> {
  const intentar = async (engine?: 'pdf-text' | 'mistral-ocr') => {
    const crudo = await completarJSONArchivo<unknown>({
      system: SYSTEM_AUDITOR,
      prompt,
      archivo,
      inicioJson: '{',
      maxTokens: 3000,
      engine,
    })
    return CasillasSchema.parse(crudo).casillas
  }

  const esPdf = archivo.mime === 'application/pdf'
  if (!esPdf) return intentar()

  try {
    const casillas = await intentar('pdf-text')
    if (Object.values(casillas).some((v) => typeof v === 'number' && v !== 0)) return casillas
    console.warn('[ia] pdf-text no extrajo valores del borrador; reintentando con OCR')
    return await intentar('mistral-ocr')
  } catch (err) {
    console.warn('[ia] lectura con pdf-text falló; reintentando con OCR:', (err as Error).message)
    return intentar('mistral-ocr')
  }
}

// POST /tributario/revisiones/:id/ia/leer-borrador — multipart: `archivo`
// (PDF/imagen del borrador) + `guardarSoporte` ('1' para adjuntarlo como
// declaración). Devuelve renglón → valor declarado; el frontend los aplica.
app.post('/tributario/revisiones/:id/ia/leer-borrador', async (c) => {
  const user = c.get('user')
  const revisionId = c.req.param('id')

  if (!iaDisponible()) return c.json({ error: ERROR_IA }, 503)
  if (excedeCuotaIA(user.sub)) return c.json({ error: ERROR_CUOTA_IA }, 429)

  const [row] = await db
    .select({ revision: revisionesTributarias, obligacion: obligacionesTributarias, empresa: empresas })
    .from(revisionesTributarias)
    .innerJoin(obligacionesTributarias, eq(revisionesTributarias.obligacionId, obligacionesTributarias.id))
    .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
    .where(and(eq(revisionesTributarias.id, revisionId), eq(empresas.firmaId, user.firmaId)))
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  if (row.revision.estado === 'revisada') {
    return c.json({ error: { code: 'REVISION_SELLADA', message: 'La revisión ya fue firmada' } }, 409)
  }

  const body = await c.req.parseBody()
  const archivo = body['archivo']
  if (!(archivo instanceof File)) {
    return c.json({ error: { code: 'ARCHIVO_REQUERIDO', message: 'Adjunta el borrador en el campo "archivo"' } }, 400)
  }
  if (!MIMES_BORRADOR.includes(archivo.type)) {
    return c.json(
      { error: { code: 'FORMATO_NO_SOPORTADO', message: 'Sube el borrador en PDF o imagen (png/jpg/webp)' } },
      400,
    )
  }
  if (archivo.size > MAX_BORRADOR_BYTES) {
    return c.json({ error: { code: 'ARCHIVO_MUY_GRANDE', message: 'El borrador supera el límite de 10 MB' } }, 413)
  }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const impuesto = IMPUESTOS_CATALOGO[row.obligacion.tipo]
  const periodo = `${etiquetaPeriodo(row.obligacion.periodicidad, row.revision.periodo)} ${row.obligacion.anioFiscal}`
  const archivoLLM = { nombre: archivo.name, mime: archivo.type, base64: contenido.toString('base64') }
  const cfgCasillas = LECTURA_FORMULARIO[row.obligacion.tipo]

  let renglones: Record<string, number | null> = {}
  let advertencias: string[] = []

  try {
    if (cfgCasillas) {
      // Formulario DIAN con casillas numeradas: la IA solo TRANSCRIBE casilla →
      // valor (tarea simple y fiable); el mapeo a renglones, las sumas de
      // casillas agrupadas y la verificación de totales son código determinista.
      const prompt = `El archivo adjunto es el BORRADOR de la declaración de ${nombreObligacion(row.obligacion)} (formulario oficial de la DIAN), período ${periodo}, de la empresa ${row.empresa.nombre}.

TRANSCRIBE todas las casillas numeradas del formulario con su valor:
- La clave es el NÚMERO de la casilla como texto (p. ej. "28"); el valor, el número en pesos colombianos como ENTERO (sin puntos, comas ni símbolos).
- Transcribe tal cual, incluidas las casillas en cero. NO calcules, NO corrijas, NO omitas casillas.
- Ignora las casillas de identificación (año, período, NIT, códigos, teléfonos): solo las casillas con valores en pesos.
- Si una casilla no se puede leer con certeza, omítela del objeto.

Devuelve un objeto JSON: {"casillas": {"27": 0, "28": 122149000, ...}}`

      const casillas = await transcribirCasillas(archivoLLM, prompt)
      const aplicado = aplicarLecturaFormulario(row.obligacion.tipo, casillas)
      renglones = aplicado?.renglones ?? {}
      advertencias = aplicado?.advertencias ?? []
    } else {
      // Impuestos sin formulario estándar (reteica, municipales, otros): la IA
      // mapea directo a los renglones digitables del catálogo.
      const digitables = CIFRAS_CATALOGO[row.obligacion.tipo]
        .flatMap((s) => s.renglones.map((r) => ({ ...r, seccion: s.titulo })))
        .filter((r) => r.tipo === 'digitable')
      const listaRenglones = digitables
        .map((r) => `- "${r.id}": ${r.label} (sección: ${r.seccion}${r.ayuda ? ` · ${r.ayuda}` : ''})`)
        .join('\n')

      const prompt = `El archivo adjunto es el BORRADOR de la declaración de ${nombreObligacion(row.obligacion)} (${impuesto.descripcion}), período ${periodo}, de la empresa ${row.empresa.nombre}.

Extrae los valores del formulario y mapéalos a estos renglones (la clave es el id exacto):
${listaRenglones}

Reglas:
- Valores en pesos colombianos como números ENTEROS, tal como aparecen en el formulario (sin puntos, comas ni símbolos).
- En retenciones los renglones piden el VALOR RETENIDO por concepto, no la base.
- Usa null en los renglones que el formulario no traiga.
- NO inventes valores: si algo no se puede leer con certeza, déjalo en null y explícalo en "advertencias".
- En "advertencias" lista también los valores DISTINTOS DE CERO que no encajaron en ningún renglón (formato "concepto: valor").

Devuelve un objeto JSON: {"renglones": {"<id>": <numero|null>, ...}, "advertencias": ["...", ...]}`

      const crudo = await completarJSONArchivo<unknown>({
        system: SYSTEM_AUDITOR,
        prompt,
        archivo: archivoLLM,
        inicioJson: '{',
        maxTokens: 3000,
      })
      const lectura = LecturaBorradorSchema.parse(crudo)
      const idsValidos = new Set(digitables.map((r) => r.id))
      for (const [id, valor] of Object.entries(lectura.renglones)) {
        if (idsValidos.has(id)) renglones[id] = valor === null ? null : Math.round(valor)
      }
      advertencias = lectura.advertencias ?? []
    }
  } catch (err) {
    console.error('[ia] leer borrador falló:', (err as Error).message)
    return c.json(
      {
        error: {
          code: 'IA_ERROR',
          message:
            'No se pudo leer el borrador. Si el PDF es escaneado o está protegido, intenta con una imagen nítida del formulario.',
        },
      },
      502,
    )
  }

  if (Object.values(renglones).every((v) => v === null || v === undefined)) {
    return c.json(
      { error: { code: 'SIN_VALORES', message: 'No se encontraron valores legibles en el archivo: verifica que sea el borrador de la declaración' } },
      422,
    )
  }

  // Opcional: dejar el borrador como soporte (tipo declaración) de la revisión.
  let adjuntoId: string | null = null
  if (body['guardarSoporte'] === '1') {
    const extension = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const key = `tributario/${row.obligacion.empresaId}/${randomUUID()}.${extension}`
    await storage.guardar(key, contenido)
    const [adjunto] = await db
      .insert(adjuntosTributarios)
      .values({
        revisionId,
        nombre: `Borrador ${nombreObligacion(row.obligacion)} ${periodo}`,
        tipo: 'declaracion',
        archivoKey: key,
        archivoNombre: archivo.name,
        archivoMime: archivo.type,
        archivoTamano: archivo.size,
        archivoHash: createHash('sha256').update(contenido).digest('hex'),
        subidoPor: user.sub,
      })
      .returning()
    adjuntoId = adjunto.id
  }

  registrarEvento(user, {
    accion: 'ia.leer_borrador_tributario',
    entidad: 'revision_tributaria',
    entidadId: revisionId,
    empresaId: row.obligacion.empresaId,
    detalle: {
      obligacion: nombreObligacion(row.obligacion),
      periodo: row.revision.periodo,
      renglonesLeidos: Object.values(renglones).filter((v) => v !== null).length,
      archivo: archivo.name,
      soporteGuardado: !!adjuntoId,
    },
  })

  return c.json({ data: { renglones, advertencias, adjuntoId } })
})

export default app
