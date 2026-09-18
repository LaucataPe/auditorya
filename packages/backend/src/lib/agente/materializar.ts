/**
 * Materialización: cuando una persona aprueba una propuesta del agente, esta escribe
 * en las tablas de siempre. Aquí viven las que tocan la ejecución:
 *
 *  - hallazgo del balance → fila en `hallazgos` dentro del papel de trabajo del CICLO
 *    de la cuenta (se crea el papel del área si no existe, con índice NIA 230);
 *  - documento pedido → solicitud PBC ligada al papel del área del hallazgo que desbloquea;
 *  - riesgo aprobado → la prueba de su respuesta planeada como papel de trabajo (con sus PBC);
 *  - componente COSO aprobado → cada deficiencia con área como hallazgo tipo 'deficiencia'
 *    en el papel del área (la carta NIA 265 las lee de ahí con su referencia).
 *
 * Los hallazgos de integridad del archivo (sin cuenta) no van a ningún papel: son
 * condiciones para volver a exportar el balance.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { auditorias, hallazgos, papelesTrabajo, propuestasAgente, solicitudesPbc, bitacoraAgente, riesgos } from '../../db/schema'
import { AREA_BASE_LABEL, PROGRAMA_AUDITORIA, areaDesdeCodigoPuc, type ContenidoPropuesta, type PruebaEstandar } from '@auditorya/types'
import { siguienteIndicePapel } from '../../routes/ejecucion'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

type Propuesta = typeof propuestasAgente.$inferSelect
type Usuario = Pick<JwtPayload, 'sub' | 'firmaId' | 'rol'>

const nombreArea = (a: string) => AREA_BASE_LABEL[a] ?? a.replace(/_/g, ' ')

/**
 * Papel de trabajo del área en el encargo. Prefiere el que atiende el riesgo indicado,
 * luego el más reciente abierto; si no hay, crea "Revisión de <área>" con el índice del área.
 */
export async function papelDelArea(auditoriaId: string, user: Usuario, area: string, riesgoId?: string | null) {
  const abiertos = await db
    .select({ id: papelesTrabajo.id, indice: papelesTrabajo.indice, titulo: papelesTrabajo.titulo, riesgoId: papelesTrabajo.riesgoId })
    .from(papelesTrabajo)
    .where(and(eq(papelesTrabajo.auditoriaId, auditoriaId), eq(papelesTrabajo.area, area), inArray(papelesTrabajo.estado, ['borrador', 'en_revision'])))
    .orderBy(desc(papelesTrabajo.createdAt))
  const elegido = (riesgoId && abiertos.find((p) => p.riesgoId === riesgoId)) || abiertos[0]
  if (elegido) return { ...elegido, creado: false }

  const programa = PROGRAMA_AUDITORIA[area] ?? []
  const procedimiento = programa.length
    ? programa.map((p) => `${p.titulo}: ${p.procedimiento}`).join('\n')
    : `Revisar los saldos y movimientos de ${nombreArea(area).toLowerCase()} a partir de los hallazgos del balance.`
  for (let intento = 0; ; intento++) {
    const indice = await siguienteIndicePapel(auditoriaId, user.firmaId, area)
    try {
      const [papel] = await db.insert(papelesTrabajo).values({
        auditoriaId, area, indice, titulo: `Revisión de ${nombreArea(area).toLowerCase()}`, riesgoId: riesgoId ?? null,
        procedimiento, alcance: 'Hallazgos del balance de prueba identificados por el agente y aprobados por el auditor.', preparadoPor: user.sub,
      }).returning({ id: papelesTrabajo.id, indice: papelesTrabajo.indice, titulo: papelesTrabajo.titulo, riesgoId: papelesTrabajo.riesgoId })
      registrarEvento(user, { accion: 'papel.crear', entidad: 'papel_trabajo', entidadId: papel.id, auditoriaId, actor: 'agente', detalle: { area, indice, titulo: papel.titulo, origen: 'agente' } })
      return { ...papel, creado: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (intento < 2 && /papeles_trabajo_auditoria_indice_unq/.test(msg)) continue
      throw e
    }
  }
}

/** Riesgo del encargo que salió de este hallazgo (propuesta de riesgo aprobada cuyas reglas lo citan). */
async function riesgoDelHallazgo(auditoriaId: string, codigo: string | null, area: string): Promise<string | null> {
  if (!codigo) return null
  const [p] = await db
    .select({ entidadDestinoId: propuestasAgente.entidadDestinoId })
    .from(propuestasAgente)
    .where(and(eq(propuestasAgente.auditoriaId, auditoriaId), eq(propuestasAgente.tipo, 'riesgo'), eq(propuestasAgente.entidadDestino, 'riesgo'), sql`${propuestasAgente.reglas} @> ${JSON.stringify([codigo])}::jsonb`))
    .limit(1)
  if (p?.entidadDestinoId) return p.entidadDestinoId
  const [r] = await db.select({ id: riesgos.id }).from(riesgos).where(and(eq(riesgos.auditoriaId, auditoriaId), eq(riesgos.area, area))).orderBy(desc(riesgos.createdAt)).limit(1)
  return r?.id ?? null
}

export type ResultadoMaterializarHallazgo =
  | { escrito: true; hallazgoId: string; papelId: string; indice: string; papelTitulo: string; papelCreado: boolean; area: string }
  | { escrito: false; motivo: 'sin_cuenta' | 'materialidad_no_aprobada' }

/** Escribe un hallazgo del balance aprobado en el papel de trabajo de su ciclo. */
export async function materializarHallazgo(p: Propuesta, user: Usuario, ajustes?: { titulo?: string; descripcion?: string; severidad?: 'alta' | 'media' | 'baja' }): Promise<ResultadoMaterializarHallazgo> {
  if (!p.cuentaCodigo) return { escrito: false, motivo: 'sin_cuenta' }
  const [aud] = await db.select({ materialidadAprobada: auditorias.materialidadAprobada }).from(auditorias).where(eq(auditorias.id, p.auditoriaId))
  if (!aud?.materialidadAprobada) return { escrito: false, motivo: 'materialidad_no_aprobada' }

  const area = areaDesdeCodigoPuc(p.cuentaCodigo)
  const riesgoId = await riesgoDelHallazgo(p.auditoriaId, p.codigo, area)
  const papel = await papelDelArea(p.auditoriaId, user, area, riesgoId)
  const contenido = p.contenido as ContenidoPropuesta
  const titulo = ajustes?.titulo ?? p.titulo
  const descripcion = ajustes?.descripcion ?? contenido.descripcion
  const datos = p.datos.map((d) => `${d.etiqueta}: ${d.valor}`).join(' · ')
  const [h] = await db.insert(hallazgos).values({
    auditoriaId: p.auditoriaId, papelTrabajoId: papel.id, area, cuentaCodigo: p.cuentaCodigo,
    descripcion: `${titulo}${descripcion ? `. ${descripcion}` : ''}${datos ? ` (${datos})` : ''}`,
    criterio: contenido.norma ?? null,
    causa: null, efecto: null, recomendacion: contenido.recomendacion ?? null,
    monto: p.monto, severidad: ajustes?.severidad ?? p.severidad ?? 'media',
    tipo: p.reglas.some((r) => /^V-8/.test(r)) ? 'deficiencia' : 'incorreccion',
  }).returning({ id: hallazgos.id })
  registrarEvento(user, { accion: 'hallazgo.crear', entidad: 'hallazgo', entidadId: h.id, auditoriaId: p.auditoriaId, actor: 'agente', detalle: { codigo: p.codigo, area, papelId: papel.id, indice: papel.indice, origen: 'agente' } })
  return { escrito: true, hallazgoId: h.id, papelId: papel.id, indice: papel.indice, papelTitulo: papel.titulo, papelCreado: papel.creado, area }
}

/** Prueba del programa estándar que corresponde a una respuesta planeada ("Título: procedimiento…"). */
function pruebaDeRespuesta(area: string, respuestaPlaneada: string): PruebaEstandar | null {
  const programa = PROGRAMA_AUDITORIA[area] ?? []
  if (programa.length === 0) return null
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const r = norm(respuestaPlaneada)
  const cabeza = r.split(':')[0].trim()
  return programa.find((p) => norm(p.titulo) === cabeza)
    ?? programa.find((p) => r.includes(norm(p.titulo)))
    ?? programa.find((p) => norm(p.titulo).split(/\s+/).filter((w) => w.length > 4).some((w) => r.includes(w)))
    ?? programa[0]
}

export type ResultadoMaterializarPrueba =
  | { creado: true; papelId: string; indice: string; titulo: string; documentos: number }
  | { creado: false; motivo: 'ya_existe' | 'materialidad_no_aprobada' | 'sin_programa' }

/** Crea, para un riesgo aprobado, la prueba de su respuesta planeada como papel de trabajo con sus PBC. */
export async function materializarPruebaDeRiesgo(auditoriaId: string, riesgo: { id: string; area: string; respuestaPlaneada: string | null }, user: Usuario): Promise<ResultadoMaterializarPrueba> {
  const [aud] = await db.select({ materialidadAprobada: auditorias.materialidadAprobada }).from(auditorias).where(eq(auditorias.id, auditoriaId))
  if (!aud?.materialidadAprobada) return { creado: false, motivo: 'materialidad_no_aprobada' }
  const [existente] = await db.select({ id: papelesTrabajo.id }).from(papelesTrabajo).where(and(eq(papelesTrabajo.auditoriaId, auditoriaId), eq(papelesTrabajo.riesgoId, riesgo.id))).limit(1)
  if (existente) return { creado: false, motivo: 'ya_existe' }
  const prueba = pruebaDeRespuesta(riesgo.area, riesgo.respuestaPlaneada ?? '')
  if (!prueba) return { creado: false, motivo: 'sin_programa' }
  const guiaTexto = prueba.guia.length > 0 ? `\n\nPasos:\n${prueba.guia.map((g) => `• ${g}`).join('\n')}` : ''
  for (let intento = 0; ; intento++) {
    const indice = await siguienteIndicePapel(auditoriaId, user.firmaId, riesgo.area)
    try {
      const [papel] = await db.insert(papelesTrabajo).values({
        auditoriaId, area: riesgo.area, indice, titulo: prueba.titulo, riesgoId: riesgo.id,
        procedimiento: `Aserción(es): ${prueba.aserciones.join(', ')}.\n\n${prueba.procedimiento}${guiaTexto}`,
        alcance: riesgo.respuestaPlaneada ? `Respuesta planeada al riesgo: ${riesgo.respuestaPlaneada}` : null,
        preparadoPor: user.sub,
      }).returning({ id: papelesTrabajo.id, indice: papelesTrabajo.indice })
      if (prueba.documentosRequeridos.length) {
        await db.insert(solicitudesPbc).values(prueba.documentosRequeridos.map((descripcion) => ({ auditoriaId, papelTrabajoId: papel.id, descripcion, notas: 'Pedido por el agente para la prueba del riesgo.' })))
      }
      registrarEvento(user, { accion: 'papel.crear', entidad: 'papel_trabajo', entidadId: papel.id, auditoriaId, actor: 'agente', detalle: { area: riesgo.area, indice: papel.indice, titulo: prueba.titulo, riesgoId: riesgo.id, origen: 'agente', pbc: prueba.documentosRequeridos.length } })
      return { creado: true, papelId: papel.id, indice: papel.indice, titulo: prueba.titulo, documentos: prueba.documentosRequeridos.length }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (intento < 2 && /papeles_trabajo_auditoria_indice_unq/.test(msg)) continue
      throw e
    }
  }
}

type DeficienciaCoso = { pregunta: string; componente: string; texto: string; areas: string[]; grado: 'no' | 'parcial' }

/**
 * Escribe las deficiencias con área de un componente COSO aprobado como hallazgos tipo
 * 'deficiencia' en el papel de su área (referencia para la carta NIA 265). Las que no tienen
 * área quedan en las observaciones del componente, que la carta ya lee.
 */
export async function materializarDeficienciasCoso(auditoriaId: string, coso: { componente: string; calificacion: string; deficiencias: DeficienciaCoso[] }, user: Usuario): Promise<{ escritas: number; papeles: string[]; pendiente: boolean }> {
  const conArea = coso.deficiencias.filter((d) => d.areas.length > 0)
  if (conArea.length === 0) return { escritas: 0, papeles: [], pendiente: false }
  const [aud] = await db.select({ materialidadAprobada: auditorias.materialidadAprobada }).from(auditorias).where(eq(auditorias.id, auditoriaId))
  if (!aud?.materialidadAprobada) return { escritas: 0, papeles: [], pendiente: true }
  const papeles = new Set<string>()
  for (const d of conArea) {
    const area = d.areas[0]
    const papel = await papelDelArea(auditoriaId, user, area)
    const [h] = await db.insert(hallazgos).values({
      auditoriaId, papelTrabajoId: papel.id, area, cuentaCodigo: null,
      descripcion: d.texto,
      criterio: `COSO 2013 · NIA 265. Cuestionario de control interno, pregunta ${d.pregunta}.`,
      causa: null, efecto: d.areas.length > 1 ? `Afecta también ${d.areas.slice(1).map(nombreArea).join(', ')}.` : null,
      recomendacion: null, monto: null, tipo: 'deficiencia',
      severidad: d.grado === 'parcial' ? 'baja' : coso.calificacion === 'deficiente' ? 'alta' : 'media',
    }).returning({ id: hallazgos.id })
    papeles.add(papel.indice)
    registrarEvento(user, { accion: 'hallazgo.crear', entidad: 'hallazgo', entidadId: h.id, auditoriaId, actor: 'agente', detalle: { tipo: 'deficiencia', componente: coso.componente, pregunta: d.pregunta, area, indice: papel.indice, origen: 'agente' } })
  }
  return { escritas: conArea.length, papeles: [...papeles], pendiente: false }
}

/**
 * Lo que quedó esperando la materialidad aprobada se escribe cuando se aprueba: hallazgos del
 * balance, pruebas de riesgos aprobados y deficiencias COSO con área.
 */
export async function materializarPendientes(auditoriaId: string, user: Usuario): Promise<{ hallazgos: number; pruebas: number; deficiencias: number; papeles: string[] }> {
  const h = await materializarHallazgosPendientes(auditoriaId, user)
  const papeles = new Set(h.papeles)
  let pruebas = 0, deficiencias = 0
  const decididas = await db.select().from(propuestasAgente)
    .where(and(eq(propuestasAgente.auditoriaId, auditoriaId), inArray(propuestasAgente.estado, ['aprobada', 'ajustada']), inArray(propuestasAgente.tipo, ['riesgo', 'juicio'])))
  for (const p of decididas) {
    const contenido = p.contenido as ContenidoPropuesta & { deficienciasEscritas?: boolean }
    if (p.tipo === 'riesgo' && p.entidadDestino === 'riesgo' && p.entidadDestinoId) {
      const [r] = await db.select({ id: riesgos.id, area: riesgos.area, respuestaPlaneada: riesgos.respuestaPlaneada }).from(riesgos).where(eq(riesgos.id, p.entidadDestinoId))
      if (!r) continue
      const res = await materializarPruebaDeRiesgo(auditoriaId, r, user)
      if (res.creado) { pruebas++; papeles.add(res.indice); await anotar(p, `Con la materialidad aprobada, creé la prueba "${res.titulo}" como papel ${res.indice}${res.documentos ? ` y pedí ${res.documentos} documento(s)` : ''}.`) }
    }
    if (p.tipo === 'juicio' && contenido.destino === 'coso' && contenido.coso && !contenido.deficienciasEscritas) {
      const res = await materializarDeficienciasCoso(auditoriaId, contenido.coso, user)
      if (res.pendiente) continue
      deficiencias += res.escritas
      res.papeles.forEach((x) => papeles.add(x))
      await db.update(propuestasAgente).set({ contenido: { ...(p.contenido as Record<string, unknown>), deficienciasEscritas: true } }).where(eq(propuestasAgente.id, p.id))
      if (res.escritas) await anotar(p, `Con la materialidad aprobada, escribí ${res.escritas} deficiencia(s) como hallazgos en ${res.papeles.join(', ')} para la carta de control interno.`)
    }
  }
  return { hallazgos: h.escritos, pruebas, deficiencias, papeles: [...papeles] }
}

async function anotar(p: Propuesta, texto: string) {
  const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${bitacoraAgente.numero}),0)::int` }).from(bitacoraAgente).where(eq(bitacoraAgente.propuestaId, p.id))
  await db.insert(bitacoraAgente).values({ auditoriaId: p.auditoriaId, propuestaId: p.id, corridaId: p.corridaId, numero: Number(max) + 1, tipo: 'clasificacion', texto, referencia: { norma: 'NIA 230' }, actor: 'agente' })
}

/**
 * Hallazgos aprobados que quedaron sin escribir porque la materialidad no estaba aprobada:
 * se escriben cuando se aprueba. Devuelve cuántos y en qué papeles.
 */
export async function materializarHallazgosPendientes(auditoriaId: string, user: Usuario): Promise<{ escritos: number; papeles: string[] }> {
  const pendientes = await db
    .select().from(propuestasAgente)
    .where(and(
      eq(propuestasAgente.auditoriaId, auditoriaId), eq(propuestasAgente.tipo, 'hallazgo'), eq(propuestasAgente.paso, 'balance'),
      inArray(propuestasAgente.estado, ['aprobada', 'ajustada']), isNull(propuestasAgente.entidadDestinoId),
    ))
  let escritos = 0
  const papeles = new Set<string>()
  for (const p of pendientes) {
    const r = await materializarHallazgo(p, user)
    if (!r.escrito) continue
    escritos++
    papeles.add(r.indice)
    const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${bitacoraAgente.numero}),0)::int` }).from(bitacoraAgente).where(eq(bitacoraAgente.propuestaId, p.id))
    await db.update(propuestasAgente).set({ entidadDestino: 'hallazgo', entidadDestinoId: r.hallazgoId }).where(eq(propuestasAgente.id, p.id))
    await db.insert(bitacoraAgente).values({ auditoriaId, propuestaId: p.id, corridaId: p.corridaId, numero: Number(max) + 1, tipo: 'clasificacion', texto: `Con la materialidad aprobada, escribí el hallazgo en el papel ${r.indice} · ${r.papelTitulo}${r.papelCreado ? ' (lo creé para este ciclo)' : ''}.`, referencia: { norma: 'NIA 230' }, actor: 'agente' })
  }
  return { escritos, papeles: [...papeles] }
}

/** Convierte un documento pedido por el agente en una solicitud PBC ligada al papel del área del hallazgo que desbloquea. */
export async function materializarDocumento(p: Propuesta, user: Usuario): Promise<{ solicitudId: string; papelIndice: string | null; area: string | null }> {
  let cuenta = p.cuentaCodigo
  let codigoHallazgo: string | null = null
  if (p.desbloqueaId) {
    const [h] = await db.select({ cuentaCodigo: propuestasAgente.cuentaCodigo, codigo: propuestasAgente.codigo, titulo: propuestasAgente.titulo }).from(propuestasAgente).where(eq(propuestasAgente.id, p.desbloqueaId))
    cuenta = cuenta ?? h?.cuentaCodigo ?? null
    codigoHallazgo = h?.codigo ?? null
  }
  const area = cuenta ? areaDesdeCodigoPuc(cuenta) : null
  const papel = area ? await papelDelArea(p.auditoriaId, user, area, await riesgoDelHallazgo(p.auditoriaId, codigoHallazgo, area)) : null
  const [s] = await db.insert(solicitudesPbc).values({
    auditoriaId: p.auditoriaId, papelTrabajoId: papel?.id ?? null, descripcion: p.titulo,
    notas: `Pedido por el agente${codigoHallazgo ? ` para resolver ${codigoHallazgo}` : ''}${p.codigo ? ` (${p.codigo})` : ''}.`,
  }).returning({ id: solicitudesPbc.id })
  registrarEvento(user, { accion: 'pbc.crear', entidad: 'solicitud_pbc', entidadId: s.id, auditoriaId: p.auditoriaId, actor: 'agente', detalle: { descripcion: p.titulo, papelId: papel?.id ?? null, origen: 'agente', codigo: p.codigo } })
  return { solicitudId: s.id, papelIndice: papel?.indice ?? null, area }
}

/**
 * Al recibir una solicitud PBC que pidió el agente: deja constancia en la propuesta del
 * documento y en el hallazgo que desbloquea, para que el auditor lo revise con el soporte.
 */
export async function anotarRecepcionDocumento(solicitudId: string, user: Usuario, papelIndice: string | null): Promise<boolean> {
  const [doc] = await db.select().from(propuestasAgente).where(and(eq(propuestasAgente.entidadDestino, 'solicitud_pbc'), eq(propuestasAgente.entidadDestinoId, solicitudId)))
  if (!doc) return false
  const anotar = async (propuestaId: string, texto: string) => {
    const [{ max } = { max: 0 }] = await db.select({ max: sql<number>`coalesce(max(${bitacoraAgente.numero}),0)::int` }).from(bitacoraAgente).where(eq(bitacoraAgente.propuestaId, propuestaId))
    await db.insert(bitacoraAgente).values({ auditoriaId: doc.auditoriaId, propuestaId, corridaId: doc.corridaId, numero: Number(max) + 1, tipo: 'humano', texto, referencia: { solicitudId }, actor: 'usuario', usuarioId: user.sub })
  }
  await anotar(doc.id, `Documento recibido del cliente${papelIndice ? ` y adjuntado como evidencia del papel ${papelIndice}` : ''}.`)
  if (doc.desbloqueaId) {
    await anotar(doc.desbloqueaId, `Llegó "${doc.titulo}"${papelIndice ? ` (evidencia en el papel ${papelIndice})` : ''}. Revísalo con el documento a la mano: todavía no leo archivos, así que la conclusión es tuya.`)
  }
  return true
}
