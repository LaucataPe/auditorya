import { Hono } from 'hono'
import { z } from 'zod'
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { createHash, randomUUID } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import { zValidator } from '../lib/validacion'
import { db } from '../db/client'
import {
  firmas,
  usuarios,
  eventos,
  calidadObjetivos,
  calidadRiesgos,
  calidadRespuestas,
  calidadEvaluaciones,
  calidadDocumentos,
  calidadManuales,
  calidadCambiosRelevantes,
  calidadDocumentosFirma,
} from '../db/schema'
import {
  CATALOGO_CALIDAD,
  FORMATOS_CALIDAD,
  VINCULOS_CALIDAD,
  componentesSinCumplir,
  ETIQUETAS_INFORME_ENRIQUECIDO,
  FORMATOS_CALIDAD_CLAVES,
  camposPorCompletar,
  esHtmlInforme,
  formatoCalidad,
  formatoDeRespuesta,
  rellenarFormato,
  vigenteHasta,
  type DocumentoCalidad,
  type ManualCalidad,
  type ManualCalidadResumen,
  type ManualCalidadSnapshot,
  type ResumenDocumentoCalidad,
  COMPONENTES_CALIDAD,
  COMPONENTES_CALIDAD_CLAVES,
  componentesPorRevisar,
  estadoComponenteCalidad,
  fechaCorteCalidad,
  riesgosSinRespuesta,
  type ComponenteCalidad,
  type EvaluacionCalidad,
  type SistemaCalidad,
  type VinculoCalidad,
  TIPOS_CAMBIO_RELEVANTE,
  TIPOS_CAMBIO_RELEVANTE_CLAVES,
  type CambioRelevante,
  type TipoCambioRelevante,
  vigenciaDocumentoFirma,
  type CoberturaDocumentoFirma,
  type DocumentoFirmaCalidad,
} from '@auditorya/types'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'
import { registrarEvento } from '../lib/eventos'
import { storage, firmarDescarga } from '../lib/storage'

// Sistema de gestión de calidad de la firma (NIGC 1). Montado en /firmas.
// Gestiona (objetivos, riesgos, respuestas, marcar componentes): socio.
// Concluye o reabre la evaluación anual: el responsable designado (o un socio si no hay).

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024

const ERROR_SIN_PERMISO = { code: 'FORBIDDEN', message: 'Solo un socio puede modificar el sistema de calidad' }
const ERROR_EVALUACION_CONCLUIDA = {
  code: 'EVALUACION_CONCLUIDA',
  message: 'La evaluación de este año ya fue concluida. Reábrela para cambiarla.',
}

/**
 * Lo que muestra el historial: lo que cambia el sistema o su evaluación. Quedan fuera los
 * pasos intermedios (crear o descartar borradores, que además ya no se registran).
 */
const ACCIONES_HISTORIAL = [
  'calidad.responsable.designar',
  'calidad.objetivo.crear',
  'calidad.objetivo.editar',
  'calidad.riesgo.crear',
  'calidad.riesgo.editar',
  'calidad.respuesta.crear',
  'calidad.respuesta.editar',
  'calidad.respuesta.evidencia',
  'calidad.documento.firmar',
  'calidad.documento.subir',
  'calidad.componente.revisar',
  'calidad.componente.desmarcar',
  'calidad.evaluacion.fecha_corte',
  'calidad.evaluacion.concluir',
  'calidad.evaluacion.reabrir',
  'calidad.manual.generar',
  'calidad.cambio.registrar',
  'calidad.cambio.evaluar',
  'calidad.documento_firma.subir',
  'calidad.documento.cubrir',
  'calidad.manual.externo',
]

const puedeGestionar = (user: JwtPayload) => user.rol === 'socio'

function puedeConcluir(user: JwtPayload, responsableId: string | null) {
  return responsableId ? user.sub === responsableId : user.rol === 'socio'
}

const anioActual = () => new Date().getFullYear()

function anioValido(raw: string | undefined): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}

const CLAVES_RESPUESTAS_BASE = CATALOGO_CALIDAD.flatMap((o) => o.riesgos.flatMap((r) => r.respuestas.map((a) => a.clave)))

/**
 * Precarga el catálogo base la primera vez que la firma abre el sistema y, después, agrega lo
 * que el catálogo sume en versiones nuevas. Idempotente: no toca lo que la firma editó o desactivó.
 */
async function asegurarCatalogo(firmaId: string) {
  const existentes = await db
    .select({ baseClave: calidadRespuestas.baseClave })
    .from(calidadRespuestas)
    .where(eq(calidadRespuestas.firmaId, firmaId))
  const tiene = new Set(existentes.map((r) => r.baseClave))
  if (CLAVES_RESPUESTAS_BASE.every((k) => tiene.has(k))) return

  await db.transaction(async (tx) => {
    await tx
      .insert(calidadObjetivos)
      .values(CATALOGO_CALIDAD.map((o) => ({ firmaId, componente: o.componente, texto: o.texto, baseClave: o.clave })))
      .onConflictDoNothing()
    const objetivos = await tx
      .select({ id: calidadObjetivos.id, baseClave: calidadObjetivos.baseClave })
      .from(calidadObjetivos)
      .where(eq(calidadObjetivos.firmaId, firmaId))
    const objetivoId = new Map(objetivos.map((o) => [o.baseClave, o.id]))

    await tx
      .insert(calidadRiesgos)
      .values(
        CATALOGO_CALIDAD.flatMap((o) =>
          o.riesgos.map((r) => ({
            firmaId,
            objetivoId: objetivoId.get(o.clave)!,
            descripcion: r.descripcion,
            baseClave: r.clave,
          })),
        ),
      )
      .onConflictDoNothing()
    const riesgos = await tx
      .select({ id: calidadRiesgos.id, baseClave: calidadRiesgos.baseClave })
      .from(calidadRiesgos)
      .where(eq(calidadRiesgos.firmaId, firmaId))
    const riesgoId = new Map(riesgos.map((r) => [r.baseClave, r.id]))

    await tx
      .insert(calidadRespuestas)
      .values(
        CATALOGO_CALIDAD.flatMap((o) =>
          o.riesgos.flatMap((r) =>
            r.respuestas.map((a) => ({
              firmaId,
              riesgoId: riesgoId.get(r.clave)!,
              descripcion: a.descripcion,
              vinculo: a.vinculo ?? null,
              baseClave: a.clave,
            })),
          ),
        ),
      )
      .onConflictDoNothing()
  })
}

/** Evaluación del año; se crea con la fecha de corte por defecto si no existe. */
async function asegurarEvaluacion(firmaId: string, anio: number) {
  await db
    .insert(calidadEvaluaciones)
    .values({ firmaId, anio, fechaCorte: fechaCorteCalidad(anio) })
    .onConflictDoNothing()
  const [evaluacion] = await db
    .select()
    .from(calidadEvaluaciones)
    .where(and(eq(calidadEvaluaciones.firmaId, firmaId), eq(calidadEvaluaciones.anio, anio)))
  return evaluacion
}

async function cargarDatos(firmaId: string) {
  const [objetivos, riesgos, respuestas] = await Promise.all([
    db.select().from(calidadObjetivos).where(eq(calidadObjetivos.firmaId, firmaId)).orderBy(calidadObjetivos.createdAt),
    db.select().from(calidadRiesgos).where(eq(calidadRiesgos.firmaId, firmaId)).orderBy(calidadRiesgos.createdAt),
    db.select().from(calidadRespuestas).where(eq(calidadRespuestas.firmaId, firmaId)).orderBy(calidadRespuestas.createdAt),
  ])
  return {
    objetivos: objetivos.map((o) => ({
      id: o.id,
      componente: o.componente as ComponenteCalidad,
      texto: o.texto,
      baseClave: o.baseClave,
      activo: o.activo,
    })),
    riesgos: riesgos.map((r) => ({
      id: r.id,
      objetivoId: r.objetivoId,
      descripcion: r.descripcion,
      baseClave: r.baseClave,
      activo: r.activo,
    })),
    respuestas: respuestas.map((r) => ({
      id: r.id,
      riesgoId: r.riesgoId,
      descripcion: r.descripcion,
      vinculo: r.vinculo as VinculoCalidad | null,
      baseClave: r.baseClave,
      activo: r.activo,
      evidenciaNombre: r.evidenciaNombre,
      evidenciaAt: r.evidenciaAt?.toISOString() ?? null,
    })),
  }
}

async function cargarCambiosRelevantes(firmaId: string, anio: number): Promise<CambioRelevante[]> {
  const filas = await db
    .select()
    .from(calidadCambiosRelevantes)
    .where(
      and(
        eq(calidadCambiosRelevantes.firmaId, firmaId),
        gte(calidadCambiosRelevantes.fecha, `${anio}-01-01`),
        lt(calidadCambiosRelevantes.fecha, `${anio + 1}-01-01`),
      ),
    )
    .orderBy(desc(calidadCambiosRelevantes.fecha), desc(calidadCambiosRelevantes.createdAt))
  const ids = [...new Set(filas.flatMap((f) => [f.creadoPor, f.evaluadoPor]).filter((x): x is string => !!x))]
  const nombres = new Map(
    ids.length
      ? (await db.select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).where(inArray(usuarios.id, ids))).map(
          (u) => [u.id, u.nombre],
        )
      : [],
  )
  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    tipo: f.tipo as TipoCambioRelevante,
    descripcion: f.descripcion,
    componentes: f.componentes as ComponenteCalidad[],
    decision: f.decision,
    justificacion: f.justificacion,
    evaluadoPorNombre: f.evaluadoPor ? (nombres.get(f.evaluadoPor) ?? null) : null,
    evaluadoAt: f.evaluadoAt?.toISOString() ?? null,
    creadoPorNombre: nombres.get(f.creadoPor) ?? null,
    createdAt: f.createdAt.toISOString(),
  }))
}

async function nombreUsuario(id: string | null) {
  if (!id) return null
  const [u] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, id))
  return u?.nombre ?? null
}

async function aEvaluacion(row: typeof calidadEvaluaciones.$inferSelect): Promise<EvaluacionCalidad> {
  return {
    id: row.id,
    anio: row.anio,
    fechaCorte: row.fechaCorte,
    componentesRevisados: row.componentesRevisados as EvaluacionCalidad['componentesRevisados'],
    resultado: row.resultado,
    conclusion: row.conclusion,
    deficiencias: row.deficiencias,
    concluidoPorNombre: await nombreUsuario(row.concluidoPor),
    concluidoAt: row.concluidoAt?.toISOString() ?? null,
  }
}

async function cargarFirma(firmaId: string) {
  const [firma] = await db
    .select({ responsableCalidadId: firmas.responsableCalidadId })
    .from(firmas)
    .where(eq(firmas.id, firmaId))
  return firma
}

// GET /firmas/mia/calidad?anio= — sistema completo + evaluación del año (por defecto el actual)
app.get('/mia/calidad', async (c) => {
  const user = c.get('user')
  const anio = anioValido(c.req.query('anio')) ?? anioActual()

  await asegurarCatalogo(user.firmaId)
  const [firma, datos, evaluacion, anteriores, cambios] = await Promise.all([
    cargarFirma(user.firmaId),
    cargarDatos(user.firmaId),
    asegurarEvaluacion(user.firmaId, anio),
    db
      .select({
        anio: calidadEvaluaciones.anio,
        resultado: calidadEvaluaciones.resultado,
        concluidoAt: calidadEvaluaciones.concluidoAt,
      })
      .from(calidadEvaluaciones)
      .where(eq(calidadEvaluaciones.firmaId, user.firmaId))
      .orderBy(desc(calidadEvaluaciones.anio)),
    db
      .select({
        id: eventos.id,
        accion: eventos.accion,
        detalle: eventos.detalle,
        usuarioNombre: usuarios.nombre,
        createdAt: eventos.createdAt,
      })
      .from(eventos)
      .leftJoin(usuarios, eq(eventos.usuarioId, usuarios.id))
      .where(and(eq(eventos.firmaId, user.firmaId), inArray(eventos.accion, ACCIONES_HISTORIAL)))
      .orderBy(desc(eventos.createdAt))
      .limit(30),
  ])

  const responsableId = firma?.responsableCalidadId ?? null
  const data: SistemaCalidad = {
    responsable: responsableId ? { id: responsableId, nombre: (await nombreUsuario(responsableId)) ?? '—' } : null,
    puedeGestionar: puedeGestionar(user),
    puedeConcluir: puedeConcluir(user, responsableId),
    ...datos,
    evaluacion: await aEvaluacion(evaluacion),
    anteriores: anteriores
      .filter((a) => a.anio !== anio)
      .map((a) => ({ anio: a.anio, resultado: a.resultado, concluidoAt: a.concluidoAt?.toISOString() ?? null })),
    cambios: cambios.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() })),
    documentos: await resumenDocumentos(user.firmaId),
    manuales: await resumenManuales(user.firmaId),
    cambiosRelevantes: await cargarCambiosRelevantes(user.firmaId, anio),
    documentosFirma: [],
  }
  data.documentosFirma = await cargarDocumentosFirma(user.firmaId, data.documentos)
  return c.json({ data })
})

// PUT /firmas/mia/calidad/responsable — designa al responsable último (debe ser socio de la firma)
app.put(
  '/mia/calidad/responsable',
  zValidator('json', z.object({ usuarioId: z.string().uuid().nullable() })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const { usuarioId } = c.req.valid('json')

    if (usuarioId) {
      const [u] = await db
        .select({ rol: usuarios.rol })
        .from(usuarios)
        .where(and(eq(usuarios.id, usuarioId), eq(usuarios.firmaId, user.firmaId)))
      if (!u) return c.json({ error: { code: 'NOT_FOUND', message: 'Usuario no encontrado en la firma' } }, 404)
      if (u.rol !== 'socio') {
        return c.json(
          { error: { code: 'RESPONSABLE_NO_SOCIO', message: 'El responsable del sistema de calidad debe ser socio' } },
          400,
        )
      }
    }

    await db.update(firmas).set({ responsableCalidadId: usuarioId }).where(eq(firmas.id, user.firmaId))
    registrarEvento(user, {
      accion: 'calidad.responsable.designar',
      entidad: 'calidad_sistema',
      detalle: { usuarioId, nombre: await nombreUsuario(usuarioId) },
    })
    return c.json({ data: { usuarioId } })
  },
)

// ─── Objetivos, riesgos y respuestas ─────────────────────────────────────────

const motivo = z
  .string({ required_error: 'Indica el motivo del cambio' })
  .trim()
  .min(3, 'Indica el motivo del cambio')

app.post(
  '/mia/calidad/objetivos',
  zValidator('json', z.object({ componente: z.enum(COMPONENTES_CALIDAD_CLAVES), texto: z.string().trim().min(5) })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const body = c.req.valid('json')

    const [objetivo] = await db
      .insert(calidadObjetivos)
      .values({ firmaId: user.firmaId, componente: body.componente, texto: body.texto })
      .returning()
    registrarEvento(user, {
      accion: 'calidad.objetivo.crear',
      entidad: 'calidad_objetivo',
      entidadId: objetivo.id,
      detalle: { componente: body.componente, texto: body.texto },
    })
    return c.json({ data: objetivo }, 201)
  },
)

app.patch(
  '/mia/calidad/objetivos/:id',
  zValidator('json', z.object({ texto: z.string().trim().min(5).optional(), activo: z.boolean().optional(), motivo })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const { motivo: razon, ...cambios } = c.req.valid('json')
    const id = c.req.param('id')

    const [antes] = await db
      .select()
      .from(calidadObjetivos)
      .where(and(eq(calidadObjetivos.id, id), eq(calidadObjetivos.firmaId, user.firmaId)))
    if (!antes) return c.json({ error: { code: 'NOT_FOUND', message: 'Objetivo no encontrado' } }, 404)

    const [objetivo] = await db
      .update(calidadObjetivos)
      .set({ ...cambios, updatedAt: new Date() })
      .where(eq(calidadObjetivos.id, id))
      .returning()
    registrarEvento(user, {
      accion: 'calidad.objetivo.editar',
      entidad: 'calidad_objetivo',
      entidadId: id,
      detalle: { componente: antes.componente, antes: { texto: antes.texto, activo: antes.activo }, cambios, motivo: razon },
    })
    return c.json({ data: objetivo })
  },
)

app.post(
  '/mia/calidad/riesgos',
  zValidator('json', z.object({ objetivoId: z.string().uuid(), descripcion: z.string().trim().min(5) })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const body = c.req.valid('json')

    const [objetivo] = await db
      .select({ componente: calidadObjetivos.componente })
      .from(calidadObjetivos)
      .where(and(eq(calidadObjetivos.id, body.objetivoId), eq(calidadObjetivos.firmaId, user.firmaId)))
    if (!objetivo) return c.json({ error: { code: 'NOT_FOUND', message: 'Objetivo no encontrado' } }, 404)

    const [riesgo] = await db
      .insert(calidadRiesgos)
      .values({ firmaId: user.firmaId, objetivoId: body.objetivoId, descripcion: body.descripcion })
      .returning()
    registrarEvento(user, {
      accion: 'calidad.riesgo.crear',
      entidad: 'calidad_riesgo',
      entidadId: riesgo.id,
      detalle: { componente: objetivo.componente, descripcion: body.descripcion },
    })
    return c.json({ data: riesgo }, 201)
  },
)

app.patch(
  '/mia/calidad/riesgos/:id',
  zValidator(
    'json',
    z.object({ descripcion: z.string().trim().min(5).optional(), activo: z.boolean().optional(), motivo }),
  ),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const { motivo: razon, ...cambios } = c.req.valid('json')
    const id = c.req.param('id')

    const [antes] = await db
      .select()
      .from(calidadRiesgos)
      .where(and(eq(calidadRiesgos.id, id), eq(calidadRiesgos.firmaId, user.firmaId)))
    if (!antes) return c.json({ error: { code: 'NOT_FOUND', message: 'Riesgo no encontrado' } }, 404)

    const [riesgo] = await db
      .update(calidadRiesgos)
      .set({ ...cambios, updatedAt: new Date() })
      .where(eq(calidadRiesgos.id, id))
      .returning()
    registrarEvento(user, {
      accion: 'calidad.riesgo.editar',
      entidad: 'calidad_riesgo',
      entidadId: id,
      detalle: { antes: { descripcion: antes.descripcion, activo: antes.activo }, cambios, motivo: razon },
    })
    return c.json({ data: riesgo })
  },
)

app.post(
  '/mia/calidad/respuestas',
  zValidator('json', z.object({ riesgoId: z.string().uuid(), descripcion: z.string().trim().min(5) })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const body = c.req.valid('json')

    const [riesgo] = await db
      .select({ id: calidadRiesgos.id })
      .from(calidadRiesgos)
      .where(and(eq(calidadRiesgos.id, body.riesgoId), eq(calidadRiesgos.firmaId, user.firmaId)))
    if (!riesgo) return c.json({ error: { code: 'NOT_FOUND', message: 'Riesgo no encontrado' } }, 404)

    const [respuesta] = await db
      .insert(calidadRespuestas)
      .values({ firmaId: user.firmaId, riesgoId: body.riesgoId, descripcion: body.descripcion })
      .returning()
    registrarEvento(user, {
      accion: 'calidad.respuesta.crear',
      entidad: 'calidad_respuesta',
      entidadId: respuesta.id,
      detalle: { descripcion: body.descripcion },
    })
    return c.json({ data: respuesta }, 201)
  },
)

app.patch(
  '/mia/calidad/respuestas/:id',
  zValidator(
    'json',
    z.object({ descripcion: z.string().trim().min(5).optional(), activo: z.boolean().optional(), motivo }),
  ),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const { motivo: razon, ...cambios } = c.req.valid('json')
    const id = c.req.param('id')

    const [antes] = await db
      .select()
      .from(calidadRespuestas)
      .where(and(eq(calidadRespuestas.id, id), eq(calidadRespuestas.firmaId, user.firmaId)))
    if (!antes) return c.json({ error: { code: 'NOT_FOUND', message: 'Respuesta no encontrada' } }, 404)

    const [respuesta] = await db
      .update(calidadRespuestas)
      .set({ ...cambios, updatedAt: new Date() })
      .where(eq(calidadRespuestas.id, id))
      .returning()
    registrarEvento(user, {
      accion: 'calidad.respuesta.editar',
      entidad: 'calidad_respuesta',
      entidadId: id,
      detalle: { antes: { descripcion: antes.descripcion, activo: antes.activo }, cambios, motivo: razon },
    })
    return c.json({ data: respuesta })
  },
)

// POST /firmas/mia/calidad/respuestas/:id/evidencia — multipart, campo "archivo". Reemplaza la anterior.
app.post('/mia/calidad/respuestas/:id/evidencia', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const id = c.req.param('id')

  const [respuesta] = await db
    .select()
    .from(calidadRespuestas)
    .where(and(eq(calidadRespuestas.id, id), eq(calidadRespuestas.firmaId, user.firmaId)))
  if (!respuesta) return c.json({ error: { code: 'NOT_FOUND', message: 'Respuesta no encontrada' } }, 404)
  const formato = formatoDeRespuesta(respuesta.baseClave)
  if (formato) {
    return c.json(
      {
        error: {
          code: 'RESPUESTA_CON_FORMATO',
          message: `Esta respuesta se evidencia con el formato «${formato.titulo}»: fírmalo o sube el tuyo en Formatos.`,
        },
      },
      409,
    )
  }

  const body = await c.req.parseBody()
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
  const key = `calidad/${user.firmaId}/${randomUUID()}.${extension}`
  await storage.guardar(key, contenido)

  const [actualizada] = await db
    .update(calidadRespuestas)
    .set({
      evidenciaKey: key,
      evidenciaNombre: archivo.name,
      evidenciaMime: archivo.type || 'application/octet-stream',
      evidenciaAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(calidadRespuestas.id, id))
    .returning()
  // La evidencia anterior se conserva en el storage: la pista de auditoría la referencia por hash.
  registrarEvento(user, {
    accion: 'calidad.respuesta.evidencia',
    entidad: 'calidad_respuesta',
    entidadId: id,
    detalle: { nombre: archivo.name, tamano: archivo.size, hash, reemplaza: respuesta.evidenciaNombre },
  })
  return c.json({ data: actualizada }, 201)
})

// GET /firmas/mia/calidad/respuestas/:id/evidencia — URL firmada de 15 minutos
app.get('/mia/calidad/respuestas/:id/evidencia', async (c) => {
  const { firmaId } = c.get('user')
  const [respuesta] = await db
    .select()
    .from(calidadRespuestas)
    .where(and(eq(calidadRespuestas.id, c.req.param('id')), eq(calidadRespuestas.firmaId, firmaId)))
  if (!respuesta?.evidenciaKey) {
    return c.json({ error: { code: 'SIN_ARCHIVO', message: 'Esta respuesta no tiene evidencia adjunta' } }, 404)
  }
  const { key, exp, sig } = firmarDescarga(respuesta.evidenciaKey)
  const params = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
    nombre: respuesta.evidenciaNombre ?? 'evidencia',
    mime: respuesta.evidenciaMime ?? 'application/octet-stream',
  })
  return c.json({ data: { url: `/archivos?${params.toString()}`, expiraEn: 15 * 60 } })
})

// ─── Formatos prellenados (documentos del sistema) ───────────────────────────

/** Última versión firmada y borrador en curso de cada formato creado. */
async function resumenDocumentos(firmaId: string): Promise<ResumenDocumentoCalidad[]> {
  const filas = await db
    .select({
      id: calidadDocumentos.id,
      formato: calidadDocumentos.formato,
      version: calidadDocumentos.version,
      estado: calidadDocumentos.estado,
      contenido: calidadDocumentos.contenido,
      firmadoAt: calidadDocumentos.firmadoAt,
      vigenteHasta: calidadDocumentos.vigenteHasta,
      firmadoPorNombre: usuarios.nombre,
      archivoNombre: calidadDocumentos.archivoNombre,
      documentoFirmaId: calidadDocumentos.documentoFirmaId,
      documentoFirmaNombre: calidadDocumentosFirma.nombre,
      referencia: calidadDocumentos.referencia,
    })
    .from(calidadDocumentos)
    .leftJoin(usuarios, eq(calidadDocumentos.firmadoPor, usuarios.id))
    .leftJoin(calidadDocumentosFirma, eq(calidadDocumentos.documentoFirmaId, calidadDocumentosFirma.id))
    .where(eq(calidadDocumentos.firmaId, firmaId))
    .orderBy(desc(calidadDocumentos.version))

  const porFormato = new Map<string, ResumenDocumentoCalidad>()
  for (const f of filas) {
    const r = porFormato.get(f.formato) ?? { formato: f.formato, firmado: null, borrador: null }
    if (f.estado === 'borrador') {
      r.borrador = { id: f.id, version: f.version, pendientes: camposPorCompletar(f.contenido) }
    } else if (!r.firmado) {
      r.firmado = {
        id: f.id,
        version: f.version,
        firmadoAt: f.firmadoAt!.toISOString(),
        firmadoPorNombre: f.firmadoPorNombre,
        vigenteHasta: f.vigenteHasta,
        archivoNombre: f.archivoNombre,
        documentoFirma: f.documentoFirmaId
          ? { id: f.documentoFirmaId, nombre: f.documentoFirmaNombre ?? '—', referencia: f.referencia }
          : null,
      }
    }
    porFormato.set(f.formato, r)
  }
  return [...porFormato.values()]
}

async function cargarDocumento(id: string, firmaId: string) {
  const [doc] = await db
    .select()
    .from(calidadDocumentos)
    .where(and(eq(calidadDocumentos.id, id), eq(calidadDocumentos.firmaId, firmaId)))
  return doc
}

async function coberturaDe(doc: typeof calidadDocumentos.$inferSelect): Promise<CoberturaDocumentoFirma | null> {
  if (!doc.documentoFirmaId) return null
  const [d] = await db
    .select({ nombre: calidadDocumentosFirma.nombre })
    .from(calidadDocumentosFirma)
    .where(eq(calidadDocumentosFirma.id, doc.documentoFirmaId))
  return { id: doc.documentoFirmaId, nombre: d?.nombre ?? '—', referencia: doc.referencia }
}

async function aDocumento(doc: typeof calidadDocumentos.$inferSelect): Promise<DocumentoCalidad> {
  const versiones = await db
    .select({
      id: calidadDocumentos.id,
      version: calidadDocumentos.version,
      estado: calidadDocumentos.estado,
      firmadoAt: calidadDocumentos.firmadoAt,
    })
    .from(calidadDocumentos)
    .where(and(eq(calidadDocumentos.firmaId, doc.firmaId), eq(calidadDocumentos.formato, doc.formato)))
    .orderBy(desc(calidadDocumentos.version))
  return {
    id: doc.id,
    formato: doc.formato,
    version: doc.version,
    estado: doc.estado,
    contenido: doc.contenido,
    firmadoPorNombre: await nombreUsuario(doc.firmadoPor),
    firmadoAt: doc.firmadoAt?.toISOString() ?? null,
    vigenteHasta: doc.vigenteHasta,
    archivoNombre: doc.archivoNombre,
    documentoFirma: await coberturaDe(doc),
    versiones: versiones.map((v) => ({ ...v, firmadoAt: v.firmadoAt?.toISOString() ?? null })),
  }
}

const ERROR_DOCUMENTO_FIRMADO = {
  code: 'DOCUMENTO_FIRMADO',
  message: 'Este documento ya está firmado. Crea una versión nueva para cambiarlo.',
}

// GET /firmas/mia/calidad/documentos/:id — una versión con su contenido y el historial
app.get('/mia/calidad/documentos/:id', async (c) => {
  const doc = await cargarDocumento(c.req.param('id'), c.get('user').firmaId)
  if (!doc) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)
  return c.json({ data: await aDocumento(doc) })
})

// POST /firmas/mia/calidad/documentos — crea el borrador de un formato: la primera vez desde la
// plantilla con los datos de la firma; después, como nueva versión de la última firmada.
app.post(
  '/mia/calidad/documentos',
  zValidator('json', z.object({ formato: z.enum(FORMATOS_CALIDAD_CLAVES) })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const formato = formatoCalidad(c.req.valid('json').formato)!

    const previas = await db
      .select()
      .from(calidadDocumentos)
      .where(and(eq(calidadDocumentos.firmaId, user.firmaId), eq(calidadDocumentos.formato, formato.clave)))
      .orderBy(desc(calidadDocumentos.version))
    const borrador = previas.find((d) => d.estado === 'borrador')
    if (borrador) return c.json({ data: await aDocumento(borrador) })

    let contenido: Record<string, string>
    const ultimaFirmada = previas[0]
    // Una versión subida como archivo no tiene texto: la nueva versión parte de la plantilla.
    if (ultimaFirmada && !ultimaFirmada.archivoKey) {
      contenido = ultimaFirmada.contenido
    } else {
      const [firma] = await db.select().from(firmas).where(eq(firmas.id, user.firmaId))
      const hoy = new Date()
      contenido = rellenarFormato(formato, {
        firma: firma.nombre,
        nit: firma.nit,
        ciudad: firma.ciudad,
        direccion: firma.direccion,
        email: firma.email,
        responsable: await nombreUsuario(firma.responsableCalidadId),
        fecha: hoy.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }),
        anio: hoy.getFullYear(),
      })
    }

    const [doc] = await db
      .insert(calidadDocumentos)
      .values({
        firmaId: user.firmaId,
        formato: formato.clave,
        version: (ultimaFirmada?.version ?? 0) + 1,
        contenido,
        creadoPor: user.sub,
      })
      .onConflictDoNothing()
      .returning()
    // Otro socio lo creó al mismo tiempo: devolver el borrador que quedó.
    const creado =
      doc ??
      (
        await db
          .select()
          .from(calidadDocumentos)
          .where(
            and(
              eq(calidadDocumentos.firmaId, user.firmaId),
              eq(calidadDocumentos.formato, formato.clave),
              eq(calidadDocumentos.estado, 'borrador'),
            ),
          )
      )[0]
    // Crear un borrador no se registra en la pista: lo que cuenta es la firma.
    return c.json({ data: await aDocumento(creado) }, 201)
  },
)

// PUT /firmas/mia/calidad/documentos/:id — guarda el contenido del borrador
app.put(
  '/mia/calidad/documentos/:id',
  zValidator('json', z.object({ contenido: z.record(z.string().max(50_000)) })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const doc = await cargarDocumento(c.req.param('id'), user.firmaId)
    if (!doc) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)
    if (doc.estado !== 'borrador') return c.json({ error: ERROR_DOCUMENTO_FIRMADO }, 409)

    // Solo las secciones del formato; el HTML del editor se sanitiza, el texto plano no
    // (escaparlo duplicaría los escapes en el PDF), igual que en los informes.
    const claves = new Set(formatoCalidad(doc.formato)?.secciones.map((s) => s.key))
    const contenido = Object.fromEntries(
      Object.entries(c.req.valid('json').contenido)
        .filter(([k]) => claves.has(k))
        .map(([k, v]) => [
          k,
          esHtmlInforme(v) ? sanitizeHtml(v, { allowedTags: ETIQUETAS_INFORME_ENRIQUECIDO, allowedAttributes: {} }) : v,
        ]),
    )
    const [actualizado] = await db
      .update(calidadDocumentos)
      .set({ contenido: { ...doc.contenido, ...contenido }, updatedAt: new Date() })
      .where(eq(calidadDocumentos.id, doc.id))
      .returning()
    return c.json({ data: await aDocumento(actualizado) })
  },
)

// POST /firmas/mia/calidad/documentos/:id/firmar — sin campos por completar
app.post('/mia/calidad/documentos/:id/firmar', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const doc = await cargarDocumento(c.req.param('id'), user.firmaId)
  if (!doc) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)
  if (doc.estado !== 'borrador') return c.json({ error: ERROR_DOCUMENTO_FIRMADO }, 409)

  const pendientes = camposPorCompletar(doc.contenido)
  if (pendientes > 0) {
    return c.json(
      {
        error: {
          code: 'CAMPOS_POR_COMPLETAR',
          message: `Quedan ${pendientes} espacio(s) marcados [COMPLETAR]. Llénalos antes de firmar.`,
        },
      },
      409,
    )
  }

  const formato = formatoCalidad(doc.formato)!
  const ahora = new Date()
  const hoy = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) // YYYY-MM-DD
  const [firmado] = await db
    .update(calidadDocumentos)
    .set({
      estado: 'firmado',
      firmadoPor: user.sub,
      firmadoAt: ahora,
      vigenteHasta: vigenteHasta(formato, hoy),
      updatedAt: ahora,
    })
    .where(eq(calidadDocumentos.id, doc.id))
    .returning()
  registrarEvento(user, {
    accion: 'calidad.documento.firmar',
    entidad: 'calidad_documento',
    entidadId: doc.id,
    detalle: {
      formato: formato.clave,
      titulo: formato.titulo,
      version: doc.version,
      componente: formato.componente,
      hash: createHash('sha256').update(JSON.stringify(doc.contenido)).digest('hex'),
    },
  })
  return c.json({ data: await aDocumento(firmado) })
})

// DELETE /firmas/mia/calidad/documentos/:id — descarta un borrador (nunca una versión firmada).
// No se registra en la pista: un borrador descartado nunca tuvo efecto.
app.delete('/mia/calidad/documentos/:id', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const doc = await cargarDocumento(c.req.param('id'), user.firmaId)
  if (!doc) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)
  if (doc.estado !== 'borrador') return c.json({ error: ERROR_DOCUMENTO_FIRMADO }, 409)

  await db.delete(calidadDocumentos).where(and(eq(calidadDocumentos.id, doc.id), eq(calidadDocumentos.estado, 'borrador')))
  return c.json({ data: { id: doc.id } })
})

// POST /firmas/mia/calidad/documentos/subir — la firma sube su propio formato ya firmado
// (multipart: formato, archivo, fecha YYYY-MM-DD de firma). Queda como la versión firmada
// siguiente y reemplaza el borrador en curso, si lo hay.
const MIMES_FORMATO_PROPIO = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]

app.post('/mia/calidad/documentos/subir', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)

  const body = await c.req.parseBody()
  const formato = typeof body['formato'] === 'string' ? formatoCalidad(body['formato']) : undefined
  if (!formato) return c.json({ error: { code: 'FORMATO_INVALIDO', message: 'Formato inválido' } }, 400)
  const archivo = body['archivo']
  if (!(archivo instanceof File)) {
    return c.json({ error: { code: 'ARCHIVO_REQUERIDO', message: 'Adjunta el archivo en el campo "archivo"' } }, 400)
  }
  if (archivo.size > MAX_ARCHIVO_BYTES) {
    return c.json({ error: { code: 'ARCHIVO_MUY_GRANDE', message: 'El archivo supera el límite de 20 MB' } }, 413)
  }
  if (!MIMES_FORMATO_PROPIO.includes(archivo.type)) {
    return c.json({ error: { code: 'TIPO_NO_PERMITIDO', message: 'Sube el documento en PDF, Word o imagen (PNG/JPG)' } }, 400)
  }
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const fechaFirma = typeof body['fecha'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body['fecha']) ? body['fecha'] : hoy
  if (fechaFirma > hoy) {
    return c.json({ error: { code: 'FECHA_FUTURA', message: 'La fecha de firma no puede ser futura' } }, 400)
  }

  const contenidoArchivo = Buffer.from(await archivo.arrayBuffer())
  const hash = createHash('sha256').update(contenidoArchivo).digest('hex')
  const extension = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const key = `calidad/${user.firmaId}/${randomUUID()}.${extension}`
  await storage.guardar(key, contenidoArchivo)

  const doc = await db.transaction(async (tx) => {
    await tx
      .delete(calidadDocumentos)
      .where(
        and(
          eq(calidadDocumentos.firmaId, user.firmaId),
          eq(calidadDocumentos.formato, formato.clave),
          eq(calidadDocumentos.estado, 'borrador'),
        ),
      )
    const [ultima] = await tx
      .select({ version: calidadDocumentos.version })
      .from(calidadDocumentos)
      .where(and(eq(calidadDocumentos.firmaId, user.firmaId), eq(calidadDocumentos.formato, formato.clave)))
      .orderBy(desc(calidadDocumentos.version))
      .limit(1)
    const [insertado] = await tx
      .insert(calidadDocumentos)
      .values({
        firmaId: user.firmaId,
        formato: formato.clave,
        version: (ultima?.version ?? 0) + 1,
        estado: 'firmado',
        contenido: {},
        // La fecha que dice el documento (mediodía en Colombia), no la de la subida: de ahí sale la vigencia.
        firmadoAt: new Date(`${fechaFirma}T12:00:00-05:00`),
        firmadoPor: user.sub,
        vigenteHasta: vigenteHasta(formato, fechaFirma),
        archivoKey: key,
        archivoNombre: archivo.name,
        archivoMime: archivo.type,
        creadoPor: user.sub,
      })
      .returning()
    return insertado
  })

  registrarEvento(user, {
    accion: 'calidad.documento.subir',
    entidad: 'calidad_documento',
    entidadId: doc.id,
    detalle: {
      formato: formato.clave,
      titulo: formato.titulo,
      version: doc.version,
      componente: formato.componente,
      nombre: archivo.name,
      tamano: archivo.size,
      fechaFirma,
      hash,
    },
  })
  return c.json({ data: await aDocumento(doc) }, 201)
})

// GET /firmas/mia/calidad/documentos/:id/archivo — URL firmada de 15 minutos del formato propio
app.get('/mia/calidad/documentos/:id/archivo', async (c) => {
  const doc = await cargarDocumento(c.req.param('id'), c.get('user').firmaId)
  if (!doc?.archivoKey) {
    return c.json({ error: { code: 'SIN_ARCHIVO', message: 'Este documento no tiene archivo adjunto' } }, 404)
  }
  const { key, exp, sig } = firmarDescarga(doc.archivoKey)
  const params = new URLSearchParams({
    key,
    exp: String(exp),
    sig,
    nombre: doc.archivoNombre ?? 'documento',
    mime: doc.archivoMime ?? 'application/octet-stream',
  })
  return c.json({ data: { url: `/archivos?${params.toString()}`, expiraEn: 15 * 60 } })
})

// ─── Manual del sistema de calidad (versionado) ──────────────────────────────

async function resumenManuales(firmaId: string): Promise<ManualCalidadResumen[]> {
  const filas = await db
    .select({
      id: calidadManuales.id,
      version: calidadManuales.version,
      anio: calidadManuales.anio,
      hash: calidadManuales.hash,
      createdAt: calidadManuales.createdAt,
      generadoPorNombre: usuarios.nombre,
      externo: calidadManuales.externo,
      fechaAprobacion: calidadManuales.fechaAprobacion,
      archivoNombre: calidadManuales.archivoNombre,
    })
    .from(calidadManuales)
    .leftJoin(usuarios, eq(calidadManuales.generadoPor, usuarios.id))
    .where(eq(calidadManuales.firmaId, firmaId))
    .orderBy(desc(calidadManuales.version))
  return filas.map(({ createdAt, ...f }) => ({ ...f, generadoAt: createdAt.toISOString() }))
}

/** Foto del sistema que queda guardada en la versión del manual. */
async function fotoDelSistema(firmaId: string, anio: number): Promise<ManualCalidadSnapshot> {
  const [firma] = await db.select().from(firmas).where(eq(firmas.id, firmaId))
  const datos = await cargarDatos(firmaId)
  const evaluacion = await aEvaluacion(await asegurarEvaluacion(firmaId, anio))

  const firmados = await db
    .select({ doc: calidadDocumentos, firmadoPorNombre: usuarios.nombre, documentoFirma: calidadDocumentosFirma })
    .from(calidadDocumentos)
    .leftJoin(usuarios, eq(calidadDocumentos.firmadoPor, usuarios.id))
    .leftJoin(calidadDocumentosFirma, eq(calidadDocumentos.documentoFirmaId, calidadDocumentosFirma.id))
    .where(and(eq(calidadDocumentos.firmaId, firmaId), eq(calidadDocumentos.estado, 'firmado')))
    .orderBy(desc(calidadDocumentos.version))

  const cambios = await db
    .select({ accion: eventos.accion, detalle: eventos.detalle, usuario: usuarios.nombre, createdAt: eventos.createdAt })
    .from(eventos)
    .leftJoin(usuarios, eq(eventos.usuarioId, usuarios.id))
    .where(
      and(
        eq(eventos.firmaId, firmaId),
        inArray(eventos.accion, ACCIONES_HISTORIAL),
        gte(eventos.createdAt, new Date(`${anio}-01-01T00:00:00-05:00`)),
        lt(eventos.createdAt, new Date(`${anio + 1}-01-01T00:00:00-05:00`)),
      ),
    )
    .orderBy(asc(eventos.createdAt))

  const evidenciaDe = (r: (typeof datos.respuestas)[number]) => {
    if (r.vinculo) return `AuditorYa: ${VINCULOS_CALIDAD[r.vinculo]}`
    const formato = formatoDeRespuesta(r.baseClave)
    if (formato) return `Formato: ${formato.titulo}`
    return r.evidenciaNombre ? `Archivo: ${r.evidenciaNombre}` : null
  }

  const [anterior] = await db
    .select({
      version: calidadManuales.version,
      externo: calidadManuales.externo,
      fechaAprobacion: calidadManuales.fechaAprobacion,
      createdAt: calidadManuales.createdAt,
    })
    .from(calidadManuales)
    .where(eq(calidadManuales.firmaId, firmaId))
    .orderBy(desc(calidadManuales.version))
    .limit(1)

  return {
    reemplaza: anterior
      ? {
          version: anterior.version,
          externo: anterior.externo,
          fecha: anterior.fechaAprobacion ?? anterior.createdAt.toISOString().slice(0, 10),
        }
      : null,
    firma: {
      nombre: firma.nombre,
      nit: firma.nit,
      ciudad: firma.ciudad,
      direccion: firma.direccion,
      telefono: firma.telefono,
      email: firma.email,
      inscripcionJcc: firma.inscripcionJcc,
    },
    responsable: await nombreUsuario(firma.responsableCalidadId),
    anio,
    componentes: COMPONENTES_CALIDAD.map((c) => ({
      clave: c.clave,
      titulo: c.titulo,
      ref: c.ref,
      descripcion: c.descripcion,
      objetivos: datos.objetivos
        .filter((o) => o.activo && o.componente === c.clave)
        .map((o) => ({
          texto: o.texto,
          riesgos: datos.riesgos
            .filter((r) => r.activo && r.objetivoId === o.id)
            .map((r) => ({
              descripcion: r.descripcion,
              respuestas: datos.respuestas
                .filter((a) => a.activo && a.riesgoId === r.id)
                .map((a) => ({ descripcion: a.descripcion, evidencia: evidenciaDe(a) })),
            })),
        })),
    })),
    formatos: FORMATOS_CALIDAD.flatMap((f) => {
      const fila = firmados.find((x) => x.doc.formato === f.clave)
      if (!fila) return []
      const { doc } = fila
      return [
        {
          clave: f.clave,
          titulo: f.titulo,
          version: doc.version,
          firmadoAt: doc.firmadoAt!.toISOString(),
          firmadoPor: fila.firmadoPorNombre,
          vigenteHasta: doc.vigenteHasta,
          archivoNombre: doc.archivoNombre,
          cubiertoPor: fila.documentoFirma
            ? {
                nombre: fila.documentoFirma.nombre,
                referencia: doc.referencia,
                aprobadoPor: fila.documentoFirma.aprobadoPor,
                fechaAprobacion: fila.documentoFirma.fechaAprobacion,
              }
            : null,
          secciones: doc.archivoKey ? [] : f.secciones.map((sec) => ({ label: sec.label, contenido: doc.contenido[sec.key] ?? '' })),
        },
      ]
    }),
    evaluacion: {
      fechaCorte: evaluacion.fechaCorte,
      resultado: evaluacion.resultado,
      conclusion: evaluacion.conclusion,
      deficiencias: evaluacion.deficiencias,
      concluidoPor: evaluacion.concluidoPorNombre,
      concluidoAt: evaluacion.concluidoAt,
    },
    cambios: cambios.map((x) => {
      const d = (x.detalle ?? {}) as Record<string, unknown>
      const componente = COMPONENTES_CALIDAD.find((c) => c.clave === d.componente)?.titulo
      const partes = [typeof d.titulo === 'string' ? d.titulo : componente, typeof d.motivo === 'string' ? `«${d.motivo}»` : null]
      return {
        fecha: x.createdAt.toISOString(),
        accion: x.accion,
        detalle: partes.filter(Boolean).join(' · ') || null,
        usuario: x.usuario,
      }
    }),
    cambiosRelevantes: (await cargarCambiosRelevantes(firmaId, anio))
      .slice()
      .reverse()
      .map((x) => ({
        fecha: x.fecha,
        tipo: TIPOS_CAMBIO_RELEVANTE[x.tipo] ?? x.tipo,
        descripcion: x.descripcion,
        componentes: x.componentes.map((k) => COMPONENTES_CALIDAD.find((c) => c.clave === k)?.titulo ?? k),
        decision: x.decision,
        justificacion: x.justificacion,
      })),
  }
}

// POST /firmas/mia/calidad/manuales — genera la versión siguiente (responsable; 8 componentes cumplidos)
app.post(
  '/mia/calidad/manuales',
  zValidator('json', z.object({ anio: z.number().int().min(2000).max(2100).optional() })),
  async (c) => {
    const user = c.get('user')
    const firma = await cargarFirma(user.firmaId)
    if (!puedeConcluir(user, firma?.responsableCalidadId ?? null)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Solo el responsable del sistema de calidad puede generar el manual' } },
        403,
      )
    }
    const anio = c.req.valid('json').anio ?? anioActual()
    const evaluacion = await aEvaluacion(await asegurarEvaluacion(user.firmaId, anio))
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const faltan = componentesSinCumplir(
      { ...(await cargarDatos(user.firmaId)), documentos: await resumenDocumentos(user.firmaId), evaluacion },
      hoy,
    )
    if (faltan.length > 0) {
      return c.json(
        {
          error: {
            code: 'COMPONENTES_SIN_CUMPLIR',
            message: `Para generar el manual, los 8 componentes deben estar cumplidos. Faltan: ${faltan.map((f) => f.titulo).join(', ')}.`,
          },
        },
        409,
      )
    }

    const contenido = await fotoDelSistema(user.firmaId, anio)
    const hash = createHash('sha256').update(JSON.stringify(contenido)).digest('hex')
    const [ultima] = await db
      .select({ version: calidadManuales.version })
      .from(calidadManuales)
      .where(eq(calidadManuales.firmaId, user.firmaId))
      .orderBy(desc(calidadManuales.version))
      .limit(1)
    const [manual] = await db
      .insert(calidadManuales)
      .values({ firmaId: user.firmaId, version: (ultima?.version ?? 0) + 1, anio, contenido, hash, generadoPor: user.sub })
      .returning()

    registrarEvento(user, {
      accion: 'calidad.manual.generar',
      entidad: 'calidad_manual',
      entidadId: manual.id,
      detalle: { titulo: `Manual de calidad versión ${manual.version}`, anio, hash },
    })
    const data: ManualCalidad = {
      id: manual.id,
      version: manual.version,
      anio: manual.anio,
      hash: manual.hash,
      generadoAt: manual.createdAt.toISOString(),
      generadoPorNombre: await nombreUsuario(user.sub),
      externo: false,
      fechaAprobacion: null,
      archivoNombre: null,
      contenido,
    }
    return c.json({ data }, 201)
  },
)

// GET /firmas/mia/calidad/manuales/:id — una versión con su foto completa
app.get('/mia/calidad/manuales/:id', async (c) => {
  const { firmaId } = c.get('user')
  const [fila] = await db
    .select({ manual: calidadManuales, generadoPorNombre: usuarios.nombre })
    .from(calidadManuales)
    .leftJoin(usuarios, eq(calidadManuales.generadoPor, usuarios.id))
    .where(and(eq(calidadManuales.id, c.req.param('id')), eq(calidadManuales.firmaId, firmaId)))
  if (!fila) return c.json({ error: { code: 'NOT_FOUND', message: 'Manual no encontrado' } }, 404)
  const { manual } = fila
  const data: ManualCalidad = {
    id: manual.id,
    version: manual.version,
    anio: manual.anio,
    hash: manual.hash,
    generadoAt: manual.createdAt.toISOString(),
    generadoPorNombre: fila.generadoPorNombre,
    externo: manual.externo,
    fechaAprobacion: manual.fechaAprobacion,
    archivoNombre: manual.archivoNombre,
    contenido: manual.contenido as ManualCalidadSnapshot,
  }
  return c.json({ data })
})

// ─── Evaluación anual (¶53-54) ───────────────────────────────────────────────

async function evaluacionAbierta(c: { get: (k: 'user') => JwtPayload; req: { param: (k: string) => string } }) {
  const user = c.get('user')
  const anio = anioValido(c.req.param('anio'))
  if (!anio) return { error: { code: 'ANIO_INVALIDO', message: 'Año inválido' }, status: 400 as const }
  const evaluacion = await asegurarEvaluacion(user.firmaId, anio)
  if (evaluacion.concluidoAt) return { error: ERROR_EVALUACION_CONCLUIDA, status: 409 as const }
  return { evaluacion }
}

// PUT /firmas/mia/calidad/evaluaciones/:anio — cambia la fecha de corte
app.put(
  '/mia/calidad/evaluaciones/:anio',
  zValidator('json', z.object({ fechaCorte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida') })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const r = await evaluacionAbierta(c)
    if ('error' in r) return c.json({ error: r.error }, r.status)
    const { fechaCorte } = c.req.valid('json')

    const [evaluacion] = await db
      .update(calidadEvaluaciones)
      .set({ fechaCorte })
      .where(eq(calidadEvaluaciones.id, r.evaluacion.id))
      .returning()
    registrarEvento(user, {
      accion: 'calidad.evaluacion.fecha_corte',
      entidad: 'calidad_evaluacion',
      entidadId: evaluacion.id,
      detalle: { anio: evaluacion.anio, antes: r.evaluacion.fechaCorte, fechaCorte },
    })
    return c.json({ data: await aEvaluacion(evaluacion) })
  },
)

// POST /firmas/mia/calidad/evaluaciones/:anio/componentes/:componente — marca revisado
app.post(
  '/mia/calidad/evaluaciones/:anio/componentes/:componente',
  zValidator('json', z.object({ nota: z.string().trim().max(2000).nullable().optional() })),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const componente = c.req.param('componente') as ComponenteCalidad
    if (!COMPONENTES_CALIDAD_CLAVES.includes(componente)) {
      return c.json({ error: { code: 'COMPONENTE_INVALIDO', message: 'Componente inválido' } }, 400)
    }
    const r = await evaluacionAbierta(c)
    if ('error' in r) return c.json({ error: r.error }, r.status)

    const sinRespuesta = riesgosSinRespuesta(componente, await cargarDatos(user.firmaId))
    if (sinRespuesta.length > 0) {
      return c.json(
        {
          error: {
            code: 'RIESGOS_SIN_RESPUESTA',
            message: `Hay ${sinRespuesta.length} riesgo(s) sin respuesta en este componente. Agrega una respuesta o desactiva el riesgo.`,
          },
        },
        409,
      )
    }

    const revision = {
      porId: user.sub,
      porNombre: (await nombreUsuario(user.sub)) ?? '—',
      at: new Date().toISOString(),
      nota: c.req.valid('json').nota ?? null,
    }
    const [evaluacion] = await db
      .update(calidadEvaluaciones)
      .set({ componentesRevisados: { ...r.evaluacion.componentesRevisados, [componente]: revision } })
      .where(eq(calidadEvaluaciones.id, r.evaluacion.id))
      .returning()
    registrarEvento(user, {
      accion: 'calidad.componente.revisar',
      entidad: 'calidad_evaluacion',
      entidadId: evaluacion.id,
      detalle: { anio: evaluacion.anio, componente, nota: revision.nota },
    })
    return c.json({ data: await aEvaluacion(evaluacion) })
  },
)

// DELETE /firmas/mia/calidad/evaluaciones/:anio/componentes/:componente — desmarca
app.delete('/mia/calidad/evaluaciones/:anio/componentes/:componente', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const componente = c.req.param('componente')
  const r = await evaluacionAbierta(c)
  if ('error' in r) return c.json({ error: r.error }, r.status)

  const { [componente]: _quitado, ...resto } = r.evaluacion.componentesRevisados
  const [evaluacion] = await db
    .update(calidadEvaluaciones)
    .set({ componentesRevisados: resto })
    .where(eq(calidadEvaluaciones.id, r.evaluacion.id))
    .returning()
  registrarEvento(user, {
    accion: 'calidad.componente.desmarcar',
    entidad: 'calidad_evaluacion',
    entidadId: evaluacion.id,
    detalle: { anio: evaluacion.anio, componente },
  })
  return c.json({ data: await aEvaluacion(evaluacion) })
})

// POST /firmas/mia/calidad/evaluaciones/:anio/concluir — conclusión firmada del responsable
app.post(
  '/mia/calidad/evaluaciones/:anio/concluir',
  zValidator(
    'json',
    z
      .object({
        resultado: z.enum(['razonable', 'razonable_salvo', 'no_razonable']),
        conclusion: z.string().trim().min(10, 'Escribe la conclusión de la evaluación'),
        deficiencias: z.string().trim().nullable().optional(),
      })
      .refine((v) => v.resultado === 'razonable' || (v.deficiencias ?? '').length >= 10, {
        message: 'Describe las deficiencias y las acciones para corregirlas',
        path: ['deficiencias'],
      }),
  ),
  async (c) => {
    const user = c.get('user')
    const firma = await cargarFirma(user.firmaId)
    if (!puedeConcluir(user, firma?.responsableCalidadId ?? null)) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'Solo el responsable del sistema de calidad puede concluir la evaluación' } },
        403,
      )
    }
    const r = await evaluacionAbierta(c)
    if ('error' in r) return c.json({ error: r.error }, r.status)

    const faltan = componentesPorRevisar(r.evaluacion.componentesRevisados)
    const datos = await cargarDatos(user.firmaId)
    const enAtencion = COMPONENTES_CALIDAD_CLAVES.filter(
      (k) => estadoComponenteCalidad(k, datos, r.evaluacion.componentesRevisados) === 'atencion',
    )
    if (faltan.length > 0 || enAtencion.length > 0) {
      const titulos = [...new Set([...faltan, ...enAtencion])].map(
        (k) => COMPONENTES_CALIDAD.find((x) => x.clave === k)!.titulo,
      )
      return c.json(
        { error: { code: 'COMPONENTES_PENDIENTES', message: `Faltan por revisar: ${titulos.join(', ')}` } },
        409,
      )
    }

    const body = c.req.valid('json')
    const [evaluacion] = await db
      .update(calidadEvaluaciones)
      .set({
        resultado: body.resultado,
        conclusion: body.conclusion,
        deficiencias: body.resultado === 'razonable' ? null : body.deficiencias ?? null,
        concluidoPor: user.sub,
        concluidoAt: new Date(),
      })
      .where(eq(calidadEvaluaciones.id, r.evaluacion.id))
      .returning()
    registrarEvento(user, {
      accion: 'calidad.evaluacion.concluir',
      entidad: 'calidad_evaluacion',
      entidadId: evaluacion.id,
      detalle: { anio: evaluacion.anio, resultado: body.resultado },
    })
    return c.json({ data: await aEvaluacion(evaluacion) })
  },
)

// POST /firmas/mia/calidad/evaluaciones/:anio/reabrir — con motivo, queda en la pista
app.post('/mia/calidad/evaluaciones/:anio/reabrir', zValidator('json', z.object({ motivo })), async (c) => {
  const user = c.get('user')
  const firma = await cargarFirma(user.firmaId)
  if (!puedeConcluir(user, firma?.responsableCalidadId ?? null)) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el responsable del sistema de calidad puede reabrir la evaluación' } },
      403,
    )
  }
  const anio = anioValido(c.req.param('anio'))
  if (!anio) return c.json({ error: { code: 'ANIO_INVALIDO', message: 'Año inválido' } }, 400)
  const actual = await asegurarEvaluacion(user.firmaId, anio)
  if (!actual.concluidoAt) {
    return c.json({ error: { code: 'EVALUACION_ABIERTA', message: 'La evaluación no está concluida' } }, 409)
  }

  const [evaluacion] = await db
    .update(calidadEvaluaciones)
    .set({ resultado: null, conclusion: null, deficiencias: null, concluidoPor: null, concluidoAt: null })
    .where(eq(calidadEvaluaciones.id, actual.id))
    .returning()
  registrarEvento(user, {
    accion: 'calidad.evaluacion.reabrir',
    entidad: 'calidad_evaluacion',
    entidadId: evaluacion.id,
    detalle: {
      anio,
      motivo: c.req.valid('json').motivo,
      anterior: { resultado: actual.resultado, conclusion: actual.conclusion, deficiencias: actual.deficiencias },
    },
  })
  return c.json({ data: await aEvaluacion(evaluacion) })
})

// ─── Cambios relevantes (¶27) ────────────────────────────────────────────────

const decisionCambio = z.object({
  decision: z.enum(['ajustado', 'sin_ajustes']),
  justificacion: z.string().trim().min(10, 'Explica qué se decidió y por qué'),
})

// POST /firmas/mia/calidad/cambios — registra un cambio relevante; la decisión puede venir ya o después
app.post(
  '/mia/calidad/cambios',
  zValidator(
    'json',
    z.object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
      tipo: z.enum(TIPOS_CAMBIO_RELEVANTE_CLAVES),
      descripcion: z.string().trim().min(5, 'Describe qué pasó'),
      componentes: z.array(z.enum(COMPONENTES_CALIDAD_CLAVES)).min(1, 'Elige al menos un componente afectado'),
      decision: decisionCambio.optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const body = c.req.valid('json')
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    if (body.fecha > hoy) {
      return c.json({ error: { code: 'FECHA_FUTURA', message: 'Registra el cambio cuando ya haya ocurrido' } }, 400)
    }

    const ahora = new Date()
    const [cambio] = await db
      .insert(calidadCambiosRelevantes)
      .values({
        firmaId: user.firmaId,
        fecha: body.fecha,
        tipo: body.tipo,
        descripcion: body.descripcion,
        componentes: [...new Set(body.componentes)],
        decision: body.decision?.decision ?? null,
        justificacion: body.decision?.justificacion ?? null,
        evaluadoPor: body.decision ? user.sub : null,
        evaluadoAt: body.decision ? ahora : null,
        creadoPor: user.sub,
      })
      .returning({ id: calidadCambiosRelevantes.id })

    registrarEvento(user, {
      accion: 'calidad.cambio.registrar',
      entidad: 'calidad_cambio_relevante',
      entidadId: cambio.id,
      detalle: { titulo: TIPOS_CAMBIO_RELEVANTE[body.tipo], motivo: body.descripcion, fecha: body.fecha, componentes: body.componentes },
    })
    if (body.decision) {
      registrarEvento(user, {
        accion: 'calidad.cambio.evaluar',
        entidad: 'calidad_cambio_relevante',
        entidadId: cambio.id,
        detalle: { titulo: TIPOS_CAMBIO_RELEVANTE[body.tipo], motivo: body.decision.justificacion, decision: body.decision.decision },
      })
    }
    return c.json({ data: { id: cambio.id } }, 201)
  },
)

// POST /firmas/mia/calidad/cambios/:id/evaluar — deja la decisión de un cambio registrado sin evaluar
app.post('/mia/calidad/cambios/:id/evaluar', zValidator('json', decisionCambio), async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const { decision, justificacion } = c.req.valid('json')
  const [cambio] = await db
    .select()
    .from(calidadCambiosRelevantes)
    .where(and(eq(calidadCambiosRelevantes.id, c.req.param('id')), eq(calidadCambiosRelevantes.firmaId, user.firmaId)))
  if (!cambio) return c.json({ error: { code: 'NOT_FOUND', message: 'Cambio no encontrado' } }, 404)
  if (cambio.decision) {
    return c.json({ error: { code: 'CAMBIO_YA_EVALUADO', message: 'Este cambio ya fue evaluado' } }, 409)
  }

  await db
    .update(calidadCambiosRelevantes)
    .set({ decision, justificacion, evaluadoPor: user.sub, evaluadoAt: new Date() })
    .where(eq(calidadCambiosRelevantes.id, cambio.id))
  registrarEvento(user, {
    accion: 'calidad.cambio.evaluar',
    entidad: 'calidad_cambio_relevante',
    entidadId: cambio.id,
    detalle: {
      titulo: TIPOS_CAMBIO_RELEVANTE[cambio.tipo as TipoCambioRelevante] ?? cambio.tipo,
      motivo: justificacion,
      decision,
    },
  })
  return c.json({ data: { id: cambio.id } })
})

// ─── Documentos que la firma ya tenía y manual anterior ──────────────────────

/** Formatos cubiertos hoy por cada documento: los que tienen como última versión firmada ese documento. */
async function cargarDocumentosFirma(
  firmaId: string,
  documentos: { formato: string; firmado: { documentoFirma: CoberturaDocumentoFirma | null } | null }[],
): Promise<DocumentoFirmaCalidad[]> {
  const filas = await db
    .select({ doc: calidadDocumentosFirma, creadoPorNombre: usuarios.nombre })
    .from(calidadDocumentosFirma)
    .leftJoin(usuarios, eq(calidadDocumentosFirma.creadoPor, usuarios.id))
    .where(eq(calidadDocumentosFirma.firmaId, firmaId))
    .orderBy(desc(calidadDocumentosFirma.fechaAprobacion), desc(calidadDocumentosFirma.createdAt))
  return filas.map(({ doc, creadoPorNombre }) => ({
    id: doc.id,
    nombre: doc.nombre,
    fechaAprobacion: doc.fechaAprobacion,
    aprobadoPor: doc.aprobadoPor,
    archivoNombre: doc.archivoNombre,
    formatos: documentos.filter((d) => d.firmado?.documentoFirma?.id === doc.id).map((d) => d.formato),
    creadoPorNombre,
    createdAt: doc.createdAt.toISOString(),
  }))
}

/** Lee y guarda el archivo de un formulario multipart; devuelve un error listo para responder si no sirve. */
async function guardarArchivoCalidad(firmaId: string, archivo: unknown) {
  if (!(archivo instanceof File)) {
    return { error: { code: 'ARCHIVO_REQUERIDO', message: 'Adjunta el archivo en el campo "archivo"' }, status: 400 as const }
  }
  if (archivo.size > MAX_ARCHIVO_BYTES) {
    return { error: { code: 'ARCHIVO_MUY_GRANDE', message: 'El archivo supera el límite de 20 MB' }, status: 413 as const }
  }
  if (!MIMES_FORMATO_PROPIO.includes(archivo.type)) {
    return { error: { code: 'TIPO_NO_PERMITIDO', message: 'Sube el documento en PDF, Word o imagen (PNG/JPG)' }, status: 400 as const }
  }
  const contenido = Buffer.from(await archivo.arrayBuffer())
  const extension = (archivo.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const key = `calidad/${firmaId}/${randomUUID()}.${extension}`
  await storage.guardar(key, contenido)
  return {
    archivo: {
      key,
      nombre: archivo.name,
      mime: archivo.type,
      tamano: archivo.size,
      hash: createHash('sha256').update(contenido).digest('hex'),
    },
  }
}

function fechaDelFormulario(valor: unknown): string | null {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

const hoyBogota = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

function urlArchivo(key: string, nombre: string | null, mime: string | null) {
  const { key: k, exp, sig } = firmarDescarga(key)
  const params = new URLSearchParams({
    key: k,
    exp: String(exp),
    sig,
    nombre: nombre ?? 'documento',
    mime: mime ?? 'application/octet-stream',
  })
  return { url: `/archivos?${params.toString()}`, expiraEn: 15 * 60 }
}

// POST /firmas/mia/calidad/documentos-firma — sube un manual o política que la firma ya tenía
// (multipart: archivo, nombre, fechaAprobacion YYYY-MM-DD, aprobadoPor opcional).
app.post('/mia/calidad/documentos-firma', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const body = await c.req.parseBody()
  const nombre = typeof body['nombre'] === 'string' ? body['nombre'].trim() : ''
  if (nombre.length < 3) return c.json({ error: { code: 'VALIDACION', message: 'Ponle un nombre al documento' } }, 400)
  const fechaAprobacion = fechaDelFormulario(body['fechaAprobacion'])
  if (!fechaAprobacion) return c.json({ error: { code: 'VALIDACION', message: 'Indica la fecha de aprobación' } }, 400)
  if (fechaAprobacion > hoyBogota()) {
    return c.json({ error: { code: 'FECHA_FUTURA', message: 'La fecha de aprobación no puede ser futura' } }, 400)
  }
  const aprobadoPor = typeof body['aprobadoPor'] === 'string' && body['aprobadoPor'].trim() ? body['aprobadoPor'].trim() : null

  const subido = await guardarArchivoCalidad(user.firmaId, body['archivo'])
  if ('error' in subido) return c.json({ error: subido.error }, subido.status)
  const { archivo } = subido

  const [doc] = await db
    .insert(calidadDocumentosFirma)
    .values({
      firmaId: user.firmaId,
      nombre,
      fechaAprobacion,
      aprobadoPor,
      archivoKey: archivo.key,
      archivoNombre: archivo.nombre,
      archivoMime: archivo.mime,
      hash: archivo.hash,
      creadoPor: user.sub,
    })
    .returning()
  registrarEvento(user, {
    accion: 'calidad.documento_firma.subir',
    entidad: 'calidad_documento_firma',
    entidadId: doc.id,
    detalle: { titulo: nombre, fechaAprobacion, aprobadoPor, nombre: archivo.nombre, tamano: archivo.tamano, hash: archivo.hash },
  })
  return c.json({ data: { id: doc.id } }, 201)
})

// POST /firmas/mia/calidad/documentos-firma/:id/cubrir — marca qué formatos cubre el documento y
// dónde (capítulo, páginas). Cada uno queda con una versión firmada nueva que apunta al documento,
// vigente un año desde su aprobación; reemplaza el borrador en curso, si lo hay.
app.post(
  '/mia/calidad/documentos-firma/:id/cubrir',
  zValidator(
    'json',
    z.object({
      formatos: z
        .array(
          z.object({
            formato: z.enum(FORMATOS_CALIDAD_CLAVES),
            referencia: z.string().trim().max(200).nullable().optional(),
          }),
        )
        .min(1, 'Elige al menos un formato'),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
    const [doc] = await db
      .select()
      .from(calidadDocumentosFirma)
      .where(and(eq(calidadDocumentosFirma.id, c.req.param('id')), eq(calidadDocumentosFirma.firmaId, user.firmaId)))
    if (!doc) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)

    const vence = vigenciaDocumentoFirma(doc.fechaAprobacion)
    if (vence <= hoyBogota()) {
      return c.json(
        {
          error: {
            code: 'DOCUMENTO_VENCIDO',
            message: 'Este documento se aprobó hace más de un año y ya no cubre formatos. Sube una versión aprobada este año.',
          },
        },
        409,
      )
    }
    // Sin duplicados, y sin volver a firmar lo que este mismo documento ya cubre.
    const actuales = await resumenDocumentos(user.firmaId)
    const pedidos = [...new Map(c.req.valid('json').formatos.map((f) => [f.formato, f])).values()].filter(
      (p) => actuales.find((a) => a.formato === p.formato)?.firmado?.documentoFirma?.id !== doc.id,
    )
    if (pedidos.length === 0) return c.json({ data: { formatos: [] } })

    // Un documento más viejo no reemplaza una versión firmada más reciente.
    const firmadoEl = new Date(`${doc.fechaAprobacion}T12:00:00-05:00`)
    const masRecientes = pedidos.filter((p) => {
      const f = actuales.find((a) => a.formato === p.formato)?.firmado
      return f && new Date(f.firmadoAt) > firmadoEl && f.documentoFirma?.id !== doc.id
    })
    if (masRecientes.length > 0) {
      return c.json(
        {
          error: {
            code: 'VERSION_MAS_RECIENTE',
            message: `Ya hay una versión firmada más reciente que este documento en: ${masRecientes
              .map((p) => formatoCalidad(p.formato)!.titulo)
              .join(', ')}.`,
          },
        },
        409,
      )
    }

    const creados = await db.transaction(async (tx) => {
      const filas = []
      for (const p of pedidos) {
        await tx
          .delete(calidadDocumentos)
          .where(
            and(
              eq(calidadDocumentos.firmaId, user.firmaId),
              eq(calidadDocumentos.formato, p.formato),
              eq(calidadDocumentos.estado, 'borrador'),
            ),
          )
        const [ultima] = await tx
          .select({ version: calidadDocumentos.version })
          .from(calidadDocumentos)
          .where(and(eq(calidadDocumentos.firmaId, user.firmaId), eq(calidadDocumentos.formato, p.formato)))
          .orderBy(desc(calidadDocumentos.version))
          .limit(1)
        const [fila] = await tx
          .insert(calidadDocumentos)
          .values({
            firmaId: user.firmaId,
            formato: p.formato,
            version: (ultima?.version ?? 0) + 1,
            estado: 'firmado',
            contenido: {},
            firmadoAt: firmadoEl,
            firmadoPor: user.sub,
            vigenteHasta: vence,
            archivoKey: doc.archivoKey,
            archivoNombre: doc.archivoNombre,
            archivoMime: doc.archivoMime,
            documentoFirmaId: doc.id,
            referencia: p.referencia || null,
            creadoPor: user.sub,
          })
          .returning()
        filas.push(fila)
      }
      return filas
    })

    for (const fila of creados) {
      const formato = formatoCalidad(fila.formato)!
      registrarEvento(user, {
        accion: 'calidad.documento.cubrir',
        entidad: 'calidad_documento',
        entidadId: fila.id,
        detalle: {
          formato: formato.clave,
          titulo: formato.titulo,
          componente: formato.componente,
          version: fila.version,
          motivo: `Cubierto por «${doc.nombre}»${fila.referencia ? `, ${fila.referencia}` : ''}`,
          documentoFirmaId: doc.id,
        },
      })
    }
    return c.json({ data: { formatos: creados.map((f) => f.formato) } })
  },
)

// GET /firmas/mia/calidad/documentos-firma/:id/archivo — URL firmada de 15 minutos
app.get('/mia/calidad/documentos-firma/:id/archivo', async (c) => {
  const [doc] = await db
    .select()
    .from(calidadDocumentosFirma)
    .where(and(eq(calidadDocumentosFirma.id, c.req.param('id')), eq(calidadDocumentosFirma.firmaId, c.get('user').firmaId)))
  if (!doc) return c.json({ error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } }, 404)
  return c.json({ data: urlArchivo(doc.archivoKey, doc.archivoNombre, doc.archivoMime) })
})

// POST /firmas/mia/calidad/manuales/externo — registra un manual anterior hecho fuera de AuditorYa
// (multipart: archivo, version, fechaAprobacion). Solo antes del primer manual generado en AuditorYa:
// es la historia previa, y el siguiente que se genere continúa la numeración.
app.post('/mia/calidad/manuales/externo', async (c) => {
  const user = c.get('user')
  if (!puedeGestionar(user)) return c.json({ error: ERROR_SIN_PERMISO }, 403)
  const body = await c.req.parseBody()
  const version = Number(body['version'])
  if (!Number.isInteger(version) || version < 1 || version > 999) {
    return c.json({ error: { code: 'VALIDACION', message: 'Indica el número de versión del manual (1, 2, 3…)' } }, 400)
  }
  const fechaAprobacion = fechaDelFormulario(body['fechaAprobacion'])
  if (!fechaAprobacion) return c.json({ error: { code: 'VALIDACION', message: 'Indica la fecha de aprobación' } }, 400)
  if (fechaAprobacion > hoyBogota()) {
    return c.json({ error: { code: 'FECHA_FUTURA', message: 'La fecha de aprobación no puede ser futura' } }, 400)
  }

  const existentes = await db
    .select({ version: calidadManuales.version, externo: calidadManuales.externo })
    .from(calidadManuales)
    .where(eq(calidadManuales.firmaId, user.firmaId))
  if (existentes.some((m) => !m.externo)) {
    return c.json(
      {
        error: {
          code: 'YA_HAY_MANUAL_AUDITORYA',
          message: 'Ya generaste el manual en AuditorYa: los manuales anteriores se registran antes de la primera versión.',
        },
      },
      409,
    )
  }
  if (existentes.some((m) => m.version === version)) {
    return c.json({ error: { code: 'VERSION_EXISTE', message: `La versión ${version} ya está registrada` } }, 409)
  }

  const subido = await guardarArchivoCalidad(user.firmaId, body['archivo'])
  if ('error' in subido) return c.json({ error: subido.error }, subido.status)
  const { archivo } = subido

  const [manual] = await db
    .insert(calidadManuales)
    .values({
      firmaId: user.firmaId,
      version,
      anio: Number(fechaAprobacion.slice(0, 4)),
      contenido: {},
      hash: archivo.hash,
      generadoPor: user.sub,
      externo: true,
      fechaAprobacion,
      archivoKey: archivo.key,
      archivoNombre: archivo.nombre,
      archivoMime: archivo.mime,
    })
    .returning()
  registrarEvento(user, {
    accion: 'calidad.manual.externo',
    entidad: 'calidad_manual',
    entidadId: manual.id,
    detalle: { titulo: `Manual anterior versión ${version}`, fechaAprobacion, nombre: archivo.nombre, hash: archivo.hash },
  })
  return c.json({ data: { id: manual.id } }, 201)
})

// GET /firmas/mia/calidad/manuales/:id/archivo — URL firmada del manual anterior (externo)
app.get('/mia/calidad/manuales/:id/archivo', async (c) => {
  const [manual] = await db
    .select()
    .from(calidadManuales)
    .where(and(eq(calidadManuales.id, c.req.param('id')), eq(calidadManuales.firmaId, c.get('user').firmaId)))
  if (!manual?.archivoKey) {
    return c.json({ error: { code: 'SIN_ARCHIVO', message: 'Esta versión no tiene archivo adjunto' } }, 404)
  }
  return c.json({ data: urlArchivo(manual.archivoKey, manual.archivoNombre, manual.archivoMime) })
})

export default app
