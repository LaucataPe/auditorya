/**
 * Libros → columna "Según libros" de la declaración de ICA (Formulario Único
 * Nacional) de UN municipio. Se lee del auxiliar o del balance de prueba del
 * período, cuenta por cuenta:
 *
 *  - Clase 4: los créditos de las cuentas de ingreso son el renglón 8 (todo el
 *    país). Si el nombre de la cuenta nombra OTRO municipio ("FUNZA PRODUCCION
 *    EXCLUIDOS"), ese ingreso va al renglón 9. Devoluciones, rebajas, descuentos
 *    y anulaciones (4175 o por el nombre) son el renglón 11; las ventas al
 *    exterior el 12, netas de sus propias devoluciones (así una anulación de
 *    exportación no se resta dos veces); la venta de activos fijos (4245) el 13.
 *  - Los ingresos no sujetos o exentos (renglones 14 y 15) no se reconocen por el
 *    nombre: los clasifica la firma una vez y quedan en la memoria (mapeoIca).
 *  - 135518 (ICA retenido): débitos = retenciones que le practicaron (renglón 27).
 *  - 2412 y el gasto de industria y comercio: el impuesto causado, para cruzar
 *    contra el impuesto a cargo.
 *
 * PENDIENTE DE VALIDAR POR LA FIRMA: exportaciones netas de sus devoluciones y
 * renglón 8 por créditos brutos (los débitos de las cuentas de ingreso se
 * muestran pero no se restan: pueden ser anulaciones o el cierre).
 */
import type { ResumenAuxiliarPeriodo, ResumenCuentaAuxiliar } from './parse-auxiliar'
import { municipioDeTexto, nombreMunicipio, normalizarMunicipio } from './municipios'

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export type ClaseCuentaIca =
  | 'ingreso' | 'fuera' | 'devolucion' | 'exportacion' | 'devolucion-exportacion' | 'activo-fijo' | 'no-sujeto' | 'exento'
  | 'retencion' | 'autorretencion' | 'anticipo' | 'causacion' | 'gasto' | 'ignorar'

/** Lo que la firma puede decidir sobre una cuenta de ingresos (memoria `mapeoIca`). */
export const OPCIONES_CUENTA_ICA = [
  { clave: 'no-sujeto', label: 'No sujeto, excluido o no gravado (renglón 14)' },
  { clave: 'exento', label: 'Exento por acuerdo municipal (renglón 15)' },
  { clave: 'gravado', label: 'Gravado: hace parte de la base' },
] as const

export const CLASE_CUENTA_ICA_LABEL: Record<ClaseCuentaIca, string> = {
  ingreso: 'Ingreso (renglón 8)',
  fuera: 'Ingreso de otro municipio (renglón 9)',
  devolucion: 'Devolución, rebaja o anulación (renglón 11)',
  exportacion: 'Exportación (renglón 12)',
  'devolucion-exportacion': 'Devolución de exportación (resta del 12)',
  'activo-fijo': 'Venta de activos fijos (renglón 13)',
  'no-sujeto': 'No sujeto o no gravado (renglón 14)',
  exento: 'Exento por acuerdo (renglón 15)',
  retencion: 'ICA retenido por clientes (renglón 27)',
  autorretencion: 'Autorretención de ICA (renglón 28)',
  anticipo: 'Anticipo de ICA',
  causacion: 'ICA por pagar (causación)',
  gasto: 'Gasto de industria y comercio',
  ignorar: 'No se usa en el ICA',
}

export type CuentaIca = {
  cuenta: string
  nombre: string | null
  clase: ClaseCuentaIca
  /** Otro municipio que nombra la cuenta (clave); null si es del municipio de la declaración o no dice. */
  municipio: string | null
  regla: 'memoria' | 'puc' | 'nombre'
  motivo: string
  debitos: number
  creditos: number
  /** Lo que la cuenta aporta a su renglón (créditos, débitos o neto según la clase). */
  valor: number
}

export type MapeoLibrosIca = {
  /** Renglones del catálogo ica con valor de libros (redondeados). */
  cifras: Record<string, { libros: number }>
  /** Municipio de la declaración (clave o texto de la obligación); null si la obligación no lo dice. */
  municipio: string | null
  cuentas: CuentaIca[]
  /** Otros municipios que aparecen en los nombres de las cuentas (ingresos, devoluciones y retenciones). */
  otrosMunicipios: { municipio: string; ingresos: number; devoluciones: number; retenciones: number; cuentas: number }[]
  /** ¿Las subcuentas de ICA retenido dicen de qué municipio son? Si no, el 27 se cruza contra el total. */
  retencionesPorMunicipio: boolean
  /** Débitos de las cuentas de ingreso (anulaciones o cierre): se muestran, no se restan. */
  debitosEnIngresos: number
  /** Cuentas de la clase 42 sin clasificar en la memoria: candidatas a no sujeto o exento. */
  porClasificar: ResumenCuentaAuxiliar[]
  /** Impuesto causado en el período; null si el libro no trae 2412 ni el gasto. */
  causado: { creditos2412: number; debitosGasto: number } | null
  bitacora: string[]
}

const esDevolucion = (codigo: string, n: string) => codigo.startsWith('4175') || /devolu|rebaja|descuento|anula/.test(n)
const esExportacion = (n: string) => /exterior|exportac|\bexport/.test(n)
const esActivoFijo = (codigo: string, n: string) => codigo.startsWith('4245') || /venta de (activos|propiedad)|propiedades,? planta/.test(n)
const esIcaEnNombre = (n: string) => /industria y comercio|\bica\b|reteica|avisos y tableros|bomberil/.test(n)

/** Clasifica una cuenta para el ICA por su código y nombre; null si no tiene que ver con el impuesto. */
export function clasificarCuentaIca(codigo: string, nombre: string | null, municipioDeclaracion: string | null): Pick<CuentaIca, 'clase' | 'municipio' | 'regla' | 'motivo'> | null {
  const n = norm(nombre)
  const otro = (() => {
    const m = municipioDeTexto(nombre)
    return m && m.clave !== municipioDeclaracion ? m.clave : null
  })()
  if (codigo.startsWith('4')) {
    const puc = codigo.startsWith('4175') || codigo.startsWith('4245')
    const regla = puc ? 'puc' as const : 'nombre' as const
    if (esDevolucion(codigo, n)) {
      const exp = codigo.startsWith('41') && esExportacion(n)
      return { clase: exp ? 'devolucion-exportacion' : 'devolucion', municipio: otro, regla, motivo: exp ? 'Devolución o anulación de ventas al exterior: resta de las exportaciones.' : `Devolución, rebaja, descuento o anulación${otro ? ` (${nombreMunicipio(otro)})` : ''}.` }
    }
    if (esActivoFijo(codigo, n)) return { clase: 'activo-fijo', municipio: otro, regla, motivo: 'Venta de activos fijos.' }
    // Solo los ingresos operacionales: "rendimientos créditos exterior" (42) no es una exportación.
    if (codigo.startsWith('41') && esExportacion(n)) return { clase: 'exportacion', municipio: null, regla: 'nombre', motivo: 'Ventas al exterior, por el nombre.' }
    if (otro) return { clase: 'fuera', municipio: otro, regla: 'nombre', motivo: `Ingreso de ${nombreMunicipio(otro)}, por el nombre: se declara allá.` }
    return { clase: 'ingreso', municipio: null, regla: 'puc', motivo: 'Ingreso del período.' }
  }
  if (codigo.startsWith('1355') && (codigo.startsWith('135518') || esIcaEnNombre(n))) {
    if (/anticipo/.test(n) || codigo.startsWith('135510')) return { clase: 'anticipo', municipio: otro, regla: codigo.startsWith('135510') ? 'puc' : 'nombre', motivo: `Anticipo de ICA${otro ? ` de ${nombreMunicipio(otro)}` : ''}.` }
    const auto = /autorret/.test(n)
    return { clase: auto ? 'autorretencion' : 'retencion', municipio: otro, regla: codigo.startsWith('135518') ? 'puc' : 'nombre', motivo: `${auto ? 'Autorretención' : 'Retención'} de ICA${otro ? ` de ${nombreMunicipio(otro)}: no es de esta declaración` : ''}.` }
  }
  if (codigo.startsWith('2412') || (codigo.startsWith('24') && esIcaEnNombre(n))) return { clase: 'causacion', municipio: otro, regla: codigo.startsWith('2412') ? 'puc' : 'nombre', motivo: 'Impuesto de industria y comercio por pagar.' }
  if (/^(5|7)/.test(codigo) && esIcaEnNombre(n)) return { clase: 'gasto', municipio: otro, regla: 'nombre', motivo: 'Gasto de industria y comercio (incluye avisos y sobretasas).' }
  return null
}

/** Municipio de la declaración: el campo de la obligación o, en las anteriores al campo, su nombre. */
export function municipioDeObligacionIca(obligacion: { nombre: string | null; municipio?: string | null }): string | null {
  return normalizarMunicipio(obligacion.municipio) ?? municipioDeTexto(obligacion.nombre)?.clave ?? null
}

export function mapearLibrosIca(
  resumen: Pick<ResumenAuxiliarPeriodo, 'cuentas'>,
  opts: {
    obligacion: { nombre: string | null; municipio?: string | null }
    /** Memoria de la empresa: cuenta → 'gravado' | 'no-sujeto' | 'exento' | 'fuera' | 'ignorar'. */
    memoria?: Record<string, string>
  },
): MapeoLibrosIca {
  const memoria = opts.memoria ?? {}
  const municipio = municipioDeObligacionIca(opts.obligacion)
  const cuentas: CuentaIca[] = []
  const porClasificar: ResumenCuentaAuxiliar[] = []
  let debitosEnIngresos = 0

  for (const c of resumen.cuentas) {
    let clas = clasificarCuentaIca(c.cuenta, c.nombre, municipio)
    const recordado = memoria[c.cuenta]
    if (recordado && c.cuenta.startsWith('4')) {
      const clase: ClaseCuentaIca = recordado === 'gravado' ? 'ingreso' : (recordado as ClaseCuentaIca)
      clas = { clase, municipio: clase === 'fuera' ? clas?.municipio ?? null : null, regla: 'memoria', motivo: `${CLASE_CUENTA_ICA_LABEL[clase]}: clasificada por la firma para esta empresa.` }
    }
    if (!clas) continue
    const valor = ['devolucion', 'devolucion-exportacion'].includes(clas.clase) ? c.debitos - c.creditos
      : ['retencion', 'autorretencion', 'anticipo', 'gasto'].includes(clas.clase) ? c.debitos
      : clas.clase === 'ignorar' ? 0
      : c.creditos
    if (['ingreso', 'fuera', 'exportacion', 'activo-fijo', 'no-sujeto', 'exento'].includes(clas.clase)) debitosEnIngresos += c.debitos
    cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, ...clas, debitos: c.debitos, creditos: c.creditos, valor })
    if (c.cuenta.startsWith('42') && clas.clase === 'ingreso' && clas.regla !== 'memoria' && c.creditos > 0) porClasificar.push(c)
  }

  const suma = (...clases: ClaseCuentaIca[]) => cuentas.filter((x) => clases.includes(x.clase)).reduce((s, x) => s + x.valor, 0)
  const hay = (...clases: ClaseCuentaIca[]) => cuentas.some((x) => clases.includes(x.clase))
  const cifras: MapeoLibrosIca['cifras'] = {}
  const r = (n: number) => ({ libros: Math.round(n) })
  if (cuentas.some((x) => x.cuenta.startsWith('4'))) {
    cifras['ica-ingresos'] = r(suma('ingreso', 'fuera', 'exportacion', 'activo-fijo', 'no-sujeto', 'exento'))
    cifras['ica-fuera-municipio'] = r(suma('fuera'))
    cifras['ica-devoluciones'] = r(suma('devolucion'))
    cifras['ica-exportaciones'] = r(suma('exportacion') - suma('devolucion-exportacion'))
    cifras['ica-activos-fijos'] = r(suma('activo-fijo'))
    // Sin clasificación de la firma no se sabe qué es no sujeto o exento: no se afirma un cero.
    if (hay('no-sujeto')) cifras['ica-no-sujetos'] = r(suma('no-sujeto'))
    if (hay('exento')) cifras['ica-exentos'] = r(suma('exento'))
  }
  const retenciones = cuentas.filter((x) => x.clase === 'retencion')
  const propias = (lista: CuentaIca[]) => lista.filter((x) => !x.municipio)
  if (retenciones.length) cifras['ica-retenciones'] = r(propias(retenciones).reduce((s, x) => s + x.valor, 0))
  const autorret = cuentas.filter((x) => x.clase === 'autorretencion')
  if (autorret.length) cifras['ica-autorretenciones'] = r(propias(autorret).reduce((s, x) => s + x.valor, 0))
  const retencionesPorMunicipio = [...retenciones, ...autorret].some((x) => !!municipioDeTexto(x.nombre))

  const otros = new Map<string, MapeoLibrosIca['otrosMunicipios'][number]>()
  for (const x of cuentas) {
    if (!x.municipio) continue
    const o = otros.get(x.municipio) ?? { municipio: x.municipio, ingresos: 0, devoluciones: 0, retenciones: 0, cuentas: 0 }
    o.cuentas++
    if (x.clase === 'fuera') o.ingresos += x.valor
    if (x.clase === 'devolucion') o.devoluciones += x.valor
    if (x.clase === 'retencion' || x.clase === 'autorretencion') o.retenciones += x.valor
    otros.set(x.municipio, o)
  }
  const otrosMunicipios = [...otros.values()].sort((a, b) => b.ingresos - a.ingresos)
  const causado = hay('causacion', 'gasto') ? { creditos2412: Math.round(suma('causacion')), debitosGasto: Math.round(suma('gasto')) } : null

  const nombreMun = municipio ? nombreMunicipio(municipio) : null
  const bitacora: string[] = []
  bitacora.push(`ICA${nombreMun ? ` de ${nombreMun}` : ''}: ${cuentas.length} cuenta(s) relacionadas con el impuesto (${cuentas.filter((x) => x.cuenta.startsWith('4')).length} de ingresos).`)
  if (!municipio) bitacora.push('La obligación no dice el municipio: no se pueden separar los ingresos de otros municipios.')
  for (const o of otrosMunicipios) if (o.ingresos) bitacora.push(`${Math.round(o.ingresos).toLocaleString('es-CO')} de ingresos en cuentas de ${nombreMunicipio(o.municipio)}: van al renglón 9 (fuera del municipio).`)
  if (debitosEnIngresos > 0) bitacora.push(`Las cuentas de ingreso tienen ${Math.round(debitosEnIngresos).toLocaleString('es-CO')} en débitos: no se restaron del renglón 8 (pueden ser anulaciones o el cierre).`)
  if (retenciones.length && !retencionesPorMunicipio) bitacora.push('Las subcuentas de ICA retenido no dicen de qué municipio son: el renglón 27 se cruza contra el total retenido en el período.')
  if (porClasificar.length) bitacora.push(`${porClasificar.length} cuenta(s) de ingresos no operacionales sin clasificar: se toman como gravadas hasta que la firma diga otra cosa.`)
  return { cifras, municipio, cuentas, otrosMunicipios, retencionesPorMunicipio, debitosEnIngresos: Math.round(debitosEnIngresos), porClasificar, causado, bitacora }
}
