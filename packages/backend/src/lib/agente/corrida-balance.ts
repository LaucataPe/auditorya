/**
 * Corrida del procedimiento de balance sobre un encargo: carga los datos que ya
 * existen (cuentas_balance, comparativo, materialidad), ejecuta la lógica pura de
 * @auditorya/types (0 tokens) y persiste corrida + propuestas + bitácora.
 * Las propuestas pendientes de una corrida anterior del mismo procedimiento se
 * marcan como descartadas ("reemplazada"); las ya decididas no se tocan.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../../db/client'
import {
  cuentasBalance, cuentasBalanceComparativo, balanceArchivos, balanceMeta, materialidades,
  corridasAgente, propuestasAgente, bitacoraAgente,
} from '../../db/schema'
import { correrValidacionBalance, huellaPropuesta, type EntradaCorridaBalance, type PropuestaBorrador } from '@auditorya/types'
import { registrarEvento } from '../eventos'
import type { JwtPayload } from '../jwt'

const MAX_INTENTOS = 3

export async function correrProcedimientoBalance(auditoriaId: string, user: Pick<JwtPayload, 'sub' | 'firmaId'>) {
  const [hayBalance] = await db.select({ id: cuentasBalance.id }).from(cuentasBalance).where(eq(cuentasBalance.auditoriaId, auditoriaId)).limit(1)
  if (!hayBalance) throw new Error('El encargo no tiene balance de prueba cargado')

  // Continuidad entre corridas: los códigos no se repiten y lo ya decidido por una persona no se vuelve a proponer.
  const previas = await db
    .select({ tipo: propuestasAgente.tipo, reglas: propuestasAgente.reglas, cuentaCodigo: propuestasAgente.cuentaCodigo, codigo: propuestasAgente.codigo, decididaPor: propuestasAgente.decididaPor, estado: propuestasAgente.estado })
    .from(propuestasAgente)
    .where(eq(propuestasAgente.auditoriaId, auditoriaId))
  const numeracion = { H: 0, D: 0, A: 0 }
  for (const p of previas) {
    const m = /^([HDA])-(\d+)$/.exec(p.codigo ?? '')
    if (m) numeracion[m[1] as 'H' | 'D' | 'A'] = Math.max(numeracion[m[1] as 'H' | 'D' | 'A'], Number(m[2]))
  }
  // Omitir no es decidir: una propuesta omitida se vuelve a proponer en la corrida siguiente.
  const huellasDecididas = previas.filter((p) => p.decididaPor && p.estado !== 'omitida').map((p) => huellaPropuesta({ tipo: p.tipo, reglas: p.reglas, cuentaCodigo: p.cuentaCodigo }))

  const [corrida] = await db
    .insert(corridasAgente)
    .values({ auditoriaId, procedimiento: 'balance', estado: 'corriendo', intentos: 1, iniciadaPor: user.sub, iniciadaAt: new Date() })
    .returning()

  try {
    const entrada = await cargarEntrada(auditoriaId)
    const resultado = correrValidacionBalance({ ...entrada, numeracion, huellasDecididas })

    await db.transaction(async (tx) => {
      // Reemplaza las propuestas aún abiertas de corridas anteriores de este procedimiento.
      const anteriores = await tx
        .select({ id: corridasAgente.id })
        .from(corridasAgente)
        .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, 'balance')))
      const ids = anteriores.map((c) => c.id).filter((id) => id !== corrida.id)
      if (ids.length) {
        await tx
          .update(propuestasAgente)
          .set({ estado: 'descartada', motivoDecision: 'Reemplazada por una corrida nueva del balance', decididaAt: new Date() })
          .where(and(inArray(propuestasAgente.corridaId, ids), inArray(propuestasAgente.estado, ['propuesta', 'omitida'])))
      }

      // Bitácora de la corrida.
      let n = 0
      for (const l of resultado.bitacora) {
        n++
        await tx.insert(bitacoraAgente).values({ auditoriaId, corridaId: corrida.id, numero: n, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
      }

      // Propuestas: primero las que no desbloquean nada, luego las que apuntan a otra.
      const idPorClave = new Map<string, string>()
      const insertar = async (p: PropuestaBorrador) => {
        const [row] = await tx
          .insert(propuestasAgente)
          .values({
            auditoriaId, corridaId: corrida.id, paso: p.paso, tipo: p.tipo, codigo: p.codigo, titulo: p.titulo,
            cuentaCodigo: p.cuentaCodigo, monto: p.monto != null ? p.monto.toFixed(2) : null,
            severidad: p.severidad, certeza: p.certeza, reglas: p.reglas, datos: p.datos, contenido: p.contenido as Record<string, unknown>,
            desbloqueaId: p.desbloqueaClave ? idPorClave.get(p.desbloqueaClave) ?? null : null, orden: p.orden,
          })
          .returning({ id: propuestasAgente.id })
        idPorClave.set(p.clave, row.id)
        let k = 0
        for (const l of p.bitacora) {
          k++
          await tx.insert(bitacoraAgente).values({ auditoriaId, propuestaId: row.id, corridaId: corrida.id, numero: k, tipo: l.tipo, texto: l.texto, referencia: l.referencia ?? null, actor: 'agente' })
        }
      }
      for (const p of resultado.propuestas.filter((x) => !x.desbloqueaClave)) await insertar(p)
      for (const p of resultado.propuestas.filter((x) => x.desbloqueaClave)) await insertar(p)

      await tx
        .update(corridasAgente)
        .set({
          estado: 'completada', terminadaAt: new Date(),
          archivoNombre: entrada.archivoNombre, filas: resultado.resumen.filas, filasHoja: resultado.resumen.filasHoja, filasResumen: resultado.resumen.filasResumen,
          parametros: { materialidad: resultado.resumen.materialidad, convencion: resultado.resumen.convencion, periodo: entrada.periodo },
          resultado: {
            hallazgos: resultado.propuestas.filter((p) => p.tipo === 'hallazgo').length,
            documentos: resultado.propuestas.filter((p) => p.tipo === 'documento').length,
            reglasEjecutadas: resultado.resumen.reglasEjecutadas, limitaciones: resultado.resumen.limitaciones,
            triviales: resultado.resumen.triviales, recortadas: resultado.resumen.recortadas, terceros: resultado.resumen.terceros,
          },
        })
        .where(eq(corridasAgente.id, corrida.id))
    })

    registrarEvento(user, {
      accion: 'agente.corrida_balance', entidad: 'corrida_agente', entidadId: corrida.id, auditoriaId, actor: 'agente',
      detalle: { propuestas: resultado.propuestas.length, reglas: resultado.resumen.reglasEjecutadas.length },
    })
    return { corridaId: corrida.id, propuestas: resultado.propuestas.length }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    await db.update(corridasAgente).set({ estado: 'error', error: mensaje.slice(0, 500), terminadaAt: new Date() }).where(eq(corridasAgente.id, corrida.id))
    console.error('[agente] corrida de balance falló', auditoriaId, mensaje)
    throw err
  }
}

/** ¿Hay una corrida en curso o ya agotó los reintentos? (para no encolar de más). */
export async function intentosAgotados(auditoriaId: string): Promise<boolean> {
  const rows = await db
    .select({ estado: corridasAgente.estado })
    .from(corridasAgente)
    .where(and(eq(corridasAgente.auditoriaId, auditoriaId), eq(corridasAgente.procedimiento, 'balance')))
    .orderBy(corridasAgente.createdAt)
  const ultimas = rows.slice(-MAX_INTENTOS)
  return ultimas.length === MAX_INTENTOS && ultimas.every((r) => r.estado === 'error')
}

async function cargarEntrada(auditoriaId: string): Promise<EntradaCorridaBalance> {
  const filas = await db
    .select({
      codigo: cuentasBalance.codigo, nombre: cuentasBalance.nombre, nivel: cuentasBalance.nivel, tercero: cuentasBalance.tercero,
      terceroNombre: cuentasBalance.terceroNombre, saldoActual: cuentasBalance.saldoActual, saldoInicial: cuentasBalance.saldoInicial,
      debito: cuentasBalance.debito, credito: cuentasBalance.credito,
    })
    .from(cuentasBalance)
    .where(eq(cuentasBalance.auditoriaId, auditoriaId))
    .orderBy(cuentasBalance.codigo)
  if (filas.length === 0) throw new Error('El encargo no tiene balance de prueba cargado')

  const comparativo = await db
    .select({ codigo: cuentasBalanceComparativo.codigo, saldo: cuentasBalanceComparativo.saldo })
    .from(cuentasBalanceComparativo)
    .where(eq(cuentasBalanceComparativo.auditoriaId, auditoriaId))
  const [mat] = await db.select().from(materialidades).where(eq(materialidades.auditoriaId, auditoriaId))
  const [archivo] = await db.select({ nombre: balanceArchivos.nombre }).from(balanceArchivos).where(eq(balanceArchivos.auditoriaId, auditoriaId))
  const [meta] = await db.select().from(balanceMeta).where(eq(balanceMeta.auditoriaId, auditoriaId))

  const resumen = filas.filter((f) => !f.tercero)
  const clase = (d: string) => { const f = resumen.find((x) => x.codigo === d); return f ? Math.abs(Number(f.saldoActual)) : null }
  const cod = (c: string) => { const f = resumen.find((x) => x.codigo === c); return f ? Math.abs(Number(f.saldoActual)) : 0 }
  const ingresos = clase('4')
  const uai = ingresos !== null ? ingresos - (clase('5') ?? 0) - (clase('6') ?? 0) - (clase('7') ?? 0) + cod('54') : null

  return {
    archivoNombre: archivo?.nombre ?? null,
    filas: filas.map((f) => ({
      codigo: f.codigo, nombre: f.nombre, nivel: f.nivel, tercero: f.tercero, terceroNombre: f.terceroNombre,
      saldoActual: Number(f.saldoActual), saldoInicial: Number(f.saldoInicial),
      debito: f.debito == null ? null : Number(f.debito), credito: f.credito == null ? null : Number(f.credito),
    })),
    comparativo: comparativo.map((c) => ({ codigo: c.codigo, saldo: Number(c.saldo) })),
    materialidad: mat ? { monto: Number(mat.materialidad), desempeno: Number(mat.materialidadDesempeno || mat.materialidad), aprobada: mat.aprobada } : null,
    bases: { activos: clase('1'), ingresos, utilidad_antes_impuestos: uai, patrimonio: clase('3') },
    periodo: { desde: meta?.corteDesde ?? null, hasta: meta?.corteHasta ?? null },
  }
}
