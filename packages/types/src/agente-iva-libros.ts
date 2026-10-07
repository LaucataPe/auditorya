/**
 * Auxiliar contable → columna "Según libros" del Formulario 300
 * (CIFRAS_CATALOGO.iva). Determinista, a cero tokens: clasifica cada cuenta
 * del resumen del período por prefijo PUC y por el nombre de la subcuenta, y
 * suma su neto en el renglón digitable que corresponde. Lo que no se puede
 * separar por subcuenta (ingresos sin tarifa en el nombre) va solo al total de
 * la sección, para compararlo contra el total declarado sin persistirlo.
 *
 * Lo aprendido con la usuaria (mapeo de subcuentas, tipo de comprobante de
 * cierre) llega por `memoria` y prevalece sobre las heurísticas.
 */
import type { ResumenAuxiliarPeriodo, ResumenCuentaAuxiliar } from './parse-auxiliar'

/** Renglones digitables del 300 a los que puede llegar una cuenta. */
export type RenglonLibrosIva =
  | 'iva-ing-19' | 'iva-ing-5' | 'iva-ing-exportaciones' | 'iva-ing-exentos' | 'iva-ing-excluidos'
  | 'iva-ing-no-gravadas' | 'iva-ing-otras' | 'iva-ing-devoluciones'
  | 'iva-gen-19' | 'iva-gen-5' | 'iva-gen-otros' | 'iva-gen-recuperado'
  | 'iva-desc-compras' | 'iva-desc-servicios' | 'iva-desc-otros' | 'iva-desc-devoluciones' | 'iva-desc-ajustes'
  | 'iva-retenido'

/** Lado natural del movimiento del período por renglón: qué se suma como positivo. */
const LADO: Record<RenglonLibrosIva, 'credito' | 'debito'> = {
  'iva-ing-19': 'credito', 'iva-ing-5': 'credito', 'iva-ing-exportaciones': 'credito', 'iva-ing-exentos': 'credito',
  'iva-ing-excluidos': 'credito', 'iva-ing-no-gravadas': 'credito', 'iva-ing-otras': 'credito',
  'iva-ing-devoluciones': 'debito',
  'iva-gen-19': 'credito', 'iva-gen-5': 'credito', 'iva-gen-otros': 'credito', 'iva-gen-recuperado': 'credito',
  'iva-desc-compras': 'debito', 'iva-desc-servicios': 'debito', 'iva-desc-otros': 'debito',
  'iva-desc-devoluciones': 'debito', 'iva-desc-ajustes': 'credito',
  'iva-retenido': 'debito',
}

export type CuentaMapeada = {
  cuenta: string
  nombre: string | null
  /** Renglón digitable; null = la cuenta suma solo en un total o se ignora. */
  destino: RenglonLibrosIva | null
  /** Total calculado al que suma cuando no hay renglón digitable ('iva-ing-brutos'). */
  total: 'iva-ing-brutos' | null
  /** Neto del período en el lado natural del destino. */
  neto: number
  /** Cómo se decidió: 'memoria', 'nombre', 'prefijo', 'ignorada'. */
  regla: 'memoria' | 'nombre' | 'prefijo' | 'ignorada'
  motivo: string
}

export type MapeoLibrosIva = {
  /** Valores para la columna libros de los renglones digitables (redondeados a pesos). */
  cifras: Record<string, { libros: number }>
  /** Totales de sección que solo se pueden comparar en agregado. */
  totales: Partial<Record<'iva-ing-brutos', number>>
  cuentas: CuentaMapeada[]
  /** Subcuentas de IVA que no se supieron clasificar: ítem de ambigüedad para la usuaria. */
  sinClasificar: ResumenCuentaAuxiliar[]
  bitacora: string[]
}

const norm = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tarifa que insinúa el nombre de la subcuenta: "19%", "5 %", "TARIFA GENERAL". */
function tarifaDelNombre(nombre: string): 19 | 5 | null {
  const n = norm(nombre)
  if (/(^|\D)5\s*%|tarifa\s*5|al\s*5\b/.test(n)) return 5
  if (/19\s*%|(^|\D)19(\D|$)|general/.test(n)) return 19
  return null
}

/** Clasificación de una subcuenta de 2408 por su nombre. null = no se sabe. */
export function clasificarSubcuentaIva(nombre: string | null): RenglonLibrosIva | 'saldo' | null {
  const n = norm(nombre)
  if (!n) return null
  if (/por pagar|a favor|saldo|transitori|cuenta corriente|regimen simpl/.test(n)) return 'saldo'
  const devolucion = /\bdev|devol|anulad|reintegr/.test(n)
  const descontable = /descont|desc\.|desc\s|descuento|compras|servicios|importac/.test(n)
  const generado = /generad|ventas|facturad|ingres/.test(n)
  if (devolucion && descontable) return 'iva-gen-recuperado' // c66: IVA recuperado en devoluciones en compras
  if (devolucion && generado) return 'iva-desc-devoluciones' // c79: IVA resultante por devoluciones en ventas
  if (/ajuste|perdida|hurto|castigo/.test(n) && descontable) return 'iva-desc-ajustes'
  if (generado && !descontable) {
    const t = tarifaDelNombre(n)
    return t === 5 ? 'iva-gen-5' : t === 19 ? 'iva-gen-19' : 'iva-gen-otros'
  }
  if (descontable) {
    if (/servic|honorar|arrend/.test(n)) return 'iva-desc-servicios'
    if (/compra|bien|import|activo/.test(n)) return 'iva-desc-compras'
    return 'iva-desc-otros'
  }
  return null
}

/** Clasificación de una cuenta de ingresos (41/42) por su nombre; null = solo al total. */
export function clasificarIngreso(nombre: string | null): RenglonLibrosIva | null {
  const n = norm(nombre)
  if (!n) return null
  if (/exclu/.test(n)) return 'iva-ing-excluidos'
  if (/exent/.test(n)) return 'iva-ing-exentos'
  if (/export/.test(n)) return 'iva-ing-exportaciones'
  if (/no gravad/.test(n)) return 'iva-ing-no-gravadas'
  const t = tarifaDelNombre(n)
  if (t === 5) return 'iva-ing-5'
  if (t === 19 || /gravad/.test(n)) return 'iva-ing-19'
  return null
}

function neto(c: ResumenCuentaAuxiliar, lado: 'credito' | 'debito'): number {
  return lado === 'credito' ? c.creditos - c.debitos : c.debitos - c.creditos
}

export function mapearAuxiliarACifrasIva(
  resumen: Pick<ResumenAuxiliarPeriodo, 'cuentas'>,
  memoria: { mapeo?: Record<string, RenglonLibrosIva | 'ignorar'> } = {},
): MapeoLibrosIva {
  const suma = new Map<RenglonLibrosIva, number>()
  const totales: MapeoLibrosIva['totales'] = {}
  const cuentas: CuentaMapeada[] = []
  const sinClasificar: ResumenCuentaAuxiliar[] = []
  const bitacora: string[] = []
  let ignoradas = 0

  const asignar = (c: ResumenCuentaAuxiliar, destino: RenglonLibrosIva, regla: CuentaMapeada['regla'], motivo: string) => {
    const n = neto(c, LADO[destino])
    suma.set(destino, (suma.get(destino) ?? 0) + n)
    cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino, total: null, neto: n, regla, motivo })
  }

  for (const c of resumen.cuentas) {
    const propio = memoria.mapeo?.[c.cuenta]
    if (propio === 'ignorar') {
      cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino: null, total: null, neto: 0, regla: 'memoria', motivo: 'Marcada como "no es IVA del período" por la firma.' })
      continue
    }
    if (propio) {
      asignar(c, propio, 'memoria', 'Mapeo guardado por la firma para esta empresa.')
      continue
    }

    if (c.cuenta.startsWith('2408')) {
      const clase = clasificarSubcuentaIva(c.nombre)
      if (clase === 'saldo') {
        cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino: null, total: null, neto: 0, regla: 'ignorada', motivo: 'Subcuenta de saldo (IVA por pagar / a favor): no es movimiento del período.' })
      } else if (clase) {
        asignar(c, clase, 'nombre', `Por el nombre "${c.nombre}".`)
      } else {
        sinClasificar.push(c)
        cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino: null, total: null, neto: 0, regla: 'ignorada', motivo: 'No se pudo clasificar por el nombre: requiere confirmación.' })
      }
      continue
    }

    if (c.cuenta.startsWith('4175')) {
      asignar(c, 'iva-ing-devoluciones', 'prefijo', 'Devoluciones en ventas (4175).')
      continue
    }
    if (c.cuenta.startsWith('41') || c.cuenta.startsWith('42')) {
      const ingreso = c.creditos - c.debitos
      totales['iva-ing-brutos'] = (totales['iva-ing-brutos'] ?? 0) + ingreso
      const clase = clasificarIngreso(c.nombre)
      if (clase) asignar(c, clase, 'nombre', `Ingreso clasificado por el nombre "${c.nombre}"; suma también al total de ingresos brutos.`)
      else cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino: null, total: 'iva-ing-brutos', neto: ingreso, regla: 'prefijo', motivo: 'Ingreso sin tarifa en el nombre: solo suma al total de ingresos brutos.' })
      continue
    }
    if (c.cuenta.startsWith('1355')) {
      // "iva" como palabra: "BOLIVAR" o "PRIVADA" no son IVA.
      if (c.cuenta.startsWith('135517') || /\biva\b|impuesto a las ventas|ventas retenid/.test(norm(c.nombre))) {
        asignar(c, 'iva-retenido', c.cuenta.startsWith('135517') ? 'prefijo' : 'nombre', 'Retención de IVA que le practicaron (anticipo de impuestos).')
      } else {
        cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino: null, total: null, neto: 0, regla: 'ignorada', motivo: 'Otro anticipo de impuestos (no es retención de IVA).' })
      }
      continue
    }
    ignoradas++
  }

  const cifras: MapeoLibrosIva['cifras'] = {}
  for (const [id, v] of suma) cifras[id] = { libros: Math.round(v) }
  if (totales['iva-ing-brutos'] !== undefined) totales['iva-ing-brutos'] = Math.round(totales['iva-ing-brutos'])

  const mapeadas = cuentas.filter((c) => c.destino).length
  bitacora.push(`Mapeé ${mapeadas} cuenta(s) a ${Object.keys(cifras).length} renglón(es) de libros.`)
  if (totales['iva-ing-brutos'] !== undefined) bitacora.push(`Ingresos brutos según libros: ${totales['iva-ing-brutos'].toLocaleString('es-CO')} (clase 4 sin devoluciones).`)
  if (sinClasificar.length) bitacora.push(`${sinClasificar.length} subcuenta(s) de 2408 sin clasificar: ${sinClasificar.map((c) => `${c.cuenta} ${c.nombre ?? ''}`.trim()).join(' · ')}.`)
  if (ignoradas) bitacora.push(`${ignoradas} cuenta(s) fuera de 2408, 41/42 y 1355 no se usaron.`)

  return { cifras, totales, cuentas, sinClasificar, bitacora }
}
