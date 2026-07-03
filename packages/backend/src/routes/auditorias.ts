import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq, lte, isNull, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'
import { db } from '../db/client'
import {
  auditorias, empresas, materialidades, riesgos,
  papelesTrabajo, controlesCoso, tareas, informes, programasAI, hallazgosAI,
  entendimientoPeriodo, cuentasBalance, balanceArchivos, eventos, usuarios,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { esSocioResponsable, ERROR_NO_SOCIO_RESPONSABLE } from '../lib/permisos'
import { registrarEvento } from '../lib/eventos'
import { sugerirRiesgos } from '../lib/ia'
import { claseDesdeCodigo, nivelCombinado } from '@auditorya/types'
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

  const [riesgosRows, materialidadRows, papelesRows, cosoRows, tareasRows, informesRows, programasRows, hallazgosRows, entendimientoRows, balanceRows] =
    await Promise.all([
      db.select({ combinado: riesgos.riesgoCombinado, respuesta: riesgos.respuestaPlaneada }).from(riesgos).where(eq(riesgos.auditoriaId, id)),
      db.select({ id: materialidades.id }).from(materialidades).where(eq(materialidades.auditoriaId, id)),
      db.select({ estado: papelesTrabajo.estado }).from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, id)),
      db.select({ componente: controlesCoso.componente }).from(controlesCoso).where(eq(controlesCoso.auditoriaId, id)),
      db.select({ estado: tareas.estado }).from(tareas).where(eq(tareas.auditoriaId, id)),
      db.select({ tipo: informes.tipo, estado: informes.estado }).from(informes).where(eq(informes.auditoriaId, id)),
      db.select({ estado: programasAI.estado }).from(programasAI).where(eq(programasAI.auditoriaId, id)),
      db.select({ id: hallazgosAI.id }).from(hallazgosAI).where(eq(hallazgosAI.auditoriaId, id)),
      db.select({ confirmado: entendimientoPeriodo.confirmado }).from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, id)),
      db.select({ id: cuentasBalance.id }).from(cuentasBalance).where(eq(cuentasBalance.auditoriaId, id)).limit(1),
    ])

  const mapaInformes: Record<string, string> = {}
  for (const inf of informesRows) mapaInformes[inf.tipo] = inf.estado

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
      cosoEvaluados: cosoRows.length,
      tareasTotal: tareasRows.length,
      tareasCompletadas: tareasRows.filter((t) => t.estado === 'completada').length,
      informes: mapaInformes,
      programasTotal: programasRows.length,
      programasCompletados: programasRows.filter((p) => p.estado === 'completado').length,
      hallazgosTotal: hallazgosRows.length,
    },
  })
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

  const analizadas = cuentas.map((ct) => {
    const actual = Number(ct.saldoActual)
    const anterior = Number(ct.saldoAnterior)
    const variacionAbs = actual - anterior
    const variacionPct = anterior !== 0 ? (variacionAbs / Math.abs(anterior)) * 100 : null
    const significativa = umbral !== null && Math.abs(actual) > umbral
    const anomalia =
      (variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION_PCT) ||
      (anterior === 0 && actual !== 0)
    return {
      codigo: ct.codigo,
      nombre: ct.nombre,
      clase: ct.clase,
      nivel: ct.nivel,
      saldoActual: actual,
      saldoAnterior: anterior,
      variacionAbs,
      variacionPct,
      significativa,
      anomalia,
    }
  })

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

  return c.json({
    data: {
      cuentas: analizadas,
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
            saldoAnterior: z.number(),
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
    }),
  ),
  async (c) => {
    const { firmaId, sub } = c.get('user')
    const id = c.req.param('id')
    const { cuentas, archivo } = c.req.valid('json')

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
      saldoAnterior: ct.saldoAnterior.toFixed(2),
      debito: ct.debito != null ? ct.debito.toFixed(2) : null,
      credito: ct.credito != null ? ct.credito.toFixed(2) : null,
    }))
    // Inserta por lotes para no exceder el límite de parámetros de Postgres.
    for (let i = 0; i < valores.length; i += 1000) {
      await db.insert(cuentasBalance).values(valores.slice(i, i + 1000))
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
        periodo: z.string().min(4),
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
        periodo: body.periodo,
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
      detalle: { periodo: body.periodo, tipoServicio: body.tipoServicio },
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

  const candidatos = cuentas
    .map((ct) => {
      const actual = Number(ct.saldoActual)
      const anterior = Number(ct.saldoAnterior)
      const variacionPct = anterior !== 0 ? ((actual - anterior) / Math.abs(anterior)) * 100 : null
      const significativa = umbral !== null && Math.abs(actual) > umbral
      const anomalia = (variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION_PCT) || (anterior === 0 && actual !== 0)
      return { ct, actual, variacionPct, significativa, anomalia }
    })
    .filter((x) => x.significativa || x.anomalia)
    .map(({ ct, actual, variacionPct, significativa, anomalia }) => {
      const area = areaDesdeCodigo(ct.codigo)
      const nombre = ct.nombre ?? `Cuenta ${ct.codigo}`
      const pct = variacionPct === null ? 'nuevo' : `${variacionPct > 0 ? '+' : ''}${variacionPct.toFixed(0)}%`
      const motivo: 'significativa' | 'anomalia' | 'ambas' = significativa && anomalia ? 'ambas' : anomalia ? 'anomalia' : 'significativa'
      let descripcion: string
      if (motivo === 'ambas') descripcion = `${nombre} (${ct.codigo}): cuenta significativa con variación inusual de ${pct} frente al período anterior. Posible riesgo de ${ASERCION[area]}.`
      else if (motivo === 'anomalia') descripcion = `${nombre} (${ct.codigo}): variación inusual de ${pct} frente al período anterior. Posible riesgo de ${ASERCION[area]}.`
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
