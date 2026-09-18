/**
 * Corrida de "Identificación de riesgos" sobre un encargo: carga lo que ya existe
 * (hallazgos aprobados del balance, entendimiento, COSO, riesgos de la matriz,
 * catálogo del sector), ejecuta la lógica pura de @auditorya/types (0 tokens) y
 * persiste corrida + propuestas tipo 'riesgo' + bitácora. Las propuestas abiertas
 * de una corrida anterior se marcan descartadas ("reemplazada"); las decididas no se tocan.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  auditorias, empresas, materialidades, entendimientoPeriodo, controlesCoso, riesgos,
  corridasAgente, propuestasAgente, bitacoraAgente,
} from '../../db/schema'
import { correrIdentificacionRiesgos, huellaRiesgo, type EntradaCorridaRiesgos, type PropuestaBorrador, type ContenidoPropuesta } from '@auditorya/types'
import { sugerirRiesgos } from '../ia'
import { controlPorAreaDe } from './corrida-control-interno'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

export const PROCEDIMIENTO_RIESGOS = 'riesgos'

export async function correrIdentificacionRiesgosEncargo(auditoriaId: string, user: Pick<JwtPayload, 'sub' | 'firmaId'>) {
  const [row] = await db
    .select({ sector: empresas.sector })
    .from(auditorias).innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
    .where(eq(auditorias.id, auditoriaId))
  if (!row) throw new Error('Auditoría no encontrada')

  // Continuidad entre corridas: los códigos R- no se repiten y lo ya decidido por una persona no se vuelve a proponer.
  const previas = await db.select().from(propuestasAgente).where(eq(propuestasAgente.auditoriaId, auditoriaId))
  let numeracionR = 0
  const huellasDecididas: string[] = []
  for (const p of previas) {
    const m = /^R-(\d+)$/.exec(p.codigo ?? '')
    if (m) numeracionR = Math.max(numeracionR, Number(m[1]))
    const r = (p.contenido as ContenidoPropuesta).riesgo
    if (p.tipo === 'riesgo' && r && p.decididaPor && p.estado !== 'omitida') huellasDecididas.push(huellaRiesgo(r))
  }
  const hallazgosBalance = previas.filter((p) => p.tipo === 'hallazgo' && p.paso === 'balance')
  const hallazgos: EntradaCorridaRiesgos['hallazgos'] = hallazgosBalance
    .filter((p) => p.estado === 'aprobada' || p.estado === 'ajustada')
    .map((p) => ({
      codigo: p.codigo, titulo: p.titulo, cuentaCodigo: p.cuentaCodigo, monto: p.monto == null ? null : Number(p.monto),
      severidad: p.severidad, certeza: p.certeza, reglas: p.reglas, estado: p.estado as 'aprobada' | 'ajustada',
    }))
  const hallazgosPendientes = hallazgosBalance.filter((p) => p.estado === 'propuesta' || p.estado === 'omitida').length

  const [corrida] = await db
    .insert(corridasAgente)
    .values({ auditoriaId, procedimiento: PROCEDIMIENTO_RIESGOS, estado: 'corriendo', intentos: 1, iniciadaPor: user.sub, iniciadaAt: new Date() })
    .returning()

  try {
    const [[ent], coso, existentes, [mat], controlPorArea] = await Promise.all([
      db.select().from(entendimientoPeriodo).where(eq(entendimientoPeriodo.auditoriaId, auditoriaId)),
      db.select({ componente: controlesCoso.componente, calificacion: controlesCoso.calificacion }).from(controlesCoso).where(eq(controlesCoso.auditoriaId, auditoriaId)),
      db.select({ area: riesgos.area, descripcion: riesgos.descripcion, origen: riesgos.origen }).from(riesgos).where(eq(riesgos.auditoriaId, auditoriaId)),
      db.select().from(materialidades).where(eq(materialidades.auditoriaId, auditoriaId)),
      controlPorAreaDe(auditoriaId),
    ])
    const entrada: EntradaCorridaRiesgos = {
      controlPorArea,
      sector: row.sector,
      hallazgos, hallazgosPendientes,
      catalogoSector: sugerirRiesgos(row.sector),
      entendimiento: ent ? { cambiosSignificativos: ent.cambiosSignificativos, sinCambios: ent.sinCambios, confirmado: ent.confirmado } : null,
      coso, riesgosExistentes: existentes,
      materialidad: mat ? { monto: Number(mat.materialidad), aprobada: mat.aprobada } : null,
      numeracion: { R: numeracionR }, huellasDecididas,
    }
    const resultado = correrIdentificacionRiesgos(entrada)

    // Las propuestas abiertas de la corrida anterior que salen idénticas se conservan (mismo código,
    // misma tarjeta); solo se reemplazan las que cambiaron o ya no aplican.
    const abiertas = previas.filter((p) => p.tipo === 'riesgo' && (p.estado === 'propuesta' || p.estado === 'omitida'))
    const conservadas = new Set<string>()
    const nuevas: PropuestaBorrador[] = []
    for (const p of resultado.propuestas) {
      const r = (p.contenido as ContenidoPropuesta).riesgo
      // Comparación campo a campo: jsonb reordena las claves, así que JSON.stringify no sirve.
      const igual = r && abiertas.find((a) => {
        const ar = (a.contenido as ContenidoPropuesta).riesgo
        return ar && !conservadas.has(a.id) && huellaRiesgo(ar) === huellaRiesgo(r)
          && ar.riesgoInherente === r.riesgoInherente && ar.riesgoControl === r.riesgoControl && ar.riesgoCombinado === r.riesgoCombinado
          && ar.respuestaPlaneada === r.respuestaPlaneada && ar.fuente.codigos.join(',') === r.fuente.codigos.join(',')
          && a.titulo === p.titulo && (a.contenido as ContenidoPropuesta).descripcion === (p.contenido as ContenidoPropuesta).descripcion
      })
      if (igual) conservadas.add(igual.id)
      else nuevas.push(p)
    }
    nuevas.forEach((p, i) => { p.codigo = `R-${String(numeracionR + i + 1).padStart(2, '0')}` })
    if (conservadas.size > 0) {
      resultado.bitacora.push({ tipo: 'contraste', texto: `Conservé ${conservadas.size} propuesta(s) que no cambiaron desde la vez anterior; ${nuevas.length} ${nuevas.length === 1 ? 'es nueva' : 'son nuevas'}.`, referencia: {} })
    }

    await db.transaction(async (tx) => {
      const anteriores = await tx
        .select({ id: corridasAgente.id }).from(corridasAgente)
        .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, PROCEDIMIENTO_RIESGOS)))
      const ids = anteriores.map((c) => c.id).filter((id) => id !== corrida.id)
      if (ids.length) {
        const reemplazar = abiertas.filter((a) => !conservadas.has(a.id)).map((a) => a.id)
        if (reemplazar.length) {
          await tx.update(propuestasAgente)
            .set({ estado: 'descartada', motivoDecision: 'Reemplazada por una propuesta nueva de riesgos', decididaAt: new Date() })
            .where(inArray(propuestasAgente.id, reemplazar))
        }
        // Las conservadas pasan a colgar de esta corrida para que "lo hecho" y el resumen las vean juntas.
        if (conservadas.size) await tx.update(propuestasAgente).set({ corridaId: corrida.id }).where(inArray(propuestasAgente.id, [...conservadas]))
      }

      let n = 0
      for (const l of resultado.bitacora) {
        n++
        await tx.insert(bitacoraAgente).values({ auditoriaId, corridaId: corrida.id, numero: n, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
      }

      const insertar = async (p: PropuestaBorrador) => {
        const [r] = await tx.insert(propuestasAgente).values({
          auditoriaId, corridaId: corrida.id, paso: p.paso, tipo: p.tipo, codigo: p.codigo, titulo: p.titulo,
          cuentaCodigo: p.cuentaCodigo, monto: p.monto != null ? p.monto.toFixed(2) : null,
          severidad: p.severidad, certeza: p.certeza, reglas: p.reglas, datos: p.datos, contenido: p.contenido as Record<string, unknown>,
          desbloqueaId: null, orden: p.orden,
        }).returning({ id: propuestasAgente.id })
        let k = 0
        for (const l of p.bitacora) {
          k++
          await tx.insert(bitacoraAgente).values({ auditoriaId, propuestaId: r.id, corridaId: corrida.id, numero: k, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
        }
      }
      for (const p of nuevas) await insertar(p)

      await tx.update(corridasAgente).set({
        estado: 'completada', terminadaAt: new Date(),
        parametros: { sector: row.sector, controlBase: resultado.resumen.controlBase, controlPorEntendimiento: resultado.resumen.controlPorEntendimiento, materialidad: entrada.materialidad },
        resultado: {
          riesgos: resultado.resumen.riesgos, nuevas: nuevas.length, conservadas: conservadas.size,
          porFuente: resultado.resumen.porFuente, areasCubiertas: resultado.resumen.areasCubiertas,
          hallazgosUsados: resultado.resumen.hallazgosUsados, hallazgosPendientes: resultado.resumen.hallazgosPendientes,
          hallazgosSinArea: resultado.resumen.hallazgosSinArea, limitaciones: resultado.resumen.limitaciones,
          reglasEjecutadas: ['R-01', 'R-02', 'R-03', 'R-10'],
        },
      }).where(eq(corridasAgente.id, corrida.id))
    })

    registrarEvento(user, {
      accion: 'agente.corrida_riesgos', entidad: 'corrida_agente', entidadId: corrida.id, auditoriaId, actor: 'agente',
      detalle: { propuestas: resultado.propuestas.length, hallazgosUsados: resultado.resumen.hallazgosUsados },
    })
    return { corridaId: corrida.id, propuestas: resultado.propuestas.length, nuevas: nuevas.length, conservadas: conservadas.size }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    await db.update(corridasAgente).set({ estado: 'error', error: mensaje.slice(0, 500), terminadaAt: new Date() }).where(eq(corridasAgente.id, corrida.id))
    console.error('[agente] corrida de riesgos falló', auditoriaId, mensaje)
    throw err
  }
}

/** ¿Existe ya una corrida de riesgos completada para el encargo? */
export async function hayCorridaRiesgos(auditoriaId: string): Promise<boolean> {
  const [c] = await db.select({ id: corridasAgente.id }).from(corridasAgente)
    .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, PROCEDIMIENTO_RIESGOS), eq(corridasAgente.estado, 'completada')))
    .limit(1)
  return !!c
}
