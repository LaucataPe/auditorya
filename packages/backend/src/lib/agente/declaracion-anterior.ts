/**
 * Declaración presentada del período anterior, insumo de las comparaciones del
 * agente (arrastre del saldo a favor, variación mes a mes).
 *
 * La fuente es SOLO el PDF de la declaración presentada que se sube al período
 * anterior después de firmarlo (soporte tipo "declaración" que no está en el
 * snapshot): las cifras "Declarado" de esa revisión vienen del borrador y pueden
 * diferir de lo que de verdad se presentó. Si el PDF no está, no se compara nada
 * y se avisa; nunca bloquea el análisis ni la firma.
 */
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { adjuntosTributarios, memoriaEmpresaAgente, obligacionesTributarias, revisionesTributarias } from '../../db/schema'
import {
  elegirDeclaracionPresentada, esImpuestoMunicipal, etiquetaPeriodo, mismoMunicipio, nombreObligacion, periodoAnteriorCruzando,
  type AnteriorPresentada, type CifrasRevision, type Periodicidad,
} from '@auditorya/types'
import { storage } from '../storage'
import { iaDisponible } from '../llm'
import { lecturaCasillasDisponible } from '../lectura-dian'
import { leerDeclaracion } from '../lectura-declaracion'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

type Revision = typeof revisionesTributarias.$inferSelect
type Obligacion = typeof obligacionesTributarias.$inferSelect
type Adjunto = typeof adjuntosTributarios.$inferSelect

const MAX_BYTES = 10 * 1024 * 1024 // el archivo viaja en base64 al workflow o al LLM

const LEGIBLES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

/**
 * Localiza (sin leer) la declaración presentada del período anterior de esta revisión.
 * Primero la que se subió directamente aquí (tipo declaracion_anterior); si no, la que
 * se adjuntó al período anterior después de firmarlo.
 */
export async function buscarAnteriorPresentada(
  obligacion: Obligacion,
  revision: Pick<Revision, 'id' | 'periodo'>,
): Promise<{ resumen: AnteriorPresentada; contexto: { obligacionAnterior: Obligacion; adjunto: Adjunto; etiqueta: string } | null }> {
  const { periodo, anio } = periodoAnteriorCruzando(obligacion.periodicidad as Periodicidad, revision.periodo)
  const anioFiscal = obligacion.anioFiscal + anio
  const etiqueta = `${etiquetaPeriodo(obligacion.periodicidad, periodo)} ${anioFiscal}`
  const noEncontrada = (motivo: string, revisionId: string | null = null): { resumen: AnteriorPresentada; contexto: null } => ({
    resumen: { estado: 'no_encontrada', etiqueta, revisionId, motivo },
    contexto: null,
  })

  // Subida directa a esta revisión: gana sobre lo que haya en el período anterior (es lo más explícito)
  // y sirve aunque ese período no exista en la plataforma.
  const propios = await db.select().from(adjuntosTributarios)
    .where(and(eq(adjuntosTributarios.revisionId, revision.id), eq(adjuntosTributarios.tipo, 'declaracion_anterior')))
    .orderBy(desc(adjuntosTributarios.createdAt))
  const directo = propios.find((a) => LEGIBLES.includes(a.archivoMime))
  if (directo) {
    return {
      resumen: { estado: 'encontrada', etiqueta, revisionId: revision.id, archivo: directo.archivoNombre, origen: 'subida' },
      contexto: { obligacionAnterior: obligacion, adjunto: directo, etiqueta },
    }
  }

  let anterior: Obligacion | undefined = obligacion
  if (anio !== 0) {
    // Cruza la vigencia: misma empresa, impuesto, periodicidad (y municipio si es municipal).
    const candidatas = await db.select().from(obligacionesTributarias).where(and(
      eq(obligacionesTributarias.empresaId, obligacion.empresaId),
      eq(obligacionesTributarias.tipo, obligacion.tipo),
      eq(obligacionesTributarias.anioFiscal, anioFiscal),
    ))
    anterior = candidatas.find((o) =>
      o.periodicidad === obligacion.periodicidad && (!esImpuestoMunicipal(obligacion.tipo) || mismoMunicipio(o.municipio, obligacion.municipio)))
    if (!anterior) return noEncontrada(`No hay una obligación de ${anioFiscal} en la plataforma`)
  }

  const [revAnterior] = await db.select().from(revisionesTributarias)
    .where(and(eq(revisionesTributarias.obligacionId, anterior.id), eq(revisionesTributarias.periodo, periodo)))
  if (!revAnterior) return noEncontrada('No hay revisión de ese período en la plataforma')

  const adjuntos = await db.select().from(adjuntosTributarios)
    .where(eq(adjuntosTributarios.revisionId, revAnterior.id)).orderBy(desc(adjuntosTributarios.createdAt))
  const adjunto = revAnterior.estado === 'revisada' ? elegirDeclaracionPresentada(adjuntos, revAnterior.snapshot) : null
  if (!adjunto) return noEncontrada('No tiene la declaración presentada adjunta', revAnterior.id)

  const completo = adjuntos.find((a) => a.id === adjunto.id)!
  return {
    resumen: { estado: 'encontrada', etiqueta, revisionId: revAnterior.id, archivo: completo.archivoNombre, origen: 'periodo_anterior' },
    contexto: { obligacionAnterior: anterior, adjunto: completo, etiqueta },
  }
}

// ─── Lectura con caché ───────────────────────────────────────────────────────
// Leer un PDF cuesta segundos (n8n u OCR): el resultado se guarda por hash del
// archivo en la memoria de la empresa y no se repite en las corridas siguientes.

type LecturaGuardada = { cifras: CifrasRevision; fuente: string; leidoAt: string }
const claveLectura = (hash: string) => `lectura:${hash}`

async function lecturaEnCache(empresaId: string, hash: string): Promise<LecturaGuardada | null> {
  const [row] = await db.select().from(memoriaEmpresaAgente)
    .where(and(eq(memoriaEmpresaAgente.empresaId, empresaId), eq(memoriaEmpresaAgente.clave, claveLectura(hash))))
  return (row?.valor as LecturaGuardada | undefined) ?? null
}

async function guardarLectura(empresaId: string, hash: string, valor: LecturaGuardada, userId: string) {
  await db.insert(memoriaEmpresaAgente)
    .values({ empresaId, clave: claveLectura(hash), valor, actualizadoPor: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [memoriaEmpresaAgente.empresaId, memoriaEmpresaAgente.clave], set: { valor, actualizadoPor: userId, updatedAt: new Date() } })
}

export type AnteriorParaCorrida = {
  /** Lo que reciben los motores; null = no se compara. */
  anterior: { etiqueta: string; cifras: CifrasRevision } | null
  /** Por qué no se pudo usar un PDF que sí existía (queda como limitación de la corrida). */
  nota: string | null
}

/** Busca la declaración presentada del período anterior y la lee. Nunca lanza: sin PDF utilizable, `anterior` es null. */
export async function anteriorParaCorrida(
  obligacion: Obligacion,
  revision: Revision,
  user: Pick<JwtPayload, 'sub' | 'firmaId'>,
): Promise<AnteriorParaCorrida> {
  const { contexto } = await buscarAnteriorPresentada(obligacion, revision)
  if (!contexto) return { anterior: null, nota: null }
  const { adjunto, etiqueta, obligacionAnterior } = contexto
  const donde = `${etiqueta} (${adjunto.archivoNombre})`

  const guardada = await lecturaEnCache(obligacion.empresaId, adjunto.archivoHash)
  if (guardada) return { anterior: { etiqueta, cifras: guardada.cifras }, nota: null }

  const hayLector = obligacion.tipo === 'reteica' ? iaDisponible() : lecturaCasillasDisponible()
  if (!hayLector) return { anterior: null, nota: `No se pudo leer la declaración presentada de ${donde}: la lectura automática no está configurada.` }
  if (adjunto.archivoTamano > MAX_BYTES) return { anterior: null, nota: `La declaración presentada de ${donde} supera los 10 MB y no se leyó.` }

  try {
    const contenido = await storage.leer(adjunto.archivoKey)
    const lectura = await leerDeclaracion({
      tipo: obligacion.tipo,
      obligacionNombre: nombreObligacion(obligacionAnterior),
      periodo: etiqueta,
      empresaNombre: 'la empresa',
      archivo: { nombre: adjunto.archivoNombre, mime: adjunto.archivoMime, base64: contenido.toString('base64') },
      documento: 'DECLARACIÓN PRESENTADA',
    })
    registrarEvento(user, {
      accion: 'ia.leer_declaracion_anterior',
      entidad: 'revision_tributaria',
      entidadId: revision.id,
      empresaId: obligacion.empresaId,
      detalle: { archivo: adjunto.archivoNombre, periodoLeido: etiqueta, fuente: lectura.fuente, advertencias: lectura.advertencias.length, descuadres: lectura.descuadres },
    })
    // Una lectura corrida compararía contra cifras en la casilla equivocada: peor que no comparar.
    if (lectura.descuadres > 0) {
      return { anterior: null, nota: `La declaración presentada de ${donde} se leyó pero sus totales no cuadran, así que no se usó para comparar.` }
    }
    const cifras: CifrasRevision = {}
    for (const [id, valor] of Object.entries(lectura.renglones)) if (valor !== null) cifras[id] = { declarado: valor, libros: null }
    if (Object.keys(cifras).length === 0) return { anterior: null, nota: `No se encontraron valores legibles en la declaración presentada de ${donde}.` }
    await guardarLectura(obligacion.empresaId, adjunto.archivoHash, { cifras, fuente: lectura.fuente, leidoAt: new Date().toISOString() }, user.sub)
    return { anterior: { etiqueta, cifras }, nota: null }
  } catch (err) {
    console.error('[agente] no se pudo leer la declaración anterior', revision.id, (err as Error).message)
    return { anterior: null, nota: `No se pudo leer la declaración presentada de ${donde}; no se hizo la comparación.` }
  }
}
