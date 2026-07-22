import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq, lte, isNull, inArray, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../db/client'
import {
  auditorias, empresas, materialidades, riesgos,
  papelesTrabajo, controlesCoso, tareas, informes, programasAI, hallazgosAI,
  entendimientoPeriodo, cuentasBalance, balanceArchivos, perfilesBalance, cuentasBalanceComparativo, balanceMeta,
  eventos, usuarios, evidencias, ajustes, hallazgos,
  solicitudesPbc, notasRevision, cierresAuditoria, muestras,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { esSocioResponsable, ERROR_NO_SOCIO_RESPONSABLE } from '../lib/permisos'
import { registrarEvento } from '../lib/eventos'
import { storage } from '../lib/storage'
import { sugerirRiesgos } from '../lib/ia'
import { claseDesdeCodigo, esClaseBalance, nivelCombinado, calcularRatios, detectarBanderas, evaluarCompletitud, evaluarOpinion, resumirHallazgos } from '@auditorya/types'
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

// El nivel combinado (RMM) se calcula con `nivelCombinado` del paquete de tipos (compartido con el front).
const combinarRiesgo = nivelCombinado

// GET /auditorias/:id/progreso — señales crudas para la cabecera guiada
app.get('/auditorias/:id/progreso', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const [riesgosRows, materialidadRows, papelesRows, cosoRows, tareasRows, informesRows, programasRows, hallazgosAiRows, entendimientoRows, balanceRows, evidRows, ajustesRows, hallazgosRows] =
    await Promise.all([
      db.select({ id: riesgos.id, combinado: riesgos.riesgoCombinado, respuesta: riesgos.respuestaPlaneada }).from(riesgos).where(eq(riesgos.auditoriaId, id)),
      db.select({ id: materialidades.id, materialidad: materialidades.materialidad }).from(materialidades).where(eq(materialidades.auditoriaId, id)),
      db.select({ id: papelesTrabajo.id, estado: papelesTrabajo.estado, riesgoId: papelesTrabajo.riesgoId }).from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)),
      db.select({ componente: controlesCoso.componente }).from(controlesCoso).where(eq(controlesCoso.auditoriaId, id)),
      db.select({ estado: tareas.estado }).from(tareas).where(eq(tareas.auditoriaId, id)),
      db.select({ tipo: informes.tipo, estado: informes.estado }).from(informes).where(eq(informes.auditoriaId, id)),
      db.select({ estado: programasAI.estado }).from(programasAI).where(eq(programasAI.auditoriaId, id)),
      db.select({ id: hallazgosAI.id }).from(hallazgosAI).where(eq(hallazgosAI.auditoriaId, id)),
      db.select({ confirmado: entendimientoPeriodo.confirmado }).from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, id)),
      db.select({ id: cuentasBalance.id }).from(cuentasBalance).where(eq(cuentasBalance.auditoriaId, id)).limit(1),
      db
        .select({ papelId: evidencias.papelTrabajoId, n: sql<number>`count(*)::int` })
        .from(evidencias)
        .innerJoin(papelesTrabajo, eq(evidencias.papelTrabajoId, papelesTrabajo.id))
        .where(eq(papelesTrabajo.auditoriaId, id))
        .groupBy(evidencias.papelTrabajoId),
      db.select({ monto: ajustes.monto, corregido: ajustes.corregido, efecto: ajustes.efecto }).from(ajustes).where(eq(ajustes.auditoriaId, id)),
      db.select({ estado: hallazgos.estado }).from(hallazgos).where(eq(hallazgos.auditoriaId, id)),
    ])

  const mapaInformes: Record<string, string> = {}
  for (const inf of informesRows) mapaInformes[inf.tipo] = inf.estado

  // Completitud de ejecución: riesgos altos sin papel + papeles (revisión/aprobados) sin evidencia.
  const riesgosConPrueba = new Set(papelesRows.map((p) => p.riesgoId).filter((x): x is string => !!x))
  const riesgosAltosSinPrueba = riesgosRows.filter((r) => r.combinado === 'alto' && !riesgosConPrueba.has(r.id)).length
  const evidPorPapel = new Map(evidRows.map((e) => [e.papelId, Number(e.n)]))
  const papelesSinEvidencia = papelesRows.filter(
    (p) => (p.estado === 'en_revision' || p.estado === 'aprobado') && (evidPorPapel.get(p.id) ?? 0) === 0,
  ).length

  // Opinión sugerida por la hoja de ajustes (NIA 450/700) frente a la materialidad.
  const materialidadMonto = materialidadRows[0]?.materialidad ? Number(materialidadRows[0].materialidad) : null
  const opinionSugerida = evaluarOpinion(
    ajustesRows.map((a) => ({ monto: Number(a.monto), corregido: a.corregido, efecto: a.efecto })),
    materialidadMonto,
  ).opinionSugerida

  // Hallazgos aún pendientes de decisión del contador (NIA 260/265).
  const hallazgosSinResolver = resumirHallazgos(hallazgosRows).sinResolver

  return c.json({
    data: {
      tipoServicio: row.auditoria.tipoServicio,
      estado: row.auditoria.estado,
      entendimientoConfirmado: entendimientoRows[0]?.confirmado ?? false,
      balanceCargado: balanceRows.length > 0,
      riesgosTotal: riesgosRows.length,
      riesgosAltos: riesgosRows.filter((r) => r.combinado === 'alto').length,
      riesgosAltosSinRespuesta: riesgosRows.filter((r) => r.combinado === 'alto' && !(r.respuesta ?? '').trim()).length,
      materialidadCalculada: materialidadRows.length > 0,
      materialidadAprobada: row.auditoria.materialidadAprobada,
      papelesTotal: papelesRows.length,
      papelesAprobados: papelesRows.filter((p) => p.estado === 'aprobado').length,
      riesgosAltosSinPrueba,
      papelesSinEvidencia,
      hallazgosSinResolver,
      cosoEvaluados: cosoRows.length,
      tareasTotal: tareasRows.length,
      tareasCompletadas: tareasRows.filter((t) => t.estado === 'completada').length,
      informes: mapaInformes,
      opinionSugerida,
      programasTotal: programasRows.length,
      programasCompletados: programasRows.filter((p) => p.estado === 'completado').length,
      hallazgosTotal: hallazgosAiRows.length,
    },
  })
})

// GET /auditorias/:id/completitud — huecos de ejecución (NIA 330/500)
app.get('/auditorias/:id/completitud', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const [riesgosRows, papelesRows, evidRows] = await Promise.all([
    db
      .select({ id: riesgos.id, area: riesgos.area, descripcion: riesgos.descripcion, nivelCombinado: riesgos.riesgoCombinado })
      .from(riesgos)
      .where(eq(riesgos.auditoriaId, id)),
    db
      .select({ id: papelesTrabajo.id, titulo: papelesTrabajo.titulo, area: papelesTrabajo.area, riesgoId: papelesTrabajo.riesgoId, estado: papelesTrabajo.estado })
      .from(papelesTrabajo)
      .where(eq(papelesTrabajo.auditoriaId, id)),
    db
      .select({ papelId: evidencias.papelTrabajoId, n: sql<number>`count(*)::int` })
      .from(evidencias)
      .innerJoin(papelesTrabajo, eq(evidencias.papelTrabajoId, papelesTrabajo.id))
      .where(eq(papelesTrabajo.auditoriaId, id))
      .groupBy(evidencias.papelTrabajoId),
  ])

  const evidPorPapel = new Map(evidRows.map((e) => [e.papelId, Number(e.n)]))
  const papeles = papelesRows.map((p) => ({ ...p, numEvidencias: evidPorPapel.get(p.id) ?? 0 }))

  return c.json({ data: evaluarCompletitud(riesgosRows, papeles) })
})

// ─── Pista de auditoría (audit trail) ────────────────────────────────────────

// GET /auditorias/:id/eventos — historial de acciones sobre la auditoría
app.get('/auditorias/:id/eventos', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const lista = await db
    .select({
      id: eventos.id,
      accion: eventos.accion,
      entidad: eventos.entidad,
      entidadId: eventos.entidadId,
      detalle: eventos.detalle,
      createdAt: eventos.createdAt,
      usuarioNombre: usuarios.nombre,
    })
    .from(eventos)
    .innerJoin(usuarios, eq(eventos.usuarioId, usuarios.id))
    .where(eq(eventos.auditoriaId, id))
    .orderBy(desc(eventos.createdAt))
    .limit(200)

  return c.json({ data: lista })
})

// ─── Entendimiento del período (NIA 315) ─────────────────────────────────────

// GET /auditorias/:id/entendimiento
app.get('/auditorias/:id/entendimiento', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const [ent] = await db
    .select()
    .from(entendimientoPeriodo)
    .where(eq(entendimientoPeriodo.auditoriaId, id))

  return c.json({ data: ent ?? null })
})

// PUT /auditorias/:id/entendimiento — upsert del entendimiento del período
app.put(
  '/auditorias/:id/entendimiento',
  zValidator(
    'json',
    z.object({
      cambiosSignificativos: z.string().optional(),
      eventosSignificativos: z.string().optional(),
      notas: z.string().optional(),
      sinCambios: z.boolean().optional(),
      confirmado: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

    const valores = {
      cambiosSignificativos: body.cambiosSignificativos ?? null,
      eventosSignificativos: body.eventosSignificativos ?? null,
      notas: body.notas ?? null,
      sinCambios: body.sinCambios ?? false,
      confirmado: body.confirmado ?? false,
    }

    const [existente] = await db
      .select()
      .from(entendimientoPeriodo)
      .where(eq(entendimientoPeriodo.auditoriaId, id))

    let resultado
    if (existente) {
      ;[resultado] = await db
        .update(entendimientoPeriodo)
        .set(valores)
        .where(eq(entendimientoPeriodo.auditoriaId, id))
        .returning()
    } else {
      ;[resultado] = await db
        .insert(entendimientoPeriodo)
        .values({ auditoriaId: id, ...valores })
        .returning()
    }

    return c.json({ data: resultado })
  },
)

// ─── Balance de prueba + procedimientos analíticos (NIA 315/520) ─────────────

const UMBRAL_VARIACION_PCT = 30 // variación inusual a partir de ±30%

// GET /auditorias/:id/balance — análisis a nivel cuenta + resumen + metadata del archivo
app.get('/auditorias/:id/balance', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  // Para planeación se analiza a nivel de cuenta (sin desglose por tercero).
  const cuentas = await db
    .select()
    .from(cuentasBalance)
    .where(and(eq(cuentasBalance.auditoriaId, id), lte(cuentasBalance.nivel, 6), isNull(cuentasBalance.tercero)))
    .orderBy(cuentasBalance.codigo)

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cuentasBalance)
    .where(eq(cuentasBalance.auditoriaId, id))
  const [{ nter } = { nter: 0 }] = await db
    .select({ nter: sql<number>`count(*)::int` })
    .from(cuentasBalance)
    .where(and(eq(cuentasBalance.auditoriaId, id), sql`${cuentasBalance.tercero} is not null`))

  const [mat] = await db.select().from(materialidades).where(eq(materialidades.auditoriaId, id))
  const umbral = mat ? Number(mat.materialidadDesempeno || mat.materialidad) : null

  // Cuentas que tienen detalle por tercero (nivel 8) debajo: se ofrece "ver terceros" solo ahí.
  const tercerosCodigos = await db
    .selectDistinct({ codigo: cuentasBalance.codigo })
    .from(cuentasBalance)
    .where(and(eq(cuentasBalance.auditoriaId, id), sql`${cuentasBalance.tercero} is not null`))
  const conTerceros = new Set<string>()
  for (const { codigo } of tercerosCodigos) {
    for (let l = 1; l <= codigo.length; l++) conTerceros.add(codigo.slice(0, l))
  }

  // Comparativo (mismo corte del año anterior) y metadatos del período.
  const comparativoRows = await db
    .select()
    .from(cuentasBalanceComparativo)
    .where(eq(cuentasBalanceComparativo.auditoriaId, id))
  const compPorCodigo = new Map(comparativoRows.map((r) => [r.codigo, Number(r.saldo)]))
  const compCargado = comparativoRows.length > 0
  const [meta] = await db.select().from(balanceMeta).where(eq(balanceMeta.auditoriaId, id))

  // Base de comparación honesta por cuenta: el comparativo real si está cargado;
  // sin comparativo, el saldo inicial solo sirve en cuentas de balance (1/2/3) —
  // en cuentas de resultado el inicial es el acumulado al corte, no una base.
  const analizar = (
    codigo: string, nombre: string | null, clase: string | null, nivel: number,
    actual: number, inicial: number,
  ) => {
    const saldoComparativo = compCargado ? (compPorCodigo.get(codigo) ?? 0) : null
    const baseVariacion: 'comparativo' | 'inicial' | null = compCargado
      ? 'comparativo'
      : esClaseBalance(codigo) ? 'inicial' : null
    const base = baseVariacion === 'comparativo' ? saldoComparativo : baseVariacion === 'inicial' ? inicial : null
    const variacionAbs = base !== null ? actual - base : null
    const variacionPct = base !== null && base !== 0 ? ((actual - base) / Math.abs(base)) * 100 : null
    const significativa = umbral !== null && Math.abs(actual) > umbral
    const anomalia =
      base !== null &&
      ((variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION_PCT) ||
        (base === 0 && actual !== 0))
    return {
      codigo, nombre, clase, nivel,
      saldoActual: actual,
      saldoInicial: inicial,
      saldoComparativo,
      baseVariacion,
      variacionAbs,
      variacionPct,
      significativa,
      anomalia,
      tieneTerceros: conTerceros.has(codigo),
    }
  }

  const codigosActual = new Set(cuentas.map((ct) => ct.codigo))
  const analizadas = [
    ...cuentas.map((ct) =>
      analizar(ct.codigo, ct.nombre, ct.clase, ct.nivel, Number(ct.saldoActual), Number(ct.saldoInicial)),
    ),
    // Cuentas que existían el año anterior y hoy no aparecen: saldo actual 0.
    ...comparativoRows
      .filter((r) => r.nivel <= 6 && !codigosActual.has(r.codigo))
      .map((r) => analizar(r.codigo, r.nombre, claseDesdeCodigo(r.codigo), r.nivel, 0, 0)),
  ].sort((a, b) => a.codigo.localeCompare(b.codigo))

  const [archivo] = await db
    .select({ nombre: balanceArchivos.nombre, tamano: balanceArchivos.tamano, createdAt: balanceArchivos.createdAt })
    .from(balanceArchivos)
    .where(eq(balanceArchivos.auditoriaId, id))

  // Bases para materialidad, derivadas de los totales por clase PUC (saldo del período actual).
  const saldoClase = (digito: string) => {
    const fila = cuentas.find((x) => x.codigo === digito)
    return fila ? Math.abs(Number(fila.saldoActual)) : null
  }
  const saldoCodigo = (cod: string) => {
    const fila = cuentas.find((x) => x.codigo === cod)
    return fila ? Math.abs(Number(fila.saldoActual)) : 0
  }
  const ingresosC = saldoClase('4')
  const gastosC = saldoClase('5')
  const costoVentaC = saldoClase('6')
  const costoProdC = saldoClase('7')
  const impuestoRenta = saldoCodigo('54') // se reincorpora para obtener "antes de impuestos"
  let utilidadAntesImp: number | null = null
  if (ingresosC !== null) {
    utilidadAntesImp =
      ingresosC - (gastosC ?? 0) - (costoVentaC ?? 0) - (costoProdC ?? 0) + impuestoRenta
  }
  const bases = {
    activos: saldoClase('1'),
    ingresos: ingresosC,
    utilidad_antes_impuestos: utilidadAntesImp,
    patrimonio: saldoClase('3'),
  }

  // Analítica (NIA 520): ratios y banderas. El `saldoAnterior` que consumen es
  // la base de comparación honesta (ver EntradaAnalitica): comparativo real, o
  // saldo inicial solo para cuentas de balance (0 en resultado → las tendencias
  // de P&G se omiten solas cuando no hay comparativo).
  const entradaAnalitica = analizadas.map((ct) => ({
    codigo: ct.codigo,
    nombre: ct.nombre,
    saldoActual: ct.saldoActual,
    saldoAnterior: compCargado
      ? (ct.saldoComparativo ?? 0)
      : esClaseBalance(ct.codigo) ? ct.saldoInicial : 0,
  }))
  const ratios = calcularRatios(entradaAnalitica)
  const banderas = detectarBanderas(entradaAnalitica)

  const periodo = meta && (meta.corteDesde || meta.corteHasta)
    ? { corteDesde: meta.corteDesde, corteHasta: meta.corteHasta }
    : null

  return c.json({
    data: {
      cuentas: analizadas,
      ratios,
      banderas,
      bases,
      resumen: {
        totalCuentas: analizadas.length,
        totalFilas: Number(total),
        terceros: Number(nter),
        significativas: analizadas.filter((x) => x.significativa).length,
        anomalias: analizadas.filter((x) => x.anomalia).length,
        umbralSignificativa: umbral,
        umbralVariacionPct: UMBRAL_VARIACION_PCT,
      },
      archivo: archivo ?? null,
      periodo,
      comparativo: {
        cargado: compCargado,
        nombre: meta?.comparativoNombre ?? null,
        createdAt: meta?.comparativoCreatedAt ?? null,
      },
    },
  })
})

// GET /auditorias/:id/balance/terceros?codigo=XXXX — detalle por tercero de una cuenta (ejecución)
app.get('/auditorias/:id/balance/terceros', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')
  const codigo = c.req.query('codigo')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const cond = [eq(cuentasBalance.auditoriaId, id), sql`${cuentasBalance.tercero} is not null`]
  if (codigo) cond.push(sql`${cuentasBalance.codigo} like ${codigo + '%'}`)

  const detalle = await db
    .select()
    .from(cuentasBalance)
    .where(and(...cond))
    .orderBy(cuentasBalance.codigo)
    .limit(2000)

  return c.json({ data: detalle })
})

// GET /auditorias/:id/perfil-balance — mapeo de columnas guardado para la empresa del encargo
app.get('/auditorias/:id/perfil-balance', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  const [perfil] = await db
    .select({ mapeo: perfilesBalance.mapeo, encabezados: perfilesBalance.encabezados })
    .from(perfilesBalance)
    .where(eq(perfilesBalance.empresaId, row.empresa.id))
  return c.json({ data: perfil ?? null })
})

const CAMPOS_MAPEO = [
  'codigo', 'nombreCuenta', 'nivel', 'nitTercero', 'nombreTercero',
  'saldoInicial', 'debito', 'credito', 'saldoFinal',
] as const

// POST /auditorias/:id/balance — importa cuentas parseadas + archivo original (reemplaza)
app.post(
  '/auditorias/:id/balance',
  zValidator(
    'json',
    z.object({
      cuentas: z
        .array(
          z.object({
            codigo: z.string().min(1),
            nombre: z.string().nullable(),
            nivel: z.number().int(),
            tercero: z.string().nullable(),
            terceroNombre: z.string().nullable(),
            saldoActual: z.number(),
            saldoInicial: z.number(),
            debito: z.number().nullable(),
            credito: z.number().nullable(),
          }),
        )
        .min(1)
        .max(100000),
      archivo: z
        .object({
          nombre: z.string(),
          tamano: z.number().int(),
          contenido: z.string(), // base64
        })
        .optional(),
      // Período que cubre el balance (YYYY-MM-DD), declarado en el asistente.
      corteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      corteHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      // Mapeo de columnas confirmado en el asistente: se guarda por empresa para reutilizarlo.
      perfil: z
        .object({
          mapeo: z.array(z.enum(CAMPOS_MAPEO).nullable()),
          encabezados: z.array(z.string().nullable()).nullable(),
        })
        .optional(),
    }),
  ),
  async (c) => {
    const { firmaId, sub } = c.get('user')
    const id = c.req.param('id')
    const { cuentas, archivo, perfil, corteDesde, corteHasta } = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

    await db.delete(cuentasBalance).where(eq(cuentasBalance.auditoriaId, id))

    const valores = cuentas.map((ct) => ({
      auditoriaId: id,
      codigo: ct.codigo,
      nombre: ct.nombre,
      clase: claseDesdeCodigo(ct.codigo),
      nivel: ct.nivel,
      tercero: ct.tercero,
      terceroNombre: ct.terceroNombre,
      saldoActual: ct.saldoActual.toFixed(2),
      saldoInicial: ct.saldoInicial.toFixed(2),
      debito: ct.debito != null ? ct.debito.toFixed(2) : null,
      credito: ct.credito != null ? ct.credito.toFixed(2) : null,
    }))
    // Inserta por lotes para no exceder el límite de parámetros de Postgres.
    for (let i = 0; i < valores.length; i += 1000) {
      await db.insert(cuentasBalance).values(valores.slice(i, i + 1000))
    }

    // Registra el período que cubre el balance (sin tocar el estado del comparativo).
    await db
      .insert(balanceMeta)
      .values({ auditoriaId: id, corteDesde: corteDesde ?? null, corteHasta: corteHasta ?? null })
      .onConflictDoUpdate({
        target: balanceMeta.auditoriaId,
        set: { corteDesde: corteDesde ?? null, corteHasta: corteHasta ?? null, updatedAt: new Date() },
      })

    // Guarda el mapeo confirmado como perfil de la empresa, para la próxima importación.
    if (perfil) {
      await db
        .insert(perfilesBalance)
        .values({
          empresaId: row.empresa.id,
          mapeo: perfil.mapeo,
          encabezados: perfil.encabezados,
          actualizadoPor: sub,
        })
        .onConflictDoUpdate({
          target: perfilesBalance.empresaId,
          set: { mapeo: perfil.mapeo, encabezados: perfil.encabezados, actualizadoPor: sub, updatedAt: new Date() },
        })
    }

    // Guarda el archivo original como evidencia inmutable.
    if (archivo) {
      const hash = createHash('sha256').update(archivo.contenido).digest('hex')
      await db.delete(balanceArchivos).where(eq(balanceArchivos.auditoriaId, id))
      await db.insert(balanceArchivos).values({
        auditoriaId: id,
        nombre: archivo.nombre,
        tamano: archivo.tamano,
        hash,
        contenido: archivo.contenido,
        subidoPor: sub,
      })
    }

    registrarEvento(c.get('user'), {
      accion: 'balance.importar',
      entidad: 'balance',
      auditoriaId: id,
      detalle: { filas: cuentas.length, archivo: archivo?.nombre ?? null },
    })

    return c.json({ data: { importadas: cuentas.length } }, 201)
  },
)

// DELETE /auditorias/:id/balance
app.delete('/auditorias/:id/balance', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  await db.delete(cuentasBalance).where(eq(cuentasBalance.auditoriaId, id))
  await db.delete(balanceArchivos).where(eq(balanceArchivos.auditoriaId, id))
  await db.delete(cuentasBalanceComparativo).where(eq(cuentasBalanceComparativo.auditoriaId, id))
  await db.delete(balanceMeta).where(eq(balanceMeta.auditoriaId, id))
  return c.json({ data: { ok: true } })
})

// POST /auditorias/:id/balance/comparativo — saldos del mismo corte del año anterior (reemplaza)
app.post(
  '/auditorias/:id/balance/comparativo',
  zValidator(
    'json',
    z.object({
      cuentas: z
        .array(
          z.object({
            codigo: z.string().min(1),
            nombre: z.string().nullable(),
            nivel: z.number().int(),
            saldo: z.number(),
          }),
        )
        .min(1)
        .max(100000),
      archivoNombre: z.string().optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const { cuentas, archivoNombre } = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

    await db.delete(cuentasBalanceComparativo).where(eq(cuentasBalanceComparativo.auditoriaId, id))
    const valores = cuentas.map((ct) => ({
      auditoriaId: id,
      codigo: ct.codigo,
      nombre: ct.nombre,
      nivel: ct.nivel,
      saldo: ct.saldo.toFixed(2),
    }))
    for (let i = 0; i < valores.length; i += 1000) {
      await db.insert(cuentasBalanceComparativo).values(valores.slice(i, i + 1000))
    }

    await db
      .insert(balanceMeta)
      .values({ auditoriaId: id, comparativoNombre: archivoNombre ?? null, comparativoCreatedAt: new Date() })
      .onConflictDoUpdate({
        target: balanceMeta.auditoriaId,
        set: { comparativoNombre: archivoNombre ?? null, comparativoCreatedAt: new Date(), updatedAt: new Date() },
      })

    registrarEvento(c.get('user'), {
      accion: 'balance.comparativo_importar',
      entidad: 'balance',
      auditoriaId: id,
      detalle: { filas: cuentas.length, archivo: archivoNombre ?? null },
    })

    return c.json({ data: { importadas: cuentas.length } }, 201)
  },
)

// DELETE /auditorias/:id/balance/comparativo
app.delete('/auditorias/:id/balance/comparativo', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  await db.delete(cuentasBalanceComparativo).where(eq(cuentasBalanceComparativo.auditoriaId, id))
  await db
    .update(balanceMeta)
    .set({ comparativoNombre: null, comparativoCreatedAt: null, updatedAt: new Date() })
    .where(eq(balanceMeta.auditoriaId, id))
  return c.json({ data: { ok: true } })
})

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
    z
      .object({
        fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
        fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
        tipoServicio: z.enum(['revisoria_fiscal', 'auditoria_interna']).default('revisoria_fiscal'),
        tipo: z.enum(['financiera', 'integral', 'especial']).optional(),
        socioId: z.string().uuid(),
      })
      .superRefine((val, ctx) => {
        if (val.tipoServicio === 'revisoria_fiscal' && !val.tipo) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'El tipo de auditoría es obligatorio para Revisoría Fiscal',
            path: ['tipo'],
          })
        }
        if (val.fechaInicio >= val.fechaFin) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'La fecha de fin debe ser posterior a la fecha de inicio',
            path: ['fechaFin'],
          })
        }
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
      .values({
        empresaId,
        socioId: body.socioId,
        fechaInicio: body.fechaInicio,
        fechaFin: body.fechaFin,
        tipoServicio: body.tipoServicio,
        tipo: body.tipo ?? null,
      })
      .returning()

    registrarEvento(c.get('user'), {
      accion: 'auditoria.crear',
      entidad: 'auditoria',
      entidadId: auditoria.id,
      auditoriaId: auditoria.id,
      empresaId,
      detalle: { fechaInicio: body.fechaInicio, fechaFin: body.fechaFin, tipoServicio: body.tipoServicio },
    })

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

// PATCH /auditorias/:id — editar datos del encargo. Regla: solo el socio responsable.
// El tipo de servicio (revisoria_fiscal/auditoria_interna) NO se puede cambiar: fija el flujo.
app.patch(
  '/auditorias/:id',
  zValidator(
    'json',
    z.object({
      fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
      fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
      tipo: z.enum(['financiera', 'integral', 'especial']).optional(),
      socioId: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId } = user
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
    }

    if (!esSocioResponsable(user, row.auditoria)) {
      return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
    }

    const fechaInicio = body.fechaInicio ?? row.auditoria.fechaInicio
    const fechaFin = body.fechaFin ?? row.auditoria.fechaFin
    if (fechaInicio >= fechaFin) {
      return c.json(
        { error: { code: 'FECHAS_INVALIDAS', message: 'La fecha de fin debe ser posterior a la fecha de inicio' } },
        409,
      )
    }

    // Si se reasigna el socio responsable, debe ser un usuario de la misma firma.
    if (body.socioId && body.socioId !== row.auditoria.socioId) {
      const [nuevoSocio] = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(and(eq(usuarios.id, body.socioId), eq(usuarios.firmaId, firmaId)))
      if (!nuevoSocio) {
        return c.json({ error: { code: 'SOCIO_INVALIDO', message: 'El socio responsable no pertenece a la firma' } }, 400)
      }
    }

    const cambios: Partial<typeof auditorias.$inferInsert> = {}
    if (body.fechaInicio) cambios.fechaInicio = body.fechaInicio
    if (body.fechaFin) cambios.fechaFin = body.fechaFin
    if (body.socioId) cambios.socioId = body.socioId
    // El tipo (modalidad) solo aplica a Revisoría Fiscal.
    if (row.auditoria.tipoServicio === 'revisoria_fiscal' && body.tipo) cambios.tipo = body.tipo

    if (Object.keys(cambios).length === 0) {
      return c.json({ data: row.auditoria })
    }

    const [actualizada] = await db
      .update(auditorias)
      .set(cambios)
      .where(eq(auditorias.id, id))
      .returning()

    registrarEvento(user, {
      accion: 'auditoria.editar',
      entidad: 'auditoria',
      entidadId: id,
      auditoriaId: id,
      empresaId: row.empresa.id,
      detalle: cambios,
    })

    return c.json({ data: actualizada })
  },
)

// DELETE /auditorias/:id — elimina el encargo y TODA su información relacionada (cascada).
// Regla: solo el socio responsable. Acción irreversible; el frontend exige confirmación escrita.
app.delete('/auditorias/:id', async (c) => {
  const user = c.get('user')
  const { firmaId } = user
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  if (!esSocioResponsable(user, row.auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
  }

  // Archivos físicos de la evidencia: se recogen antes para limpiarlos del storage tras el commit.
  const papeles = await db
    .select({ id: papelesTrabajo.id })
    .from(papelesTrabajo)
    .where(eq(papelesTrabajo.auditoriaId, id))
  const papelIds = papeles.map((p) => p.id)
  const claves = papelIds.length
    ? (
        await db
          .select({ key: evidencias.archivoKey })
          .from(evidencias)
          .where(inArray(evidencias.papelTrabajoId, papelIds))
      )
        .map((e) => e.key)
        .filter((k): k is string => !!k)
    : []

  // Borrado en cascada dentro de una transacción: hijos y referencias cruzadas primero.
  await db.transaction(async (tx) => {
    await tx.delete(muestras).where(eq(muestras.auditoriaId, id)) // cascada → muestra_items
    await tx.delete(solicitudesPbc).where(eq(solicitudesPbc.auditoriaId, id)) // ref → evidencias, papeles
    await tx.delete(notasRevision).where(eq(notasRevision.auditoriaId, id)) // ref → papeles
    await tx.delete(tareas).where(eq(tareas.auditoriaId, id)) // ref → papeles, riesgos
    await tx.delete(hallazgos).where(eq(hallazgos.auditoriaId, id)) // ref → papeles, ajustes
    if (papelIds.length) {
      await tx.delete(evidencias).where(inArray(evidencias.papelTrabajoId, papelIds)) // ref → papeles
    }
    await tx.delete(ajustes).where(eq(ajustes.auditoriaId, id))
    await tx.delete(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)) // ref → riesgos
    await tx.delete(riesgos).where(eq(riesgos.auditoriaId, id))
    await tx.delete(hallazgosAI).where(eq(hallazgosAI.auditoriaId, id)) // ref → programas_ai
    await tx.delete(programasAI).where(eq(programasAI.auditoriaId, id))
    await tx.delete(controlesCoso).where(eq(controlesCoso.auditoriaId, id))
    await tx.delete(materialidades).where(eq(materialidades.auditoriaId, id))
    await tx.delete(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, id))
    await tx.delete(cuentasBalance).where(eq(cuentasBalance.auditoriaId, id))
    await tx.delete(balanceArchivos).where(eq(balanceArchivos.auditoriaId, id))
    await tx.delete(cuentasBalanceComparativo).where(eq(cuentasBalanceComparativo.auditoriaId, id))
    await tx.delete(balanceMeta).where(eq(balanceMeta.auditoriaId, id))
    await tx.delete(informes).where(eq(informes.auditoriaId, id))
    await tx.delete(cierresAuditoria).where(eq(cierresAuditoria.auditoriaId, id))
    await tx.delete(eventos).where(eq(eventos.auditoriaId, id)) // pista propia del encargo
    await tx.delete(auditorias).where(eq(auditorias.id, id))
  })

  // Limpieza best-effort de los archivos en disco/S3 (fuera de la transacción).
  for (const key of claves) await storage.eliminar(key).catch(() => {})

  // Registro permanente a nivel de empresa: sobrevive al borrado del encargo (auditoriaId = null).
  registrarEvento(user, {
    accion: 'auditoria.eliminar',
    entidad: 'auditoria',
    entidadId: id,
    empresaId: row.empresa.id,
    detalle: {
      periodo: `${row.auditoria.fechaInicio} → ${row.auditoria.fechaFin}`,
      tipoServicio: row.auditoria.tipoServicio,
      papeles: papelIds.length,
    },
  })

  return c.json({ data: { id } })
})

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
  const user = c.get('user')
  const { firmaId, sub } = user
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  if (!esSocioResponsable(user, row.auditoria)) {
    return c.json({ error: ERROR_NO_SOCIO_RESPONSABLE }, 403)
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

  registrarEvento(user, {
    accion: 'materialidad.aprobar',
    entidad: 'materialidad',
    entidadId: aprobada.id,
    auditoriaId: id,
    detalle: { materialidad: aprobada.materialidad, base: aprobada.baseCalculo },
  })

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

// DELETE /auditorias/:id/riesgos/:riesgoId — borra el riesgo y, en cascada, los papeles de
// trabajo que lo atienden (con sus tareas, evidencia, muestras, PBC, notas y hallazgos).
// El frontend exige confirmación previa cuando hay papeles enlazados.
app.delete('/auditorias/:id/riesgos/:riesgoId', async (c) => {
  const user = c.get('user')
  const { firmaId } = user
  const id = c.req.param('id')
  const riesgoId = c.req.param('riesgoId')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)
  }

  const [riesgo] = await db
    .select({ id: riesgos.id })
    .from(riesgos)
    .where(and(eq(riesgos.id, riesgoId), eq(riesgos.auditoriaId, id)))
  if (!riesgo) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Riesgo no encontrado' } }, 404)
  }

  // Papeles de trabajo que responden a este riesgo (se borran en cascada con sus hijos).
  const papeles = await db
    .select({ id: papelesTrabajo.id })
    .from(papelesTrabajo)
    .where(and(eq(papelesTrabajo.riesgoId, riesgoId), eq(papelesTrabajo.auditoriaId, id)))
  const papelIds = papeles.map((p) => p.id)

  // Archivos físicos de la evidencia de esos papeles: se limpian tras el commit.
  const claves = papelIds.length
    ? (
        await db
          .select({ key: evidencias.archivoKey })
          .from(evidencias)
          .where(inArray(evidencias.papelTrabajoId, papelIds))
      )
        .map((e) => e.key)
        .filter((k): k is string => !!k)
    : []

  await db.transaction(async (tx) => {
    if (papelIds.length) {
      await tx.delete(muestras).where(inArray(muestras.papelTrabajoId, papelIds)) // cascada → muestra_items
      await tx.delete(solicitudesPbc).where(inArray(solicitudesPbc.papelTrabajoId, papelIds)) // ref → evidencias
      await tx.delete(notasRevision).where(inArray(notasRevision.papelTrabajoId, papelIds))
      await tx.delete(hallazgos).where(inArray(hallazgos.papelTrabajoId, papelIds))
      await tx.delete(evidencias).where(inArray(evidencias.papelTrabajoId, papelIds))
    }
    // Tareas ligadas al riesgo o a cualquiera de sus papeles.
    await tx.delete(tareas).where(
      papelIds.length
        ? or(eq(tareas.riesgoId, riesgoId), inArray(tareas.papelTrabajoId, papelIds))
        : eq(tareas.riesgoId, riesgoId),
    )
    if (papelIds.length) {
      await tx.delete(papelesTrabajo).where(inArray(papelesTrabajo.id, papelIds)) // ref → riesgos
    }
    await tx.delete(riesgos).where(eq(riesgos.id, riesgoId))
  })

  for (const key of claves) await storage.eliminar(key).catch(() => {})

  registrarEvento(user, {
    accion: 'riesgo.eliminar',
    entidad: 'riesgo',
    entidadId: riesgoId,
    auditoriaId: id,
    empresaId: row.empresa.id,
    detalle: { papeles: papelIds.length },
  })

  return c.json({ data: { id: riesgoId, papelesEliminados: papelIds.length } })
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

// ─── Riesgos candidatos desde el balance (analíticos) ────────────────────────

type AreaR = (typeof AREAS)[number]

const AREA_POR_GRUPO: Record<string, AreaR> = {
  '11': 'efectivo', '13': 'cartera', '14': 'inventarios', '15': 'propiedad_planta_equipo',
  '22': 'proveedores', '23': 'proveedores', '24': 'impuestos', '25': 'nomina',
  '41': 'ingresos', '42': 'ingresos', '51': 'gastos', '52': 'gastos', '53': 'gastos',
  '54': 'impuestos', '61': 'gastos', '62': 'gastos',
}
const AREA_POR_CLASE: Record<string, AreaR> = { '3': 'patrimonio', '4': 'ingresos', '5': 'gastos', '6': 'gastos', '7': 'gastos' }

function areaDesdeCodigo(cod: string): AreaR {
  const g = cod.slice(0, 2)
  if (AREA_POR_GRUPO[g]) return AREA_POR_GRUPO[g]
  return AREA_POR_CLASE[cod[0]] ?? 'otro'
}

const ASERCION: Record<AreaR, string> = {
  efectivo: 'existencia', cartera: 'valuación y existencia', inventarios: 'valuación y existencia',
  propiedad_planta_equipo: 'existencia y valuación', proveedores: 'integridad', impuestos: 'exactitud',
  nomina: 'integridad', ingresos: 'ocurrencia y corte', gastos: 'integridad y exactitud',
  patrimonio: 'exactitud', otro: 'valuación',
}
const RESPUESTA: Record<AreaR, string> = {
  efectivo: 'Confirmación bancaria y revisión de conciliaciones.',
  cartera: 'Circularización a clientes y análisis de antigüedad.',
  inventarios: 'Observación de toma física y pruebas de valuación.',
  propiedad_planta_equipo: 'Inspección física y recálculo de depreciación.',
  proveedores: 'Confirmación a proveedores y pruebas de corte de pasivos.',
  impuestos: 'Recálculo y conciliación con las declaraciones tributarias.',
  nomina: 'Recálculo de prestaciones y verificación de seguridad social.',
  ingresos: 'Pruebas de corte de ingresos y análisis de márgenes.',
  gastos: 'Pruebas de soporte y razonabilidad de gastos.',
  patrimonio: 'Revisión de movimientos del patrimonio y actas.',
  otro: 'Procedimientos sustantivos acordes a la naturaleza de la cuenta.',
}

const copCO = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

// GET /auditorias/:id/riesgos/candidatos — propone riesgos desde cuentas significativas/anómalas
app.get('/auditorias/:id/riesgos/candidatos', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const row = await cargarAuditoria(id, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

  // Trabaja a nivel de cuenta (4 dígitos).
  const cuentas = await db
    .select()
    .from(cuentasBalance)
    .where(and(eq(cuentasBalance.auditoriaId, id), eq(cuentasBalance.nivel, 4)))
    .orderBy(cuentasBalance.codigo)

  const [mat] = await db.select().from(materialidades).where(eq(materialidades.auditoriaId, id))
  const umbral = mat ? Number(mat.materialidadDesempeno || mat.materialidad) : null

  // Misma base de comparación honesta que GET /balance: comparativo real si está
  // cargado; sin él, el saldo inicial solo en cuentas de balance.
  const comparativoRows = await db
    .select()
    .from(cuentasBalanceComparativo)
    .where(and(eq(cuentasBalanceComparativo.auditoriaId, id), eq(cuentasBalanceComparativo.nivel, 4)))
  const compPorCodigo = new Map(comparativoRows.map((r) => [r.codigo, Number(r.saldo)]))
  const compCargado = comparativoRows.length > 0

  const candidatos = cuentas
    .map((ct) => {
      const actual = Number(ct.saldoActual)
      const base = compCargado
        ? (compPorCodigo.get(ct.codigo) ?? 0)
        : esClaseBalance(ct.codigo) ? Number(ct.saldoInicial) : null
      const variacionPct = base !== null && base !== 0 ? ((actual - base) / Math.abs(base)) * 100 : null
      const significativa = umbral !== null && Math.abs(actual) > umbral
      const anomalia =
        base !== null &&
        ((variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION_PCT) || (base === 0 && actual !== 0))
      return { ct, actual, variacionPct, significativa, anomalia }
    })
    .filter((x) => x.significativa || x.anomalia)
    .map(({ ct, actual, variacionPct, significativa, anomalia }) => {
      const area = areaDesdeCodigo(ct.codigo)
      const nombre = ct.nombre ?? `Cuenta ${ct.codigo}`
      const refBase = compCargado ? 'frente al mismo corte del año anterior' : 'frente al saldo inicial del período'
      const pct = variacionPct === null ? 'nuevo' : `${variacionPct > 0 ? '+' : ''}${variacionPct.toFixed(0)}%`
      const motivo: 'significativa' | 'anomalia' | 'ambas' = significativa && anomalia ? 'ambas' : anomalia ? 'anomalia' : 'significativa'
      let descripcion: string
      if (motivo === 'ambas') descripcion = `${nombre} (${ct.codigo}): cuenta significativa con variación inusual de ${pct} ${refBase}. Posible riesgo de ${ASERCION[area]}.`
      else if (motivo === 'anomalia') descripcion = `${nombre} (${ct.codigo}): variación inusual de ${pct} ${refBase}. Posible riesgo de ${ASERCION[area]}.`
      else descripcion = `${nombre} (${ct.codigo}): saldo significativo de ${copCO(actual)}. Posible riesgo de ${ASERCION[area]}.`
      return {
        codigo: ct.codigo,
        cuentaNombre: ct.nombre,
        area,
        descripcion,
        riesgoInherente: (anomalia ? 'alto' : 'medio') as 'alto' | 'medio',
        respuestaPlaneada: RESPUESTA[area],
        motivo,
        _orden: Math.abs(actual),
      }
    })
    .sort((a, b) => b._orden - a._orden)
    .slice(0, 25)
    .map(({ _orden, ...rest }) => rest)

  return c.json({ data: candidatos })
})

// POST /auditorias/:id/riesgos/agregar-candidatos — inserta los candidatos elegidos (origen analítico)
app.post(
  '/auditorias/:id/riesgos/agregar-candidatos',
  zValidator(
    'json',
    z.object({
      candidatos: z
        .array(
          z.object({
            area: z.enum(AREAS),
            descripcion: z.string().min(3),
            riesgoInherente: z.enum(['bajo', 'medio', 'alto']),
            respuestaPlaneada: z.string().optional(),
          }),
        )
        .min(1)
        .max(50),
      // 'analitico' (candidatos del balance) o 'sugerido' (sugerencias de IA/catálogo)
      origen: z.enum(['analitico', 'sugerido']).default('analitico'),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const { candidatos, origen } = c.req.valid('json')

    const row = await cargarAuditoria(id, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Auditoría no encontrada' } }, 404)

    const insertados = await db
      .insert(riesgos)
      .values(
        candidatos.map((s) => ({
          auditoriaId: id,
          area: s.area,
          descripcion: s.descripcion,
          riesgoInherente: s.riesgoInherente,
          riesgoControl: 'alto' as const,
          riesgoCombinado: combinarRiesgo(s.riesgoInherente, 'alto'),
          respuestaPlaneada: s.respuestaPlaneada ?? null,
          origen,
        })),
      )
      .returning()

    return c.json({ data: insertados }, 201)
  },
)

export default app
