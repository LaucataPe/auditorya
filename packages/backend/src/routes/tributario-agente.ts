/**
 * Agente de IVA sobre una revisión tributaria (docs/agente/procedimiento-iva-v1.md, etapa 2):
 *  - GET  /tributario/revisiones/:id/agente                          → última corrida + propuestas con bitácora
 *  - POST /tributario/revisiones/:id/agente/corridas                 → corre el motor con los resúmenes leídos en el navegador (0 tokens)
 *  - POST /tributario/revisiones/:id/agente/propuestas/:pid/decidir  → aprobar / ajustar / omitir / descartar / retomar
 *  - DELETE /tributario/revisiones/:id/agente/memoria                 → olvida la memoria de la empresa (mapeo de 2408, tipo de cierre)
 *  - PUT  /tributario/revisiones/:id/agente/cedulas/:cid/conclusion  → conclusión del auditor sobre una cédula (nombre y fecha los pone el servidor)
 * Aprobar un hallazgo lo escribe en hallazgos_tributarios; aprobar un juicio marca el
 * punto del checklist con la nota del agente. Todo exige la revisión abierta (no sellada).
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { zValidator } from '../lib/validacion'
import { db } from '../db/client'
import {
  bitacoraAgente, empresas, hallazgosTributarios, obligacionesTributarias, propuestasAgente, revisionesTributarias, usuarios,
} from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { registrarEvento } from '../lib/eventos'
import { mergeJsonbPatch } from '../lib/jsonb'
import { aPropuestaTributaria, cargarMemoriaIva, correrProcedimientoIva, estadoAgenteIva, guardarMemoriaIva, olvidarMemoriaIva } from '../lib/agente/corrida-iva'
import {
  RESULTADOS_CONCLUSION_CEDULA, esTipoAgentico, faltaParaFormato, estadoConclusionCedula, nombreObligacion,
  type ConclusionCedula, type ConclusionesCedulas, type ContenidoPropuesta, type EntradaCorridaIvaCliente, type MemoriaIvaEmpresa,
} from '@auditorya/types'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()
app.use('*', authMiddleware)

const ERROR_REVISION_SELLADA = {
  code: 'REVISION_SELLADA',
  message: 'La revisión ya fue firmada; un socio debe reabrirla para modificarla',
} as const

async function cargarRevision(revisionId: string, firmaId: string) {
  const [row] = await db
    .select({ revision: revisionesTributarias, obligacion: obligacionesTributarias, empresa: empresas })
    .from(revisionesTributarias)
    .innerJoin(obligacionesTributarias, eq(revisionesTributarias.obligacionId, obligacionesTributarias.id))
    .innerJoin(empresas, eq(obligacionesTributarias.empresaId, empresas.id))
    .where(and(eq(revisionesTributarias.id, revisionId), eq(empresas.firmaId, firmaId)))
  return row ?? null
}

// ─── Esquemas del cuerpo de la corrida (resúmenes ya calculados en el navegador) ──

const suma = z.object({ n: z.number(), base: z.number(), iva: z.number(), total: z.number() })
const resumenDian = z.object({
  desde: z.string(), hasta: z.string(),
  ventas: suma, notasCreditoVentas: suma, notasDebitoVentas: suma, compras: suma, comprasVentana: suma, notasCreditoCompras: suma, comprasNoObligados: suma,
  recibidasTarde: z.number(), contingencia: z.number(), mesesSinEmitidos: z.array(z.string()), ivaGeneradoNeto: z.number(), ingresosNetos: z.number(),
})
const movimiento = z.object({
  fecha: z.string(), tipoDoc: z.string().nullable(), numeroDoc: z.string().nullable(), cuenta: z.string(), cuentaNombre: z.string().nullable(),
  tercero: z.string().nullable(), terceroNombre: z.string().nullable(), concepto: z.string().nullable(), debito: z.number(), credito: z.number(),
})
const cuentaResumen = z.object({ cuenta: z.string(), nombre: z.string().nullable(), debitos: z.number(), creditos: z.number(), movimientos: z.number(), cierres: z.array(movimiento) })
const mapeoLibrosIva = z.object({
  cifras: z.record(z.object({ libros: z.number() })),
  totales: z.object({ 'iva-ing-brutos': z.number().optional() }),
  cuentas: z.array(z.object({
    cuenta: z.string(), nombre: z.string().nullable(), destino: z.string().nullable(), total: z.enum(['iva-ing-brutos']).nullable(), neto: z.number(),
    regla: z.enum(['memoria', 'nombre', 'prefijo', 'ignorada']), motivo: z.string(),
  })),
  sinClasificar: z.array(cuentaResumen),
  bitacora: z.array(z.string()),
})
const asientoRf = z.object({
  cuenta: z.string(), concepto: z.string(), beneficiario: z.enum(['pj', 'pn']).nullable(), tercero: z.string().nullable(), terceroNombre: z.string().nullable(),
  fecha: z.string(), numeroDoc: z.string().nullable(), base: z.number(), retencion: z.number(), tarifa: z.number(), tarifaRegistrada: z.number().nullable(),
})
const mapeoLibrosRetefuente = z.object({
  cifras: z.record(z.object({ libros: z.number() })),
  conceptos: z.record(z.object({ retencion: z.number(), base: z.number().nullable(), beneficiarioConocido: z.boolean() })),
  cuentas: z.array(z.object({
    cuenta: z.string(), nombre: z.string().nullable(), destino: z.string().nullable(), neto: z.number(),
    regla: z.enum(['memoria', 'nombre', 'puc', 'ignorada']), motivo: z.string(), tarifaNombre: z.number().nullable(),
  })),
  sinClasificar: z.array(cuentaResumen),
  asientos: z.array(asientoRf).max(50_000),
  anomalias: z.array(z.object({ asiento: asientoRf, tipo: z.enum(['calculo', 'tarifa']), detalle: z.string() })).max(5_000),
  sinBeneficiario: z.number(),
  terceros: z.object({
    filas: z.array(z.object({
      tercero: z.string().nullable(), nombre: z.string().nullable(), beneficiario: z.enum(['pj', 'pn']).nullable(), base: z.number(),
      conceptos: z.array(z.enum(['honorarios', 'comisiones', 'servicios', 'arrendamientos', 'compras', 'otros'])), cuentasBase: z.array(z.string()),
      retencion: z.number(), tarifaImplicita: z.number().nullable(), baseRetenida: z.number(), diferencia: z.number(),
      alerta: z.enum(['sin_retencion', 'retencion_baja', 'retencion_alta', 'retencion_sin_base']).nullable(), nota: z.string().nullable(),
    })).max(300),
    omitidas: z.number(), terceros: z.number(),
    alertas: z.object({ sin_retencion: z.number(), retencion_baja: z.number(), retencion_alta: z.number(), retencion_sin_base: z.number() }),
    baseTotal: z.number(), retencionTotal: z.number(),
    cuentasBase: z.array(z.object({ cuenta: z.string(), nombre: z.string().nullable(), concepto: z.enum(['honorarios', 'comisiones', 'servicios', 'arrendamientos', 'compras', 'otros']), neto: z.number(), terceros: z.number() })).max(2000),
    excluidas: z.array(z.object({ cuenta: z.string(), nombre: z.string().nullable(), motivo: z.string(), neto: z.number() })).max(2000),
    uvt: z.object({ anio: z.number(), valor: z.number(), deReferencia: z.boolean() }).nullable(),
    bitacora: z.array(z.string()),
  }).nullable().optional(),
  tercerosPorQue: z.string().nullable().optional(),
  bitacora: z.array(z.string()),
})
const mapeoLibrosReteica = z.object({
  cifras: z.record(z.object({ libros: z.number() })),
  municipio: z.string().nullable(),
  municipioOrigen: z.enum(['obligacion', 'memoria', 'unico-en-libros']).nullable(),
  municipios: z.array(z.object({ municipio: z.string(), retencion: z.number(), autorretencion: z.number(), devoluciones: z.number(), pagos: z.number(), subcuentas: z.number() })).max(200),
  subcuentas: z.array(z.object({
    cuenta: z.string(), nombre: z.string().nullable(), municipio: z.string().nullable(), tipo: z.enum(['retencion', 'autorretencion', 'saldo']).nullable(), tarifa: z.number().nullable(),
    regla: z.enum(['memoria', 'nombre', 'padre', 'sin-clasificar']), motivo: z.string(), creditos: z.number(), debitosTerceros: z.number(), pagos: z.number(), baseExplicada: z.number().nullable(),
  })).max(2000),
  sinClasificar: z.array(cuentaResumen),
  baseExplicada: z.number().nullable(),
  conTerceros: z.boolean(),
  terceros: z.array(z.object({ tercero: z.string().nullable(), nombre: z.string().nullable(), cuenta: z.string(), tarifa: z.number().nullable(), retencion: z.number(), devolucion: z.number(), baseExplicada: z.number().nullable() })).max(20_000),
  bitacora: z.array(z.string()),
})
const claseCuentaIca = z.enum(['ingreso', 'fuera', 'devolucion', 'exportacion', 'devolucion-exportacion', 'activo-fijo', 'no-sujeto', 'exento', 'retencion', 'autorretencion', 'anticipo', 'causacion', 'gasto', 'ignorar'])
const mapeoLibrosIca = z.object({
  cifras: z.record(z.object({ libros: z.number() })),
  municipio: z.string().nullable(),
  cuentas: z.array(z.object({
    cuenta: z.string(), nombre: z.string().nullable(), clase: claseCuentaIca, municipio: z.string().nullable(), regla: z.enum(['memoria', 'puc', 'nombre']),
    motivo: z.string(), debitos: z.number(), creditos: z.number(), valor: z.number(),
  })).max(5000),
  otrosMunicipios: z.array(z.object({ municipio: z.string(), ingresos: z.number(), devoluciones: z.number(), retenciones: z.number(), cuentas: z.number() })).max(200),
  retencionesPorMunicipio: z.boolean(),
  debitosEnIngresos: z.number(),
  porClasificar: z.array(cuentaResumen),
  causado: z.object({ creditos2412: z.number(), debitosGasto: z.number() }).nullable(),
  bitacora: z.array(z.string()),
})
// Cada forma tiene un campo propio (totales / conceptos / municipios / otrosMunicipios): la unión no se confunde.
const mapeoLibros = z.union([mapeoLibrosIva, mapeoLibrosRetefuente, mapeoLibrosReteica, mapeoLibrosIca])
const corridaSchema = z.object({
  tiposDocCierre: z.array(z.string().max(20)).max(20).optional(),
  libros: mapeoLibros.nullable(),
  dian: z.object({ resumen: resumenDian, nitReporte: z.string().nullable(), advertencias: z.array(z.string()) }).nullable(),
  insumos: z.object({
    auxiliares: z.array(z.object({ adjuntoId: z.string().nullable(), nombre: z.string(), archivo: z.string(), enPeriodo: z.number(), cuentas: z.array(z.string()), cierres: z.number() })),
    dian: z.object({ adjuntoId: z.string().nullable(), archivo: z.string(), documentos: z.number() }).nullable(),
    anterior: z.string().nullable().optional(),
  }),
  lecturas: z.array(z.string().max(2000)).max(500),
})

// GET /tributario/revisiones/:id/agente
app.get('/tributario/revisiones/:id/agente', async (c) => {
  const { firmaId } = c.get('user')
  const row = await cargarRevision(c.req.param('id'), firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  return c.json({ data: await estadoAgenteIva(row.revision.id, row.obligacion.empresaId) })
})

// DELETE /tributario/revisiones/:id/agente/memoria — la empresa vuelve a empezar de cero
app.delete('/tributario/revisiones/:id/agente/memoria', async (c) => {
  const user = c.get('user')
  const row = await cargarRevision(c.req.param('id'), user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  await olvidarMemoriaIva(row.obligacion.empresaId)
  registrarEvento(user, { accion: 'tributario.agente.memoria.olvidar', entidad: 'empresa', entidadId: row.obligacion.empresaId, empresaId: row.obligacion.empresaId })
  return c.json({ data: await cargarMemoriaIva(row.obligacion.empresaId) })
})

// PUT /tributario/revisiones/:id/agente/memoria/formato — columnas de un formato de libro que el
// lector no reconoció solo: quedan en la memoria de la empresa y ese formato se lee solo desde ahí.
app.put(
  '/tributario/revisiones/:id/agente/memoria/formato',
  zValidator('json', z.object({
    firma: z.string().min(3).max(2000),
    familia: z.enum(['movimientos', 'balance']),
    columnas: z.record(z.number().int().min(0).max(500).nullable()),
    etiqueta: z.string().max(200).optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const body = c.req.valid('json')
    const row = await cargarRevision(c.req.param('id'), user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    const falta = faltaParaFormato(body.familia, body.columnas)
    if (falta.length) return c.json({ error: { code: 'FORMATO_INCOMPLETO', message: `Falta indicar ${falta.join(', ')}` } }, 400)
    const memoria = await guardarMemoriaIva(row.obligacion.empresaId, { formatoLibro: { ...body, creadoAt: new Date().toISOString() } }, user.sub)
    registrarEvento(user, {
      accion: 'tributario.agente.memoria.formato', entidad: 'empresa', entidadId: row.obligacion.empresaId, empresaId: row.obligacion.empresaId,
      detalle: { familia: body.familia, etiqueta: body.etiqueta ?? null, columnas: Object.keys(body.columnas).filter((k) => body.columnas[k] !== null) },
    })
    return c.json({ data: memoria })
  },
)

// POST /tributario/revisiones/:id/agente/corridas
app.post('/tributario/revisiones/:id/agente/corridas', zValidator('json', corridaSchema), async (c) => {
  const user = c.get('user')
  const body = c.req.valid('json')
  const row = await cargarRevision(c.req.param('id'), user.firmaId)
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
  if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)
  if (!esTipoAgentico(row.obligacion.tipo)) {
    return c.json({ error: { code: 'PROCEDIMIENTO_NO_DISPONIBLE', message: 'El agente solo revisa IVA, retención en la fuente, reteICA e ICA por ahora' } }, 409)
  }
  const entrada = {
    ...body,
    insumos: { ...body.insumos, anterior: body.insumos.anterior ?? null },
  } as unknown as EntradaCorridaIvaCliente
  const estado = await correrProcedimientoIva(
    { revision: row.revision, obligacion: row.obligacion, empresa: { nombre: row.empresa.nombre, nit: row.empresa.nit ?? null } },
    user,
    entrada,
  )
  return c.json({ data: estado }, 201)
})

// POST /tributario/revisiones/:id/agente/propuestas/:pid/decidir
app.post(
  '/tributario/revisiones/:id/agente/propuestas/:pid/decidir',
  zValidator('json', z.object({
    decision: z.enum(['aprobar', 'ajustar', 'omitir', 'descartar', 'retomar']),
    motivo: z.string().max(1000).optional(),
    ajustes: z.object({
      opcion: z.string().max(60).optional(),
      titulo: z.string().min(3).optional(),
      descripcion: z.string().optional(),
      severidad: z.enum(['alta', 'media', 'baja']).optional(),
    }).optional(),
  })),
  async (c) => {
    const user = c.get('user')
    const { decision, motivo, ajustes } = c.req.valid('json')
    const row = await cargarRevision(c.req.param('id'), user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)

    const [p] = await db.select().from(propuestasAgente)
      .where(and(eq(propuestasAgente.id, c.req.param('pid')), eq(propuestasAgente.revisionTributariaId, row.revision.id)))
    if (!p) return c.json({ error: { code: 'NOT_FOUND', message: 'Propuesta no encontrada' } }, 404)

    const abierta = p.estado === 'propuesta' || p.estado === 'omitida'
    if (decision === 'retomar') {
      if (p.estado !== 'omitida') return c.json({ error: { code: 'ESTADO_INVALIDO', message: 'Solo se retoma una propuesta omitida' } }, 409)
    } else if (!abierta) {
      return c.json({ error: { code: 'ESTADO_INVALIDO', message: 'Esta propuesta ya fue decidida' } }, 409)
    }

    const [usuario] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, user.sub))
    const nombre = usuario?.nombre ?? 'Usuario'
    const contenido = p.contenido as ContenidoPropuesta
    const trib = contenido.tributario
    let texto = ''
    let set: Partial<typeof propuestasAgente.$inferInsert> = {}
    let aviso: string | null = null
    /** Qué quedó escrito en las tablas de siempre (para el toast del frontend). */
    let escrito: 'hallazgo' | 'checklist' | 'nota' | 'memoria' | null = null
    let memoria: MemoriaIvaEmpresa | null = null

    if (decision === 'omitir') { set = { estado: 'omitida' }; texto = `${nombre} omitió la propuesta por ahora${motivo ? `: ${motivo}` : ''}.` }
    if (decision === 'retomar') { set = { estado: 'propuesta' }; texto = `${nombre} retomó la propuesta.` }
    if (decision === 'descartar') { set = { estado: 'descartada', motivoDecision: motivo ?? null }; texto = `${nombre} descartó la propuesta${motivo ? `: ${motivo}` : ''}.` }
    if (decision === 'ajustar') {
      const nuevo = { ...(p.contenido as Record<string, unknown>) }
      if (ajustes?.descripcion) nuevo.descripcion = ajustes.descripcion
      set = { estado: 'ajustada', motivoDecision: motivo ?? null, titulo: ajustes?.titulo ?? p.titulo, severidad: ajustes?.severidad ?? p.severidad, contenido: nuevo }
      const cambios = [ajustes?.titulo ? 'título' : null, ajustes?.descripcion ? 'descripción' : null, ajustes?.severidad ? `severidad → ${ajustes.severidad}` : null].filter(Boolean).join(', ')
      texto = `${nombre} aprobó con ajustes (${cambios || 'sin cambios de texto'})${motivo ? `: ${motivo}` : ''}.`
    }
    if (decision === 'aprobar') { set = { estado: 'aprobada', motivoDecision: motivo ?? null }; texto = `${nombre} aprobó la propuesta${motivo ? `: ${motivo}` : ''}.` }

    const aprueba = decision === 'aprobar' || decision === 'ajustar'

    // Hallazgo: aprobar (o ajustar) lo escribe en los hallazgos de la revisión, ligado a la propuesta.
    if (p.tipo === 'hallazgo' && aprueba) {
      const [h] = await db.insert(hallazgosTributarios).values({
        revisionId: row.revision.id,
        descripcion: ajustes?.descripcion?.trim() || contenido.descripcion || p.titulo,
        recomendacion: contenido.recomendacion ?? null,
        monto: p.monto,
        severidad: ajustes?.severidad ?? p.severidad ?? 'media',
        creadoPor: user.sub,
      }).returning()
      set.entidadDestino = 'hallazgo_tributario'; set.entidadDestinoId = h.id
      escrito = 'hallazgo'
      texto += ` Hallazgo ${p.codigo ?? ''} escrito en la revisión.`.replace('  ', ' ')
      registrarEvento(user, {
        accion: 'tributario.hallazgo.crear', entidad: 'hallazgo_tributario', entidadId: h.id, empresaId: row.obligacion.empresaId, actor: 'agente',
        detalle: { obligacion: nombreObligacion(row.obligacion), periodo: row.revision.periodo, severidad: h.severidad, origen: 'agente', propuestaId: p.id, codigo: p.codigo },
      })
    }

    // Juicio con punto del checklist: aprobar lo marca verificado con la nota del agente;
    // ajustar guarda la nota del auditor pero deja el punto abierto (él decide cuándo cerrarlo).
    if (p.tipo === 'juicio' && trib?.checklistItem && aprueba) {
      const nota = decision === 'ajustar'
        ? (ajustes?.descripcion?.trim() || motivo?.trim() || trib.nota || `Revisado con el agente: ${p.titulo}`)
        : (trib.nota ?? `Verificado por el agente: ${p.titulo}`)
      const parche = decision === 'aprobar' ? { hecho: true, nota } : { nota }
      await db.update(revisionesTributarias)
        .set({ checklistEstado: mergeJsonbPatch(revisionesTributarias.checklistEstado, { [trib.checklistItem]: parche }) })
        .where(eq(revisionesTributarias.id, row.revision.id))
      set.entidadDestino = 'checklist'
      escrito = decision === 'aprobar' ? 'checklist' : 'nota'
      texto += decision === 'aprobar' ? ' Punto del programa marcado como verificado.' : ' Nota guardada en el punto del programa; sigue abierto.'
      if (decision === 'ajustar') aviso = 'El punto del programa sigue abierto con tu nota; márcalo cuando termines de revisarlo.'
      registrarEvento(user, {
        accion: 'tributario.revision.editar', entidad: 'revision_tributaria', entidadId: row.revision.id, empresaId: row.obligacion.empresaId, actor: 'agente',
        detalle: { obligacion: nombreObligacion(row.obligacion), periodo: row.revision.periodo, campos: ['checklistEstado'], item: trib.checklistItem, origen: 'agente', propuestaId: p.id },
      })
    }

    // Ambigüedad de clasificación: la opción elegida se guarda en la memoria de la empresa y
    // desde la próxima lectura la subcuenta se mapea sola.
    if (p.tipo === 'ambiguedad' && trib?.cuentaAuxiliar && aprueba) {
      const opciones = contenido.opciones ?? []
      const elegida = ajustes?.opcion
        ? opciones.find((o) => o.clave === ajustes.opcion)
        : decision === 'ajustar' && motivo ? opciones.find((o) => o.label === motivo) ?? opciones[0] : opciones[0]
      if (!elegida) return c.json({ error: { code: 'PROPUESTA_INVALIDA', message: 'La propuesta no trae opciones de clasificación' } }, 409)
      // La ambigüedad dice en qué mapa de la memoria va (IVA → mapeo2408; retención en la fuente → mapeo2365; reteICA → mapeo2368; ICA → mapeoIca).
      memoria = trib.memoriaClave === 'mapeo2365'
        ? await guardarMemoriaIva(row.obligacion.empresaId, { mapeo2365: { [trib.cuentaAuxiliar]: elegida.clave } }, user.sub)
        : trib.memoriaClave === 'mapeo2368'
        ? await guardarMemoriaIva(row.obligacion.empresaId, { mapeo2368: { [trib.cuentaAuxiliar]: elegida.clave } }, user.sub)
        : trib.memoriaClave === 'mapeoIca'
        ? await guardarMemoriaIva(row.obligacion.empresaId, { mapeoIca: { [trib.cuentaAuxiliar]: elegida.clave } }, user.sub)
        : await guardarMemoriaIva(row.obligacion.empresaId, { mapeo2408: { [trib.cuentaAuxiliar]: elegida.clave as MemoriaIvaEmpresa['mapeo2408'][string] } }, user.sub)
      set.entidadDestino = 'memoria_empresa'
      set.contenido = { ...(set.contenido ?? (p.contenido as Record<string, unknown>)), opcionElegida: elegida.clave }
      escrito = 'memoria'
      texto += trib.cuentaAuxiliar.startsWith('obligacion:')
        ? ` Municipio de la declaración → "${elegida.label}" guardado en la memoria de la empresa.`
        : ` Subcuenta ${trib.cuentaAuxiliar} → "${elegida.label}" guardada en la memoria de la empresa.`
      aviso = 'Guardado en la memoria de la empresa. Vuelve a analizar para que "Según libros" use la clasificación nueva.'
      registrarEvento(user, {
        accion: 'tributario.agente.memoria.guardar', entidad: 'empresa', entidadId: row.obligacion.empresaId, empresaId: row.obligacion.empresaId,
        detalle: { cuenta: trib.cuentaAuxiliar, destino: elegida.clave, propuestaId: p.id, codigo: p.codigo },
      })
    }

    const [actualizada] = await db.update(propuestasAgente)
      .set({ ...set, decididaPor: decision === 'retomar' ? null : user.sub, decididaAt: decision === 'retomar' ? null : new Date() })
      .where(eq(propuestasAgente.id, p.id)).returning()

    const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${bitacoraAgente.numero}),0)::int` }).from(bitacoraAgente).where(eq(bitacoraAgente.propuestaId, p.id))
    await db.insert(bitacoraAgente).values({
      revisionTributariaId: row.revision.id, propuestaId: p.id, corridaId: p.corridaId, numero: Number(max) + 1,
      tipo: 'humano', texto, referencia: { decision }, actor: 'usuario', usuarioId: user.sub,
    })

    registrarEvento(user, {
      accion: `tributario.propuesta.${decision}`, entidad: 'propuesta_agente', entidadId: p.id, empresaId: row.obligacion.empresaId,
      detalle: { revisionId: row.revision.id, tipo: p.tipo, codigo: p.codigo, motivo: motivo ?? null },
    })

    const rows = await db.select({ b: bitacoraAgente, usuarioNombre: usuarios.nombre }).from(bitacoraAgente)
      .leftJoin(usuarios, eq(bitacoraAgente.usuarioId, usuarios.id))
      .where(eq(bitacoraAgente.propuestaId, p.id)).orderBy(bitacoraAgente.numero)
    const bit = rows.map(({ b, usuarioNombre }) => ({ numero: b.numero, tipo: b.tipo, texto: b.texto, referencia: b.referencia, actor: b.actor, usuarioNombre, createdAt: b.createdAt.toISOString() }))
    // Todo dentro de `data`: el cliente del frontend solo devuelve ese campo.
    return c.json({ data: { propuesta: aPropuestaTributaria(actualizada, bit), aviso, escrito, memoria } })
  },
)

// PUT /tributario/revisiones/:id/agente/cedulas/:cid/conclusion
// La conclusión es del auditor: el agente solo sugiere el texto. Queda atada a la
// huella de la cédula, de modo que un análisis nuevo que cambie el contenido obliga
// a reconfirmarla. Cuando todas las cédulas de un punto del checklist quedan
// concluidas, el punto se marca con esas conclusiones como nota.
app.put(
  '/tributario/revisiones/:id/agente/cedulas/:cid/conclusion',
  zValidator('json', z.object({
    texto: z.string().trim().min(10, 'Escribe la conclusión (mínimo 10 caracteres)').max(4000),
    resultado: z.enum(RESULTADOS_CONCLUSION_CEDULA),
  })),
  async (c) => {
    const user = c.get('user')
    const { texto, resultado } = c.req.valid('json')
    const row = await cargarRevision(c.req.param('id'), user.firmaId)
    if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Revisión no encontrada' } }, 404)
    if (row.revision.estado === 'revisada') return c.json({ error: ERROR_REVISION_SELLADA }, 409)

    const estado = await estadoAgenteIva(row.revision.id, row.obligacion.empresaId)
    const cedulas = estado.corrida?.resultado?.cedulas ?? []
    const cedula = cedulas.find((x) => x.id === c.req.param('cid'))
    if (!estado.corrida || !cedula) return c.json({ error: { code: 'NOT_FOUND', message: 'La cédula no existe en el último análisis' } }, 404)
    if (cedula.estado === 'omitida') return c.json({ error: { code: 'CEDULA_OMITIDA', message: 'Ese procedimiento está desactivado en el programa' } }, 409)

    // No se concluye "satisfactorio" con propuestas de la cédula aún sin decidir.
    const abiertas = estado.propuestas.filter((p) => p.contenido.tributario?.cedula === cedula.id && (p.estado === 'propuesta' || p.estado === 'omitida'))
    if (resultado === 'satisfactorio' && abiertas.length > 0) {
      return c.json({ error: { code: 'PROPUESTAS_ABIERTAS', message: `Esta cédula tiene ${abiertas.length} propuesta(s) sin decidir (${abiertas.map((p) => p.codigo).join(', ')}): decídelas o concluye "con excepciones"` } }, 409)
    }

    const [usuario] = await db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, user.sub))
    const conclusion: ConclusionCedula = {
      texto, resultado, huella: cedula.huella, corridaId: estado.corrida.id, porId: user.sub, porNombre: usuario?.nombre ?? null, at: new Date().toISOString(),
    }
    const conclusiones: ConclusionesCedulas = { ...estado.conclusiones, [cedula.id]: conclusion }

    // Punto del checklist: hecho cuando todas las cédulas ejecutadas que lo alimentan están concluidas y ninguna es "no concluyente".
    let checklist: Record<string, { hecho: boolean; nota: string }> | null = null
    if (cedula.checklistItem) {
      const delPunto = cedulas.filter((x) => x.checklistItem === cedula.checklistItem && x.estado === 'ejecutada')
      const vigentes = delPunto.filter((x) => estadoConclusionCedula(x, conclusiones) === 'vigente')
      if (delPunto.length > 0 && vigentes.length === delPunto.length) {
        const nota = vigentes.map((x) => `${x.titulo}: ${conclusiones[x.id].texto}`).join('\n').slice(0, 1900)
        checklist = { [cedula.checklistItem]: { hecho: vigentes.every((x) => conclusiones[x.id].resultado !== 'no_concluyente'), nota } }
      }
    }

    await db.update(revisionesTributarias)
      .set({
        conclusionesCedulas: mergeJsonbPatch(revisionesTributarias.conclusionesCedulas, { [cedula.id]: conclusion }),
        ...(checklist ? { checklistEstado: mergeJsonbPatch(revisionesTributarias.checklistEstado, checklist) } : {}),
      })
      .where(eq(revisionesTributarias.id, row.revision.id))

    await db.insert(bitacoraAgente).values({
      revisionTributariaId: row.revision.id, corridaId: estado.corrida.id, numero: (estado.corrida.bitacora.at(-1)?.numero ?? 0) + 1,
      tipo: 'humano', texto: `${conclusion.porNombre ?? 'Usuario'} concluyó la cédula "${cedula.titulo}" (${resultado.replace('_', ' ')}): ${texto}`,
      referencia: { cedula: cedula.id, resultado }, actor: 'usuario', usuarioId: user.sub,
    })
    registrarEvento(user, {
      accion: 'tributario.cedula.concluir', entidad: 'revision_tributaria', entidadId: row.revision.id, empresaId: row.obligacion.empresaId,
      detalle: { obligacion: nombreObligacion(row.obligacion), periodo: row.revision.periodo, cedula: cedula.id, resultado, huella: cedula.huella, corridaId: estado.corrida.id, checklist: checklist ? Object.keys(checklist) : [] },
    })
    return c.json({ data: { conclusiones, checklist } })
  },
)

export default app
