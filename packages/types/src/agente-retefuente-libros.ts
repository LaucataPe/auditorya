/**
 * Según libros para la declaración de retención en la fuente (Formulario 350):
 * de las subcuentas de 2365 (retefuente), 2367 (rete-IVA practicada) y, en
 * algunos planes de cuentas, 2364, a los renglones del catálogo
 * `rf-{pj|pn}-{concepto}` (retención) y `…-base` (base), más las autorretenciones
 * `rf-ar-…`. Lógica pura.
 *
 * Lo no obvio:
 *  - El concepto sale del NOMBRE de la subcuenta (honorarios, servicios,
 *    compras…) con ayuda del código PUC (236515 honorarios, 236525 servicios…);
 *    lo que no se reconoce queda como ambigüedad y, cuando el auditor decide,
 *    en la memoria de la empresa (`mapeo2365`).
 *  - El 350 separa personas jurídicas y naturales. Con los asientos y su
 *    tercero se separa por NIT (8xx/9xx = jurídica) o, si no hay NIT, por el
 *    nombre (SAS, LTDA, S.A. …); sin asientos (balance de prueba) solo se
 *    puede comparar el total del concepto, y el mapeo lo dice.
 *  - La base solo existe si el software la exporta por asiento (World Office
 *    "Base", Siesa "Base gravable"). Sin base no hay verificación de tarifa.
 */
import type { SaldoTerceroPeriodo } from './parse-balance-periodo'
import { probarRetencionPorTercero, type PruebaTercerosRetencion } from './agente-retefuente-terceros'
import type { MovimientoAuxiliar, ResumenAuxiliarPeriodo, ResumenCuentaAuxiliar } from './parse-auxiliar'
import { tarifaAdmisible } from './tarifas-retefuente'

export type Beneficiario350 = 'pj' | 'pn'

/** Conceptos del 350 (claves de CONCEPTOS_RENTA_350) más los de autorretención con prefijo "ar:". */
export type ConceptoRetefuente =
  | 'trabajo' | 'pensiones' | 'honorarios' | 'comisiones' | 'servicios' | 'rendimientos' | 'arrendamientos' | 'regalias' | 'dividendos'
  | 'compras' | 'tarjetas' | 'construccion' | 'enajenacion' | 'loterias' | 'hidrocarburos' | 'otros' | 'exterior-sin-convenio' | 'exterior-con-convenio'
  | 'ar:exonerados' | 'ar:ventas' | 'ar:honorarios' | 'ar:comisiones' | 'ar:servicios' | 'ar:rendimientos' | 'ar:otros'
  | 'reteiva' | 'reteiva-no-residentes'

export type DestinoRetefuente = ConceptoRetefuente | 'saldo' | 'ignorar'

/** Opciones que se le muestran al auditor en una ambigüedad (y claves válidas de la memoria). */
export const OPCIONES_CONCEPTO_RETEFUENTE: { clave: DestinoRetefuente; label: string }[] = [
  { clave: 'compras', label: 'Compras' },
  { clave: 'servicios', label: 'Servicios' },
  { clave: 'honorarios', label: 'Honorarios' },
  { clave: 'comisiones', label: 'Comisiones' },
  { clave: 'arrendamientos', label: 'Arrendamientos' },
  { clave: 'trabajo', label: 'Rentas de trabajo (nómina)' },
  { clave: 'rendimientos', label: 'Rendimientos financieros' },
  { clave: 'dividendos', label: 'Dividendos y participaciones' },
  { clave: 'otros', label: 'Otros pagos sujetos a retención' },
  { clave: 'exterior-sin-convenio', label: 'Pagos al exterior' },
  { clave: 'ar:exonerados', label: 'Autorretención especial (art. 114-1)' },
  { clave: 'ar:otros', label: 'Autorretención por otros conceptos' },
  { clave: 'reteiva', label: 'Retención de IVA practicada' },
  { clave: 'saldo', label: 'Saldo por pagar (no es retención del período)' },
  { clave: 'ignorar', label: 'No es retención en la fuente' },
]

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tarifa que insinúa el nombre de la subcuenta: "2.5%", "2,5 %", "11%". */
export function tarifaDelNombreRf(nombre: string | null): number | null {
  const m = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(nombre ?? '')
  return m ? Number(m[1].replace(',', '.')) : null
}

/** ¿El nombre dice que el tercero es NO declarante? (cambia la tarifa esperada) */
export function noDeclaranteDelNombre(nombre: string | null): boolean | null {
  const n = norm(nombre)
  if (/no\s*declarante/.test(n)) return true
  if (/declarante/.test(n)) return false
  return null
}

/**
 * Concepto por el nombre de la subcuenta, con el código PUC como pista de
 * respaldo. null = no se sabe (ambigüedad).
 */
export function clasificarSubcuentaRetefuente(codigo: string, nombre: string | null): DestinoRetefuente | null {
  const n = norm(nombre)
  if (codigo.startsWith('2367')) {
    if (/por pagar|saldo/.test(n)) return 'saldo'
    if (/no (residente|domiciliad)|exterior/.test(n)) return 'reteiva-no-residentes'
    return 'reteiva'
  }
  if (/por pagar|a favor|saldo|transitori|cuenta corriente/.test(n)) return 'saldo'
  if (/autorret|auto ret|auto-ret/.test(n)) {
    if (/venta/.test(n)) return 'ar:ventas'
    if (/honorar/.test(n)) return 'ar:honorarios'
    if (/comision/.test(n)) return 'ar:comisiones'
    if (/servici/.test(n)) return 'ar:servicios'
    if (/rendimient|interes|financier/.test(n)) return 'ar:rendimientos'
    if (/renta|especial|114|exonerad|ingreso/.test(n)) return 'ar:exonerados'
    return 'ar:otros'
  }
  if (/salario|laboral|nomina|rentas? de trabajo|sueldo|empleado/.test(n)) return 'trabajo'
  if (/pension/.test(n)) return 'pensiones'
  if (/honorar/.test(n)) return 'honorarios'
  if (/comision/.test(n)) return 'comisiones'
  if (/arrend|alquiler|canon/.test(n)) return 'arrendamientos'
  if (/dividend|participacion/.test(n)) return 'dividendos'
  if (/rendimient|interes|financier/.test(n)) return 'rendimientos'
  if (/regalia|propiedad intelectual|licenc.*(marca|uso)/.test(n)) return 'regalias'
  if (/loteria|rifa|apuesta|premio/.test(n)) return 'loterias'
  if (/construcc|obra civil|urbaniz/.test(n)) return 'construccion'
  if (/tarjeta/.test(n)) return 'tarjetas'
  if (/hidrocarbur|carbon|miner|petrol/.test(n)) return 'hidrocarburos'
  if (/exterior|no residente|no domiciliad|extranjer/.test(n)) return /convenio|cdi/.test(n) && !/sin convenio/.test(n) ? 'exterior-con-convenio' : 'exterior-sin-convenio'
  if (/enajenacion|activo fijo|notari/.test(n)) return 'enajenacion'
  if (/servici|transporte|vigilancia|aseo|software|licenciamiento|ips|eps|mantenimiento|fletes?/.test(n)) return 'servicios'
  if (/compra|bienes|mercanc|energia|vehiculo|agricol|agropec|combustible|insumo|materia prima/.test(n)) return 'compras'
  if (/otros|otras|demas/.test(n)) return 'otros'
  // Pista PUC (subcuenta 6 dígitos de 2365) cuando el nombre no dice nada.
  const sub = codigo.slice(0, 6)
  const porPuc: Record<string, DestinoRetefuente> = {
    '236505': 'trabajo', '236510': 'dividendos', '236515': 'honorarios', '236520': 'comisiones', '236525': 'servicios', '236530': 'arrendamientos',
    '236535': 'rendimientos', '236540': 'compras', '236545': 'loterias', '236550': 'exterior-sin-convenio', '236560': 'enajenacion', '236565': 'otros',
    '236570': 'otros', '236575': 'ar:exonerados',
  }
  return codigo.startsWith('2365') ? porPuc[sub] ?? null : null
}

/**
 * Persona jurídica o natural por el NIT (los NIT de sociedades empiezan por 8 o
 * 9 y tienen 9 dígitos) o, sin NIT, por la forma del nombre. null = no se sabe.
 */
/** NIT de la DIAN (U.A.E. Dirección de Impuestos y Aduanas Nacionales), sin dígito de verificación. */
export const NIT_DIAN = '800197268'

/** Dígito de verificación del NIT (DIAN): pesos primos de derecha a izquierda, módulo 11. */
export function digitoVerificacionNit(nit: string): number {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const d = nit.replace(/\D/g, '').split('').reverse()
  const suma = d.reduce((s, x, i) => s + Number(x) * (pesos[i] ?? 0), 0)
  const r = suma % 11
  return r > 1 ? 11 - r : r
}

/** Quita el dígito de verificación cuando el software lo exporta pegado al NIT ("9001234561" → "900123456"). */
export function normalizarNit(nit: string | null): string {
  const n = (nit ?? '').replace(/-\d$/, '').replace(/\D/g, '')
  if (n.length === 10 && /^[89]/.test(n) && digitoVerificacionNit(n.slice(0, 9)) === Number(n[9])) return n.slice(0, 9)
  return n
}

export function beneficiarioDeTercero(nit: string | null, nombre: string | null): Beneficiario350 | null {
  const n = normalizarNit(nit)
  if (n.length === 9 && /^[89]/.test(n)) return 'pj'
  // 10 dígitos que empiezan por 8 o 9 sin dígito de verificación válido: ni cédula (las de 10 empiezan por 1) ni NIT; decide el nombre.
  if (n.length >= 6 && n.length <= 10 && !/^[89]\d{8}$/.test(n) && !/^[89]\d{9}$/.test(n)) return 'pn'
  const s = norm(nombre)
  if (!s) return null
  if (/\b(s\.?a\.?s\.?|s\.?a\.?|ltda\.?|limitada|e\.?u\.?|s\.?c\.?a\.?|s\.? en c\.?|s\.?c\.?s\.?|e\.?s\.?p\.?|sas|inc\.?|llc|corp\.?|gmbh|b\.?v\.?|fundacion|cooperativa|coop\.?|asociacion|corporacion|universidad|colegio|banco|fiduciaria|compania|compañia|cia\.?|consorcio|union temporal|ips|eps|iglesia|municipio|alcaldia|gobernacion|ministerio|dian|empresa|industrias?|comercializadora|inversiones|constructora|distribuidora|laboratorios?)\b/.test(s)) return 'pj'
  if (/consumidor final|cuantias menores|varios/.test(s)) return null
  // Dos apellidos y nombres: persona natural.
  if (/^[a-z]+ [a-z]+ [a-z]+/.test(s)) return 'pn'
  return null
}

export type CuentaMapeadaRf = {
  cuenta: string
  nombre: string | null
  destino: DestinoRetefuente | null
  /** Retención neta del período (créditos − débitos, naturaleza pasiva). */
  neto: number
  regla: 'memoria' | 'nombre' | 'puc' | 'ignorada'
  motivo: string
  /** Tarifa que anuncia el nombre ("COMPRAS DECLARANTES 2.5%"), si la trae. */
  tarifaNombre: number | null
}

/** Asiento con base y retención: lo que permite verificar la tarifa uno por uno. */
export type AsientoRetefuente = {
  cuenta: string
  concepto: ConceptoRetefuente
  beneficiario: Beneficiario350 | null
  tercero: string | null
  terceroNombre: string | null
  fecha: string
  numeroDoc: string | null
  base: number
  retencion: number
  /** Tarifa registrada por el software (%), o implícita retención/base. */
  tarifa: number
  tarifaRegistrada: number | null
}

export type MapeoLibrosRetefuente = {
  /** Renglones digitables `rf-…` (retención y, si hubo asientos con base, `-base`), redondeados a pesos. */
  cifras: Record<string, { libros: number }>
  /** Total por concepto (jurídicas + naturales), siempre disponible aunque no se conozca el beneficiario. */
  conceptos: Record<string, { retencion: number; base: number | null; beneficiarioConocido: boolean }>
  cuentas: CuentaMapeadaRf[]
  sinClasificar: ResumenCuentaAuxiliar[]
  /** Asientos con base (para R-15); vacío si el libro no la trae. */
  asientos: AsientoRetefuente[]
  /** Anomalías por asiento: tarifa aplicada que no corresponde a la registrada, o tarifa no admisible para el concepto. */
  anomalias: { asiento: AsientoRetefuente; tipo: 'calculo' | 'tarifa'; detalle: string }[]
  /** Movimientos cuyo beneficiario (jurídica/natural) no se pudo determinar. */
  sinBeneficiario: number
  /** Razonabilidad por tercero (R-17): lo causado a cada tercero contra lo que se le retuvo. null si el libro no trae terceros. */
  terceros?: PruebaTercerosRetencion | null
  /** Por qué no se pudo correr la prueba por tercero. */
  tercerosPorQue?: string | null
  bitacora: string[]
}

const conceptoARenglon = (c: ConceptoRetefuente, b: Beneficiario350): string | null => {
  if (c === 'reteiva') return 'rf-reteiva'
  if (c === 'reteiva-no-residentes') return 'rf-reteiva-no-residentes'
  if (c.startsWith('ar:')) return `rf-ar-${b}-${c.slice(3)}`
  return `rf-${b}-${c}`
}

/**
 * Mapea el resumen del período (débitos/créditos por subcuenta) y, si los hay,
 * los asientos, a los renglones del 350.
 */
export function mapearLibrosRetefuente(
  resumen: Pick<ResumenAuxiliarPeriodo, 'cuentas'>,
  movimientos: MovimientoAuxiliar[],
  memoria: { mapeo?: Record<string, string> } = {},
  opts: { renglonesValidos?: Set<string>; saldosTercero?: SaldoTerceroPeriodo[]; anio?: number; nitEmpresa?: string | null } = {},
): MapeoLibrosRetefuente {
  const bitacora: string[] = []
  const cuentas: CuentaMapeadaRf[] = []
  const sinClasificar: ResumenCuentaAuxiliar[] = []
  const conceptos: MapeoLibrosRetefuente['conceptos'] = {}
  const suma = new Map<string, number>()
  const asientos: AsientoRetefuente[] = []
  const anomalias: MapeoLibrosRetefuente['anomalias'] = []
  let sinBeneficiario = 0
  let ignoradas = 0

  const esRetefuente = (codigo: string) => /^(2365|2364|2367)/.test(codigo)
  // Rentas de trabajo, pensiones y enajenación solo existen a naturales; la autorretención es de la propia empresa.
  const beneficiarioFijo = (d: ConceptoRetefuente): Beneficiario350 | null => (d === 'trabajo' || d === 'pensiones' || d === 'enajenacion' ? 'pn' : d.startsWith('ar:') ? 'pj' : null)
  const terceroPorCuenta = new Map<string, SaldoTerceroPeriodo[]>()
  for (const t of opts.saldosTercero ?? []) {
    if (!esRetefuente(t.cuenta) || (t.debitos === 0 && t.creditos === 0)) continue
    const l = terceroPorCuenta.get(t.cuenta) ?? []
    l.push(t)
    terceroPorCuenta.set(t.cuenta, l)
  }
  const acumular = (id: string, v: number) => suma.set(id, (suma.get(id) ?? 0) + v)

  // Asientos por cuenta, para separar por beneficiario y leer base/tarifa.
  const movPorCuenta = new Map<string, MovimientoAuxiliar[]>()
  for (const m of movimientos) {
    if (!esRetefuente(m.cuenta)) continue
    const l = movPorCuenta.get(m.cuenta) ?? []
    l.push(m)
    movPorCuenta.set(m.cuenta, l)
  }

  // El débito a la DIAN en 2365/2367 es el pago de la declaración anterior, no una reversión del período.
  const esPagoDian = (tercero: string | null, debito: number) => debito > 0 && normalizarNit(tercero) === NIT_DIAN
  let pagosDianTotal = 0
  let cuentasSinDetalle = 0
  for (const c of resumen.cuentas) {
    if (!esRetefuente(c.cuenta)) { ignoradas++; continue }
    const movsCuenta = movPorCuenta.get(c.cuenta) ?? []
    const saldosCuenta = terceroPorCuenta.get(c.cuenta) ?? []
    const pagosDian = movsCuenta.length
      ? movsCuenta.filter((m) => esPagoDian(m.tercero, m.debito)).reduce((x, m) => x + m.debito, 0)
      : saldosCuenta.filter((t) => esPagoDian(t.tercero, t.debitos)).reduce((x, t) => x + t.debitos, 0)
    const sinDetalle = movsCuenta.length === 0 && saldosCuenta.length === 0
    // Sin tercero no se distingue el pago a la DIAN de una reversión: se toma lo causado (créditos) y se deja dicho.
    const neto = sinDetalle ? c.creditos : c.creditos - (c.debitos - pagosDian)
    pagosDianTotal += pagosDian
    const tarifaNombre = tarifaDelNombreRf(c.nombre)
    const propio = memoria.mapeo?.[c.cuenta] as DestinoRetefuente | undefined
    const destino = propio ?? clasificarSubcuentaRetefuente(c.cuenta, c.nombre)
    const regla: CuentaMapeadaRf['regla'] = propio ? 'memoria' : destino && /[a-z]/.test(norm(c.nombre)) ? 'nombre' : 'puc'
    if (destino === 'saldo' || destino === 'ignorar') {
      cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino, neto: 0, regla: propio ? 'memoria' : 'ignorada', motivo: destino === 'saldo' ? 'Subcuenta de saldo por pagar: no es retención del período.' : 'Marcada como "no es retención" por la firma.', tarifaNombre })
      continue
    }
    if (!destino) {
      sinClasificar.push(c)
      cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino: null, neto: 0, regla: 'ignorada', motivo: 'No se pudo clasificar por el nombre ni por el código: requiere confirmación.', tarifaNombre })
      continue
    }
    cuentas.push({ cuenta: c.cuenta, nombre: c.nombre, destino, neto, regla, motivo: propio ? 'Mapeo guardado por la firma para esta empresa.' : regla === 'nombre' ? `Por el nombre "${c.nombre}".` : `Por la subcuenta PUC ${c.cuenta.slice(0, 6)}.`, tarifaNombre })

    const con = (conceptos[destino] ??= { retencion: 0, base: null, beneficiarioConocido: false })
    con.retencion += neto
    if (sinDetalle && c.debitos > 0) cuentasSinDetalle++

    const movs = movsCuenta.filter((m) => !esPagoDian(m.tercero, m.debito))
    if (destino === 'reteiva' || destino === 'reteiva-no-residentes') {
      acumular(conceptoARenglon(destino, 'pj')!, neto)
      con.beneficiarioConocido = true
      continue
    }
    if (movsCuenta.length === 0) {
      // Balance por terceros: la retención de cada tercero se separa por su NIT o su nombre.
      const saldos = saldosCuenta.map((t) => (esPagoDian(t.tercero, t.debitos) ? { ...t, debitos: 0 } : t)).filter((t) => t.debitos !== 0 || t.creditos !== 0)
      if (saldosCuenta.length === 0) continue // balance sin terceros: se compara por concepto
      const porB: Record<Beneficiario350, number> = { pj: 0, pn: 0 }
      let asignado = 0
      for (const t of saldos) {
        const b = beneficiarioFijo(destino) ?? beneficiarioDeTercero(t.tercero, t.terceroNombre)
        if (!b) { sinBeneficiario++; continue }
        const ret = t.creditos - t.debitos
        porB[b] += ret
        asignado += ret
      }
      if (Math.abs(asignado - neto) > 1) bitacora.push(`Cuenta ${c.cuenta}: ${Math.round(neto - asignado).toLocaleString('es-CO')} de retención sin beneficiario identificable (jurídica/natural) en el detalle por tercero; solo suma al total del concepto.`)
      con.beneficiarioConocido = con.beneficiarioConocido || asignado !== 0
      for (const b of ['pj', 'pn'] as Beneficiario350[]) {
        const r = conceptoARenglon(destino, b)
        if (r && porB[b] !== 0) acumular(r, porB[b])
      }
      continue
    }
    // Con asientos: separa por beneficiario y suma base cuando la trae.
    let baseCuenta = 0
    let hayBase = false
    const porBeneficiario: Record<Beneficiario350, { ret: number; base: number }> = { pj: { ret: 0, base: 0 }, pn: { ret: 0, base: 0 } }
    let netoAsignado = 0
    for (const m of movs) {
      const ret = m.credito - m.debito
      const b: Beneficiario350 | null = beneficiarioFijo(destino) ?? beneficiarioDeTercero(m.tercero, m.terceroNombre)
      const signoBase = m.credito >= m.debito ? 1 : -1
      const base = typeof m.base === 'number' ? m.base * signoBase : null
      if (base !== null) { hayBase = true; baseCuenta += base }
      if (!b) { sinBeneficiario++; continue }
      porBeneficiario[b].ret += ret
      if (base !== null) porBeneficiario[b].base += base
      netoAsignado += ret
      if (base !== null && base !== 0 && ret !== 0) {
        const tarifaImplicita = Math.round((ret / base) * 10000) / 100
        const asiento: AsientoRetefuente = { cuenta: m.cuenta, concepto: destino, beneficiario: b, tercero: m.tercero, terceroNombre: m.terceroNombre, fecha: m.fecha, numeroDoc: m.numeroDoc, base, retencion: ret, tarifa: tarifaImplicita, tarifaRegistrada: m.tarifa ?? null }
        asientos.push(asiento)
        // Rentas de trabajo y pensiones no son base × tarifa plana (tabla del art. 383 ET): no se recalculan.
        const tarifaPlana = destino !== 'trabajo' && destino !== 'pensiones' && destino !== 'dividendos'
        if (tarifaPlana && m.tarifa != null && Math.abs(base * (m.tarifa / 100) - ret) > Math.max(100, Math.abs(ret) * 0.01)) {
          anomalias.push({ asiento, tipo: 'calculo', detalle: `Retención ${Math.round(ret)} ≠ ${m.tarifa} % de la base ${Math.round(base)} (${Math.round(base * (m.tarifa / 100))}).` })
        } else if (tarifaPlana && !destino.startsWith('ar:')) {
          const adm = tarifaAdmisible(destino, m.tarifa ?? tarifaImplicita)
          if (adm === false) anomalias.push({ asiento, tipo: 'tarifa', detalle: `Tarifa ${m.tarifa ?? tarifaImplicita} % no es admisible para ${destino}.` })
        }
      }
    }
    // Lo que no se pudo asignar a un beneficiario queda en el concepto total (no en pj/pn).
    if (netoAsignado !== neto && Math.abs(netoAsignado - neto) > 1) {
      bitacora.push(`Cuenta ${c.cuenta}: ${Math.round(neto - netoAsignado).toLocaleString('es-CO')} de retención sin beneficiario identificable (jurídica/natural); solo suma al total del concepto.`)
    }
    con.beneficiarioConocido = con.beneficiarioConocido || netoAsignado !== 0
    for (const b of ['pj', 'pn'] as Beneficiario350[]) {
      const r = conceptoARenglon(destino, b)
      if (!r) continue
      if (porBeneficiario[b].ret !== 0) acumular(r, porBeneficiario[b].ret)
      if (hayBase && porBeneficiario[b].base !== 0) acumular(`${r}-base`, porBeneficiario[b].base)
    }
    if (hayBase) con.base = (con.base ?? 0) + baseCuenta
  }

  const cifras: MapeoLibrosRetefuente['cifras'] = {}
  for (const [id, v] of suma) {
    if (opts.renglonesValidos && !opts.renglonesValidos.has(id)) {
      // Concepto sin casilla para ese beneficiario (p. ej. honorarios a jurídicas sí, rentas de trabajo a jurídicas no).
      bitacora.push(`Renglón ${id} no existe en el formulario: su valor (${Math.round(v).toLocaleString('es-CO')}) queda solo en el total del concepto.`)
      continue
    }
    cifras[id] = { libros: Math.round(v) }
  }
  if (pagosDianTotal > 0) bitacora.push(`${Math.round(pagosDianTotal).toLocaleString('es-CO')} debitados a la DIAN en 2365/2367 (pago de la declaración anterior) no se descontaron de lo retenido en el período.`)
  if (cuentasSinDetalle > 0) bitacora.push(`${cuentasSinDetalle} cuenta(s) de retención con débitos y sin detalle por tercero: se tomó lo causado (créditos), porque no se puede distinguir el pago a la DIAN de una reversión. Con el balance por terceros o el auxiliar se precisa.`)
  const mapeadas = cuentas.filter((x) => x.destino && x.destino !== 'saldo' && x.destino !== 'ignorar').length
  bitacora.unshift(`Retención en la fuente: ${mapeadas} subcuenta(s) de 2365/2367 mapeadas a ${Object.keys(conceptos).length} concepto(s) del 350; ${asientos.length} asiento(s) con base para verificar tarifa.`)
  if (sinClasificar.length) bitacora.push(`${sinClasificar.length} subcuenta(s) sin clasificar: requieren confirmación.`)
  if (sinBeneficiario) bitacora.push(`${sinBeneficiario} asiento(s) sin poder decir si el tercero es persona jurídica o natural.`)
  if (ignoradas) bitacora.push(`${ignoradas} cuenta(s) fuera de 2365/2367 no se usaron.`)
  // Razonabilidad por tercero: solo si el libro trae detalle por tercero (balance por terceros o asientos con tercero).
  let terceros: PruebaTercerosRetencion | null = null
  let tercerosPorQue: string | null = 'El libro no trae detalle por tercero.'
  if (opts.saldosTercero?.length) {
    const r = probarRetencionPorTercero(opts.saldosTercero, { anio: opts.anio ?? new Date().getFullYear(), memoria: memoria.mapeo, nitEmpresa: opts.nitEmpresa })
    terceros = r.prueba
    tercerosPorQue = r.porQue
    if (r.prueba) bitacora.push(...r.prueba.bitacora)
  }
  return { cifras, conceptos, cuentas, sinClasificar, asientos, anomalias, sinBeneficiario, terceros, tercerosPorQue, bitacora }
}
