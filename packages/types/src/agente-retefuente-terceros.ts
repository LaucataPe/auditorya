/**
 * Prueba de razonabilidad de la retención por tercero (regla R-17), propuesta
 * por el auditor el 2026-09-29: cuando el libro no trae la base de cada asiento
 * (un balance de prueba por terceros), se toma lo causado a cada tercero en
 * gasto, costo o compras como BASE PRESUNTA y se compara con lo que se le
 * retuvo en la 2365. La retención de cada subcuenta se divide por su tarifa
 * ("COMPRAS 2.5%") para saber qué base explica; si lo causado la supera, o no
 * se le retuvo, sale una alerta para que el auditor la revise.
 *
 * Es una prueba analítica, no un recálculo: el gasto del período no es
 * exactamente la base de retención (pagos bajo la cuantía mínima, terceros
 * autorretenedores o del régimen simple, partidas no sujetas), así que nunca
 * produce hallazgos por sí sola: produce puntos por confirmar.
 *
 * PENDIENTE DE VALIDAR POR LA FIRMA: qué cuentas cuentan como base y a qué
 * concepto va cada una (conceptoDeCuentaBase), y el margen del 10 %.
 */
import type { SaldoTerceroPeriodo } from './parse-balance-periodo'
import type { MovimientoAuxiliar } from './parse-auxiliar'
import { NIT_DIAN, beneficiarioDeTercero, clasificarSubcuentaRetefuente, normalizarNit, tarifaDelNombreRf, type Beneficiario350 } from './agente-retefuente-libros'
import { TARIFAS_RETEFUENTE, UVT_POR_ANIO } from './tarifas-retefuente'

export const UMBRALES_TERCEROS = {
  /** Lo causado y la base que explica la retención pueden diferir hasta 10 % sin alertar (partidas menores no sujetas, consumos de otro período). */
  margenPct: 10,
  /** Diferencias en pesos por debajo de esto no alertan. */
  minimoPesos: 1000,
  /** Filas que viajan al backend y a la cédula. */
  maxFilas: 300,
} as const

export type ConceptoBase = 'honorarios' | 'comisiones' | 'servicios' | 'arrendamientos' | 'compras' | 'otros'

export const CONCEPTO_BASE_LABEL: Record<ConceptoBase, string> = {
  honorarios: 'Honorarios', comisiones: 'Comisiones', servicios: 'Servicios', arrendamientos: 'Arrendamientos', compras: 'Compras', otros: 'Otros gastos',
}

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * ¿La cuenta es base presunta de retención, y de qué concepto? Primero el
 * nombre; luego el PUC (grupos 51, 52, 72 a 74 comparten la cuenta xx05…xx95).
 * `excluir` dice por qué una cuenta de gasto o costo NO se toma como base.
 */
export function conceptoDeCuentaBase(codigo: string, nombre: string | null): { concepto: ConceptoBase } | { excluir: string } | null {
  const clase = codigo[0]
  const grupo = codigo.slice(0, 2)
  // Compras que se llevan al activo antes de pasar al costo: inventarios, propiedad y equipo, intangibles y diferidos.
  const esActivoComprable = ['14', '15', '16', '17'].includes(grupo)
  if (!['5', '6', '7'].includes(clase) && !esActivoComprable) return null
  const n = norm(nombre)
  const cuenta = codigo.slice(2, 4)
  if (/deprecia|amortiza|agotamiento|provisi|deterioro/.test(n)) return { excluir: 'No es un pago a un tercero (depreciación, amortización o provisión).' }
  if (/en transito|importacion/.test(n)) return { excluir: 'Importación o bienes en tránsito: el proveedor del exterior no está sujeto a esta retención.' }
  if (/sueldo|salario|nomina|prestacion|cesant|vacacion|prima de servicio|aporte|parafiscal|seguridad social|pension|incapacidad|bonificacion|auxilio|horas extra|recargo/.test(n)) return { excluir: 'Pago laboral: su retención va por la tabla del art. 383 ET, no por tarifa.' }
  if (/impuesto|industria y comercio|predial|gravamen|4 ?x ?1000|\biva\b|sancion|multa/.test(n)) return { excluir: 'Impuestos, sanciones y gravámenes: no están sujetos a retención.' }
  if (/diferencia en cambio|interes|financier|bancari/.test(n)) return { excluir: 'Gasto financiero: se revisa aparte (rendimientos financieros).' }
  if (grupo === '54') return { excluir: 'Impuesto de renta.' }
  if (grupo === '72') return { excluir: 'Mano de obra directa: pago laboral.' }
  // Por código antes que por nombre: bajo 1592 o 5160 las subcuentas se llaman "MAQUINARIA Y EQUIPO", pero son depreciación.
  if ((grupo === '15' && ['92', '97', '99'].includes(cuenta)) || (['16', '17'].includes(grupo) && ['98', '99'].includes(cuenta)) || (['51', '52', '73', '74'].includes(grupo) && ['60', '65', '99'].includes(cuenta))) {
    return { excluir: 'No es un pago a un tercero (depreciación, amortización o provisión).' }
  }
  // Gastos de personal (5105, 5205): todo lo que cuelga es laboral, aunque el nombre diga "comisiones" o "seguros".
  if (['51', '52'].includes(grupo) && cuenta === '05') return { excluir: 'Gastos de personal: pago laboral.' }

  if (/honorario|asesoria|revisoria|auditoria|consultoria/.test(n)) return { concepto: 'honorarios' }
  if (/comision/.test(n)) return { concepto: 'comisiones' }
  if (/arrend|alquiler|canon/.test(n)) return { concepto: 'arrendamientos' }
  if (/servicio|mantenimiento|reparacion|aseo y limpieza|vigilancia|transporte|flete|acarreo|publicidad|asistencia|temporal|instalacion|adecuacion|capacitacion|software|licencia|medic|salud|correo|telefono|hospedaje/.test(n)) return { concepto: 'servicios' }
  if (/compra|mercancia|materia prima|material|inventario|insumo|repuesto|papeleria|combustible|dotacion|elemento|ferreteria|equipo|maquinaria|mueble/.test(n)) return { concepto: 'compras' }

  if (esActivoComprable || grupo === '62' || grupo === '71') return { concepto: 'compras' }
  if (['51', '52', '73', '74'].includes(grupo) && cuenta) {
    if (cuenta === '10') return { concepto: 'honorarios' }
    if (cuenta === '15') return { excluir: 'Impuestos: no están sujetos a retención.' }
    if (cuenta === '20') return { concepto: 'arrendamientos' }
    if (cuenta === '35' || cuenta === '45' || cuenta === '50') return { concepto: 'servicios' }
  }
  if (grupo === '53' && cuenta === '05') return { excluir: 'Gasto financiero: se revisa aparte (rendimientos financieros).' }
  return { concepto: 'otros' }
}

/** Tarifa de referencia del concepto: la menor entre la general y la de no declarantes. */
const tarifaReferencia = (c: ConceptoBase): number => {
  const t = TARIFAS_RETEFUENTE[c]!
  return Math.min(t.general ?? t.admisibles[0], t.noDeclarante ?? Infinity)
}

export type AlertaTercero = 'sin_retencion' | 'retencion_baja' | 'retencion_alta' | 'retencion_sin_base'

export const ALERTA_TERCERO_LABEL: Record<AlertaTercero, string> = {
  sin_retencion: 'Causado sin retención',
  retencion_baja: 'Parte de lo causado sin retención',
  retencion_alta: 'Retención superior a lo causado',
  retencion_sin_base: 'Retención sin gasto ni compra',
}

export type FilaTerceroRetencion = {
  tercero: string | null
  nombre: string | null
  beneficiario: Beneficiario350 | null
  /** Causado al tercero en cuentas de base presunta (débitos − créditos). */
  base: number
  conceptos: ConceptoBase[]
  cuentasBase: string[]
  /** Retenido al tercero en 2365 a título de renta (créditos − débitos). */
  retencion: number
  tarifaImplicita: number | null
  /** Base que explica la retención: lo retenido en cada subcuenta dividido por la tarifa de esa subcuenta. */
  baseRetenida: number
  /** Causado − base retenida. Positivo: causado sin retención; negativo: retención sin causación que la explique. */
  diferencia: number
  alerta: AlertaTercero | null
  nota: string | null
}

export type PruebaTercerosRetencion = {
  /** Terceros con alerta primero (por valor), luego los conformes; máximo UMBRALES_TERCEROS.maxFilas. */
  filas: FilaTerceroRetencion[]
  omitidas: number
  terceros: number
  alertas: Record<AlertaTercero, number>
  baseTotal: number
  retencionTotal: number
  /** Cuentas tomadas como base, con su concepto. */
  cuentasBase: { cuenta: string; nombre: string | null; concepto: ConceptoBase; neto: number; terceros: number }[]
  /** Cuentas de gasto o costo que NO se tomaron como base, y por qué. */
  excluidas: { cuenta: string; nombre: string | null; motivo: string; neto: number }[]
  uvt: { anio: number; valor: number; deReferencia: boolean } | null
  bitacora: string[]
}

/** Agrupa los asientos del período por cuenta y tercero, en la misma forma que el detalle por tercero de un balance. */
export function saldosTerceroDeMovimientos(movimientos: MovimientoAuxiliar[], periodo: { desde: string; hasta: string }): SaldoTerceroPeriodo[] {
  const mapa = new Map<string, SaldoTerceroPeriodo>()
  for (const m of movimientos) {
    if (m.fecha < periodo.desde || m.fecha > periodo.hasta) continue
    if (!m.tercero && !m.terceroNombre) continue
    const k = `${m.cuenta}|${m.tercero ?? norm(m.terceroNombre)}`
    const s = mapa.get(k) ?? { cuenta: m.cuenta, cuentaNombre: m.cuentaNombre, tercero: m.tercero, terceroNombre: m.terceroNombre, debitos: 0, creditos: 0 }
    s.debitos += m.debito
    s.creditos += m.credito
    mapa.set(k, s)
  }
  return [...mapa.values()]
}

/**
 * Corre la prueba. Devuelve null (con el motivo en `porQue`) cuando el libro no
 * trae lo necesario: terceros en las cuentas de gasto/costo Y en la 2365.
 */
export function probarRetencionPorTercero(
  saldos: SaldoTerceroPeriodo[],
  opts: { anio: number; memoria?: Record<string, string>; nitEmpresa?: string | null },
): { prueba: PruebaTercerosRetencion | null; porQue: string | null } {
  const propio = (opts.nitEmpresa ?? '').replace(/-\d$/, '').replace(/\D/g, '')
  const clave = (s: SaldoTerceroPeriodo) => normalizarNit(s.tercero) || (s.terceroNombre ? `n:${norm(s.terceroNombre)}` : null)

  type Acum = { tercero: string | null; nombre: string | null; base: Map<ConceptoBase, number>; cuentas: Set<string>; retencion: number; baseRetenida: number; tarifas: Set<number>; sinTarifa: boolean }
  const porTercero = new Map<string, Acum>()
  const acum = (s: SaldoTerceroPeriodo): Acum | null => {
    const k = clave(s)
    // La propia empresa y la DIAN (pago de la declaración) no son terceros a los que se les retiene.
    if (!k || (propio && k === propio) || k === NIT_DIAN) return null
    let a = porTercero.get(k)
    if (!a) { a = { tercero: s.tercero, nombre: s.terceroNombre, base: new Map(), cuentas: new Set(), retencion: 0, baseRetenida: 0, tarifas: new Set(), sinTarifa: false }; porTercero.set(k, a) }
    if (!a.nombre && s.terceroNombre) a.nombre = s.terceroNombre
    return a
  }

  const cuentasBase = new Map<string, PruebaTercerosRetencion['cuentasBase'][number]>()
  const excluidas = new Map<string, PruebaTercerosRetencion['excluidas'][number]>()
  let hayRetencion = false
  let sinClasificar = 0

  for (const s of saldos) {
    if (/^(2365|2364)/.test(s.cuenta)) {
      const destino = opts.memoria?.[s.cuenta] ?? clasificarSubcuentaRetefuente(s.cuenta, s.cuentaNombre)
      if (!destino) { sinClasificar++; continue }
      // Solo retención de renta practicada a terceros por tarifa: fuera laborales, autorretención y saldos por pagar.
      if (destino === 'saldo' || destino === 'ignorar' || destino === 'trabajo' || destino === 'pensiones' || destino === 'dividendos' || destino.startsWith('ar:') || destino.startsWith('reteiva')) continue
      const a = acum(s)
      if (!a) continue
      const ret = s.creditos - s.debitos
      a.retencion += ret
      // La tarifa la dice el nombre de la subcuenta ("COMPRAS 2.5%"); si no, la de referencia del concepto.
      const tarifa = tarifaDelNombreRf(s.cuentaNombre) ?? (TARIFAS_RETEFUENTE[destino] ? tarifaReferencia(destino as ConceptoBase) : null)
      if (tarifa && tarifa > 0) { a.baseRetenida += ret / (tarifa / 100); a.tarifas.add(tarifa) } else a.sinTarifa = true
      hayRetencion = true
      continue
    }
    const c = conceptoDeCuentaBase(s.cuenta, s.cuentaNombre)
    if (!c) continue
    const neto = s.debitos - s.creditos
    if ('excluir' in c) {
      const e = excluidas.get(s.cuenta) ?? { cuenta: s.cuenta, nombre: s.cuentaNombre, motivo: c.excluir, neto: 0 }
      e.neto += neto
      excluidas.set(s.cuenta, e)
      continue
    }
    const a = acum(s)
    if (!a) continue
    a.base.set(c.concepto, (a.base.get(c.concepto) ?? 0) + neto)
    a.cuentas.add(s.cuenta)
    const cb = cuentasBase.get(s.cuenta) ?? { cuenta: s.cuenta, nombre: s.cuentaNombre, concepto: c.concepto, neto: 0, terceros: 0 }
    cb.neto += neto
    cb.terceros++
    cuentasBase.set(s.cuenta, cb)
  }

  if (cuentasBase.size === 0) return { prueba: null, porQue: 'El libro no trae cuentas de gasto, costo o compras con detalle por tercero.' }
  if (!hayRetencion) return { prueba: null, porQue: 'El libro no trae la 2365 con detalle por tercero: no se puede saber a quién se le retuvo.' }

  // Cuantía mínima: con la UVT del año; si aún no está configurada, la última conocida como referencia.
  const anios = Object.keys(UVT_POR_ANIO).map(Number).sort((a, b) => a - b)
  const anioUvt = UVT_POR_ANIO[opts.anio] ? opts.anio : anios.filter((a) => a <= opts.anio).pop() ?? anios[anios.length - 1]
  const uvt = anioUvt ? { anio: anioUvt, valor: UVT_POR_ANIO[anioUvt], deReferencia: anioUvt !== opts.anio } : null
  const minima = (c: ConceptoBase) => (uvt && TARIFAS_RETEFUENTE[c]?.minimaUvt ? TARIFAS_RETEFUENTE[c]!.minimaUvt! * uvt.valor : 0)
  const fmt = (n: number) => Math.round(n).toLocaleString('es-CO')

  const alertas: Record<AlertaTercero, number> = { sin_retencion: 0, retencion_baja: 0, retencion_alta: 0, retencion_sin_base: 0 }
  const filas: FilaTerceroRetencion[] = []
  let baseTotal = 0
  let retencionTotal = 0

  for (const a of porTercero.values()) {
    const conceptos = [...a.base.entries()].filter(([, v]) => Math.abs(v) >= 1)
    const base = conceptos.reduce((s, [, v]) => s + v, 0)
    const retencion = a.retencion
    if (Math.abs(base) < 1 && Math.abs(retencion) < 1) continue
    baseTotal += base
    retencionTotal += retencion
    const baseRetenida = a.baseRetenida
    const diferencia = base - baseRetenida
    const implicita = base > 0 && retencion !== 0 ? (retencion / base) * 100 : null
    const margen = Math.max(UMBRALES_TERCEROS.minimoPesos / 0.025, Math.max(base, baseRetenida) * (UMBRALES_TERCEROS.margenPct / 100))
    const sobreMinima = conceptos.some(([c, v]) => v > 0 && v >= minima(c))
    const tarifas = [...a.tarifas].sort((x, y) => x - y).map((t) => `${t.toLocaleString('es-CO')} %`).join(', ')

    let alerta: AlertaTercero | null = null
    let nota: string | null = null
    if (base <= 0 && retencion > UMBRALES_TERCEROS.minimoPesos) {
      alerta = 'retencion_sin_base'
      nota = 'Se le retuvo y no tiene gasto, costo ni compra en el período: la base puede estar en una cuenta que el libro no trae o en otro período.'
    } else if (base > 0 && retencion <= 0) {
      if (sobreMinima) {
        alerta = 'sin_retencion'
        nota = 'Confirmar por qué no se retuvo: autorretenedor, régimen simple, no sujeto, o pagos que individualmente no superan la cuantía mínima.'
      } else {
        nota = 'Lo causado en el período no supera la cuantía mínima del concepto.'
      }
    } else if (base > 0 && a.sinTarifa && a.tarifas.size === 0) {
      nota = 'La subcuenta de retención no dice su tarifa: no se pudo calcular la base que explica la retención.'
    } else if (base > 0 && diferencia > margen) {
      alerta = 'retencion_baja'
      nota = `La retención (tarifa ${tarifas}) explica una base de ${fmt(baseRetenida)}; quedan ${fmt(diferencia)} causados sin retención.`
    } else if (base > 0 && diferencia < -margen) {
      alerta = 'retencion_alta'
      nota = `La retención (tarifa ${tarifas}) corresponde a una base de ${fmt(baseRetenida)}, superior a lo causado: parte de la base puede estar en otra cuenta o en otro período.`
    } else if (base > 0) {
      nota = `Retención al ${tarifas}.`
    }
    if (alerta) alertas[alerta]++
    filas.push({
      tercero: a.tercero, nombre: a.nombre, beneficiario: beneficiarioDeTercero(a.tercero, a.nombre), base: Math.round(base), conceptos: conceptos.map(([c]) => c), cuentasBase: [...a.cuentas].sort(),
      retencion: Math.round(retencion), tarifaImplicita: implicita === null ? null : Math.round(implicita * 100) / 100, baseRetenida: Math.round(baseRetenida), diferencia: Math.round(diferencia), alerta, nota,
    })
  }

  // Primero lo que el auditor debe mirar, de mayor a menor efecto; después lo conforme por valor.
  filas.sort((x, y) => Number(!!y.alerta) - Number(!!x.alerta) || Math.abs(y.diferencia) - Math.abs(x.diferencia) || y.base - x.base)
  const total = filas.length
  const conAlerta = filas.filter((f) => f.alerta).length
  const bitacora = [
    `Razonabilidad por tercero: ${total} tercero(s) con gasto, costo, compra o retención en el período; ${conAlerta} con alerta.`,
    `Base presunta: ${cuentasBase.size} cuenta(s) por ${fmt(baseTotal)}; ${excluidas.size} cuenta(s) de gasto o costo excluidas (laborales, impuestos, depreciaciones, financieros).`,
  ]
  if (sinClasificar) bitacora.push(`${sinClasificar} saldo(s) de 2365 sin clasificar no entraron a la prueba.`)
  if (uvt?.deReferencia) bitacora.push(`Sin UVT de ${opts.anio}: la cuantía mínima se midió con la UVT de ${uvt.anio} como referencia.`)

  return {
    porQue: null,
    prueba: {
      filas: filas.slice(0, UMBRALES_TERCEROS.maxFilas), omitidas: Math.max(0, total - UMBRALES_TERCEROS.maxFilas), terceros: total, alertas,
      baseTotal: Math.round(baseTotal), retencionTotal: Math.round(retencionTotal),
      cuentasBase: [...cuentasBase.values()].map((c) => ({ ...c, neto: Math.round(c.neto) })).sort((a, b) => a.cuenta.localeCompare(b.cuenta)),
      excluidas: [...excluidas.values()].map((c) => ({ ...c, neto: Math.round(c.neto) })).sort((a, b) => a.cuenta.localeCompare(b.cuenta)),
      uvt, bitacora,
    },
  }
}
