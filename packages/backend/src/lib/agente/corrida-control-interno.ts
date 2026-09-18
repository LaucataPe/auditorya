/**
 * Corrida de "Evaluación del control interno" sobre un encargo: lee las respuestas del
 * cuestionario pyme, los hallazgos aprobados del balance, el entendimiento, lo que ya
 * está guardado en controles_coso y la memoria de la empresa; ejecuta la lógica pura de
 * @auditorya/types (0 tokens) y persiste corrida + propuestas (juicio destino 'coso' y
 * documentos) + bitácora. Las propuestas abiertas de la corrida anterior se reemplazan;
 * las decididas no se tocan.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  auditorias, entendimientoPeriodo, controlesCoso, respuestasCosoAgente, memoriaEmpresaAgente,
  corridasAgente, propuestasAgente, bitacoraAgente,
} from '../../db/schema'
import {
  correrEvaluacionControlInterno, huellaCoso, riesgoControlPorArea,
  type EntradaCorridaControlInterno, type PropuestaBorrador, type ContenidoPropuesta, type RespuestaCosoRegistrada, type NivelRiesgo,
} from '@auditorya/types'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

export const PROCEDIMIENTO_CONTROL_INTERNO = 'control_interno'
export const MEMORIA_COSO = 'coso_respuestas'

export async function cargarRespuestasCoso(auditoriaId: string): Promise<RespuestaCosoRegistrada[]> {
  const rows = await db
    .select({ pregunta: respuestasCosoAgente.pregunta, respuesta: respuestasCosoAgente.respuesta, nota: respuestasCosoAgente.nota })
    .from(respuestasCosoAgente).where(eq(respuestasCosoAgente.auditoriaId, auditoriaId))
  return rows
}

/** Riesgo de control por área que aporta el cuestionario (para la corrida de riesgos). */
export async function controlPorAreaDe(auditoriaId: string): Promise<Record<string, NivelRiesgo>> {
  return riesgoControlPorArea(await cargarRespuestasCoso(auditoriaId))
}

export async function correrEvaluacionControlInternoEncargo(auditoriaId: string, user: Pick<JwtPayload, 'sub' | 'firmaId'>) {
  const [aud] = await db.select({ empresaId: auditorias.empresaId }).from(auditorias).where(eq(auditorias.id, auditoriaId))
  if (!aud) throw new Error('Auditoría no encontrada')

  const previas = await db.select().from(propuestasAgente).where(eq(propuestasAgente.auditoriaId, auditoriaId))
  const numeracion = { C: 0, D: 0 }
  const huellasDecididas: string[] = []
  for (const p of previas) {
    const m = /^([CD])-(\d+)$/.exec(p.codigo ?? '')
    if (m) numeracion[m[1] as 'C' | 'D'] = Math.max(numeracion[m[1] as 'C' | 'D'], Number(m[2]))
    const coso = (p.contenido as ContenidoPropuesta).coso
    if (coso && p.decididaPor && p.estado !== 'omitida') huellasDecididas.push(huellaCoso(coso.componente))
  }
  const hallazgos = previas
    .filter((p) => p.tipo === 'hallazgo' && p.paso === 'balance' && (p.estado === 'aprobada' || p.estado === 'ajustada'))
    .map((p) => ({ codigo: p.codigo, titulo: p.titulo, cuentaCodigo: p.cuentaCodigo, reglas: p.reglas, severidad: p.severidad }))

  const [corrida] = await db
    .insert(corridasAgente)
    .values({ auditoriaId, procedimiento: PROCEDIMIENTO_CONTROL_INTERNO, estado: 'corriendo', intentos: 1, iniciadaPor: user.sub, iniciadaAt: new Date() })
    .returning()

  try {
    const [respuestas, [ent], existentes, [memoria]] = await Promise.all([
      cargarRespuestasCoso(auditoriaId),
      db.select().from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, auditoriaId)),
      db.select({ componente: controlesCoso.componente, calificacion: controlesCoso.calificacion }).from(controlesCoso).where(eq(controlesCoso.auditoriaId, auditoriaId)),
      db.select().from(memoriaEmpresaAgente).where(and(eq(memoriaEmpresaAgente.empresaId, aud.empresaId), eq(memoriaEmpresaAgente.clave, MEMORIA_COSO))),
    ])
    const memoriaPrevia = memoria && (memoria.valor as { auditoriaId?: string }).auditoriaId !== auditoriaId
      ? ((memoria.valor as { respuestas?: RespuestaCosoRegistrada[] }).respuestas ?? null)
      : null
    const entrada: EntradaCorridaControlInterno = {
      respuestas, hallazgos,
      entendimiento: ent ? { cambiosSignificativos: ent.cambiosSignificativos, confirmado: ent.confirmado } : null,
      existentes, memoria: memoriaPrevia, numeracion, huellasDecididas,
    }
    const resultado = correrEvaluacionControlInterno(entrada)

    await db.transaction(async (tx) => {
      const anteriores = await tx
        .select({ id: corridasAgente.id }).from(corridasAgente)
        .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, PROCEDIMIENTO_CONTROL_INTERNO)))
      const ids = anteriores.map((c) => c.id).filter((id) => id !== corrida.id)
      if (ids.length) {
        await tx.update(propuestasAgente)
          .set({ estado: 'descartada', motivoDecision: 'Reemplazada por una evaluación nueva del control interno', decididaAt: new Date() })
          .where(and(inArray(propuestasAgente.corridaId, ids), inArray(propuestasAgente.estado, ['propuesta', 'omitida'])))
      }

      let n = 0
      for (const l of resultado.bitacora) {
        n++
        await tx.insert(bitacoraAgente).values({ auditoriaId, corridaId: corrida.id, numero: n, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
      }

      const idPorClave = new Map<string, string>()
      const insertar = async (p: PropuestaBorrador) => {
        const [r] = await tx.insert(propuestasAgente).values({
          auditoriaId, corridaId: corrida.id, paso: p.paso, tipo: p.tipo, codigo: p.codigo, titulo: p.titulo,
          cuentaCodigo: p.cuentaCodigo, monto: null, severidad: p.severidad, certeza: p.certeza, reglas: p.reglas, datos: p.datos,
          contenido: p.contenido as Record<string, unknown>,
          desbloqueaId: p.desbloqueaClave ? idPorClave.get(p.desbloqueaClave) ?? null : null, orden: p.orden,
        }).returning({ id: propuestasAgente.id })
        idPorClave.set(p.clave, r.id)
        let k = 0
        for (const l of p.bitacora) {
          k++
          await tx.insert(bitacoraAgente).values({ auditoriaId, propuestaId: r.id, corridaId: corrida.id, numero: k, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
        }
      }
      for (const p of resultado.propuestas.filter((x) => !x.desbloqueaClave)) await insertar(p)
      for (const p of resultado.propuestas.filter((x) => x.desbloqueaClave)) await insertar(p)

      await tx.update(corridasAgente).set({
        estado: 'completada', terminadaAt: new Date(),
        parametros: { respondidas: resultado.resumen.respondidas, total: resultado.resumen.total, memoria: !!memoriaPrevia },
        resultado: {
          componentes: resultado.resumen.componentes, porCalificacion: resultado.resumen.porCalificacion,
          deficiencias: resultado.deficiencias, controlPorArea: resultado.controlPorArea,
          sinResponder: resultado.resumen.sinResponder, limitaciones: resultado.resumen.limitaciones,
          documentos: resultado.propuestas.filter((p) => p.tipo === 'documento').length,
          reglasEjecutadas: ['CI-01', 'CI-02', 'CI-03', 'CI-04', 'CI-05', 'CI-06', 'CI-07', 'CI-10'],
        },
      }).where(eq(corridasAgente.id, corrida.id))
    })

    registrarEvento(user, {
      accion: 'agente.corrida_control_interno', entidad: 'corrida_agente', entidadId: corrida.id, auditoriaId, actor: 'agente',
      detalle: { componentes: resultado.resumen.componentes, deficiencias: resultado.deficiencias.length },
    })
    return { corridaId: corrida.id, propuestas: resultado.propuestas.length, componentes: resultado.resumen.componentes, deficiencias: resultado.deficiencias.length }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    await db.update(corridasAgente).set({ estado: 'error', error: mensaje.slice(0, 500), terminadaAt: new Date() }).where(eq(corridasAgente.id, corrida.id))
    console.error('[agente] corrida de control interno falló', auditoriaId, mensaje)
    throw err
  }
}
