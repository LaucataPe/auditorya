/**
 * Libro auxiliar por movimientos (un asiento por fila), como lo exportan los
 * programas contables colombianos. Lógica pura; recibe la matriz de strings que
 * ya produce leerExcelAFilas / parseCsv. Formatos reales con los que se probó
 * (fixtures en ./fixtures): Pluss100 ("AUXILIAR POR CUENTAS": cuenta y tercero
 * como "código - nombre", DEBITO/CREDITO), World Office ("Libro Auxiliar entre
 * el … y el …": la cuenta solo va en la primera fila del bloque y las demás la
 * heredan, fila SALDO INICIAL y filas "Total …", tercero solo con nombre, fecha
 * como serial de Excel; su auxiliar de retenciones trae UNA columna "Valor" más
 * "%" y "Base") y Siesa (exportación de movimientos con Auxiliar / Desc. auxiliar
 * / Nit tercero / Base gravable / Débitos / Créditos / Neto, a veces sin tildes).
 * El encabezado se elige por puntaje entre las primeras filas, no por posición.
 * Un balance de prueba del período (sin fechas) no es un auxiliar: lo lee
 * parse-balance-periodo y `leerLibroContable` decide cuál de los dos aplica.
 *
 * Lo no obvio: al cierre de cada período los programas registran un
 * comprobante que cancela las cuentas de IVA (débito al generado y crédito a
 * los descontables por el total del período). Si se suman a ciegas, el período
 * da cero. `resumirAuxiliarPeriodo` detecta ese cierre —movimiento del último
 * día, en el lado contrario, por el neto exacto del resto— y lo excluye
 * dejándolo en la bitácora.
 */
import { parseNumeroLocal } from './parse-balance'

export type MovimientoAuxiliar = {
  /** YYYY-MM-DD */
  fecha: string
  tipoDoc: string | null
  numeroDoc: string | null
  /** Código PUC sin separadores. */
  cuenta: string
  cuentaNombre: string | null
  /** NIT o documento del tercero, sin dígito de verificación ni nombre. */
  tercero: string | null
  terceroNombre: string | null
  concepto: string | null
  debito: number
  credito: number
  /** Base gravable del asiento, si el software la exporta (Siesa, World Office retenciones). */
  base?: number | null
  /** Tarifa en porcentaje (19, 2.5), si el software la exporta. */
  tarifa?: number | null
}

export type ColumnasAuxiliar = {
  fecha: number
  cuenta: number | null
  /** Nombre de la cuenta en columna propia (Siesa "Desc. auxiliar"); si no, va con el código. */
  cuentaNombre: number | null
  /** Débito y crédito en columnas propias… */
  debito: number | null
  credito: number | null
  /** …o un solo importe con signo ("Valor", "Neto"): va al lado natural de la cuenta. */
  valor: number | null
  tipoDoc: number | null
  numeroDoc: number | null
  tercero: number | null
  terceroNombre: number | null
  concepto: number | null
  base: number | null
  tarifa: number | null
}

export type AuxiliarParseado = {
  movimientos: MovimientoAuxiliar[]
  columnas: ColumnasAuxiliar
  /** Fila (1-based) donde se detectó el encabezado. */
  filaEncabezado: number
  encabezado: {
    empresa: string | null
    periodoDesde: string | null
    periodoHasta: string | null
    /** Cuenta única del auxiliar cuando no hay columna de cuenta y el título la trae ("CUENTA: 2408…"). */
    cuentaTitulo: string | null
  }
  /** Filas con fecha pero sin cuenta o sin importe legible. */
  filasIgnoradas: number
  advertencias: string[]
  /** Qué columnas se reconocieron (para mostrarle al auditor cómo se leyó el archivo). */
  reconocidas: string[]
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Excel guarda fechas como días desde 1899-12-30. */
function fechaDesdeSerial(n: number): string | null {
  if (!isFinite(n) || n < 20000 || n > 80000) return null
  const ms = Math.round((n - 25569) * 86_400_000)
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Normaliza una celda de fecha a YYYY-MM-DD. Acepta ISO (con o sin hora),
 * DD/MM/YYYY, DD-MM-YYYY y el serial de Excel. Devuelve null si no es fecha.
 */
export function normalizarFecha(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return fechaDesdeSerial(raw)
  const s = raw.toString().trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s)
  if (m) return validar(m[1], m[2], m[3])
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T].*)?$/.exec(s)
  if (m) return validar(m[3], m[2].padStart(2, '0'), m[1].padStart(2, '0'))
  if (/^\d{5}(\.\d+)?$/.test(s)) return fechaDesdeSerial(Number(s))
  return null
}

function validar(a: string, m: string, d: string): string | null {
  const mes = Number(m)
  const dia = Number(d)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return `${a}-${m}-${d}`
}

/** "24081010 - IVA DESC. COMPRAS 19%" → { codigo: '24081010', nombre: 'IVA DESC. COMPRAS 19%' }. */
export function separarCodigoNombre(raw: string): { codigo: string; nombre: string | null } | null {
  // "NIT  901926885" (World Office) → el código es el número; "123.0" (xls) → sin decimal.
  const s = (raw ?? '').toString().trim().replace(/^(nit|c\.?c\.?|cc)\s*:?\s*/i, '').replace(/^(\d+)\.0+$/, '$1')
  const m = /^(\d[\d.]*\d|\d)\s*(?:[-–—:]\s*|\s{2,}|\s(?=[A-Za-zÁÉÍÓÚÑáéíóúñ]))?(.*)$/.exec(s)
  if (!m) return null
  const codigo = m[1].replace(/\./g, '')
  if (!/^\d+$/.test(codigo)) return null
  const nombre = m[2].trim()
  return { codigo, nombre: nombre || null }
}

/**
 * Puntúa una fila como encabezado del auxiliar y devuelve las columnas. Se
 * eligen por sinónimos (sin tildes, y tolerando "Dbitos" cuando el xls perdió
 * la tilde). Exige fecha y un importe (débito y crédito, o un solo valor).
 */
export function puntuarEncabezado(fila: string[]): { columnas: ColumnasAuxiliar; puntaje: number; reconocidas: string[] } | null {
  const h = fila.map((c) => sinAcentos((c ?? '').toString()).replace(/\s+/g, ' ').trim())
  const usadas = new Set<number>()
  const buscar = (re: RegExp, excluir?: RegExp) => {
    const i = h.findIndex((c, idx) => !usadas.has(idx) && c !== '' && re.test(c) && !(excluir && excluir.test(c)))
    if (i >= 0) usadas.add(i)
    return i >= 0 ? i : null
  }
  const fecha = buscar(/^fecha(?!.*(vcto|venc|cruce|proveedor|recaudo|docto))/)
  // "Débito", "Movimiento débito", "Valor débito" (Siigo, Helisa, Alegra…), pero no el saldo.
  const debito = buscar(/^d[e]?bito|\bd[e]?bitos?\b|^debe$/, /saldo/)
  const credito = buscar(/^cr[e]?dito|\bcr[e]?ditos?\b|^haber$/, /saldo/)
  const valor = debito === null && credito === null ? buscar(/^valor$|^neto$|^importe$|^monto$|^movimiento$/) : null
  if (fecha === null || (valor === null && (debito === null || credito === null))) return null
  const cuenta = buscar(/^cuenta$|^cuentas?\b(?!\/)|^codigo|^cod\.?\s|^cta|^auxiliar$|^cuenta contable|codigo (de la )?cuenta/, /nombre|tercero/)
  const cuentaNombre = buscar(/^desc\.? ?auxiliar|nombre (de la )?cuenta|^descripcion (de la )?cuenta|^nombre$|^cuenta$/)
  const tercero = buscar(/^nit tercero|^nit\b|^tercero|^beneficiario|^identificacion/)
  const terceroNombre = buscar(/^raz[o]?n social(?!.*movto)|^nombre (del )?tercero/)
  const tipoDoc = buscar(/^tp\.?\s*doc|^tipo/)
  const numeroDoc = buscar(/^n[°º.o]*\s*doc|^numero|^nro|^no\.|^documento$|^comprobante|^docto\.?$|^doc num|^cuenta\/documento/)
  const concepto = buscar(/^concepto|^detalle|^descripcion|^observacion|^notas?$/)
  const base = buscar(/^base/)
  const tarifa = buscar(/^%$|^tarifa|^porcentaje|^% ?ret/)
  const columnas: ColumnasAuxiliar = { fecha, cuenta, cuentaNombre, debito, credito, valor, tipoDoc, numeroDoc, tercero, terceroNombre, concepto, base, tarifa }
  const reconocidas = (Object.entries(columnas) as [string, number | null][]).filter(([, v]) => v !== null).map(([k]) => k)
  // Fecha e importe valen doble: son lo que hace auxiliar a un auxiliar.
  const puntaje = reconocidas.length + 2 + (valor === null ? 1 : 0)
  return { columnas, puntaje, reconocidas }
}

/** Fila de saldo inicial, total o subtotal: no es un movimiento aunque tenga importe. */
function esFilaResumen(fila: string[]): boolean {
  const textos = fila.map((c) => sinAcentos((c ?? '').toString()).trim()).filter(Boolean)
  return textos.some((t) => /^(total|totales|sub-?total|saldo inicial|saldo anterior|saldo final|sumas iguales|suma )/.test(t) || t === 'saldo')
}

/**
 * Lee "PERIODO: 01/01/2026 - 30/04/2026 … CUENTA: 2408 - …" (Pluss100) o
 * "Libro Auxiliar entre el 01/07/2026 y el 31/08/2026" (World Office) de las
 * filas de título que preceden al encabezado.
 */
export function leerTitulos(filas: string[][], hasta: number) {
  let empresa: string | null = null
  let periodoDesde: string | null = null
  let periodoHasta: string | null = null
  let cuentaTitulo: string | null = null
  for (let i = 0; i < hasta; i++) {
    const texto = (filas[i] ?? []).map((c) => (c ?? '').toString().trim()).filter(Boolean).join('  ')
    if (!texto) continue
    const per =
      /periodo\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})\s*(?:-|a|al|hasta)\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{2}-\d{2})/i.exec(texto) ??
      /entre el\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s*y el\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})/i.exec(texto)
    if (per) {
      periodoDesde = normalizarFecha(per[1])
      periodoHasta = normalizarFecha(per[2])
    }
    const cta = /cuenta\s*:\s*(\d[\d.]*)/i.exec(texto)
    if (cta && !/cuenta\s+(inicio|fin)/i.test(texto)) cuentaTitulo = cta[1].replace(/\./g, '')
    if (i === 0 && !/periodo|cuenta|auxiliar|libro|balance|comprobacion/i.test(texto)) empresa = texto
  }
  return { empresa, periodoDesde, periodoHasta, cuentaTitulo }
}

/**
 * Lee el auxiliar. Sin `forzado`, detecta el encabezado y las columnas; con él (columnas que indicó el
 * auditor para un formato que no se reconoció), usa exactamente esas.
 */
export function parseAuxiliarMovimientos(filas: string[][], forzado?: { fila: number; columnas: ColumnasAuxiliar }): AuxiliarParseado | null {
  // El encabezado es la fila con mejor puntaje entre las primeras 40 (no la primera que "sirva").
  let mejor: { fila: number; columnas: ColumnasAuxiliar; puntaje: number; reconocidas: string[] } | null = null
  if (forzado) {
    mejor = { fila: forzado.fila, columnas: forzado.columnas, puntaje: 0, reconocidas: (Object.entries(forzado.columnas) as [string, number | null][]).filter(([, v]) => v !== null).map(([k]) => k) }
  } else {
    for (let i = 0; i < Math.min(filas.length, 40); i++) {
      const r = puntuarEncabezado(filas[i] ?? [])
      if (r && (!mejor || r.puntaje > mejor.puntaje)) mejor = { fila: i, ...r }
    }
  }
  if (!mejor) return null
  const { columnas, fila: filaEncabezado, reconocidas } = mejor

  const encabezado = leerTitulos(filas, filaEncabezado)
  const advertencias: string[] = []
  if (columnas.cuenta === null && !encabezado.cuentaTitulo) {
    advertencias.push('El auxiliar no trae columna de cuenta ni la cuenta en el título: no se puede saber a qué cuenta pertenece cada movimiento.')
  }
  if (columnas.valor !== null) {
    advertencias.push('El importe viene en una sola columna: se asignó al lado natural de cada cuenta (débito en activos, costos y gastos; crédito en pasivos, patrimonio e ingresos) y el signo negativo lo invierte.')
  }

  const movimientos: MovimientoAuxiliar[] = []
  let filasIgnoradas = 0
  let heredadas = 0
  const celda = (fila: string[], i: number | null) => (i === null ? '' : (fila[i] ?? '').toString().trim())
  // World Office: la cuenta va en la primera fila del bloque (a veces la de SALDO INICIAL) y las demás la heredan.
  let cuentaActual: { codigo: string; nombre: string | null } | null = encabezado.cuentaTitulo ? { codigo: encabezado.cuentaTitulo, nombre: null } : null

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const cuentaRaw = celda(fila, columnas.cuenta)
    const cuentaFila = cuentaRaw && !/^total/i.test(cuentaRaw) ? separarCodigoNombre(cuentaRaw) : null
    if (cuentaFila) {
      const nombreCol = celda(fila, columnas.cuentaNombre)
      cuentaActual = { codigo: cuentaFila.codigo, nombre: nombreCol || cuentaFila.nombre || (cuentaActual?.codigo === cuentaFila.codigo ? cuentaActual.nombre : null) }
    }
    if (esFilaResumen(fila)) continue
    const fecha = normalizarFecha(celda(fila, columnas.fecha))
    if (!fecha) continue // títulos, filas vacías

    let debito = columnas.debito !== null ? parseNumeroLocal(celda(fila, columnas.debito)) : NaN
    let credito = columnas.credito !== null ? parseNumeroLocal(celda(fila, columnas.credito)) : NaN
    // cuentaActual ya incorpora la fila (código + nombre de su columna) o la hereda del bloque.
    const cuenta = cuentaActual
    if (!cuenta) { filasIgnoradas++; continue }
    if (!cuentaFila) heredadas++
    if (columnas.valor !== null) {
      const v = parseNumeroLocal(celda(fila, columnas.valor))
      if (!isFinite(v)) { filasIgnoradas++; continue }
      const naturalezaDebito = /^[15678]/.test(cuenta.codigo)
      const positivo = Math.abs(v)
      const alDebito = naturalezaDebito ? v >= 0 : v < 0
      debito = alDebito ? positivo : 0
      credito = alDebito ? 0 : positivo
    } else if (!isFinite(debito) && !isFinite(credito)) {
      filasIgnoradas++
      continue
    }
    const terceroCelda = celda(fila, columnas.tercero)
    const tercero = terceroCelda ? separarCodigoNombre(terceroCelda) : null
    const terceroNombreCol = celda(fila, columnas.terceroNombre)
    const baseRaw = columnas.base !== null ? parseNumeroLocal(celda(fila, columnas.base)) : NaN
    const tarifaRaw = columnas.tarifa !== null ? parseNumeroLocal(celda(fila, columnas.tarifa)) : NaN
    movimientos.push({
      fecha,
      tipoDoc: celda(fila, columnas.tipoDoc) || null,
      numeroDoc: celda(fila, columnas.numeroDoc) || null,
      cuenta: cuenta.codigo,
      cuentaNombre: cuenta.nombre,
      tercero: tercero?.codigo ?? null,
      terceroNombre: terceroNombreCol || tercero?.nombre || (tercero ? null : terceroCelda || null),
      concepto: celda(fila, columnas.concepto) || null,
      debito: isFinite(debito) ? debito : 0,
      credito: isFinite(credito) ? credito : 0,
      ...(columnas.base !== null ? { base: isFinite(baseRaw) ? Math.abs(baseRaw) : null } : {}),
      // Tarifa como porcentaje: "0.19" → 19, "19%" → 19.
      ...(columnas.tarifa !== null ? { tarifa: isFinite(tarifaRaw) ? (Math.abs(tarifaRaw) <= 1 ? Math.round(Math.abs(tarifaRaw) * 10000) / 100 : Math.abs(tarifaRaw)) : null } : {}),
    })
  }

  if (movimientos.length === 0) advertencias.push('No se encontraron movimientos con fecha, cuenta e importe.')
  if (movimientos.length > 0 && movimientos.every((m) => m.tercero === null) && movimientos.some((m) => m.terceroNombre)) {
    advertencias.push('El tercero viene solo con nombre, sin NIT: los cruces por tercero se hacen por nombre.')
  }
  if (filasIgnoradas > 0) advertencias.push(`${filasIgnoradas} fila(s) con fecha pero sin cuenta o importe legible se ignoraron.`)
  if (heredadas > 0) advertencias.push(`${heredadas} movimiento(s) tomaron la cuenta de la fila que encabeza su bloque.`)

  return { movimientos, columnas, filaEncabezado: filaEncabezado + 1, encabezado, filasIgnoradas, advertencias, reconocidas }
}

// ─── Resumen por período con exclusión del asiento de cierre ─────────────────

export type ResumenCuentaAuxiliar = {
  cuenta: string
  nombre: string | null
  /** Movimientos reales del período (sin el cierre). */
  debitos: number
  creditos: number
  movimientos: number
  /** Asientos de cierre excluidos (los que cancelan la cuenta al final del período). */
  cierres: MovimientoAuxiliar[]
}

export type ResumenAuxiliarPeriodo = {
  desde: string
  hasta: string
  cuentas: ResumenCuentaAuxiliar[]
  /** Movimientos fuera del período (informativo). */
  fueraDePeriodo: number
  /** Tipos de documento usados por los cierres detectados (p. ej. ['CI']), para la memoria de la empresa. */
  tiposDocCierre: string[]
  bitacora: string[]
}

const TOLERANCIA_CIERRE = 1

/**
 * Suma débitos y créditos por cuenta dentro del período, excluyendo el asiento
 * de cierre: los movimientos del último día con movimientos del período cuyo
 * total, en el lado contrario, cancela exactamente el neto del resto. Si se
 * conoce el tipo de documento del cierre (memoria de la empresa), se excluye
 * por tipo sin exigir que cuadre.
 */
export function resumirAuxiliarPeriodo(
  aux: Pick<AuxiliarParseado, 'movimientos'>,
  periodo: { desde: string; hasta: string },
  opts: { tiposDocCierre?: string[] } = {},
): ResumenAuxiliarPeriodo {
  const bitacora: string[] = []
  const porCuenta = new Map<string, MovimientoAuxiliar[]>()
  let fueraDePeriodo = 0
  for (const m of aux.movimientos) {
    if (m.fecha < periodo.desde || m.fecha > periodo.hasta) {
      fueraDePeriodo++
      continue
    }
    const lista = porCuenta.get(m.cuenta) ?? []
    lista.push(m)
    porCuenta.set(m.cuenta, lista)
  }
  if (fueraDePeriodo > 0) bitacora.push(`${fueraDePeriodo} movimiento(s) fuera del período ${periodo.desde} a ${periodo.hasta}: no se sumaron.`)

  const conocidos = new Set((opts.tiposDocCierre ?? []).map((t) => t.toUpperCase()))
  const tiposDocCierre = new Set<string>()
  const cuentas: ResumenCuentaAuxiliar[] = []

  for (const [cuenta, lista] of [...porCuenta.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let cierres: MovimientoAuxiliar[] = []
    if (conocidos.size) {
      cierres = lista.filter((m) => m.tipoDoc && conocidos.has(m.tipoDoc.toUpperCase()))
    } else {
      const ultimoDia = lista.reduce((max, m) => (m.fecha > max ? m.fecha : max), '')
      const netoDe = (ms: MovimientoAuxiliar[]) => ms.reduce((s, m) => s + m.debito - m.credito, 0)
      // El cierre son los movimientos del último día en un mismo lado cuyo total
      // cancela exactamente el neto de todo lo demás (incluidos otros asientos
      // reales de ese mismo día en el lado contrario).
      for (const lado of ['credito', 'debito'] as const) {
        const candidatos = lista.filter((m) => m.fecha === ultimoDia && m[lado] > 0 && m[lado === 'credito' ? 'debito' : 'credito'] === 0)
        if (candidatos.length === 0 || candidatos.length === lista.length) continue
        const resto = lista.filter((m) => !candidatos.includes(m))
        const netoResto = netoDe(resto)
        if (netoResto !== 0 && Math.abs(netoResto + netoDe(candidatos)) <= TOLERANCIA_CIERRE) {
          cierres = candidatos
          break
        }
      }
    }
    const reales = lista.filter((m) => !cierres.includes(m))
    for (const c of cierres) if (c.tipoDoc) tiposDocCierre.add(c.tipoDoc.toUpperCase())
    if (cierres.length) {
      const monto = cierres.reduce((s, m) => s + Math.abs(m.debito - m.credito), 0)
      bitacora.push(
        `Cuenta ${cuenta}: excluí ${cierres.length} asiento(s) de cierre del ${cierres[0].fecha}${cierres[0].tipoDoc ? ` (${cierres[0].tipoDoc})` : ''} por ${Math.round(monto).toLocaleString('es-CO')}: cancela el neto del período.`,
      )
    }
    cuentas.push({
      cuenta,
      nombre: lista.find((m) => m.cuentaNombre)?.cuentaNombre ?? null,
      debitos: reales.reduce((s, m) => s + m.debito, 0),
      creditos: reales.reduce((s, m) => s + m.credito, 0),
      movimientos: reales.length,
      cierres,
    })
  }

  return { desde: periodo.desde, hasta: periodo.hasta, cuentas, fueraDePeriodo, tiposDocCierre: [...tiposDocCierre], bitacora }
}
