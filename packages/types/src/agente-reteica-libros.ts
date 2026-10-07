/**
 * Libros → columna "Según libros" de la declaración de retención de ICA
 * (reteICA) de UN municipio. La 2368 se lleva por municipio y, casi siempre, por
 * tarifa ("23680501 BOGOTA TARIFA 9,66/1000"): con el nombre se sabe de qué
 * municipio es cada subcuenta y a qué tarifa por mil retuvo, y con la tarifa se
 * reconstruye la base que explica la retención.
 *
 * Con detalle por tercero (auxiliar o balance por terceros) se separan los tres
 * movimientos que conviven en la 2368: créditos = retenciones practicadas;
 * débitos a proveedores = devoluciones de retención (renglón de descuento);
 * débitos al municipio = pago de la declaración anterior (no se descuenta).
 *
 * Municipios: tabla de referencia con los principales; el que no esté se
 * reconoce igual si el nombre de la subcuenta lo trae, y lo que no se pueda
 * decir queda como ambigüedad para la memoria de la empresa (mapeo2368).
 * PENDIENTE DE VALIDAR POR LA FIRMA: tarifas admisibles de Bogotá.
 */
import type { MovimientoAuxiliar, ResumenAuxiliarPeriodo, ResumenCuentaAuxiliar } from './parse-auxiliar'
import type { SaldoTerceroPeriodo } from './parse-balance-periodo'
import { normalizarNit } from './agente-retefuente-libros'
import { MUNICIPIOS_RETEICA, municipioDeTexto, nombreMunicipio, normalizarMunicipio } from './municipios'

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export { MUNICIPIOS_RETEICA, municipioDeTexto, municipioPorClave, nombreMunicipio, type MunicipioReteica } from './municipios'

/** Tarifa por mil del nombre: "TARIFA 9,66/1000", "6.9 X MIL", "11,04 POR MIL", "4.14‰". */
export function tarifaPorMilDelNombre(nombre: string | null | undefined): number | null {
  const n = norm(nombre)
  const m = /(\d{1,2}(?:[.,]\d{1,3})?)\s*(?:\/\s*1\.?000|x\s*1\.?000|x\s*mil|por\s*mil|‰|o\/oo)/.exec(n)
  if (!m) return null
  const t = Number(m[1].replace(',', '.'))
  return t > 0 && t < 100 ? t : null
}

/** ¿El tercero es la entidad territorial a la que se le paga la declaración? */
export function esEntidadTerritorial(tercero: string | null, nombre: string | null): boolean {
  const nit = normalizarNit(tercero)
  if (nit && MUNICIPIOS_RETEICA.some((m) => m.nit === nit)) return true
  return /secretar.*hacienda|tesorer|^municipio\b|alcaldia|distrito capital|^distrito\b|^bogota distrito|direccion distrital de impuestos/.test(norm(nombre))
}

export type TipoSubcuentaReteica = 'retencion' | 'autorretencion' | 'saldo'

export type SubcuentaReteica = {
  cuenta: string
  nombre: string | null
  municipio: string | null
  tipo: TipoSubcuentaReteica | null
  tarifa: number | null
  regla: 'memoria' | 'nombre' | 'padre' | 'sin-clasificar'
  motivo: string
  creditos: number
  /** Débitos a proveedores (o todos, sin detalle por tercero). */
  debitosTerceros: number
  /** Débitos a la entidad territorial: pago de la declaración anterior. */
  pagos: number
  /** Base que explica la retención (créditos ÷ tarifa); null sin tarifa en el nombre. */
  baseExplicada: number | null
}

/** Detalle por tercero de la retención del municipio de la declaración. */
export type TerceroReteica = {
  tercero: string | null
  nombre: string | null
  cuenta: string
  tarifa: number | null
  retencion: number
  devolucion: number
  baseExplicada: number | null
}

export type MapeoLibrosReteica = {
  /** Renglones del catálogo reteica: ri-retenciones, ri-devoluciones, ri-autorretenciones (redondeados). */
  cifras: Record<string, { libros: number }>
  /** Municipio de la declaración (clave de MUNICIPIOS_RETEICA o texto libre de la memoria); null si no se pudo establecer. */
  municipio: string | null
  /** Cómo se estableció el municipio. */
  municipioOrigen: 'obligacion' | 'memoria' | 'unico-en-libros' | null
  /** Municipios con retención en libros (para territorialidad y para elegir el de la declaración). */
  municipios: { municipio: string; retencion: number; autorretencion: number; devoluciones: number; pagos: number; subcuentas: number }[]
  subcuentas: SubcuentaReteica[]
  sinClasificar: ResumenCuentaAuxiliar[]
  /** Base que explican las retenciones del municipio (Σ créditos ÷ tarifa); null si alguna subcuenta no trae tarifa. */
  baseExplicada: number | null
  /** ¿Hubo detalle por tercero para separar devoluciones de pagos? */
  conTerceros: boolean
  terceros: TerceroReteica[]
  bitacora: string[]
}

/** Clasifica una subcuenta de 2368 por su nombre (o el de su cuenta padre). */
export function clasificarSubcuentaReteica(_codigo: string, nombre: string | null, nombrePadre?: string | null): Pick<SubcuentaReteica, 'municipio' | 'tipo' | 'tarifa' | 'regla' | 'motivo'> {
  const n = norm(nombre)
  const tipo: TipoSubcuentaReteica | null = /pago|por pagar|saldo|declarad|traslad/.test(n) ? 'saldo' : /autorret/.test(n) ? 'autorretencion' : 'retencion'
  const propio = municipioDeTexto(nombre)
  const padre = propio ? null : municipioDeTexto(nombrePadre)
  const municipio = propio ?? padre
  const tarifa = tarifaPorMilDelNombre(nombre)
  if (!municipio) return { municipio: null, tipo, tarifa, regla: 'sin-clasificar', motivo: 'Ni el nombre de la subcuenta ni el de su cuenta dicen de qué municipio es.' }
  const que = tipo === 'saldo' ? 'saldo o pago de la declaración (no es retención del período)' : tipo === 'autorretencion' ? 'autorretención' : `retención${tarifa ? ` al ${tarifa.toLocaleString('es-CO')} por mil` : ' sin tarifa en el nombre'}`
  return { municipio: municipio.clave, tipo, tarifa, regla: propio ? 'nombre' : 'padre', motivo: `${municipio.nombre}: ${que}, por el nombre${propio ? '' : ' de la cuenta padre'}.` }
}

/**
 * Municipio de la declaración: el de la obligación (campo municipio o, en las
 * creadas antes de existir el campo, su nombre); si no, el que la firma eligió
 * (memoria); si no, el único municipio con retención en libros.
 */
export function municipioDeLaDeclaracion(
  obligacion: { id: string; nombre: string | null; municipio?: string | null },
  memoria: Record<string, string>,
  municipiosEnLibros: string[],
): { municipio: string | null; origen: MapeoLibrosReteica['municipioOrigen'] } {
  const propio = normalizarMunicipio(obligacion.municipio)
  if (propio) return { municipio: propio, origen: 'obligacion' }
  const delNombre = municipioDeTexto(obligacion.nombre)
  if (delNombre) return { municipio: delNombre.clave, origen: 'obligacion' }
  const recordado = memoria[`obligacion:${obligacion.id}`]
  if (recordado) return { municipio: recordado, origen: 'memoria' }
  if (municipiosEnLibros.length === 1) return { municipio: municipiosEnLibros[0], origen: 'unico-en-libros' }
  return { municipio: null, origen: null }
}


export function mapearLibrosReteica(
  resumen: Pick<ResumenAuxiliarPeriodo, 'cuentas'>,
  movimientos: MovimientoAuxiliar[],
  opts: {
    obligacion: { id: string; nombre: string | null; municipio?: string | null }
    /** Memoria de la empresa: subcuenta → municipio | 'ignorar'; `obligacion:<id>` → municipio. */
    memoria?: Record<string, string>
    saldosTercero?: SaldoTerceroPeriodo[]
    /** Nombres de las cuentas de nivel superior (2368xx), para heredar el municipio. */
    nombresCuentas?: Record<string, string | null>
  },
): MapeoLibrosReteica {
  const memoria = opts.memoria ?? {}
  const bitacora: string[] = []
  const subcuentas: SubcuentaReteica[] = []
  const sinClasificar: ResumenCuentaAuxiliar[] = []
  const es2368 = (c: string) => c.startsWith('2368')

  const movPorCuenta = new Map<string, MovimientoAuxiliar[]>()
  for (const m of movimientos) if (es2368(m.cuenta)) movPorCuenta.set(m.cuenta, [...(movPorCuenta.get(m.cuenta) ?? []), m])
  const terPorCuenta = new Map<string, SaldoTerceroPeriodo[]>()
  for (const t of opts.saldosTercero ?? []) if (es2368(t.cuenta) && (t.debitos || t.creditos)) terPorCuenta.set(t.cuenta, [...(terPorCuenta.get(t.cuenta) ?? []), t])
  // Detalle uniforme por cuenta: asientos o saldos por tercero, con lo mismo que se necesita de ambos.
  const detalle = (cuenta: string): { tercero: string | null; nombre: string | null; debitos: number; creditos: number }[] | null => {
    const movs = movPorCuenta.get(cuenta)
    if (movs?.length) return movs.map((m) => ({ tercero: m.tercero, nombre: m.terceroNombre, debitos: m.debito, creditos: m.credito }))
    const ters = terPorCuenta.get(cuenta)
    if (ters?.length) return ters.map((t) => ({ tercero: t.tercero, nombre: t.terceroNombre, debitos: t.debitos, creditos: t.creditos }))
    return null
  }
  const nombrePadre = (codigo: string) => {
    for (let l = codigo.length - 2; l >= 4; l -= 2) { const n = opts.nombresCuentas?.[codigo.slice(0, l)]; if (n) return n }
    return null
  }

  let conTerceros = false
  const detallePorCuenta = new Map<string, ReturnType<typeof detalle>>()
  for (const c of resumen.cuentas) {
    if (!es2368(c.cuenta)) continue
    const propio = memoria[c.cuenta]
    let clas = propio
      ? propio === 'ignorar'
        ? { municipio: null, tipo: 'saldo' as const, tarifa: tarifaPorMilDelNombre(c.nombre), regla: 'memoria' as const, motivo: 'Marcada como "no es retención" por la firma.' }
        : { ...clasificarSubcuentaReteica(c.cuenta, c.nombre, nombrePadre(c.cuenta)), municipio: propio, regla: 'memoria' as const, motivo: `${nombreMunicipio(propio)}: clasificada por la firma para esta empresa.` }
      : clasificarSubcuentaReteica(c.cuenta, c.nombre, nombrePadre(c.cuenta))
    if (propio && propio !== 'ignorar' && clas.tipo === 'saldo') clas = { ...clas, tipo: 'retencion' }
    const det = detalle(c.cuenta)
    detallePorCuenta.set(c.cuenta, det)
    if (det) conTerceros = true
    let pagos = 0
    let debitosTerceros = c.debitos
    if (det) {
      pagos = det.filter((d) => d.debitos > 0 && esEntidadTerritorial(d.tercero, d.nombre)).reduce((s, d) => s + d.debitos, 0)
      debitosTerceros = c.debitos - pagos
    }
    const sub: SubcuentaReteica = {
      cuenta: c.cuenta, nombre: c.nombre, ...clas, creditos: c.creditos, debitosTerceros, pagos,
      baseExplicada: clas.tipo !== 'saldo' && clas.tarifa ? c.creditos / (clas.tarifa / 1000) : null,
    }
    subcuentas.push(sub)
    if (!clas.municipio && clas.tipo !== 'saldo' && (c.creditos || c.debitos)) sinClasificar.push(c)
  }

  // Municipios con retención en libros.
  const porMunicipio = new Map<string, MapeoLibrosReteica['municipios'][number]>()
  for (const s of subcuentas) {
    if (!s.municipio) continue
    const m = porMunicipio.get(s.municipio) ?? { municipio: s.municipio, retencion: 0, autorretencion: 0, devoluciones: 0, pagos: 0, subcuentas: 0 }
    m.subcuentas++
    m.pagos += s.pagos
    if (s.tipo === 'retencion') { m.retencion += s.creditos; m.devoluciones += s.debitosTerceros }
    if (s.tipo === 'autorretencion') m.autorretencion += s.creditos
    porMunicipio.set(s.municipio, m)
  }
  const municipios = [...porMunicipio.values()].sort((a, b) => b.retencion - a.retencion)
  const { municipio, origen } = municipioDeLaDeclaracion(opts.obligacion, memoria, municipios.filter((m) => m.retencion > 0 || m.autorretencion > 0).map((m) => m.municipio))

  const cifras: MapeoLibrosReteica['cifras'] = {}
  let baseExplicada: number | null = null
  const terceros: TerceroReteica[] = []
  if (municipio) {
    const propias = subcuentas.filter((s) => s.municipio === municipio && s.tipo !== 'saldo')
    const m = porMunicipio.get(municipio)
    if (m) {
      cifras['ri-retenciones'] = { libros: Math.round(m.retencion) }
      // Sin detalle por tercero los débitos mezclan devoluciones y pagos: no se lleva el renglón.
      if (conTerceros) cifras['ri-devoluciones'] = { libros: Math.round(m.devoluciones) }
      if (m.autorretencion) cifras['ri-autorretenciones'] = { libros: Math.round(m.autorretencion) }
    }
    const ret = propias.filter((s) => s.tipo === 'retencion')
    baseExplicada = ret.length && ret.every((s) => s.baseExplicada !== null || s.creditos === 0) ? Math.round(ret.reduce((x, s) => x + (s.baseExplicada ?? 0), 0)) : null
    for (const s of ret) {
      for (const d of detallePorCuenta.get(s.cuenta) ?? []) {
        if (esEntidadTerritorial(d.tercero, d.nombre)) continue
        const k = normalizarNit(d.tercero) || norm(d.nombre)
        const prev = terceros.find((t) => (normalizarNit(t.tercero) || norm(t.nombre)) === k && t.cuenta === s.cuenta)
        if (prev) { prev.retencion += d.creditos; prev.devolucion += d.debitos; continue }
        terceros.push({ tercero: d.tercero, nombre: d.nombre, cuenta: s.cuenta, tarifa: s.tarifa, retencion: d.creditos, devolucion: d.debitos, baseExplicada: null })
      }
    }
    for (const t of terceros) {
      t.retencion = Math.round(t.retencion)
      t.devolucion = Math.round(t.devolucion)
      t.baseExplicada = t.tarifa ? Math.round((t.retencion - t.devolucion) / (t.tarifa / 1000)) : null
    }
    terceros.sort((a, b) => b.retencion - a.retencion)
  }

  const nombreMun = municipio ? nombreMunicipio(municipio) : null
  bitacora.push(`ReteICA: ${subcuentas.length} subcuenta(s) de 2368 en ${municipios.length} municipio(s)${nombreMun ? `; la declaración es de ${nombreMun}` : '; no se pudo establecer de qué municipio es la declaración'}.`)
  const pagosMun = municipio ? porMunicipio.get(municipio)?.pagos ?? 0 : 0
  if (pagosMun > 0) bitacora.push(`${Math.round(pagosMun).toLocaleString('es-CO')} debitados a ${nombreMun} (pago de la declaración anterior) no se descontaron de lo retenido.`)
  if (!conTerceros) bitacora.push('Sin detalle por tercero: los débitos de la 2368 no se pueden separar entre devoluciones a proveedores y pagos al municipio; se toma lo retenido (créditos) y no se calculan las devoluciones.')
  if (sinClasificar.length) bitacora.push(`${sinClasificar.length} subcuenta(s) de 2368 sin municipio: requieren confirmación.`)
  return { cifras, municipio, municipioOrigen: origen, municipios, subcuentas, sinClasificar, baseExplicada, conTerceros, terceros, bitacora }
}
