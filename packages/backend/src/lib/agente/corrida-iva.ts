/**
 * Corrida del agente de IVA sobre una revisión tributaria (docs/agente/
 * procedimiento-iva-v1.md, etapa 2). El navegador lee los archivos y manda los
 * resúmenes; aquí se completa la entrada con lo que ya está en la base (cifras
 * declaradas, revisión anterior, programa, decisiones previas), se corre el motor
 * puro de @auditorya/types (0 tokens) y se persisten corrida + propuestas +
 * bitácora en las tablas del agente con `revision_tributaria_id`. Las propuestas
 * aún abiertas de corridas anteriores quedan descartadas ("reemplazada"); lo ya
 * decidido no se vuelve a proponer.
 */
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  bitacoraAgente, corridasAgente, memoriaEmpresaAgente, obligacionesTributarias, propuestasAgente, revisionesTributarias, usuarios,
} from '../../db/schema'
import {
  MEMORIA_IVA_CLAVE, MEMORIA_IVA_VACIA, correrRevisionIca, correrRevisionIva, correrRevisionReteica, correrRevisionRetefuente, esTipoAgentico, mapeoMemoriaDe, municipioDeTexto, normalizarMunicipio, etiquetaPeriodo, huellaDeclarado, huellaPropuesta, periodoAnterior, rangoPeriodo, reglasOmitidasDe,
  type CorridaAgente, type EntradaCorridaIvaCliente, type EstadoAgenteIva, type LineaBitacora, type MapeoLibrosIca, type MapeoLibrosIva, type MapeoLibrosReteica, type MapeoLibrosRetefuente, type MemoriaIvaEmpresa, type PropuestaAgente,
  type PropuestaBorrador, type ResultadoPersistidoIva, type ResumenAgenteRevision, type TipoAgentico,
} from '@auditorya/types'
import { mergeJsonbPatch } from '../jsonb'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

/** El procedimiento de la corrida es el tipo de impuesto ('iva', 'retefuente', 'reteica', 'ica'). */
export const PROCEDIMIENTO_IVA = 'iva'

type Revision = typeof revisionesTributarias.$inferSelect
type Obligacion = typeof obligacionesTributarias.$inferSelect

// ─── Memoria de la empresa ───────────────────────────────────────────────────
// Lo que la firma decidió una vez para esta empresa (clasificación de subcuentas
// de 2408, tipo de comprobante del cierre) y el agente aplica solo la próxima vez.

export async function cargarMemoriaIva(empresaId: string): Promise<MemoriaIvaEmpresa> {
  const [row] = await db.select().from(memoriaEmpresaAgente)
    .where(and(eq(memoriaEmpresaAgente.empresaId, empresaId), eq(memoriaEmpresaAgente.clave, MEMORIA_IVA_CLAVE)))
  if (!row) return { ...MEMORIA_IVA_VACIA, mapeo2408: {}, tiposDocCierre: [] }
  const v = row.valor as Partial<MemoriaIvaEmpresa>
  return { mapeo2408: v.mapeo2408 ?? {}, mapeo2365: v.mapeo2365 ?? {}, mapeo2368: v.mapeo2368 ?? {}, mapeoIca: v.mapeoIca ?? {}, tiposDocCierre: v.tiposDocCierre ?? [], actualizadoAt: row.updatedAt.toISOString() }
}

/** Funde un parche en la memoria (mapeo por cuenta, tipos de cierre en unión) y la guarda. */
export async function guardarMemoriaIva(
  empresaId: string,
  parche: { mapeo2408?: MemoriaIvaEmpresa['mapeo2408']; mapeo2365?: Record<string, string>; mapeo2368?: Record<string, string>; mapeoIca?: Record<string, string>; tiposDocCierre?: string[]; olvidarCuenta?: string },
  userId: string,
): Promise<MemoriaIvaEmpresa> {
  const actual = await cargarMemoriaIva(empresaId)
  const mapeo2408 = { ...actual.mapeo2408, ...(parche.mapeo2408 ?? {}) }
  const mapeo2365 = { ...(actual.mapeo2365 ?? {}), ...(parche.mapeo2365 ?? {}) }
  const mapeo2368 = { ...(actual.mapeo2368 ?? {}), ...(parche.mapeo2368 ?? {}) }
  const mapeoIca = { ...(actual.mapeoIca ?? {}), ...(parche.mapeoIca ?? {}) }
  if (parche.olvidarCuenta) { delete mapeo2408[parche.olvidarCuenta]; delete mapeo2365[parche.olvidarCuenta]; delete mapeo2368[parche.olvidarCuenta]; delete mapeoIca[parche.olvidarCuenta] }
  const tiposDocCierre = [...new Set([...actual.tiposDocCierre, ...(parche.tiposDocCierre ?? []).map((t) => t.toUpperCase())])]
  const valor = { mapeo2408, mapeo2365, mapeo2368, mapeoIca, tiposDocCierre }
  await db.insert(memoriaEmpresaAgente)
    .values({ empresaId, clave: MEMORIA_IVA_CLAVE, valor, actualizadoPor: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [memoriaEmpresaAgente.empresaId, memoriaEmpresaAgente.clave], set: { valor, actualizadoPor: userId, updatedAt: new Date() } })
  return { ...valor, actualizadoAt: new Date().toISOString() }
}

export async function olvidarMemoriaIva(empresaId: string): Promise<void> {
  await db.delete(memoriaEmpresaAgente).where(and(eq(memoriaEmpresaAgente.empresaId, empresaId), eq(memoriaEmpresaAgente.clave, MEMORIA_IVA_CLAVE)))
}

export async function correrProcedimientoIva(
  ctx: { revision: Revision; obligacion: Obligacion; empresa: { nombre: string; nit: string | null } },
  user: Pick<JwtPayload, 'sub' | 'firmaId'>,
  entrada: EntradaCorridaIvaCliente,
): Promise<EstadoAgenteIva> {
  const { revision, obligacion } = ctx
  if (!esTipoAgentico(obligacion.tipo)) throw new Error(`El agente no tiene procedimiento para ${obligacion.tipo}`)
  const tipo: TipoAgentico = obligacion.tipo
  const rango = rangoPeriodo(obligacion.periodicidad, revision.periodo, obligacion.anioFiscal)
  if (!rango) throw new Error('No se pudo resolver el rango de fechas del período')
  const etiqueta = `${etiquetaPeriodo(obligacion.periodicidad, revision.periodo)} ${obligacion.anioFiscal}`

  // Revisión del período anterior (misma obligación) para el arrastre del saldo a favor.
  const claveAnterior = periodoAnterior(obligacion.periodicidad, revision.periodo)
  const [anteriorRow] = claveAnterior
    ? await db.select({ cifras: revisionesTributarias.cifras }).from(revisionesTributarias)
        .where(and(eq(revisionesTributarias.obligacionId, obligacion.id), eq(revisionesTributarias.periodo, claveAnterior)))
    : []
  const anterior = anteriorRow ? { etiqueta: `${etiquetaPeriodo(obligacion.periodicidad, claveAnterior!)} ${obligacion.anioFiscal}`, cifras: anteriorRow.cifras } : null

  // Continuidad: los códigos no se repiten y lo decidido por una persona no se vuelve a proponer
  // (omitir no es decidir: vuelve a salir en la corrida siguiente).
  const previas = await db
    .select({ tipo: propuestasAgente.tipo, reglas: propuestasAgente.reglas, cuentaCodigo: propuestasAgente.cuentaCodigo, codigo: propuestasAgente.codigo, decididaPor: propuestasAgente.decididaPor, estado: propuestasAgente.estado })
    .from(propuestasAgente)
    .where(eq(propuestasAgente.revisionTributariaId, revision.id))
  const numeracion = { H: 0, J: 0, A: 0, D: 0 }
  for (const p of previas) {
    const m = /^([HJAD])-(\d+)$/.exec(p.codigo ?? '')
    if (m) numeracion[m[1] as keyof typeof numeracion] = Math.max(numeracion[m[1] as keyof typeof numeracion], Number(m[2]))
  }
  const huellasDecididas = previas.filter((p) => p.decididaPor && p.estado !== 'omitida').map((p) => huellaPropuesta({ tipo: p.tipo, reglas: p.reglas, cuentaCodigo: p.cuentaCodigo }))

  const [corrida] = await db
    .insert(corridasAgente)
    .values({ revisionTributariaId: revision.id, procedimiento: tipo, estado: 'corriendo', intentos: 1, iniciadaPor: user.sub, iniciadaAt: new Date() })
    .returning()

  try {
    const comunes = {
      cifras: revision.cifras, anterior, omitirReglas: reglasOmitidasDe(tipo, revision.programa ?? null), numeracion, huellasDecididas,
      fuentes: entrada.insumos.auxiliares.map((a) => ({ nombre: a.nombre, archivo: a.archivo, registros: a.enPeriodo, cuentas: a.cuentas.length })),
      fechaVencimiento: revision.fechaVencimiento,
      fechaPresentacion: revision.fechaPresentacion,
    }
    // ReteICA e ICA: municipios con obligación del mismo impuesto en la vigencia (territorialidad).
    const municipiosConObligacion = tipo === 'reteica' || tipo === 'ica'
      ? (await db.select({ nombre: obligacionesTributarias.nombre, municipio: obligacionesTributarias.municipio }).from(obligacionesTributarias)
          .where(and(eq(obligacionesTributarias.empresaId, obligacion.empresaId), eq(obligacionesTributarias.anioFiscal, obligacion.anioFiscal), eq(obligacionesTributarias.tipo, tipo))))
          .map((o) => normalizarMunicipio(o.municipio) ?? municipioDeTexto(o.nombre)?.clave ?? null)
          .filter((m): m is string => !!m)
      : []
    const memoriaAntes = tipo === 'reteica' ? await cargarMemoriaIva(obligacion.empresaId) : null
    for (const [k, v] of Object.entries(memoriaAntes?.mapeo2368 ?? {})) if (k.startsWith('obligacion:') && v !== 'ignorar') municipiosConObligacion.push(v)
    const resultado = tipo === 'ica'
      ? correrRevisionIca({
          ...comunes,
          periodo: { ...rango, etiqueta, periodicidad: obligacion.periodicidad, anio: obligacion.anioFiscal },
          libros: entrada.libros as MapeoLibrosIca | null,
          municipio: normalizarMunicipio(obligacion.municipio) ?? municipioDeTexto(obligacion.nombre)?.clave ?? null,
          municipiosConObligacion: [...new Set(municipiosConObligacion)],
        })
      : tipo === 'reteica'
      ? correrRevisionReteica({
          ...comunes,
          periodo: { ...rango, etiqueta, periodicidad: obligacion.periodicidad, anio: obligacion.anioFiscal },
          libros: entrada.libros as MapeoLibrosReteica | null,
          obligacionId: obligacion.id,
          municipiosConObligacion: [...new Set(municipiosConObligacion)],
        })
      : tipo === 'iva'
      ? correrRevisionIva({
          ...comunes,
          periodo: { ...rango, etiqueta, periodicidad: obligacion.periodicidad },
          libros: entrada.libros as MapeoLibrosIva | null,
          dian: entrada.dian ? { ...entrada.dian, nitEmpresa: ctx.empresa.nit } : null,
        })
      : correrRevisionRetefuente({
          ...comunes,
          periodo: { ...rango, etiqueta, periodicidad: obligacion.periodicidad, anio: obligacion.anioFiscal },
          libros: entrada.libros as MapeoLibrosRetefuente | null,
        })

    // El agente aprende solo el tipo de comprobante del cierre; la clasificación de subcuentas la decide una persona.
    let memoria = await cargarMemoriaIva(obligacion.empresaId)
    const cierresNuevos = (entrada.tiposDocCierre ?? []).map((t) => t.toUpperCase()).filter((t) => !memoria.tiposDocCierre.includes(t))
    if (cierresNuevos.length) memoria = await guardarMemoriaIva(obligacion.empresaId, { tiposDocCierre: cierresNuevos }, user.sub)

    const persistido: ResultadoPersistidoIva = {
      ...resultado.resumen,
      insumos: { ...entrada.insumos, anterior: anterior?.etiqueta ?? null },
      declaradoHuella: huellaDeclarado(revision.cifras),
      memoriaMapeo: mapeoMemoriaDe(tipo, memoria),
      propuestas: resultado.propuestas.length,
      ...(resultado.cedulas ? { cedulas: resultado.cedulas } : {}),
    }

    await db.transaction(async (tx) => {
      // Reemplaza las propuestas aún abiertas de corridas anteriores de esta revisión.
      const anteriores = await tx.select({ id: corridasAgente.id }).from(corridasAgente)
        .where(and(eq(corridasAgente.revisionTributariaId, revision.id), eq(corridasAgente.procedimiento, tipo)))
      const ids = anteriores.map((c) => c.id).filter((id) => id !== corrida.id)
      if (ids.length) {
        await tx.update(propuestasAgente)
          .set({ estado: 'descartada', motivoDecision: 'Reemplazada por un análisis nuevo', decididaAt: new Date() })
          .where(and(inArray(propuestasAgente.corridaId, ids), inArray(propuestasAgente.estado, ['propuesta', 'omitida'])))
      }

      // Bitácora de la corrida: primero la lectura hecha en el navegador, luego la del motor.
      let n = 0
      for (const texto of entrada.lecturas) {
        n++
        await tx.insert(bitacoraAgente).values({ revisionTributariaId: revision.id, corridaId: corrida.id, numero: n, tipo: 'lectura', texto, referencia: { paso: 'P-02' }, actor: 'agente' })
      }
      if (cierresNuevos.length) {
        n++
        await tx.insert(bitacoraAgente).values({ revisionTributariaId: revision.id, corridaId: corrida.id, numero: n, tipo: 'clasificacion', texto: `Aprendí que el cierre del IVA de esta empresa usa el comprobante ${cierresNuevos.join(', ')}: la próxima vez lo excluyo directo.`, referencia: { paso: 'P-02' }, actor: 'agente' })
      }
      for (const l of resultado.bitacora) {
        n++
        await tx.insert(bitacoraAgente).values({ revisionTributariaId: revision.id, corridaId: corrida.id, numero: n, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
      }

      const idPorClave = new Map<string, string>()
      const insertar = async (p: PropuestaBorrador) => {
        const [row] = await tx.insert(propuestasAgente).values({
          revisionTributariaId: revision.id, corridaId: corrida.id, paso: p.paso, tipo: p.tipo, codigo: p.codigo, titulo: p.titulo,
          cuentaCodigo: p.cuentaCodigo, monto: p.monto != null ? p.monto.toFixed(2) : null,
          severidad: p.severidad, certeza: p.certeza, reglas: p.reglas, datos: p.datos, contenido: p.contenido as Record<string, unknown>,
          desbloqueaId: p.desbloqueaClave ? idPorClave.get(p.desbloqueaClave) ?? null : null, orden: p.orden,
        }).returning({ id: propuestasAgente.id })
        idPorClave.set(p.clave, row.id)
        let k = 0
        for (const l of p.bitacora) {
          k++
          await tx.insert(bitacoraAgente).values({ revisionTributariaId: revision.id, propuestaId: row.id, corridaId: corrida.id, numero: k, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
        }
      }
      for (const p of resultado.propuestas.filter((x) => !x.desbloqueaClave)) await insertar(p)
      for (const p of resultado.propuestas.filter((x) => x.desbloqueaClave)) await insertar(p)

      // "Según libros" recién mapeado queda en la revisión en la misma transacción,
      // y analizar una revisión pendiente la pasa a "en revisión".
      const librosPatch = Object.fromEntries(Object.entries(resultado.cifrasLibros).map(([id, v]) => [id, { libros: v.libros }]))
      const cambiosRevision = {
        ...(Object.keys(librosPatch).length ? { cifras: mergeJsonbPatch(revisionesTributarias.cifras, librosPatch) } : {}),
        ...(revision.estado === 'pendiente' ? { estado: 'en_revision' as const } : {}),
      }
      if (Object.keys(cambiosRevision).length) {
        await tx.update(revisionesTributarias).set(cambiosRevision).where(eq(revisionesTributarias.id, revision.id))
      }

      await tx.update(corridasAgente).set({
        estado: 'completada', terminadaAt: new Date(),
        archivoNombre: [...entrada.insumos.auxiliares.map((a) => a.nombre), entrada.insumos.dian?.archivo].filter(Boolean).join(' · ') || null,
        filas: entrada.insumos.auxiliares.reduce((s, a) => s + a.enPeriodo, 0) + (entrada.insumos.dian?.documentos ?? 0),
        parametros: {
          periodo: revision.periodo, etiqueta, desde: rango.desde, hasta: rango.hasta,
          reglasOmitidas: reglasOmitidasDe(tipo, revision.programa ?? null),
          pasosActivos: (revision.programa?.pasos ?? []).filter((x) => x.activo).map((x) => x.id),
          nitEmpresa: ctx.empresa.nit, nitReporte: entrada.dian?.nitReporte ?? null,
        },
        resultado: persistido,
      }).where(eq(corridasAgente.id, corrida.id))
    })

    registrarEvento(user, {
      accion: 'tributario.agente.corrida', entidad: 'corrida_agente', entidadId: corrida.id, empresaId: obligacion.empresaId, actor: 'agente',
      detalle: { revisionId: revision.id, procedimiento: tipo, periodo: revision.periodo, propuestas: resultado.propuestas.length, reglas: resultado.resumen.reglasEjecutadas.length, limitaciones: resultado.resumen.limitaciones.length },
    })
    return estadoAgenteIva(revision.id, obligacion.empresaId)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    await db.update(corridasAgente).set({ estado: 'error', error: mensaje.slice(0, 500), terminadaAt: new Date() }).where(eq(corridasAgente.id, corrida.id))
    console.error('[agente] corrida de IVA falló', revision.id, mensaje)
    throw err
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

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

export function aPropuestaTributaria(row: typeof propuestasAgente.$inferSelect, bitacora: LineaBitacora[]): PropuestaAgente {
  return {
    id: row.id, auditoriaId: row.auditoriaId, revisionTributariaId: row.revisionTributariaId, corridaId: row.corridaId, paso: row.paso, tipo: row.tipo,
    codigo: row.codigo, titulo: row.titulo, cuentaCodigo: row.cuentaCodigo, monto: row.monto == null ? null : Number(row.monto), severidad: row.severidad,
    certeza: row.certeza, reglas: row.reglas, datos: row.datos, contenido: row.contenido as PropuestaAgente['contenido'], estado: row.estado,
    desbloqueaId: row.desbloqueaId, entidadDestino: row.entidadDestino, entidadDestinoId: row.entidadDestinoId, decididaPor: row.decididaPor,
    decididaAt: row.decididaAt?.toISOString() ?? null, motivoDecision: row.motivoDecision, orden: row.orden, createdAt: row.createdAt.toISOString(), bitacora,
  }
}

async function ultimaCorridaIva(revisionId: string) {
  const [c] = await db.select().from(corridasAgente)
    .where(and(eq(corridasAgente.revisionTributariaId, revisionId), eq(corridasAgente.estado, 'completada')))
    .orderBy(desc(corridasAgente.createdAt)).limit(1)
  return c ?? null
}

/** Última corrida completada con su bitácora y todas sus propuestas (decididas incluidas). */
export async function estadoAgenteIva(revisionId: string, empresaId: string): Promise<EstadoAgenteIva> {
  const [c, memoria, [rev]] = await Promise.all([
    ultimaCorridaIva(revisionId), cargarMemoriaIva(empresaId),
    db.select({ conclusiones: revisionesTributarias.conclusionesCedulas }).from(revisionesTributarias).where(eq(revisionesTributarias.id, revisionId)),
  ])
  const conclusiones = rev?.conclusiones ?? {}
  if (!c) return { corrida: null, propuestas: [], memoria, conclusiones }
  const rows = await db.select().from(propuestasAgente).where(eq(propuestasAgente.corridaId, c.id)).orderBy(asc(propuestasAgente.orden), asc(propuestasAgente.createdAt))
  const [bitCorrida, bitProp] = await Promise.all([bitacoraDe({ corridaId: c.id }), bitacoraDe({ propuestaIds: rows.map((r) => r.id) })])
  const corrida: CorridaAgente & { resultado: ResultadoPersistidoIva | null } = {
    id: c.id, procedimiento: c.procedimiento, estado: c.estado, archivoNombre: c.archivoNombre, filas: c.filas, filasHoja: c.filasHoja, filasResumen: c.filasResumen,
    parametros: c.parametros, resultado: (c.resultado as ResultadoPersistidoIva | null) ?? null, error: c.error,
    iniciadaAt: c.iniciadaAt?.toISOString() ?? null, terminadaAt: c.terminadaAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), bitacora: bitCorrida.get(c.id) ?? [],
  }
  return { corrida, propuestas: rows.map((r) => aPropuestaTributaria(r, bitProp.get(r.id) ?? [])), memoria, conclusiones }
}

/** Resumen liviano para el detalle de la revisión y el snapshot de la firma (constancia). */
export async function resumenAgenteRevision(revisionId: string, empresaId: string, nombres: Map<string, string>): Promise<ResumenAgenteRevision | null> {
  const estado = await estadoAgenteIva(revisionId, empresaId)
  if (!estado.corrida) return null
  const c = estado.corrida
  const r = c.resultado
  const [ini] = await db.select({ iniciadaPor: corridasAgente.iniciadaPor }).from(corridasAgente).where(eq(corridasAgente.id, c.id))
  return {
    corridaId: c.id,
    terminadaAt: c.terminadaAt,
    iniciadaNombre: (ini?.iniciadaPor && nombres.get(ini.iniciadaPor)) ?? null,
    reglasEjecutadas: r?.reglasEjecutadas ?? [],
    limitaciones: r?.limitaciones ?? [],
    verificados: r?.verificados ?? [],
    insumos: r?.insumos ?? { auxiliares: [], dian: null, anterior: null },
    bitacora: c.bitacora.map((l) => l.texto),
    cedulas: r?.cedulas ?? [],
    conclusiones: estado.conclusiones,
    propuestas: estado.propuestas.map((p) => ({
      id: p.id, codigo: p.codigo, tipo: p.tipo, titulo: p.titulo, monto: p.monto, severidad: p.severidad, certeza: p.certeza, reglas: p.reglas, estado: p.estado,
      decididaNombre: (p.decididaPor && nombres.get(p.decididaPor)) ?? null, decididaAt: p.decididaAt, motivoDecision: p.motivoDecision,
      entidadDestino: p.entidadDestino, entidadDestinoId: p.entidadDestinoId,
    })),
  }
}

/** Borra el rastro del agente de varias revisiones (al eliminar una obligación sin firmas). */
export async function borrarAgenteDeRevisiones(tx: Pick<typeof db, 'delete'>, revisionIds: string[]) {
  if (!revisionIds.length) return
  await tx.delete(bitacoraAgente).where(inArray(bitacoraAgente.revisionTributariaId, revisionIds))
  await tx.delete(propuestasAgente).where(inArray(propuestasAgente.revisionTributariaId, revisionIds))
  await tx.delete(corridasAgente).where(inArray(corridasAgente.revisionTributariaId, revisionIds))
}
