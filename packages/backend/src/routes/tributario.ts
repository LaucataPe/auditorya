/**
 * Módulo tributario — revisión recurrente de impuestos (revisoría fiscal).
 * A nivel de EMPRESA por año fiscal (vigencia), independiente de los encargos:
 * una obligación por impuesto × vigencia genera una revisión por período.
 * La firma del revisor sella la revisión con un snapshot inmutable (constancia);
 * solo un socio puede reabrirla y el snapshot siempre se conserva.
 */
import { createHash, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/client'
import {
  adjuntosTributarios,
  empresas,
  hallazgosTributarios,
  obligacionesTributarias,
  revisionesTributarias,
  usuarios,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import { mergeJsonbPatch } from '../lib/jsonb'
import { notificar } from '../lib/notificaciones'
import { storage, firmarDescarga } from '../lib/storage'
import {
  CIFRAS_CATALOGO,
  ESTADOS_HALLAZGO_TRIBUTARIO,
  IMPUESTOS_CATALOGO,
  PERIODICIDADES,
  TIPOS_ADJUNTO_POST_FIRMA,
  TIPOS_ADJUNTO_TRIBUTARIO,
  TIPOS_IMPUESTO,
  alcanceSugerido,
  etiquetaPeriodo,
  hallazgoTributarioPendiente,
  nombreObligacion,
  periodosDeVigencia,
  procedimientosSugeridos,
  type TipoAdjuntoTributario,
} from '@auditorya/types'
import type { JwtPayload } from '../lib/jwt'

const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const ERROR_REVISION_SELLADA = {
  code: 'REVISION_SELLADA',
  message: 'La revisión ya fue firmada; un socio debe reabrirla para modificarla',
} as const

// ─── Helpers (verifican pertenencia a la firma) ──────────────────────────────

async function cargarEmpresa(empresaId: string, firmaId: string) {
  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, empresaId), eq(empresas.firmaId, firmaId)))
  return empresa ?? null
}

async function cargarObligacion(obligacionId: string, firmaId: string) {
  const [row] = await db
    .select({ obligacion: obligacionesTributarias, empresa: empresas })
    .from(obligacionesTributarias)
    .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
    .where(and(eq(obligacionesTributarias.id, obligacionId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

async function cargarRevision(revisionId: string, firmaId: string) {
  const [row] = await db
    .select({
      revision: revisionesTributarias,
      obligacion: obligacionesTributarias,
      empresa: empresas,
    })
    .from(revisionesTributarias)
    .innerJoin(
      obligacionesTributarias,
      eq(revisionesTributarias.obligacionId, obligacionesTributarias.id),
    )
    .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
    .where(and(eq(revisionesTributarias.id, revisionId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

/** Mapa id → nombre de los usuarios de la firma (para asignado/revisor). */
async function nombresUsuarios(firmaId: string): Promise<Map<string, string>> {
  const filas = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(usuarios)
    .where(eq(usuarios.firmaId, firmaId))
  return new Map(filas.map((u) => [u.id, u.nombre]))
}

/**
 * Ids de los soportes que quedaron sellados en el snapshot de la firma. Lo que
 * se suba después (declaración presentada, recibo de pago) no está aquí: se
 * puede quitar, y la constancia lo marca como incorporado después de firmar.
 */
function idsAdjuntosSellados(snapshot: Record<string, unknown> | null): Set<string> {
  const lista = (snapshot?.adjuntos ?? []) as Array<{ id?: string }>
  return new Set(lista.map((a) => a.id).filter((id): id is string => !!id))
}

// ─── Matriz de la vigencia ───────────────────────────────────────────────────

// GET /empresas/:id/tributario?anio=YYYY — obligaciones de la vigencia con sus
// revisiones (la matriz completa) + años con datos (para el selector).
app.get('/empresas/:id/tributario', async (c) => {
  const { firmaId } = c.get('user')
  const empresaId = c.req.param('id')

  const empresa = await cargarEmpresa(empresaId, firmaId)
  if (!empresa) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  const anioParam = Number(c.req.query('anio'))
  const anio = Number.isInteger(anioParam) && anioParam > 2000 ? anioParam : new Date().getFullYear()

  const todas = await db
    .select({ anioFiscal: obligacionesTributarias.anioFiscal })
    .from(obligacionesTributarias)
    .where(eq(obligacionesTributarias.empresaId, empresaId))
  const anios = [...new Set(todas.map((o) => o.anioFiscal))].sort((a, b) => b - a)

  const obligaciones = await db
    .select()
    .from(obligacionesTributarias)
    .where(
      and(
        eq(obligacionesTributarias.empresaId, empresaId),
        eq(obligacionesTributarias.anioFiscal, anio),
      ),
    )
    .orderBy(asc(obligacionesTributarias.createdAt))

  const revisiones = obligaciones.length
    ? await db
        .select()
        .from(revisionesTributarias)
        .where(
          inArray(
            revisionesTributarias.obligacionId,
            obligaciones.map((o) => o.id),
          ),
        )
        .orderBy(asc(revisionesTributarias.periodo))
    : []

  const nombres = await nombresUsuarios(firmaId)
  const data = obligaciones.map((o) => ({
    ...o,
    asignadoNombre: (o.asignadoA && nombres.get(o.asignadoA)) ?? null,
    revisiones: revisiones
      .filter((r) => r.obligacionId === o.id)
      .map((r) => ({
        ...r,
        revisadoNombre: (r.revisadoPor && nombres.get(r.revisadoPor)) ?? null,
        snapshot: undefined, // la matriz no necesita el snapshot completo
      })),
  }))

  return c.json({ data: { anio, anios, obligaciones: data } })
})

// ─── Obligaciones ────────────────────────────────────────────────────────────

// POST /empresas/:id/tributario/obligaciones — crea la obligación y sus
// revisiones (una por período de la vigencia).
app.post(
  '/empresas/:id/tributario/obligaciones',
  zValidator(
    'json',
    z.object({
      anioFiscal: z.number().int().min(2000).max(2100),
      tipo: z.enum(TIPOS_IMPUESTO),
      nombre: z.string().trim().max(120).optional(),
      periodicidad: z.enum(PERIODICIDADES),
      asignadoA: z.string().uuid().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const empresaId = c.req.param('id')
    const body = c.req.valid('json')

    const empresa = await cargarEmpresa(empresaId, user.firmaId)
    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    if (body.tipo === 'otro' && !body.nombre) {
      return c.json(
        { error: { code: 'NOMBRE_REQUERIDO', message: 'Para "otro impuesto" indica el nombre de la obligación' } },
        400,
      )
    }

    // Evita duplicar la misma obligación en la vigencia ('otro' se distingue por nombre).
    const existentes = await db
      .select()
      .from(obligacionesTributarias)
      .where(
        and(
          eq(obligacionesTributarias.empresaId, empresaId),
          eq(obligacionesTributarias.anioFiscal, body.anioFiscal),
          eq(obligacionesTributarias.tipo, body.tipo),
        ),
      )
    const duplicada =
      body.tipo === 'otro'
        ? existentes.some((o) => (o.nombre ?? '').toLowerCase() === (body.nombre ?? '').toLowerCase())
        : existentes.length > 0
    if (duplicada) {
      return c.json(
        { error: { code: 'OBLIGACION_DUPLICADA', message: 'Esa obligación ya existe en la vigencia' } },
        409,
      )
    }

    const creada = await db.transaction(async (tx) => {
      const [obligacion] = await tx
        .insert(obligacionesTributarias)
        .values({
          empresaId,
          anioFiscal: body.anioFiscal,
          tipo: body.tipo,
          nombre: body.nombre || null,
          periodicidad: body.periodicidad,
          asignadoA: body.asignadoA ?? null,
        })
        .returning()

      const revisiones = await tx
        .insert(revisionesTributarias)
        .values(periodosDeVigencia(body.periodicidad).map((periodo) => ({ obligacionId: obligacion.id, periodo })))
        .returning()

      return { ...obligacion, revisiones }
    })

    registrarEvento(user, {
      accion: 'tributario.obligacion.crear',
      entidad: 'obligacion_tributaria',
      entidadId: creada.id,
      empresaId,
      detalle: {
        tipo: creada.tipo,
        nombre: nombreObligacion(creada),
        anioFiscal: creada.anioFiscal,
        periodicidad: creada.periodicidad,
        periodos: creada.revisiones.length,
      },
    })

    notificar(user, {
      para: creada.asignadoA,
      tipo: 'obligacion_asignada',
      mensaje: `Te asignaron la revisión de ${nombreObligacion(creada)} ${creada.anioFiscal} de ${empresa.nombre}`,
      empresaId,
    })

    return c.json({ data: creada }, 201)
  },
)

// POST /empresas/:id/tributario/copiar — copia la configuración de obligaciones
// de una vigencia a otra (las que aún no existan en el destino).
app.post(
  '/empresas/:id/tributario/copiar',
  zValidator(
    'json',
    z.object({
      desde: z.number().int().min(2000).max(2100),
      hacia: z.number().int().min(2000).max(2100),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const empresaId = c.req.param('id')
    const { desde, hacia } = c.req.valid('json')

    if (desde === hacia) {
      return c.json({ error: { code: 'VIGENCIA_IGUAL', message: 'Elige vigencias distintas' } }, 400)
    }
    const empresa = await cargarEmpresa(empresaId, user.firmaId)
    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    const [origen, destino] = await Promise.all([
      db
        .select()
        .from(obligacionesTributarias)
        .where(and(eq(obligacionesTributarias.empresaId, empresaId), eq(obligacionesTributarias.anioFiscal, desde))),
      db
        .select()
        .from(obligacionesTributarias)
        .where(and(eq(obligacionesTributarias.empresaId, empresaId), eq(obligacionesTributarias.anioFiscal, hacia))),
    ])
    if (origen.length === 0) {
      return c.json({ error: { code: 'SIN_ORIGEN', message: `La vigencia ${desde} no tiene obligaciones configuradas` } }, 404)
    }

    const yaExiste = (o: (typeof origen)[number]) =>
      destino.some(
        (d) => d.tipo === o.tipo && (o.tipo !== 'otro' || (d.nombre ?? '').toLowerCase() === (o.nombre ?? '').toLowerCase()),
      )
    const faltantes = origen.filter((o) => !yaExiste(o))

    const creadas = await db.transaction(async (tx) => {
      const resultado = []
      for (const o of faltantes) {
        const [obligacion] = await tx
          .insert(obligacionesTributarias)
          .values({
            empresaId,
            anioFiscal: hacia,
            tipo: o.tipo,
            nombre: o.nombre,
            periodicidad: o.periodicidad,
            asignadoA: o.asignadoA,
          })
          .returning()
        await tx
          .insert(revisionesTributarias)
          .values(periodosDeVigencia(o.periodicidad).map((periodo) => ({ obligacionId: obligacion.id, periodo })))
        resultado.push(obligacion)
      }
      return resultado
    })

    registrarEvento(user, {
      accion: 'tributario.copiar_vigencia',
      entidad: 'obligacion_tributaria',
      empresaId,
      detalle: { desde, hacia, copiadas: creadas.length, omitidas: origen.length - faltantes.length },
    })

    return c.json({ data: { copiadas: creadas.length } }, 201)
  },
)

// PATCH /tributario/obligaciones/:id — etiqueta y responsable
app.patch(
  '/tributario/obligaciones/:id',
  zValidator(
    'json',
    z.object({
      nombre: z.string().trim().max(120).optional(),
      asignadoA: z.string().uuid().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const obligacionId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarObligacion(obligacionId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Obligación no encontrada' } }, 404)

    const updates: Record<string, string | null> = {}
    if (body.nombre !== undefined) {
      if (row.obligacion.tipo === 'otro' && !body.nombre) {
        return c.json({ error: { code: 'NOMBRE_REQUERIDO', message: 'Para "otro impuesto" el nombre es obligatorio' } }, 400)
      }
      updates.nombre = body.nombre || null
    }
    if (body.asignadoA !== undefined) updates.asignadoA = body.asignadoA

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizada] = await db
      .update(obligacionesTributarias)
      .set(updates)
      .where(eq(obligacionesTributarias.id, obligacionId))
      .returning()

    registrarEvento(user, {
      accion: 'tributario.obligacion.editar',
      entidad: 'obligacion_tributaria',
      entidadId: obligacionId,
      empresaId: row.obligacion.empresaId,
      detalle: { campos: Object.keys(updates) },
    })

    if (body.asignadoA !== undefined && body.asignadoA && body.asignadoA !== row.obligacion.asignadoA) {
      notificar(user, {
        para: body.asignadoA,
        tipo: 'obligacion_asignada',
        mensaje: `Te asignaron la revisión de ${nombreObligacion(actualizada)} ${actualizada.anioFiscal} de ${row.empresa.nombre}`,
        empresaId: row.obligacion.empresaId,
      })
    }

    return c.json({ data: actualizada })
  },
)

// DELETE /tributario/obligaciones/:id — solo si ninguna revisión está firmada
app.delete('/tributario/obligaciones/:id', async (c) => {
  const user = c.get('user')
  const obligacionId = c.req.param('id')

  const row = await cargarObligacion(obligacionId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Obligación no encontrada' } }, 404)

  const revisiones = await db
    .select({ id: revisionesTributarias.id, estado: revisionesTributarias.estado })
    .from(revisionesTributarias)
    .where(eq(revisionesTributarias.obligacionId, obligacionId))

  if (revisiones.some((r) => r.estado === 'revisada')) {
    return c.json(
      { error: { code: 'CON_REVISIONES_FIRMADAS', message: 'No se puede eliminar: la obligación tiene revisiones firmadas (constancia)' } },
      409,
    )
  }

  // Archivos físicos de los adjuntos: se recogen antes para limpiarlos tras el commit.
  const revisionIds = revisiones.map((r) => r.id)
  const adjuntos = revisionIds.length
    ? await db
        .select({ key: adjuntosTributarios.archivoKey })
        .from(adjuntosTributarios)
        .where(inArray(adjuntosTributarios.revisionId, revisionIds))
    : []

  await db.transaction(async (tx) => {
    if (revisionIds.length) {
      // Adjuntos primero: la evidencia de un hallazgo referencia al hallazgo
      // (FK hallazgo_id) y bloquearía su borrado.
      await tx.delete(adjuntosTributarios).where(inArray(adjuntosTributarios.revisionId, revisionIds))
      await tx.delete(hallazgosTributarios).where(inArray(hallazgosTributarios.revisionId, revisionIds))
      await tx.delete(revisionesTributarias).where(eq(revisionesTributarias.obligacionId, obligacionId))
    }
    await tx.delete(obligacionesTributarias).where(eq(obligacionesTributarias.id, obligacionId))
  })

  for (const a of adjuntos) await storage.eliminar(a.key).catch(() => {})

  registrarEvento(user, {
    accion: 'tributario.obligacion.eliminar',
    entidad: 'obligacion_tributaria',
    entidadId: obligacionId,
    empresaId: row.obligacion.empresaId,
    detalle: {
      tipo: row.obligacion.tipo,
      nombre: nombreObligacion(row.obligacion),
      anioFiscal: row.obligacion.anioFiscal,
    },
  })

  return c.json({ data: { id: obligacionId } })
})

// ─── Revisiones ──────────────────────────────────────────────────────────────

// GET /tributario/revisiones/:id — detalle con obligación y adjuntos
app.get('/tributario/revisiones/:id', async (c) => {
  const { firmaId } = c.get('user')
  const revisionId = c.req.param('id')

  const row = await cargarRevision(revisionId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)

  const [adjuntos, hallazgos, nombres] = await Promise.all([
    db
      .select()
      .from(adjuntosTributarios)
      .where(eq(adjuntosTributarios.revisionId, revisionId))
      .orderBy(asc(adjuntosTributarios.createdAt)),
    db
      .select()
      .from(hallazgosTributarios)
      .where(eq(hallazgosTributarios.revisionId, revisionId))
      .orderBy(asc(hallazgosTributarios.createdAt)),
    nombresUsuarios(firmaId),
  ])

  const firmada = row.revision.estado === 'revisada'
  const sellados = idsAdjuntosSellados(row.revision.snapshot)

  return c.json({
    data: {
      ...row.revision,
      revisadoNombre: (row.revision.revisadoPor && nombres.get(row.revision.revisadoPor)) ?? null,
      obligacion: {
        ...row.obligacion,
        asignadoNombre: (row.obligacion.asignadoA && nombres.get(row.obligacion.asignadoA)) ?? null,
      },
      adjuntos: adjuntos.map((a) => ({ ...a, posteriorAFirma: firmada && !sellados.has(a.id) })),
      hallazgos,
    },
  })
})

// PATCH /tributario/revisiones/:id — checklist, cifras, textos, vencimiento, estado
app.patch(
  '/tributario/revisiones/:id',
  zValidator(
    'json',
    z.object({
      estado: z.enum(['pendiente', 'en_revision']).optional(),
      fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      // Parche parcial: cada id trae solo los campos que cambiaron (se funden
      // a nivel de campo en la columna, ver mergeJsonbPatch — nunca se envía
      // ni se persiste el objeto completo para evitar pisar ediciones concurrentes).
      checklistEstado: z
        .record(z.object({ hecho: z.boolean().optional(), nota: z.string().nullable().optional() }))
        .optional(),
      cifras: z
        .record(z.object({ declarado: z.number().nullable().optional(), libros: z.number().nullable().optional() }))
        .optional(),
      valorDeclarado: z.number().nullable().optional(),
      valorLibros: z.number().nullable().optional(),
      // Encabezado del papel de trabajo; null restaura el borrador sugerido.
      alcance: z.string().nullable().optional(),
      procedimientos: z.string().nullable().optional(),
      observaciones: z.string().nullable().optional(),
      conclusion: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const revisionId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarRevision(revisionId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)

    const updates: Record<string, unknown> = {}
    if (body.estado !== undefined) updates.estado = body.estado
    if (body.fechaVencimiento !== undefined) updates.fechaVencimiento = body.fechaVencimiento
    if (body.checklistEstado !== undefined) {
      updates.checklistEstado = mergeJsonbPatch(revisionesTributarias.checklistEstado, body.checklistEstado)
    }
    if (body.cifras !== undefined) {
      updates.cifras = mergeJsonbPatch(revisionesTributarias.cifras, body.cifras)
    }
    if (body.valorDeclarado !== undefined) {
      updates.valorDeclarado = body.valorDeclarado === null ? null : String(body.valorDeclarado)
    }
    if (body.valorLibros !== undefined) {
      updates.valorLibros = body.valorLibros === null ? null : String(body.valorLibros)
    }
    if (body.alcance !== undefined) updates.alcance = body.alcance || null
    if (body.procedimientos !== undefined) updates.procedimientos = body.procedimientos || null
    if (body.observaciones !== undefined) updates.observaciones = body.observaciones || null
    if (body.conclusion !== undefined) updates.conclusion = body.conclusion || null

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    // Diligenciar una revisión pendiente la pasa a "en revisión" automáticamente.
    if (row.revision.estado === 'pendiente' && body.estado === undefined) {
      updates.estado = 'en_revision'
    }

    const [actualizada] = await db
      .update(revisionesTributarias)
      .set(updates)
      .where(eq(revisionesTributarias.id, revisionId))
      .returning()

    registrarEvento(user, {
      accion: 'tributario.revision.editar',
      entidad: 'revision_tributaria',
      entidadId: revisionId,
      empresaId: row.obligacion.empresaId,
      detalle: {
        obligacion: nombreObligacion(row.obligacion),
        periodo: row.revision.periodo,
        campos: Object.keys(updates),
      },
    })

    return c.json({ data: actualizada })
  },
)

// POST /tributario/revisiones/:id/firmar — sella la revisión: constancia con
// snapshot inmutable. Exige conclusión y resultado.
app.post(
  '/tributario/revisiones/:id/firmar',
  zValidator(
    'json',
    z.object({
      resultado: z.enum(['sin_observaciones', 'con_observaciones']),
      conclusion: z.string().trim().min(1).optional(),
      observaciones: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const revisionId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarRevision(revisionId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)

    const conclusion = body.conclusion ?? row.revision.conclusion ?? ''
    if (!conclusion.trim()) {
      return c.json(
        { error: { code: 'SIN_CONCLUSION', message: 'La revisión necesita una conclusión documentada antes de firmarse' } },
        409,
      )
    }
    const [adjuntos, hallazgos] = await Promise.all([
      db.select().from(adjuntosTributarios).where(eq(adjuntosTributarios.revisionId, revisionId)),
      db.select().from(hallazgosTributarios).where(eq(hallazgosTributarios.revisionId, revisionId)),
    ])

    // "En trámite" también es pendiente: se está gestionando, no está cerrado.
    const pendientes = hallazgos.filter(hallazgoTributarioPendiente).length
    if (body.resultado === 'sin_observaciones' && pendientes > 0) {
      return c.json(
        {
          error: {
            code: 'HALLAZGOS_ABIERTOS',
            message: `La revisión tiene ${pendientes} hallazgo(s) pendiente(s) (abiertos o en trámite); el resultado debe ser "con observaciones" o resuélvelos antes de firmar`,
          },
        },
        409,
      )
    }
    if (body.resultado === 'con_observaciones' && hallazgos.length === 0) {
      const observaciones = body.observaciones !== undefined ? body.observaciones : row.revision.observaciones
      if (!(observaciones ?? '').trim()) {
        return c.json(
          { error: { code: 'SIN_OBSERVACIONES', message: 'Si el resultado es "con observaciones", documenta las observaciones o registra un hallazgo' } },
          409,
        )
      }
    }

    // El encabezado del papel de trabajo se materializa al firmar: si el
    // revisor nunca lo editó queda escrito el borrador vigente hoy, para que
    // la constancia no cambie si mañana se ajusta el catálogo.
    const alcance =
      row.revision.alcance ??
      alcanceSugerido({
        obligacion: row.obligacion,
        periodo: row.revision.periodo,
        empresaNombre: row.empresa.nombre,
      })
    const procedimientos = row.revision.procedimientos ?? procedimientosSugeridos(row.obligacion.tipo)

    // Firma + snapshot en la misma transacción: o quedan ambos, o ninguno.
    const firmada = await db.transaction(async (tx) => {
      const [r] = await tx
        .update(revisionesTributarias)
        .set({
          estado: 'revisada',
          resultado: body.resultado,
          conclusion,
          alcance,
          procedimientos,
          ...(body.observaciones !== undefined ? { observaciones: body.observaciones || null } : {}),
          revisadoPor: user.sub,
          revisadoAt: new Date(),
        })
        .where(eq(revisionesTributarias.id, revisionId))
        .returning()

      const [sellada] = await tx
        .update(revisionesTributarias)
        .set({
          snapshot: {
            obligacion: {
              tipo: row.obligacion.tipo,
              nombre: nombreObligacion(row.obligacion),
              anioFiscal: row.obligacion.anioFiscal,
              periodicidad: row.obligacion.periodicidad,
            },
            periodo: r.periodo,
            periodoEtiqueta: etiquetaPeriodo(row.obligacion.periodicidad, r.periodo),
            fechaVencimiento: r.fechaVencimiento,
            alcance: r.alcance,
            procedimientos: r.procedimientos,
            checklistEstado: r.checklistEstado,
            checklistCatalogo: IMPUESTOS_CATALOGO[row.obligacion.tipo].checklist,
            cifras: r.cifras,
            cifrasCatalogo: CIFRAS_CATALOGO[row.obligacion.tipo],
            valorDeclarado: r.valorDeclarado,
            valorLibros: r.valorLibros,
            observaciones: r.observaciones,
            conclusion: r.conclusion,
            resultado: r.resultado,
            revisadoPor: user.sub,
            revisadoAt: r.revisadoAt,
            adjuntos: adjuntos.map((a) => ({
              id: a.id,
              hallazgoId: a.hallazgoId,
              nombre: a.nombre,
              tipo: a.tipo,
              archivoNombre: a.archivoNombre,
              archivoHash: a.archivoHash,
              archivoTamano: a.archivoTamano,
            })),
            hallazgos: hallazgos.map((h) => ({
              id: h.id,
              descripcion: h.descripcion,
              recomendacion: h.recomendacion,
              monto: h.monto,
              severidad: h.severidad,
              estado: h.estado,
              seguimiento: h.seguimiento,
            })),
          },
        })
        .where(eq(revisionesTributarias.id, revisionId))
        .returning()

      return sellada
    })

    registrarEvento(user, {
      accion: 'tributario.revision.firmar',
      entidad: 'revision_tributaria',
      entidadId: revisionId,
      empresaId: row.obligacion.empresaId,
      detalle: {
        obligacion: nombreObligacion(row.obligacion),
        anioFiscal: row.obligacion.anioFiscal,
        periodo: row.revision.periodo,
        resultado: body.resultado,
        adjuntos: adjuntos.length,
        hallazgos: hallazgos.length,
      },
    })

    return c.json({ data: firmada })
  },
)

// POST /tributario/revisiones/:id/reabrir — solo rol socio; el snapshot de la
// firma anterior se conserva (la reapertura no borra el rastro).
app.post('/tributario/revisiones/:id/reabrir', async (c) => {
  const user = c.get('user')
  const revisionId = c.req.param('id')

  if (user.rol !== 'socio') {
    return c.json({ error: { code: 'SOLO_SOCIO', message: 'Solo un socio puede reabrir una revisión firmada' } }, 403)
  }

  const row = await cargarRevision(revisionId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  if (row.revision.estado !== 'revisada') {
    return c.json({ error: { code: 'NO_FIRMADA', message: 'La revisión no está firmada' } }, 409)
  }

  const [reabierta] = await db
    .update(revisionesTributarias)
    .set({ estado: 'en_revision', resultado: null, revisadoPor: null, revisadoAt: null })
    .where(eq(revisionesTributarias.id, revisionId))
    .returning()

  registrarEvento(user, {
    accion: 'tributario.revision.reabrir',
    entidad: 'revision_tributaria',
    entidadId: revisionId,
    empresaId: row.obligacion.empresaId,
    detalle: { obligacion: nombreObligacion(row.obligacion), periodo: row.revision.periodo },
  })

  return c.json({ data: reabierta })
})

// POST /tributario/revisiones/:id/presentacion — registra (o borra, con null)
// la fecha en que se presentó la declaración. Exige la revisión firmada: la
// presentación es posterior a la firma del revisor. Es otra grieta deliberada
// del sello, como el seguimiento de hallazgos: no toca el contenido revisado
// ni el snapshot, y cualquiera del equipo puede registrarla. Al reabrir la
// revisión la fecha se conserva (la presentación ya ocurrió).
app.post(
  '/tributario/revisiones/:id/presentacion',
  zValidator(
    'json',
    z.object({ fechaPresentacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
  ),
  async (c) => {
    const user = c.get('user')
    const revisionId = c.req.param('id')
    const { fechaPresentacion } = c.req.valid('json')

    const row = await cargarRevision(revisionId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    if (row.revision.estado !== 'revisada') {
      return c.json(
        { error: { code: 'NO_FIRMADA', message: 'Firma la revisión antes de registrar su presentación' } },
        409,
      )
    }
    // "Hoy" en Colombia (UTC-5, sin horario de verano): una fecha posterior es
    // un error de digitación.
    const hoy = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (fechaPresentacion && fechaPresentacion > hoy) {
      return c.json(
        { error: { code: 'FECHA_FUTURA', message: 'La fecha de presentación no puede ser posterior a hoy' } },
        400,
      )
    }

    const [actualizada] = await db
      .update(revisionesTributarias)
      .set({ fechaPresentacion })
      .where(eq(revisionesTributarias.id, revisionId))
      .returning()

    registrarEvento(user, {
      accion: fechaPresentacion ? 'tributario.revision.presentar' : 'tributario.revision.quitar_presentacion',
      entidad: 'revision_tributaria',
      entidadId: revisionId,
      empresaId: row.obligacion.empresaId,
      detalle: {
        obligacion: nombreObligacion(row.obligacion),
        periodo: row.revision.periodo,
        fechaPresentacion,
        anterior: row.revision.fechaPresentacion,
      },
    })

    return c.json({ data: actualizada })
  },
)

// ─── Adjuntos (soportes de la revisión) ──────────────────────────────────────

// POST /tributario/revisiones/:id/adjuntos — multipart: archivo + nombre opcional
app.post('/tributario/revisiones/:id/adjuntos', async (c) => {
  const user = c.get('user')
  const revisionId = c.req.param('id')

  const row = await cargarRevision(revisionId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  const body = await c.req.parseBody()
  const tipo: TipoAdjuntoTributario =
    typeof body['tipo'] === 'string' && (TIPOS_ADJUNTO_TRIBUTARIO as readonly string[]).includes(body['tipo'])
      ? (body['tipo'] as TipoAdjuntoTributario)
      : 'otro'

  // Con la revisión firmada solo entran los soportes que nacen después de la
  // firma (declaración presentada, recibo de pago); el resto exige reabrir.
  const sellada = row.revision.estado === 'revisada'
  if (sellada && !TIPOS_ADJUNTO_POST_FIRMA.includes(tipo)) {
    return c.json(
      {
        error: {
          code: 'REVISION_SELLADA',
          message: 'Con la revisión firmada solo puedes adjuntar la declaración presentada o el recibo de pago',
        },
      },
      409,
    )
  }

  // Evidencia de un hallazgo: debe ser de esta misma revisión. Es contenido
  // revisado, así que exige la revisión abierta (no aplica el post-firma).
  const hallazgoIdCrudo = typeof body['hallazgoId'] === 'string' ? body['hallazgoId'].trim() : ''
  if (hallazgoIdCrudo && !/^[0-9a-f-]{36}$/i.test(hallazgoIdCrudo)) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'hallazgoId inválido' } }, 400)
  }
  const hallazgoId = hallazgoIdCrudo || null
  if (hallazgoId) {
    if (sellada) return c.json({ error: ERROR_REVISION_SELLADA }, 409)
    const [hallazgo] = await db
      .select({ id: hallazgosTributarios.id })
      .from(hallazgosTributarios)
      .where(and(eq(hallazgosTributarios.id, hallazgoId), eq(hallazgosTributarios.revisionId, revisionId)))
    if (!hallazgo) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado en esta revisión' } }, 404)
    }
  }
  // El tipo "evidencia" solo existe atado a un hallazgo: si no, sería un
  // soporte de la revisión mal etiquetado.
  if (tipo === 'evidencia' && !hallazgoId) {
    return c.json(
      { error: { code: 'BAD_REQUEST', message: 'La evidencia de hallazgo debe ir asociada a un hallazgo' } },
      400,
    )
  }

  const archivo = body['archivo']
  if (!(archivo instanceof File)) {
    return c.json({ error: { code: 'ARCHIVO_REQUERIDO', message: 'Adjunta el archivo en el campo "archivo"' } }, 400)
  }
  if (archivo.size > MAX_ARCHIVO_BYTES) {
    return c.json({ error: { code: 'ARCHIVO_MUY_GRANDE', message: 'El archivo supera el límite de 20 MB' } }, 413)
  }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const hash = createHash('sha256').update(contenido).digest('hex')
  const extension = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const key = `tributario/${row.obligacion.empresaId}/${randomUUID()}.${extension}`
  await storage.guardar(key, contenido)

  const nombre = typeof body['nombre'] === 'string' && body['nombre'].trim() ? body['nombre'].trim() : archivo.name

  const [adjunto] = await db
    .insert(adjuntosTributarios)
    .values({
      revisionId,
      hallazgoId,
      nombre,
      tipo,
      archivoKey: key,
      archivoNombre: archivo.name,
      archivoMime: archivo.type || 'application/octet-stream',
      archivoTamano: archivo.size,
      archivoHash: hash,
      subidoPor: user.sub,
    })
    .returning()

  registrarEvento(user, {
    accion: 'tributario.adjunto.subir',
    entidad: 'adjunto_tributario',
    entidadId: adjunto.id,
    empresaId: row.obligacion.empresaId,
    detalle: {
      obligacion: nombreObligacion(row.obligacion),
      periodo: row.revision.periodo,
      nombre: archivo.name,
      tamano: archivo.size,
      hash,
      hallazgoId,
      posteriorAFirma: sellada,
    },
  })

  return c.json({ data: { ...adjunto, posteriorAFirma: sellada } }, 201)
})

async function cargarAdjunto(adjuntoId: string, firmaId: string) {
  const [row] = await db
    .select({
      adjunto: adjuntosTributarios,
      revision: revisionesTributarias,
      obligacion: obligacionesTributarias,
    })
    .from(adjuntosTributarios)
    .innerJoin(revisionesTributarias, eq(adjuntosTributarios.revisionId, revisionesTributarias.id))
    .innerJoin(
      obligacionesTributarias,
      eq(revisionesTributarias.obligacionId, obligacionesTributarias.id),
    )
    .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
    .where(and(eq(adjuntosTributarios.id, adjuntoId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// PATCH /tributario/adjuntos/:id — renombrar / cambiar tipo del soporte
app.patch(
  '/tributario/adjuntos/:id',
  zValidator(
    'json',
    z.object({
      nombre: z.string().trim().min(1).max(200).optional(),
      tipo: z.enum(TIPOS_ADJUNTO_TRIBUTARIO).optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const adjuntoId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarAdjunto(adjuntoId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Adjunto no encontrado' } }, 404)
    if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)
    // Misma regla que al subir: el tipo "evidencia" solo existe atado a un hallazgo.
    if (body.tipo === 'evidencia' && !row.adjunto.hallazgoId) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'La evidencia de hallazgo debe ir asociada a un hallazgo' } },
        400,
      )
    }

    const updates: Record<string, string> = {}
    if (body.nombre !== undefined) updates.nombre = body.nombre
    if (body.tipo !== undefined) updates.tipo = body.tipo
    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db
      .update(adjuntosTributarios)
      .set(updates)
      .where(eq(adjuntosTributarios.id, adjuntoId))
      .returning()

    registrarEvento(user, {
      accion: 'tributario.adjunto.editar',
      entidad: 'adjunto_tributario',
      entidadId: adjuntoId,
      empresaId: row.obligacion.empresaId,
      detalle: { campos: Object.keys(updates), nombre: actualizado.nombre },
    })

    return c.json({ data: actualizado })
  },
)

// DELETE /tributario/adjuntos/:id — bloqueado si la revisión está firmada
app.delete('/tributario/adjuntos/:id', async (c) => {
  const user = c.get('user')
  const adjuntoId = c.req.param('id')

  const row = await cargarAdjunto(adjuntoId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Adjunto no encontrado' } }, 404)
  // Firmada: solo se quita lo incorporado después de la firma; lo sellado en el
  // snapshot es evidencia inmutable.
  if (row.revision.estado === 'revisada' && idsAdjuntosSellados(row.revision.snapshot).has(adjuntoId)) {
    return c.json({ error: ERROR_REVISION_SELLADA }, 409)
  }

  await db.delete(adjuntosTributarios).where(eq(adjuntosTributarios.id, adjuntoId))
  await storage.eliminar(row.adjunto.archivoKey).catch(() => {})

  registrarEvento(user, {
    accion: 'tributario.adjunto.eliminar',
    entidad: 'adjunto_tributario',
    entidadId: adjuntoId,
    empresaId: row.obligacion.empresaId,
    detalle: { nombre: row.adjunto.nombre, periodo: row.revision.periodo },
  })

  return c.json({ data: { id: adjuntoId } })
})

// GET /tributario/adjuntos/:id/descarga — URL firmada (15 min)
app.get('/tributario/adjuntos/:id/descarga', async (c) => {
  const { firmaId } = c.get('user')
  const adjuntoId = c.req.param('id')

  const row = await cargarAdjunto(adjuntoId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Adjunto no encontrado' } }, 404)

  const { key, exp, sig } = firmarDescarga(row.adjunto.archivoKey)
  const params = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
    nombre: row.adjunto.archivoNombre,
    mime: row.adjunto.archivoMime,
  })

  return c.json({ data: { url: `/archivos?${params.toString()}`, expiraEn: 15 * 60 } })
})

// ─── Hallazgos y recomendaciones ─────────────────────────────────────────────

async function cargarHallazgo(hallazgoId: string, firmaId: string) {
  const [row] = await db
    .select({
      hallazgo: hallazgosTributarios,
      revision: revisionesTributarias,
      obligacion: obligacionesTributarias,
    })
    .from(hallazgosTributarios)
    .innerJoin(revisionesTributarias, eq(hallazgosTributarios.revisionId, revisionesTributarias.id))
    .innerJoin(
      obligacionesTributarias,
      eq(revisionesTributarias.obligacionId, obligacionesTributarias.id),
    )
    .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
    .where(and(eq(hallazgosTributarios.id, hallazgoId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

const hallazgoSchema = z.object({
  descripcion: z.string().trim().min(2),
  recomendacion: z.string().nullable().optional(),
  monto: z.number().nullable().optional(),
  severidad: z.enum(['alta', 'media', 'baja']).optional(),
})

// POST /tributario/revisiones/:id/hallazgos — solo con la revisión abierta
app.post('/tributario/revisiones/:id/hallazgos', zValidator('json', hallazgoSchema), async (c) => {
  const user = c.get('user')
  const revisionId = c.req.param('id')
  const body = c.req.valid('json')

  const row = await cargarRevision(revisionId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)

  const [hallazgo] = await db
    .insert(hallazgosTributarios)
    .values({
      revisionId,
      descripcion: body.descripcion,
      recomendacion: body.recomendacion || null,
      monto: body.monto == null ? null : String(body.monto),
      severidad: body.severidad ?? 'media',
      creadoPor: user.sub,
    })
    .returning()

  registrarEvento(user, {
    accion: 'tributario.hallazgo.crear',
    entidad: 'hallazgo_tributario',
    entidadId: hallazgo.id,
    empresaId: row.obligacion.empresaId,
    detalle: {
      obligacion: nombreObligacion(row.obligacion),
      periodo: row.revision.periodo,
      severidad: hallazgo.severidad,
    },
  })

  return c.json({ data: hallazgo }, 201)
})

// PATCH /tributario/hallazgos/:id — con la revisión firmada solo se permite el
// seguimiento (estado + nota); el contenido exige la revisión abierta.
app.patch(
  '/tributario/hallazgos/:id',
  zValidator(
    'json',
    hallazgoSchema.partial().extend({
      estado: z.enum(ESTADOS_HALLAZGO_TRIBUTARIO).optional(),
      seguimiento: z.string().nullable().optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const hallazgoId = c.req.param('id')
    const body = c.req.valid('json')

    const row = await cargarHallazgo(hallazgoId, user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)

    const sellada = row.revision.estado === 'revisada'
    const tocaContenido =
      body.descripcion !== undefined ||
      body.recomendacion !== undefined ||
      body.monto !== undefined ||
      body.severidad !== undefined
    if (sellada && tocaContenido) return c.json({ error: ERROR_REVISION_SELLADA }, 409)

    const updates: Record<string, unknown> = {}
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion
    if (body.recomendacion !== undefined) updates.recomendacion = body.recomendacion || null
    if (body.monto !== undefined) updates.monto = body.monto == null ? null : String(body.monto)
    if (body.severidad !== undefined) updates.severidad = body.severidad
    if (body.seguimiento !== undefined) updates.seguimiento = body.seguimiento || null
    if (body.estado !== undefined && body.estado !== row.hallazgo.estado) {
      updates.estado = body.estado
      updates.resueltoAt = body.estado === 'resuelto' ? new Date() : null
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizado] = await db
      .update(hallazgosTributarios)
      .set(updates)
      .where(eq(hallazgosTributarios.id, hallazgoId))
      .returning()

    registrarEvento(user, {
      accion: 'tributario.hallazgo.editar',
      entidad: 'hallazgo_tributario',
      entidadId: hallazgoId,
      empresaId: row.obligacion.empresaId,
      detalle: { campos: Object.keys(updates), estado: actualizado.estado },
    })

    return c.json({ data: actualizado })
  },
)

// DELETE /tributario/hallazgos/:id — solo con la revisión abierta
app.delete('/tributario/hallazgos/:id', async (c) => {
  const user = c.get('user')
  const hallazgoId = c.req.param('id')

  const row = await cargarHallazgo(hallazgoId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Hallazgo no encontrado' } }, 404)
  if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)

  // La evidencia del hallazgo se va con él: primero, o la FK bloquea el borrado.
  const evidencias = await db
    .select({ archivoKey: adjuntosTributarios.archivoKey })
    .from(adjuntosTributarios)
    .where(eq(adjuntosTributarios.hallazgoId, hallazgoId))
  if (evidencias.length > 0) {
    await db.delete(adjuntosTributarios).where(eq(adjuntosTributarios.hallazgoId, hallazgoId))
    await Promise.all(evidencias.map((e) => storage.eliminar(e.archivoKey).catch(() => {})))
  }

  await db.delete(hallazgosTributarios).where(eq(hallazgosTributarios.id, hallazgoId))

  registrarEvento(user, {
    accion: 'tributario.hallazgo.eliminar',
    entidad: 'hallazgo_tributario',
    entidadId: hallazgoId,
    empresaId: row.obligacion.empresaId,
    detalle: {
      descripcion: row.hallazgo.descripcion,
      periodo: row.revision.periodo,
      evidencias: evidencias.length,
    },
  })

  return c.json({ data: { id: hallazgoId } })
})

export default app
