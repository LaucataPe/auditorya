/**
 * Varios libros cargados para la misma revisión (un balance completo, un
 * auxiliar de 2365, otro balance solo de 2367…): se combinan sin sumar dos
 * veces una cuenta. Cada cuenta sale de UN solo archivo:
 *  1. Auxiliares por movimientos primero (traen asientos, terceros y base). Si
 *     dos auxiliares traen la misma cuenta, se usa el último cargado.
 *  2. Luego los balances: primero los que traen detalle por tercero, y entre
 *     iguales el último cargado.
 * Una cuenta ya tomada cubre también a sus subcuentas (236515 cubre a
 * 23651501). Si un balance trae una cuenta más general que otra ya tomada
 * (236515 frente a 23651501), solo entra lo que esa cuenta tiene de más, como
 * "(resto)". El detalle por tercero se toma del mismo archivo que la cuenta.
 */
import { resumirAuxiliarPeriodo, type MovimientoAuxiliar, type ResumenAuxiliarPeriodo, type ResumenCuentaAuxiliar } from './parse-auxiliar'
import type { SaldoTerceroPeriodo } from './parse-balance-periodo'

export type FuenteLibro = {
  nombre: string
  movimientos: MovimientoAuxiliar[]
  /** Cuentas hoja de un balance (débitos y créditos del período). */
  saldos: ResumenCuentaAuxiliar[]
  saldosTercero: SaldoTerceroPeriodo[]
}

export type LibrosCombinados = ResumenAuxiliarPeriodo & {
  /** Asientos que se usaron (sin los de un auxiliar repetido). */
  movimientosUsados: MovimientoAuxiliar[]
  /** Detalle por tercero de las cuentas que salieron de un balance. */
  saldosTercero: SaldoTerceroPeriodo[]
  /** De qué archivo salió cada cuenta. */
  origen: Record<string, string>
}

export function combinarFuentesLibro(
  fuentes: FuenteLibro[],
  rango: { desde: string; hasta: string },
  opts: { tiposDocCierre?: string[] } = {},
): LibrosCombinados {
  // 1. Auxiliares: por cuenta, el último archivo que la trae dentro del período.
  const dueno = new Map<string, number>()
  fuentes.forEach((f, i) => {
    for (const m of f.movimientos) if (m.fecha >= rango.desde && m.fecha <= rango.hasta) dueno.set(m.cuenta, i)
  })
  const movimientosUsados = fuentes.flatMap((f, i) => f.movimientos.filter((m) => dueno.get(m.cuenta) === i))
  const resumen = resumirAuxiliarPeriodo({ movimientos: movimientosUsados }, rango, opts)
  const repetidas = new Set<string>()
  fuentes.forEach((f, i) => { for (const m of f.movimientos) if (dueno.has(m.cuenta) && dueno.get(m.cuenta) !== i) repetidas.add(m.cuenta) })
  if (repetidas.size) resumen.bitacora.push(`${repetidas.size} cuenta(s) venían en más de un auxiliar: se usó el último cargado (${[...repetidas].slice(0, 5).join(', ')}${repetidas.size > 5 ? '…' : ''}).`)

  const origen: Record<string, string> = {}
  const tomadas = new Map<string, { debitos: number; creditos: number }>()
  for (const c of resumen.cuentas) {
    tomadas.set(c.cuenta, { debitos: c.debitos, creditos: c.creditos })
    origen[c.cuenta] = fuentes[dueno.get(c.cuenta) ?? 0]?.nombre ?? ''
  }

  // 2. Balances: con detalle por tercero primero; entre iguales, el último cargado.
  const balances = fuentes
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.saldos.length > 0)
    .sort((a, b) => Number(b.f.saldosTercero.length > 0) - Number(a.f.saldosTercero.length > 0) || b.i - a.i)
  const cubierta = (cuenta: string) => [...tomadas.keys()].some((k) => cuenta === k || cuenta.startsWith(k))
  const tercerosDe = new Map<number, SaldoTerceroPeriodo[]>()
  for (const { f, i } of balances) {
    let usadas = 0
    let omitidas = 0
    let restos = 0
    const propias: string[] = []
    for (const c of f.saldos) {
      if (cubierta(c.cuenta)) { omitidas++; continue }
      const masFinas = [...tomadas.entries()].filter(([k]) => k.startsWith(c.cuenta) && k !== c.cuenta)
      if (masFinas.length) {
        const d = c.debitos - masFinas.reduce((s, [, v]) => s + v.debitos, 0)
        const h = c.creditos - masFinas.reduce((s, [, v]) => s + v.creditos, 0)
        if (Math.abs(d) > 1 || Math.abs(h) > 1) {
          resumen.cuentas.push({ ...c, nombre: `${c.nombre ?? c.cuenta} (resto)`, debitos: Math.max(d, 0), creditos: Math.max(h, 0) })
          restos++
        } else omitidas++
        tomadas.set(c.cuenta, { debitos: c.debitos, creditos: c.creditos })
        origen[c.cuenta] = f.nombre
        continue
      }
      resumen.cuentas.push(c)
      tomadas.set(c.cuenta, { debitos: c.debitos, creditos: c.creditos })
      origen[c.cuenta] = f.nombre
      propias.push(c.cuenta)
      usadas++
    }
    // El detalle por tercero viaja con su cuenta: solo el del archivo del que salió la cuenta.
    const deEste = f.saldosTercero.filter((t) => propias.some((k) => t.cuenta === k || t.cuenta.startsWith(k)))
    tercerosDe.set(i, deEste)
    if (fuentes.length > 1) {
      resumen.bitacora.push(`"${f.nombre}": ${usadas} cuenta(s) usadas${omitidas ? `; ${omitidas} ya venían en otro archivo y no se sumaron otra vez` : ''}${restos ? `; ${restos} solo por lo que traen de más que sus subcuentas ya tomadas` : ''}.`)
    }
  }
  resumen.cuentas.sort((x, y) => x.cuenta.localeCompare(y.cuenta))
  return { ...resumen, movimientosUsados, saldosTercero: [...tercerosDe.values()].flat(), origen }
}
