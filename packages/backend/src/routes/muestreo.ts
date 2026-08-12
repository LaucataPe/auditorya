import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import {
  auditorias,
  empresas,
  papelesTrabajo,
  cuentasBalance,
  materialidades,
  muestras,
  muestraItems,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { encargoCerrado, ERROR_ENCARGO_CERRADO } from '../lib/encargo'
import { registrarEvento } from '../lib/eventos'
import { seleccionarMuestra, resumirMuestra, type TerceroSaldo } from '@auditorya/types'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0,
  )

// ─── Helpers (verifican pertenencia a la firma) ──────────────────────────────

async function cargarPapel(papelId: string, firmaId: string) {
  const [row] = await db
    .select({ papel: papelesTrabajo, auditoria: auditorias })
    .from(papelesTrabajo)
    .innerJoin(auditorias, eq(papelesTrabajo.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(papelesTrabajo.id, papelId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

async function cargarItem(itemId: string, firmaId: string) {
  const [row] = await db
    .select({ item: muestraItems, muestra: muestras, papel: papelesTrabajo })
    .from(muestraItems)
    .innerJoin(muestras, eq(muestraItems.muestraId, muestras.id))
    .innerJoin(papelesTrabajo, eq(muestras.papelTrabajoId, papelesTrabajo.id))
    .innerJoin(auditorias, eq(muestras.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(muestraItems.id, itemId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

async function cargarMuestra(muestraId: string, firmaId: string) {
  const [row] = await db
    .select({ muestra: muestras, papel: papelesTrabajo })
    .from(muestras)
    .innerJoin(papelesTrabajo, eq(muestras.papelTrabajoId, papelesTrabajo.id))
    .innerJoin(auditorias, eq(muestras.auditoriaId, auditorias.id))
    .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(and(eq(muestras.id, muestraId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

/** Población por tercero de una cuenta (código PUC como prefijo). */
async function poblacionPorTercero(auditoriaId: string, codigoCuenta: string): Promise<TerceroSaldo[]> {
  const filas = await db
    .select({
      tercero: cuentasBalance.tercero,
      terceroNombre: cuentasBalance.terceroNombre,
      saldo: cuentasBalance.saldoActual,
    })
    .from(cuentasBalance)
    .where(
      and(
        eq(cuentasBalance.auditoriaId, auditoriaId),
        sql`${cuentasBalance.tercero} is not null`,
        sql`${cuentasBalance.codigo} like ${codigoCuenta + '%'}`,
      ),
    )
  return filas.map((f) => ({ tercero: f.tercero, terceroNombre: f.terceroNombre, saldo: Number(f.saldo) }))
}

/** Reconstruye la MuestraConItems (muestra + items + resumen recalculado). */
async function armarMuestra(muestraRow: typeof muestras.$inferSelect) {
  const items = await db
    .select()
    .from(muestraItems)
    .where(eq(muestraItems.muestraId, muestraRow.id))
    .orderBy(sql`abs(${muestraItems.saldo}) desc`)

  const poblacion = await poblacionPorTercero(muestraRow.auditoriaId, muestraRow.codigoCuenta)
  const incluidos = items
    .filter((i) => i.incluido)
    .map((i) => ({ tercero: i.tercero, terceroNombre: i.terceroNombre, saldo: Number(i.saldo), esClave: i.esClave }))
  const resumen = resumirMuestra(poblacion, incluidos)

  return { ...muestraRow, items, resumen }
}

/** Escribe en papel.alcance un resumen legible de la muestra (NIA 230/530). */
async function sincronizarAlcance(
  papelId: string,
  muestraRow: typeof muestras.$inferSelect,
  resumen: { numPoblacion: number; saldoPoblacion: number; numMuestra: number; saldoMuestra: number; coberturaPct: number; numClave: number },
) {
  const texto =
    `Muestreo (cobertura + partidas clave) sobre la cuenta ${muestraRow.codigoCuenta}. ` +
    `${resumen.numMuestra} de ${resumen.numPoblacion} terceros seleccionados — cobertura ${resumen.coberturaPct.toFixed(0)}% ` +
    `del saldo (${cop(resumen.saldoMuestra)} de ${cop(resumen.saldoPoblacion)}). Partidas clave: ${resumen.numClave}.`
  await db.update(papelesTrabajo).set({ alcance: texto }).where(eq(papelesTrabajo.id, papelId))
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

// GET /papeles/:papelId/muestra — muestra actual (o null) con items y resumen
app.get('/papeles/:papelId/muestra', async (c) => {
  const { firmaId } = c.get('user')
  const papelId = c.req.param('papelId')

  const papel = await cargarPapel(papelId, firmaId)
  if (!papel) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel no encontrado' } }, 404)

  const [muestraRow] = await db.select().from(muestras).where(eq(muestras.papelTrabajoId, papelId))
  if (!muestraRow) return c.json({ data: null })

  return c.json({ data: await armarMuestra(muestraRow) })
})

// POST /papeles/:papelId/muestra/generar — calcula/reemplaza la muestra
app.post(
  '/papeles/:papelId/muestra/generar',
  zValidator(
    'json',
    z.object({
      codigoCuenta: z.string().min(1).max(20),
      coberturaObjetivo: z.number().min(0).max(1).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const papelId = c.req.param('papelId')
    const { codigoCuenta, coberturaObjetivo } = c.req.valid('json')

    const papel = await cargarPapel(papelId, user.firmaId)
    if (!papel) return c.json({ error: { code: 'NOT_FOUND', message: 'Papel no encontrado' } }, 404)
    if (await encargoCerrado(papel.auditoria.id)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)
    if (papel.papel.estado === 'aprobado') {
      return c.json(
        { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la muestra de un papel aprobado. Reábrelo primero.' } },
        409,
      )
    }

    const poblacion = await poblacionPorTercero(papel.auditoria.id, codigoCuenta)
    if (poblacion.length === 0) {
      return c.json(
        {
          error: {
            code: 'SIN_POBLACION',
            message: `No hay detalle por tercero para la cuenta ${codigoCuenta}. Verifica el código o que el balance tenga terceros.`,
          },
        },
        409,
      )
    }

    const [mat] = await db.select().from(materialidades).where(eq(materialidades.auditoriaId, papel.auditoria.id))
    const materialidad = mat ? Number(mat.materialidadDesempeno || mat.materialidad) : null

    const seleccion = seleccionarMuestra(poblacion, { materialidad, coberturaObjetivo })

    // Reemplaza la muestra anterior del papel (los items caen por ON DELETE CASCADE).
    await db.delete(muestras).where(eq(muestras.papelTrabajoId, papelId))
    const [muestraRow] = await db
      .insert(muestras)
      .values({
        papelTrabajoId: papelId,
        auditoriaId: papel.auditoria.id,
        codigoCuenta,
        metodo: 'cobertura',
        coberturaObjetivo: String(coberturaObjetivo ?? 0.8),
        materialidad: materialidad !== null ? String(materialidad) : null,
      })
      .returning()

    if (seleccion.items.length > 0) {
      await db.insert(muestraItems).values(
        seleccion.items.map((i) => ({
          muestraId: muestraRow.id,
          cuentaCodigo: codigoCuenta,
          tercero: i.tercero,
          terceroNombre: i.terceroNombre,
          saldo: String(i.saldo),
          esClave: i.esClave,
          incluido: true,
        })),
      )
    }

    await sincronizarAlcance(papelId, muestraRow, seleccion.resumen)

    registrarEvento(user, {
      accion: 'muestra.generar',
      entidad: 'muestra',
      entidadId: muestraRow.id,
      auditoriaId: papel.auditoria.id,
      detalle: {
        codigoCuenta,
        numPoblacion: seleccion.resumen.numPoblacion,
        numMuestra: seleccion.resumen.numMuestra,
        coberturaPct: Math.round(seleccion.resumen.coberturaPct),
      },
    })

    return c.json({ data: await armarMuestra(muestraRow) }, 201)
  },
)

// PATCH /muestra-items/:itemId — incluir/excluir, resultado, diferencia, nota
app.patch(
  '/muestra-items/:itemId',
  zValidator(
    'json',
    z.object({
      incluido: z.boolean().optional(),
      resultado: z.enum(['pendiente', 'sin_diferencia', 'con_diferencia']).optional(),
      diferencia: z.number().nullable().optional(),
      nota: z.string().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const itemId = c.req.param('itemId')
    const body = c.req.valid('json')

    const row = await cargarItem(itemId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Ítem no encontrado' } }, 404)
    if (await encargoCerrado(row.muestra.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)
    if (row.papel.estado === 'aprobado') {
      return c.json(
        { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la muestra de un papel aprobado. Reábrelo primero.' } },
        409,
      )
    }

    const updates: Record<string, unknown> = {}
    if (body.incluido !== undefined) updates.incluido = body.incluido
    if (body.resultado !== undefined) updates.resultado = body.resultado
    if (body.diferencia !== undefined) updates.diferencia = body.diferencia === null ? null : String(body.diferencia)
    if (body.nota !== undefined) updates.nota = body.nota || null
    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    await db.update(muestraItems).set(updates).where(eq(muestraItems.id, itemId))

    // Si cambió la inclusión, el alcance del papel cambia: lo re-sincronizamos.
    const muestraArmada = await armarMuestra(row.muestra)
    if (body.incluido !== undefined) {
      await sincronizarAlcance(row.papel.id, row.muestra, muestraArmada.resumen)
    }

    // El resultado de la prueba sobre un ítem es un hecho de auditoría: queda en la pista.
    if (body.resultado !== undefined && body.resultado !== row.item.resultado) {
      registrarEvento(user, {
        accion: 'muestra_item.resultado',
        entidad: 'muestra_item',
        entidadId: itemId,
        auditoriaId: row.muestra.auditoriaId,
        detalle: { resultado: body.resultado, diferencia: body.diferencia ?? null, tercero: row.item.tercero },
      })
    }

    return c.json({ data: muestraArmada })
  },
)

// POST /muestras/:muestraId/items — añadir un tercero a mano (no clave)
app.post(
  '/muestras/:muestraId/items',
  zValidator(
    'json',
    z.object({
      tercero: z.string().nullable().optional(),
      terceroNombre: z.string().nullable().optional(),
      cuentaCodigo: z.string().nullable().optional(),
      saldo: z.number(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const muestraId = c.req.param('muestraId')
    const body = c.req.valid('json')

    const row = await cargarMuestra(muestraId, firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Muestra no encontrada' } }, 404)
    if (await encargoCerrado(row.muestra.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)
    if (row.papel.estado === 'aprobado') {
      return c.json(
        { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la muestra de un papel aprobado. Reábrelo primero.' } },
        409,
      )
    }

    await db.insert(muestraItems).values({
      muestraId,
      cuentaCodigo: body.cuentaCodigo ?? row.muestra.codigoCuenta,
      tercero: body.tercero ?? null,
      terceroNombre: body.terceroNombre ?? null,
      saldo: String(body.saldo),
      esClave: false,
      incluido: true,
    })

    const muestraArmada = await armarMuestra(row.muestra)
    await sincronizarAlcance(row.papel.id, row.muestra, muestraArmada.resumen)
    return c.json({ data: muestraArmada }, 201)
  },
)

// DELETE /muestra-items/:itemId — quitar un ítem de la muestra
app.delete('/muestra-items/:itemId', async (c) => {
  const { firmaId } = c.get('user')
  const itemId = c.req.param('itemId')

  const row = await cargarItem(itemId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Ítem no encontrado' } }, 404)
  if (await encargoCerrado(row.muestra.auditoriaId)) return c.json({ error: ERROR_ENCARGO_CERRADO }, 409)
  if (row.papel.estado === 'aprobado') {
    return c.json(
      { error: { code: 'PAPEL_APROBADO', message: 'No se puede modificar la muestra de un papel aprobado. Reábrelo primero.' } },
      409,
    )
  }

  await db.delete(muestraItems).where(eq(muestraItems.id, itemId))

  const muestraArmada = await armarMuestra(row.muestra)
  await sincronizarAlcance(row.papel.id, row.muestra, muestraArmada.resumen)
  return c.json({ data: muestraArmada })
})

export default app
