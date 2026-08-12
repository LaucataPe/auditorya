import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { createHash, randomUUID } from 'node:crypto'
import { db } from '../db/client'
import { empresas, evaluacionesAceptacion, documentosEmpresa } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import { storage, firmarDescarga } from '../lib/storage'
import { sectorDesdeCiiu, SECTOR_LABEL, TIPOS_DOCUMENTO_EMPRESA, type TipoDocumentoEmpresa } from '@auditorya/types'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

/** Si el CIIU es válido, devuelve el sector legible derivado; si no, null. */
function sectorPorCiiu(ciiu?: string | null): string | null {
  if (!ciiu) return null
  const derivado = sectorDesdeCiiu(ciiu)
  return derivado ? SECTOR_LABEL[derivado] : null
}

// GET /empresas
app.get('/', async (c) => {
  const { firmaId } = c.get('user')
  const estado = c.req.query('estado') as 'pendiente' | 'aceptado' | 'rechazado' | undefined

  const conditions = [eq(empresas.firmaId, firmaId)]
  if (estado) conditions.push(eq(empresas.estadoEncargo, estado))

  const lista = await db
    .select()
    .from(empresas)
    .where(and(...conditions))
    .orderBy(empresas.createdAt)

  return c.json({ data: lista })
})

// POST /empresas
app.post(
  '/',
  zValidator(
    'json',
    z
      .object({
        nombre: z.string().min(2),
        nit: z.string().min(5),
        sector: z.string().min(2).optional(),
        ciiu: z.string().optional(),
        actividadEconomica: z.string().optional(),
        ciudad: z.string().optional(),
        marcoContable: z.enum(['NIIF', 'NIIF_PYMES', 'PCGA']),
      })
      // Debe poderse determinar el sector: o viene explícito, o por un CIIU válido.
      .refine((d) => !!d.sector || !!sectorDesdeCiiu(d.ciiu ?? ''), {
        message: 'Indica el sector económico o un código CIIU válido',
        path: ['ciiu'],
      }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId } = user
    const body = c.req.valid('json')

    // Unicidad por firma: otra firma puede tener al mismo cliente sin conflicto.
    const [existe] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.nit, body.nit), eq(empresas.firmaId, firmaId)))
    if (existe) {
      return c.json({ error: { code: 'NIT_DUPLICADO', message: 'Ya tienes una empresa con ese NIT' } }, 409)
    }

    // El sector (select controlado) manda; si no viene, se deriva del CIIU.
    const sectorFinal = body.sector ?? sectorPorCiiu(body.ciiu)!

    const [empresa] = await db
      .insert(empresas)
      .values({
        firmaId,
        nombre: body.nombre,
        nit: body.nit,
        sector: sectorFinal,
        ciiu: body.ciiu || null,
        actividadEconomica: body.actividadEconomica || null,
        ciudad: body.ciudad || null,
        marcoContable: body.marcoContable,
        estadoEncargo: 'pendiente',
      })
      .returning()

    registrarEvento(user, {
      accion: 'empresa.crear',
      entidad: 'empresa',
      entidadId: empresa.id,
      empresaId: empresa.id,
      detalle: { nombre: empresa.nombre, nit: empresa.nit, sector: empresa.sector },
    })

    return c.json({ data: empresa }, 201)
  },
)

// PUT /empresas/:id
app.put(
  '/:id',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2).optional(),
      nit: z.string().min(5).optional(),
      sector: z.string().min(2).optional(),
      ciiu: z.string().optional(),
      actividadEconomica: z.string().optional(),
      ciudad: z.string().optional(),
      modeloNegocio: z.string().optional(),
      estructura: z.string().optional(),
      personasClave: z.string().optional(),
      entornoRegulatorio: z.string().optional(),
      sistemaContable: z.string().optional(),
      marcoContable: z.enum(['NIIF', 'NIIF_PYMES', 'PCGA']).optional(),
    }),
  ),
  async (c) => {
    const { firmaId } = c.get('user')
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const [empresa] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    if (body.nit && body.nit !== empresa.nit) {
      const [duplicado] = await db
        .select()
        .from(empresas)
        .where(and(eq(empresas.nit, body.nit), eq(empresas.firmaId, firmaId)))
      if (duplicado) {
        return c.json({ error: { code: 'NIT_DUPLICADO', message: 'Ya tienes una empresa con ese NIT' } }, 409)
      }
    }

    const updates: Record<string, string | null> = {}
    if (body.nombre) updates.nombre = body.nombre
    if (body.nit) updates.nit = body.nit
    if (body.marcoContable) updates.marcoContable = body.marcoContable
    if (body.actividadEconomica !== undefined) updates.actividadEconomica = body.actividadEconomica || null
    if (body.ciudad !== undefined) updates.ciudad = body.ciudad || null
    // Archivo permanente (capa global)
    if (body.modeloNegocio !== undefined) updates.modeloNegocio = body.modeloNegocio || null
    if (body.estructura !== undefined) updates.estructura = body.estructura || null
    if (body.personasClave !== undefined) updates.personasClave = body.personasClave || null
    if (body.entornoRegulatorio !== undefined) updates.entornoRegulatorio = body.entornoRegulatorio || null
    if (body.sistemaContable !== undefined) updates.sistemaContable = body.sistemaContable || null

    // El sector (select controlado) manda; si no viene, se deriva del CIIU.
    if (body.ciiu !== undefined) updates.ciiu = body.ciiu || null
    if (body.sector) updates.sector = body.sector
    else if (body.ciiu) {
      const derivado = sectorPorCiiu(body.ciiu)
      if (derivado) updates.sector = derivado
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [actualizada] = await db
      .update(empresas)
      .set(updates)
      .where(eq(empresas.id, id))
      .returning()

    registrarEvento(c.get('user'), {
      accion: 'empresa.editar',
      entidad: 'empresa',
      entidadId: id,
      empresaId: id,
      detalle: { campos: Object.keys(updates) },
    })

    return c.json({ data: actualizada })
  },
)

// GET /empresas/:id
app.get('/:id', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

  if (!empresa) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  return c.json({ data: empresa })
})

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación de aceptación del encargo (NIA 200 / NICC 1 - ISQM 1) — Fase 2
// ─────────────────────────────────────────────────────────────────────────────

// GET /empresas/:id/evaluacion — última evaluación registrada (o null)
app.get('/:id/evaluacion', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

  if (!empresa) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  const [evaluacion] = await db
    .select()
    .from(evaluacionesAceptacion)
    .where(eq(evaluacionesAceptacion.empresaId, id))
    .orderBy(desc(evaluacionesAceptacion.createdAt))
    .limit(1)

  return c.json({ data: evaluacion ?? null })
})

// POST /empresas/:id/evaluacion — registra la evaluación y fija el estado del encargo
app.post(
  '/:id/evaluacion',
  zValidator(
    'json',
    z.object({
      respuestas: z.record(z.string(), z.enum(['si', 'no'])),
      decision: z.enum(['aceptado', 'rechazado']),
    }),
  ),
  async (c) => {
    const { firmaId, sub } = c.get('user')
    const id = c.req.param('id')
    const { respuestas, decision } = c.req.valid('json')

    const [empresa] = await db
      .select()
      .from(empresas)
      .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))

    if (!empresa) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
    }

    const hayAmenazas = Object.values(respuestas).some((v) => v === 'si')

    const [evaluacion] = await db
      .insert(evaluacionesAceptacion)
      .values({ empresaId: id, respuestas, hayAmenazas, decision, evaluadoPor: sub })
      .returning()

    const [empresaActualizada] = await db
      .update(empresas)
      .set({ estadoEncargo: decision })
      .where(eq(empresas.id, id))
      .returning()

    registrarEvento(c.get('user'), {
      accion: `encargo.${decision}`,
      entidad: 'evaluacion_aceptacion',
      entidadId: evaluacion.id,
      empresaId: id,
      detalle: { hayAmenazas, decision },
    })

    return c.json({ data: { evaluacion, empresa: empresaActualizada } }, 201)
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// Documentos legales del cliente (RUT, Cámara de Comercio, etc.) — archivo permanente
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024 // 20 MB

async function cargarEmpresaFirma(id: string, firmaId: string) {
  const [empresa] = await db
    .select()
    .from(empresas)
    .where(and(eq(empresas.id, id), eq(empresas.firmaId, firmaId)))
  return empresa ?? null
}

async function cargarDocumento(documentoId: string, firmaId: string) {
  const [row] = await db
    .select({ documento: documentosEmpresa, empresa: empresas })
    .from(documentosEmpresa)
    .innerJoin(empresas, eq(documentosEmpresa.empresaId, empresas.id))
    .where(and(eq(documentosEmpresa.id, documentoId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// GET /empresas/:id/documentos — lista de documentos legales subidos
app.get('/:id/documentos', async (c) => {
  const { firmaId } = c.get('user')
  const id = c.req.param('id')

  if (!(await cargarEmpresaFirma(id, firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  const lista = await db
    .select({
      id: documentosEmpresa.id,
      empresaId: documentosEmpresa.empresaId,
      tipo: documentosEmpresa.tipo,
      nombre: documentosEmpresa.nombre,
      archivoNombre: documentosEmpresa.archivoNombre,
      archivoMime: documentosEmpresa.archivoMime,
      archivoTamano: documentosEmpresa.archivoTamano,
      archivoHash: documentosEmpresa.archivoHash,
      subidoPor: documentosEmpresa.subidoPor,
      createdAt: documentosEmpresa.createdAt,
    })
    .from(documentosEmpresa)
    .where(eq(documentosEmpresa.empresaId, id))
    .orderBy(desc(documentosEmpresa.createdAt))

  return c.json({ data: lista })
})

// POST /empresas/:id/documentos — sube un documento legal (multipart); los tipos
// del catálogo reemplazan el archivo vigente, 'otro' siempre crea uno nuevo.
app.post('/:id/documentos', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  if (!(await cargarEmpresaFirma(id, user.firmaId))) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Empresa no encontrada' } }, 404)
  }

  const body = await c.req.parseBody()
  const archivo = body['archivo']
  const tipo = body['tipo']
  const nombre = typeof body['nombre'] === 'string' ? body['nombre'].trim() : ''

  if (typeof tipo !== 'string' || !TIPOS_DOCUMENTO_EMPRESA.includes(tipo as TipoDocumentoEmpresa)) {
    return c.json({ error: { code: 'TIPO_INVALIDO', message: 'Tipo de documento inválido' } }, 400)
  }
  const tipoDoc = tipo as TipoDocumentoEmpresa
  if (tipoDoc === 'otro' && !nombre) {
    return c.json({ error: { code: 'NOMBRE_REQUERIDO', message: 'Indica un nombre para el documento' } }, 400)
  }
  if (!(archivo instanceof File)) {
    return c.json({ error: { code: 'ARCHIVO_REQUERIDO', message: 'Adjunta el archivo en el campo "archivo"' } }, 400)
  }
  if (archivo.size > MAX_DOCUMENTO_BYTES) {
    return c.json({ error: { code: 'ARCHIVO_MUY_GRANDE', message: 'El archivo supera el límite de 20 MB' } }, 413)
  }

  const contenido = Buffer.from(await archivo.arrayBuffer())
  const hash = createHash('sha256').update(contenido).digest('hex')
  const extension = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const key = `documentos-empresa/${id}/${randomUUID()}.${extension}`
  await storage.guardar(key, contenido)

  // Los tipos del catálogo son de archivo único vigente: si ya existía, se reemplaza.
  const anterior =
    tipoDoc === 'otro'
      ? null
      : (
          await db
            .select({ id: documentosEmpresa.id, archivoKey: documentosEmpresa.archivoKey })
            .from(documentosEmpresa)
            .where(and(eq(documentosEmpresa.empresaId, id), eq(documentosEmpresa.tipo, tipoDoc)))
        )[0]

  const valores = {
    archivoKey: key,
    archivoNombre: archivo.name,
    archivoMime: archivo.type || 'application/octet-stream',
    archivoTamano: archivo.size,
    archivoHash: hash,
    subidoPor: user.sub,
  }

  const [documento] = anterior
    ? await db
        .update(documentosEmpresa)
        .set({ ...valores, createdAt: new Date() })
        .where(eq(documentosEmpresa.id, anterior.id))
        .returning()
    : await db
        .insert(documentosEmpresa)
        .values({ empresaId: id, tipo: tipoDoc, nombre: tipoDoc === 'otro' ? nombre : null, ...valores })
        .returning()

  if (anterior) await storage.eliminar(anterior.archivoKey)

  registrarEvento(user, {
    accion: anterior ? 'documento_empresa.reemplazar' : 'documento_empresa.subir',
    entidad: 'documento_empresa',
    entidadId: documento.id,
    empresaId: id,
    detalle: { tipo: tipoDoc, nombre: archivo.name, tamano: archivo.size, hash },
  })

  return c.json({ data: documento }, 201)
})

// DELETE /empresas/documentos/:documentoId
app.delete('/documentos/:documentoId', async (c) => {
  const user = c.get('user')
  const documentoId = c.req.param('documentoId')

  const row = await cargarDocumento(documentoId, user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)

  await db.delete(documentosEmpresa).where(eq(documentosEmpresa.id, documentoId))
  await storage.eliminar(row.documento.archivoKey)

  registrarEvento(user, {
    accion: 'documento_empresa.eliminar',
    entidad: 'documento_empresa',
    entidadId: documentoId,
    empresaId: row.documento.empresaId,
    detalle: { tipo: row.documento.tipo, nombre: row.documento.archivoNombre },
  })

  return c.json({ data: { id: documentoId } })
})

// GET /empresas/documentos/:documentoId/descarga — URL firmada (15 min)
app.get('/documentos/:documentoId/descarga', async (c) => {
  const { firmaId } = c.get('user')
  const documentoId = c.req.param('documentoId')

  const row = await cargarDocumento(documentoId, firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)

  const { key, exp, sig } = firmarDescarga(row.documento.archivoKey)
  const params = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
    nombre: row.documento.archivoNombre,
    mime: row.documento.archivoMime,
  })

  return c.json({ data: { url: `/archivos?${params.toString()}`, expiraEn: 15 * 60 } })
})

export default app
