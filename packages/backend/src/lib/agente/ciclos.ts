/**
 * Ejecución por ciclo (modo agéntico). Arma, con lo que ya existe en el encargo, el
 * estado de cada área/ciclo: riesgos, pruebas (papeles), documentos, hallazgos y lo que
 * el agente tiene pendiente ahí. Ordena los ciclos por lo que ya se puede hacer con lo
 * que hay (evidencia recibida primero) y sugiere el primero; el auditor entra al que
 * quiera. Todo determinista, 0 tokens.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  auditorias, empresas, areasFirma, riesgos, papelesTrabajo, evidencias, solicitudesPbc, hallazgos,
  propuestasAgente, bitacoraAgente,
} from '../../db/schema'
import {
  AREAS_BASE, PROGRAMA_AUDITORIA, areaDesdeCodigoPuc, nivelCombinado, prefijoDeArea,
  type AccionCiclo, type CicloAgente, type CicloDetalle, type ContenidoPropuesta, type EstadoCiclo, type PapelCiclo, type NivelRiesgo,
  type PropuestaAgente, type RiesgosCiclo,
} from '@auditorya/types'
import { sugerirRiesgos } from '../ia'
import { controlPorAreaDe } from './corrida-control-interno'
import { materializarPruebaDeRiesgo } from './materializar'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

type Usuario = Pick<JwtPayload, 'sub' | 'firmaId' | 'rol'>
type AreaInfo = { area: string; nombre: string; prefijo: string }

const PESO: Record<NivelRiesgo, number> = { bajo: 1, medio: 2, alto: 3 }

async function areasDe(firmaId: string): Promise<AreaInfo[]> {
  const propias = await db.select({ clave: areasFirma.clave, nombre: areasFirma.nombre, prefijo: areasFirma.prefijo }).from(areasFirma).where(eq(areasFirma.firmaId, firmaId))
  return [
    ...AREAS_BASE.map((a) => ({ area: a.clave, nombre: a.nombre, prefijo: a.prefijo })),
    ...propias.map((a) => ({ area: a.clave, nombre: a.nombre, prefijo: prefijoDeArea(a.clave, a.prefijo) })),
  ]
}

async function cargarDatos(auditoriaId: string) {
  const [rs, ps, evs, pbc, hs, props] = await Promise.all([
    db.select().from(riesgos).where(eq(riesgos.auditoriaId, auditoriaId)),
    db.select().from(papelesTrabajo).where(eq(papelesTrabajo.auditoriaId, auditoriaId)).orderBy(papelesTrabajo.indice),
    db.select({ id: evidencias.id, papelTrabajoId: evidencias.papelTrabajoId, nombre: evidencias.nombre, tipo: evidencias.tipo, createdAt: evidencias.createdAt })
      .from(evidencias).innerJoin(papelesTrabajo, eq(evidencias.papelTrabajoId, papelesTrabajo.id)).where(eq(papelesTrabajo.auditoriaId, auditoriaId)),
    db.select().from(solicitudesPbc).where(eq(solicitudesPbc.auditoriaId, auditoriaId)),
    db.select().from(hallazgos).where(eq(hallazgos.auditoriaId, auditoriaId)).orderBy(desc(hallazgos.createdAt)),
    db.select().from(propuestasAgente).where(eq(propuestasAgente.auditoriaId, auditoriaId)),
  ])
  return { rs, ps, evs, pbc, hs, props }
}
type Datos = Awaited<ReturnType<typeof cargarDatos>>

/** Área de una propuesta del agente (por cuenta, por el riesgo que propone o por el papel al que apunta). */
function areaDePropuesta(p: Datos['props'][number], d: Datos): string | null {
  const c = p.contenido as ContenidoPropuesta & { papelId?: string }
  if (p.tipo === 'riesgo' && c.riesgo) return c.riesgo.area
  if (c.papelId) return d.ps.find((x) => x.id === c.papelId)?.area ?? null
  if (p.cuentaCodigo) return areaDesdeCodigoPuc(p.cuentaCodigo)
  return null
}

function pasosDe(area: string, titulo: string): string[] {
  return (PROGRAMA_AUDITORIA[area] ?? []).find((p) => p.titulo === titulo)?.guia ?? []
}

function papelesDelArea(area: string, d: Datos): PapelCiclo[] {
  return d.ps.filter((p) => p.area === area).map((p) => {
    const guia = pasosDe(area, p.titulo)
    const pbcP = d.pbc.filter((s) => s.papelTrabajoId === p.id)
    return {
      id: p.id, indice: p.indice, titulo: p.titulo, estado: p.estado,
      pasosHechos: guia.filter((_, i) => p.pasosEstado?.[String(i)]?.hecho).length, pasosTotal: guia.length,
      evidencias: d.evs.filter((e) => e.papelTrabajoId === p.id).length,
      pbcSolicitados: pbcP.filter((s) => s.estado === 'solicitado').length, pbcRecibidos: pbcP.filter((s) => s.estado === 'recibido').length,
      hallazgosAbiertos: d.hs.filter((h) => h.papelTrabajoId === p.id && (h.estado === 'abierto' || h.estado === 'no_corregido')).length,
      tieneConclusion: !!(p.conclusion ?? '').trim(),
    }
  })
}

export function armarCiclo(info: AreaInfo, d: Datos): CicloAgente {
  const { area } = info
  const rs = d.rs.filter((r) => r.area === area)
  const papeles = papelesDelArea(area, d)
  const pendientes = d.props.filter((p) => p.estado === 'propuesta' && areaDePropuesta(p, d) === area).length
  const senales = d.props.filter((p) => p.paso === 'balance' && p.tipo === 'hallazgo' && p.estado !== 'descartada' && p.cuentaCodigo && areaDesdeCodigoPuc(p.cuentaCodigo) === area).length
  const hallazgosAbiertos = d.hs.filter((h) => h.area === area && (h.estado === 'abierto' || h.estado === 'no_corregido')).length
  const pbcPendientes = papeles.reduce((n, p) => n + p.pbcSolicitados, 0)
  const riesgoMaximo = rs.length ? rs.map((r) => r.riesgoCombinado).sort((a, b) => PESO[b] - PESO[a])[0] : null

  const abiertos = papeles.filter((p) => p.estado !== 'aprobado')
  const conEvidencia = abiertos.filter((p) => (p.evidencias > 0 || p.pbcRecibidos > 0) && (p.pasosHechos < p.pasosTotal || !p.tieneConclusion))
  const ejecutados = abiertos.filter((p) => ((p.pasosTotal > 0 && p.pasosHechos === p.pasosTotal) || (p.pasosTotal === 0 && p.evidencias > 0)) && !p.tieneConclusion)
  const sinNada = abiertos.filter((p) => p.evidencias === 0 && p.pbcRecibidos === 0)

  let estado: EstadoCiclo, motivo: string, siguiente: string | null = null
  if (papeles.length > 0 && papeles.every((p) => p.estado === 'aprobado') && hallazgosAbiertos === 0) {
    estado = 'terminado'; motivo = `${papeles.length} papel(es) aprobados y sin hallazgos abiertos.`
  } else if (pendientes > 0) {
    estado = 'decidir'; motivo = `${pendientes} decisión(es) del agente esperan por ti en este ciclo.`; siguiente = 'Decidir las propuestas pendientes'
  } else if (ejecutados.length > 0) {
    estado = 'listo'; motivo = `${ejecutados[0].indice} ya está ejecutado y le falta la conclusión.`; siguiente = `Concluir ${ejecutados[0].indice} · ${ejecutados[0].titulo}`
  } else if (conEvidencia.length > 0) {
    const p = conEvidencia[0]
    estado = 'listo'; motivo = `Llegó evidencia a ${p.indice} (${p.evidencias + p.pbcRecibidos} documento(s)): ya se puede ejecutar.`; siguiente = `Ejecutar ${p.indice} · ${p.titulo}`
  } else if (rs.length === 0 && papeles.length === 0) {
    estado = 'sin_iniciar'
    motivo = senales > 0 ? `El balance muestra ${senales} señal(es) en este ciclo y todavía no tiene riesgo ni prueba.` : 'Sin riesgo, prueba ni señales del balance.'
    siguiente = senales > 0 ? `Crear el riesgo y la prueba de ${info.nombre.toLowerCase()}` : null
  } else if (pbcPendientes > 0 && sinNada.length === abiertos.length) {
    estado = 'esperando'; motivo = `Faltan ${pbcPendientes} documento(s) del cliente para ejecutar.`; siguiente = 'Hacer seguimiento a los documentos pedidos'
  } else if (abiertos.length > 0) {
    const p = abiertos[0]
    estado = 'listo'; motivo = `${p.indice} está creado y no depende de documentos pendientes.`; siguiente = `Ejecutar ${p.indice} · ${p.titulo}`
  } else {
    estado = 'listo'; motivo = `Tiene ${rs.length} riesgo(s) sin prueba.`; siguiente = 'Crear la prueba del riesgo'
  }

  return {
    area, nombre: info.nombre, prefijo: info.prefijo, estado, motivo, siguiente,
    riesgos: rs.length, riesgoMaximo, papeles, pendientes, hallazgosAbiertos, senalesBalance: senales, pbcPendientes,
  }
}

const ORDEN: Record<EstadoCiclo, number> = { listo: 0, decidir: 1, sin_iniciar: 2, esperando: 3, terminado: 5 }
const peso = (c: CicloAgente) => (c.estado === 'sin_iniciar' && c.senalesBalance === 0 ? 4 : ORDEN[c.estado])

export async function listarCiclos(auditoriaId: string, firmaId: string): Promise<{ ciclos: CicloAgente[]; otros: AreaInfo[]; sugerido: string | null }> {
  const [areas, d] = await Promise.all([areasDe(firmaId), cargarDatos(auditoriaId)])
  const todos = areas.map((a) => armarCiclo(a, d))
  const conDatos = todos.filter((c) => c.riesgos > 0 || c.papeles.length > 0 || c.pendientes > 0 || c.senalesBalance > 0 || c.hallazgosAbiertos > 0)
  conDatos.sort((a, b) => peso(a) - peso(b) || (PESO[b.riesgoMaximo ?? 'bajo'] - PESO[a.riesgoMaximo ?? 'bajo']) || b.senalesBalance - a.senalesBalance)
  const otros = areas.filter((a) => !conDatos.some((c) => c.area === a.area))
  const sugerido = conDatos.find((c) => c.estado !== 'terminado')?.area ?? null
  return { ciclos: conDatos, otros, sugerido }
}

export async function detalleCiclo(auditoriaId: string, firmaId: string, area: string): Promise<CicloDetalle | null> {
  const [areas, d] = await Promise.all([areasDe(firmaId), cargarDatos(auditoriaId)])
  const info = areas.find((a) => a.area === area)
  if (!info) return null
  const base = armarCiclo(info, d)
  const pendientes = d.props.filter((p) => p.estado === 'propuesta' && areaDePropuesta(p, d) === area)
  const acciones: AccionCiclo[] = []

  for (const p of pendientes) acciones.push({ tipo: 'decidir', texto: `${p.codigo ? `${p.codigo} · ` : ''}${p.titulo}`, detalle: p.tipo === 'hallazgo' ? 'Hallazgo del balance por aprobar' : p.tipo === 'riesgo' ? 'Riesgo propuesto' : 'Documento por pedir', propuestaId: p.id })
  for (const p of base.papeles.filter((x) => x.estado !== 'aprobado')) {
    const ejecutado = (p.pasosTotal > 0 && p.pasosHechos === p.pasosTotal) || (p.pasosTotal === 0 && p.evidencias > 0)
    if (ejecutado && !p.tieneConclusion) acciones.push({ tipo: 'concluir', texto: `${p.indice} está ejecutado: pídeme la conclusión`, detalle: `${p.pasosHechos}/${p.pasosTotal} pasos · ${p.evidencias} evidencia(s)`, papelId: p.id, papelIndice: p.indice })
    else if ((p.evidencias > 0 || p.pbcRecibidos > 0) && p.pasosHechos < p.pasosTotal) acciones.push({ tipo: 'revisar_evidencia', texto: `Llegó evidencia a ${p.indice}: revísala y marca los pasos`, detalle: `${p.evidencias + p.pbcRecibidos} documento(s) · ${p.pasosHechos}/${p.pasosTotal} pasos hechos`, papelId: p.id, papelIndice: p.indice })
    else if (p.pbcSolicitados > 0 && p.evidencias === 0) acciones.push({ tipo: 'pedir', texto: `${p.indice} espera ${p.pbcSolicitados} documento(s) del cliente`, detalle: 'Cuando lleguen, este ciclo sube al frente.', papelId: p.id, papelIndice: p.indice })
    else if (p.pasosTotal > 0 && p.pasosHechos < p.pasosTotal) acciones.push({ tipo: 'marcar_pasos', texto: `${p.indice} tiene ${p.pasosTotal - p.pasosHechos} paso(s) por hacer`, detalle: 'No depende de documentos pendientes.', papelId: p.id, papelIndice: p.indice })
  }
  for (const r of d.rs.filter((x) => x.area === area && !d.ps.some((p) => p.riesgoId === x.id))) {
    acciones.push({ tipo: 'prueba', texto: `Riesgo sin prueba: ${r.descripcion.split(/[.;]/)[0].trim()}`, detalle: r.respuestaPlaneada ? `Respuesta planeada: ${r.respuestaPlaneada.slice(0, 120)}` : 'Sin respuesta planeada. Crea la prueba o escribe cómo lo cubres.', riesgoId: r.id })
  }
  if (base.hallazgosAbiertos > 0) acciones.push({ tipo: 'hallazgo', texto: `${base.hallazgosAbiertos} hallazgo(s) abiertos en el ciclo`, detalle: 'Decide si van a la hoja de ajustes o a la carta de recomendaciones.' })
  if (base.estado === 'sin_iniciar') acciones.push({ tipo: 'iniciar', texto: `Crear el riesgo y la prueba de ${info.nombre.toLowerCase()}`, detalle: base.senalesBalance > 0 ? `${base.senalesBalance} señal(es) del balance lo sustentan.` : 'Del programa estándar del área.' })

  const papelesDetalle = base.papeles.map((p) => {
    const row = d.ps.find((x) => x.id === p.id)!
    const guia = pasosDe(area, p.titulo)
    return {
      ...p,
      pasos: guia.map((texto, i) => ({ indice: i, texto, hecho: !!row.pasosEstado?.[String(i)]?.hecho, nota: row.pasosEstado?.[String(i)]?.nota ?? null })),
      evidenciasLista: d.evs.filter((e) => e.papelTrabajoId === p.id).map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo, createdAt: e.createdAt.toISOString() })),
      pbc: d.pbc.filter((s) => s.papelTrabajoId === p.id).map((s) => ({ id: s.id, descripcion: s.descripcion, estado: s.estado })),
      conclusion: row.conclusion,
    }
  })
  const riesgosLista = d.rs.filter((r) => r.area === area).map((r) => ({ id: r.id, descripcion: r.descripcion, riesgoCombinado: r.riesgoCombinado, respuestaPlaneada: r.respuestaPlaneada }))
  const hallazgosLista = d.hs.filter((h) => h.area === area).map((h) => ({ id: h.id, descripcion: h.descripcion, severidad: h.severidad, estado: h.estado, tipo: h.tipo, papelIndice: d.ps.find((p) => p.id === h.papelTrabajoId)?.indice ?? null }))

  // Propuestas pendientes completas (con bitácora) para las tarjetas.
  const bit = pendientes.length
    ? await db.select().from(bitacoraAgente).where(inArray(bitacoraAgente.propuestaId, pendientes.map((p) => p.id))).orderBy(bitacoraAgente.numero)
    : []
  const propuestas = pendientes.map((p) => ({
    id: p.id, auditoriaId: p.auditoriaId, corridaId: p.corridaId, paso: p.paso, tipo: p.tipo, codigo: p.codigo, titulo: p.titulo,
    cuentaCodigo: p.cuentaCodigo, monto: p.monto == null ? null : Number(p.monto), severidad: p.severidad, certeza: p.certeza,
    reglas: p.reglas, datos: p.datos, contenido: p.contenido as ContenidoPropuesta, estado: p.estado, desbloqueaId: p.desbloqueaId,
    entidadDestino: p.entidadDestino, entidadDestinoId: p.entidadDestinoId, decididaPor: p.decididaPor, decididaAt: p.decididaAt?.toISOString() ?? null,
    motivoDecision: p.motivoDecision, orden: p.orden, createdAt: p.createdAt.toISOString(),
    bitacora: bit.filter((b) => b.propuestaId === p.id).map((b) => ({ numero: b.numero, tipo: b.tipo, texto: b.texto, referencia: b.referencia, actor: b.actor, createdAt: b.createdAt.toISOString() })),
  }))

  return { ...base, acciones, papelesDetalle, riesgosLista, hallazgosLista, propuestas }
}

/** Convierte filas de propuestas en el tipo compartido, con su bitácora. */
async function aPropuestas(rows: Datos['props']): Promise<PropuestaAgente[]> {
  const bit = rows.length ? await db.select().from(bitacoraAgente).where(inArray(bitacoraAgente.propuestaId, rows.map((p) => p.id))).orderBy(bitacoraAgente.numero) : []
  return rows.map((p) => ({
    id: p.id, auditoriaId: p.auditoriaId, corridaId: p.corridaId, paso: p.paso, tipo: p.tipo, codigo: p.codigo, titulo: p.titulo,
    cuentaCodigo: p.cuentaCodigo, monto: p.monto == null ? null : Number(p.monto), severidad: p.severidad, certeza: p.certeza,
    reglas: p.reglas, datos: p.datos, contenido: p.contenido as ContenidoPropuesta, estado: p.estado, desbloqueaId: p.desbloqueaId,
    entidadDestino: p.entidadDestino, entidadDestinoId: p.entidadDestinoId, decididaPor: p.decididaPor, decididaAt: p.decididaAt?.toISOString() ?? null,
    motivoDecision: p.motivoDecision, orden: p.orden, createdAt: p.createdAt.toISOString(),
    bitacora: bit.filter((b) => b.propuestaId === p.id).map((b) => ({ numero: b.numero, tipo: b.tipo, texto: b.texto, referencia: b.referencia, actor: b.actor, createdAt: b.createdAt.toISOString() })),
  }))
}

/**
 * Riesgos por ciclo: lo que el agente propone (por decidir), lo omitido, lo que ya está en la
 * matriz con sus pruebas, y el catálogo del sector para agregar en un clic.
 */
export async function riesgosPorCiclo(auditoriaId: string, firmaId: string): Promise<{ ciclos: RiesgosCiclo[]; otros: AreaInfo[] }> {
  const [areas, d, [row]] = await Promise.all([
    areasDe(firmaId), cargarDatos(auditoriaId),
    db.select({ sector: empresas.sector }).from(auditorias).innerJoin(empresas, eq(auditorias.empresaId, empresas.id)).where(eq(auditorias.id, auditoriaId)),
  ])
  const catalogo = sugerirRiesgos(row?.sector ?? '')
  const propuestasRiesgo = d.props.filter((p) => p.tipo === 'riesgo')
  const pendientes = await aPropuestas(propuestasRiesgo.filter((p) => p.estado === 'propuesta'))
  const ciclos: RiesgosCiclo[] = []
  for (const a of areas) {
    const props = pendientes.filter((p) => p.contenido.riesgo?.area === a.area)
    const omitidas = propuestasRiesgo.filter((p) => p.estado === 'omitida' && (p.contenido as ContenidoPropuesta).riesgo?.area === a.area).map((p) => ({ id: p.id, codigo: p.codigo, titulo: p.titulo }))
    const matriz = d.rs.filter((r) => r.area === a.area).map((r) => ({
      id: r.id, descripcion: r.descripcion, riesgoInherente: r.riesgoInherente, riesgoControl: r.riesgoControl, riesgoCombinado: r.riesgoCombinado,
      respuestaPlaneada: r.respuestaPlaneada, origen: r.origen, papeles: d.ps.filter((p) => p.riesgoId === r.id).map((p) => ({ id: p.id, indice: p.indice, titulo: p.titulo })),
    }))
    const senales = d.props.filter((p) => p.paso === 'balance' && p.tipo === 'hallazgo' && p.estado !== 'descartada' && p.cuentaCodigo && areaDesdeCodigoPuc(p.cuentaCodigo) === a.area).length
    if (props.length === 0 && omitidas.length === 0 && matriz.length === 0 && senales === 0) continue
    const niveles = [...matriz.map((r) => r.riesgoCombinado), ...props.map((p) => p.contenido.riesgo!.riesgoCombinado)]
    const cat = catalogo.filter((c) => c.area === a.area && !matriz.some((m) => m.descripcion === c.descripcion) && !props.some((p) => p.contenido.descripcion === c.descripcion))
    ciclos.push({
      area: a.area, nombre: a.nombre, prefijo: a.prefijo,
      riesgoMaximo: niveles.length ? niveles.sort((x, y) => PESO[y] - PESO[x])[0] : null, senalesBalance: senales,
      propuestas: props, omitidas, matriz, catalogo: cat.map((c) => ({ descripcion: c.descripcion, riesgoInherente: c.riesgoInherente, respuestaPlaneada: c.respuestaPlaneada })),
    })
  }
  ciclos.sort((x, y) => (y.propuestas.length > 0 ? 1 : 0) - (x.propuestas.length > 0 ? 1 : 0) || PESO[y.riesgoMaximo ?? 'bajo'] - PESO[x.riesgoMaximo ?? 'bajo'] || y.senalesBalance - x.senalesBalance)
  const otros = areas.filter((a) => !ciclos.some((c) => c.area === a.area))
  return { ciclos, otros }
}

/**
 * Inicia un ciclo: si no tiene riesgo, lo crea (del catálogo del sector, de las señales del
 * balance o del programa estándar) y crea la prueba de su respuesta planeada.
 */
export async function iniciarCiclo(auditoriaId: string, area: string, user: Usuario) {
  const [row] = await db.select({ sector: empresas.sector }).from(auditorias).innerJoin(empresas, eq(auditorias.empresaId, empresas.id)).where(eq(auditorias.id, auditoriaId))
  if (!row) throw new Error('Auditoría no encontrada')
  const nombre = AREAS_BASE.find((a) => a.clave === area)?.nombre ?? area.replace(/_/g, ' ')
  const [existente] = await db.select().from(riesgos).where(and(eq(riesgos.auditoriaId, auditoriaId), eq(riesgos.area, area))).orderBy(desc(riesgos.createdAt)).limit(1)
  let riesgo = existente ?? null
  let riesgoCreado = false
  if (!riesgo) {
    const senales = await db.select({ codigo: propuestasAgente.codigo, titulo: propuestasAgente.titulo, severidad: propuestasAgente.severidad, cuentaCodigo: propuestasAgente.cuentaCodigo })
      .from(propuestasAgente)
      .where(and(eq(propuestasAgente.auditoriaId, auditoriaId), eq(propuestasAgente.paso, 'balance'), eq(propuestasAgente.tipo, 'hallazgo'), sql`${propuestasAgente.estado} <> 'descartada'`))
    const delArea = senales.filter((s) => s.cuentaCodigo && areaDesdeCodigoPuc(s.cuentaCodigo) === area)
    const catalogo = sugerirRiesgos(row.sector).find((r) => r.area === area)
    const programa = PROGRAMA_AUDITORIA[area] ?? []
    const control = (await controlPorAreaDe(auditoriaId))[area] ?? 'medio'
    let descripcion: string, inherente: NivelRiesgo, respuesta: string | null, origen: 'sugerido' | 'analitico'
    if (delArea.length > 0) {
      inherente = delArea.some((s) => s.severidad === 'alta') ? 'alto' : 'medio'
      descripcion = `Señales del balance en ${nombre.toLowerCase()}: ${delArea.map((s) => `${s.codigo ?? ''} ${s.titulo}`.trim()).join('; ')}.`
      respuesta = programa[0] ? `${programa[0].titulo}: ${programa[0].procedimiento}` : null
      origen = 'analitico'
    } else if (catalogo) {
      inherente = catalogo.riesgoInherente; descripcion = catalogo.descripcion; respuesta = catalogo.respuestaPlaneada; origen = 'sugerido'
    } else {
      inherente = 'medio'; descripcion = `Riesgo de incorrección material en ${nombre.toLowerCase()} (programa estándar del área).`
      respuesta = programa[0] ? `${programa[0].titulo}: ${programa[0].procedimiento}` : null; origen = 'sugerido'
    }
    ;[riesgo] = await db.insert(riesgos).values({
      auditoriaId, area, descripcion, riesgoInherente: inherente, riesgoControl: control, riesgoCombinado: nivelCombinado(inherente, control), respuestaPlaneada: respuesta, origen,
    }).returning()
    riesgoCreado = true
    registrarEvento(user, { accion: 'riesgo.crear', entidad: 'riesgo', entidadId: riesgo.id, auditoriaId, actor: 'agente', detalle: { area, combinado: riesgo.riesgoCombinado, origen: 'agente_ciclo' } })
  }
  const prueba = await materializarPruebaDeRiesgo(auditoriaId, { id: riesgo.id, area, respuestaPlaneada: riesgo.respuestaPlaneada }, user)
  registrarEvento(user, { accion: 'agente.ciclo_iniciado', entidad: 'auditoria', entidadId: auditoriaId, auditoriaId, actor: 'agente', detalle: { area, riesgoCreado, prueba: prueba.creado ? prueba.indice : prueba.motivo } })
  return { riesgoId: riesgo.id, riesgoCreado, prueba }
}

/** Borrador determinista de la conclusión de un papel, como propuesta (juicio destino 'conclusion'). */
export async function proponerConclusion(auditoriaId: string, papelId: string, user: Usuario) {
  const [papel] = await db.select().from(papelesTrabajo).where(and(eq(papelesTrabajo.id, papelId), eq(papelesTrabajo.auditoriaId, auditoriaId)))
  if (!papel) throw new Error('Papel no encontrado')
  const d = await cargarDatos(auditoriaId)
  const p = papelesDelArea(papel.area, d).find((x) => x.id === papelId)!
  const hs = d.hs.filter((h) => h.papelTrabajoId === papelId)
  const abiertos = hs.filter((h) => h.estado === 'abierto' || h.estado === 'no_corregido')
  const nombre = (AREAS_BASE.find((a) => a.clave === papel.area)?.nombre ?? papel.area.replace(/_/g, ' ')).toLowerCase()
  const altaAbierta = abiertos.some((h) => h.severidad === 'alta')

  const partes = [
    `${papel.titulo} (${papel.indice}): se ejecutaron ${p.pasosHechos} de ${p.pasosTotal || p.pasosHechos} pasos del procedimiento con ${p.evidencias} evidencia(s)${p.pbcRecibidos ? ` y ${p.pbcRecibidos} documento(s) recibidos del cliente` : ''}.`,
    hs.length
      ? `Se identificaron ${hs.length} hallazgo(s): ${hs.map((h) => h.descripcion.split(/[.(]/)[0].trim()).join('; ')}. ${abiertos.length ? `${abiertos.length} siguen abiertos y se evalúan frente a la materialidad para determinar si constituyen incorrecciones a ajustar o deficiencias a comunicar.` : 'Todos quedaron resueltos.'}`
      : `No se identificaron incorrecciones ni deficiencias de control en ${nombre}.`,
    altaAbierta
      ? `Con base en los procedimientos aplicados, no es posible concluir sobre la razonabilidad de los saldos de ${nombre} hasta resolver los hallazgos de severidad alta.`
      : `Con base en los procedimientos aplicados, los saldos de ${nombre} al cierre del período son razonables en todos los aspectos materiales.`,
  ]
  const descripcion = partes.join(' ')

  const previas = await db.select({ codigo: propuestasAgente.codigo, id: propuestasAgente.id, contenido: propuestasAgente.contenido, estado: propuestasAgente.estado }).from(propuestasAgente).where(eq(propuestasAgente.auditoriaId, auditoriaId))
  let n = 0
  for (const x of previas) { const m = /^CL-(\d+)$/.exec(x.codigo ?? ''); if (m) n = Math.max(n, Number(m[1])) }
  const abiertasMismoPapel = previas.filter((x) => x.estado === 'propuesta' && (x.contenido as ContenidoPropuesta & { papelId?: string }).papelId === papelId).map((x) => x.id)
  if (abiertasMismoPapel.length) await db.update(propuestasAgente).set({ estado: 'descartada', motivoDecision: 'Reemplazada por una conclusión nueva', decididaAt: new Date() }).where(inArray(propuestasAgente.id, abiertasMismoPapel))

  const [prop] = await db.insert(propuestasAgente).values({
    auditoriaId, paso: 'papeles', tipo: 'juicio', codigo: `CL-${String(n + 1).padStart(2, '0')}`,
    titulo: `Conclusión de ${papel.indice} · ${papel.titulo}`,
    cuentaCodigo: null, monto: null, severidad: altaAbierta ? 'alta' : abiertos.length ? 'media' : null, certeza: p.evidencias > 0 ? 'verificado' : 'requiere_evidencia',
    reglas: ['NIA 500'],
    datos: [
      { etiqueta: 'Papel', valor: papel.indice }, { etiqueta: 'Pasos', valor: `${p.pasosHechos}/${p.pasosTotal}` },
      { etiqueta: 'Evidencias', valor: String(p.evidencias) }, { etiqueta: 'Hallazgos', valor: `${hs.length} (${abiertos.length} abiertos)` },
    ],
    contenido: {
      descripcion, destino: 'conclusion', papelId,
      norma: 'NIA 500 · NIA 230. La conclusión debe sustentarse en la evidencia obtenida y quedar documentada en el papel.',
      para: 'Al confirmar queda como conclusión del papel de trabajo; puedes ajustar el texto antes.',
      opciones: [{ clave: 'confirmar', label: 'Confirmar conclusión' }],
    },
    orden: 0,
  }).returning({ id: propuestasAgente.id, codigo: propuestasAgente.codigo })
  const lineas = [
    { tipo: 'lectura' as const, texto: `Leí ${papel.indice}: ${p.pasosHechos} de ${p.pasosTotal} pasos marcados, ${p.evidencias} evidencia(s), ${hs.length} hallazgo(s).`, referencia: { norma: 'NIA 230' } },
    { tipo: 'clasificacion' as const, texto: altaAbierta ? 'Hay hallazgos de severidad alta abiertos: la conclusión queda condicionada.' : abiertos.length ? 'Hay hallazgos abiertos de severidad media o baja: concluyo razonable y los dejo para evaluar frente a la materialidad.' : 'Sin hallazgos abiertos: concluyo razonable.', referencia: { norma: 'NIA 450' } },
    { tipo: 'clasificacion' as const, texto: p.evidencias > 0 ? 'Con evidencia en el papel, la conclusión queda como verificada.' : 'Sin evidencia adjunta: la conclusión requiere evidencia antes de aprobar el papel.', referencia: { norma: 'NIA 500' } },
  ]
  let k = 0
  for (const l of lineas) { k++; await db.insert(bitacoraAgente).values({ auditoriaId, propuestaId: prop.id, numero: k, tipo: l.tipo, texto: l.texto, referencia: l.referencia, actor: 'agente' }) }
  registrarEvento(user, { accion: 'agente.conclusion_propuesta', entidad: 'propuesta_agente', entidadId: prop.id, auditoriaId, actor: 'agente', detalle: { papelId, indice: papel.indice, codigo: prop.codigo } })
  return { propuestaId: prop.id, codigo: prop.codigo }
}
