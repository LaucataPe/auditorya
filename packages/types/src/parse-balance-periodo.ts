/**
 * Balance de prueba DEL PERÍODO como insumo del agente tributario: saldo
 * inicial · débitos · créditos · saldo final por cuenta, sin fechas ni
 * asientos. Para las reglas de libros contra formulario basta con los débitos y
 * créditos del período por subcuenta, así que un balance del bimestre sirve
 * igual que un auxiliar; lo que NO permite es detectar el asiento de cierre
 * (no hay fechas) ni verificar tarifas factura por factura.
 *
 * Formatos reales (fixtures en ./fixtures): Siesa "COMPROBACION DE SALDOS"
 * (títulos, encabezado "Cuentas · (nombre) · 2026/07 · Débitos · Créditos ·
 * 2026/08 · L/G", códigos como número, todos los niveles; en la versión por
 * terceros el encabezado repite "Cuentas" para el NIT y la fila del tercero
 * repite el código) y World Office "Balance de Prueba entre el … y el …"
 * (CODIGO · NOMBRE CUENTA · TERCERO · SALDO INICIAL · DEBITOS · CREDITOS ·
 * SALDO FINAL; las filas por tercero llevan "NIT  123" en TERCERO).
 * Se conservan solo las cuentas HOJA (las que no son prefijo de otra) para no
 * sumar dos veces clase, grupo, cuenta y subcuenta.
 */
import { parseNumeroLocal } from './parse-balance'
import { leerTitulos, parseAuxiliarMovimientos, separarCodigoNombre, type ColumnasAuxiliar, type ResumenCuentaAuxiliar } from './parse-auxiliar'

export type ColumnasBalancePeriodo = {
  cuenta: number
  nombre: number | null
  tercero: number | null
  terceroNombre: number | null
  saldoInicial: number | null
  debito: number
  credito: number
  saldoFinal: number | null
}

export type CuentaBalancePeriodo = {
  cuenta: string
  nombre: string | null
  saldoInicial: number | null
  debitos: number
  creditos: number
  saldoFinal: number | null
  /** Nivel por longitud del código: 1 clase, 2 grupo, 4 cuenta, 6 subcuenta, 8+ auxiliar. */
  nivel: number
}

/** Movimiento del período de un tercero dentro de una cuenta (detalle por tercero del balance, o asientos agrupados). */
export type SaldoTerceroPeriodo = {
  cuenta: string
  cuentaNombre: string | null
  /** NIT o cédula sin dígito de verificación; null si el libro solo trae el nombre. */
  tercero: string | null
  terceroNombre: string | null
  debitos: number
  creditos: number
}

export type BalancePeriodoParseado = {
  /** Solo cuentas hoja, en la forma que consumen resumir/mapear. */
  cuentas: ResumenCuentaAuxiliar[]
  /** Todas las filas de cuenta (todos los niveles), por si se quiere el árbol. */
  todas: CuentaBalancePeriodo[]
  columnas: ColumnasBalancePeriodo
  filaEncabezado: number
  encabezado: { empresa: string | null; periodoDesde: string | null; periodoHasta: string | null }
  /** Filas por tercero: no se suman a la cuenta (ya están en ella), pero se conservan en `terceros`. */
  filasTercero: number
  /** Detalle por tercero de las cuentas hoja, con movimiento en el período. */
  terceros: SaldoTerceroPeriodo[]
  advertencias: string[]
  reconocidas: string[]
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Puntúa una fila como encabezado de balance del período. Sin columna de fecha: eso es un auxiliar.
 * No depende de un software: busca por sinónimos (Siigo "Movimiento débito", Helisa "Nuevo saldo",
 * Pluss100 "CODIGO · CUENTA", Siesa "Cuentas · Nit · Terceros", World Office "TERCERO") y deja de
 * lado las columnas de saldo partidas en débito y crédito, que no son el movimiento del período.
 */
export function puntuarEncabezadoBalance(fila: string[]): { columnas: ColumnasBalancePeriodo; puntaje: number; reconocidas: string[] } | null {
  const h = fila.map((c) => sinAcentos((c ?? '').toString()).replace(/\s+/g, ' ').trim())
  if (h.some((c) => /^fecha/.test(c))) return null
  const usadas = new Set<number>()
  const buscar = (pred: (c: string) => boolean) => {
    const i = h.findIndex((c, idx) => !usadas.has(idx) && c !== '' && pred(c))
    if (i >= 0) usadas.add(i)
    return i >= 0 ? i : null
  }
  const esSaldo = (c: string) => /saldo|inicial|anterior|final|nuevo/.test(c)
  const debito = buscar((c) => /\bd[e]?bitos?\b|^debe$/.test(c) && !esSaldo(c))
  const credito = buscar((c) => /\bcr[e]?ditos?\b|^haber$/.test(c) && !esSaldo(c))
  const cuenta = buscar((c) => /^(codigo|cod\.?|cuentas?|cta\.?|puc)\b|^(no\.?|numero|n°) (de )?cuenta|codigo (de la )?cuenta|^cuenta contable$/.test(c) && !/nombre|descripcion|tercero/.test(c))
  if (debito === null || credito === null || cuenta === null) return null
  // El nombre de la cuenta antes que el tercero: en "CODIGO · CUENTA · … · TERCERO" (Pluss100) la columna CUENTA es el nombre.
  const nombre = buscar((c) => (/^cuenta$|^nombre|^descripcion|^detalle|^denominacion|nombre (de la )?cuenta/.test(c)) && !/tercero|razon social/.test(c))
  const tercero = buscar((c) => /^(nit|n\.i\.t\.?|identificacion|cedula|c\.c\.|documento del tercero|id tercero)\b|^nit tercero|^tercero$|^codigo tercero/.test(c))
    // Siesa por terceros repite el encabezado "Cuentas" para el NIT del tercero.
    ?? buscar((c) => c === h[cuenta])
  const terceroNombre = buscar((c) => /^razon social|nombre (del )?tercero|^terceros$|^beneficiario/.test(c))
  const saldoInicial = buscar((c) => /^saldo (inicial|anterior)|^inicial$|^anterior$/.test(c) && !/debito|credito/.test(c))
  const saldoFinal = buscar((c) => /^saldo (final|actual)|^nuevo saldo|^final$/.test(c) && !/debito|credito/.test(c))
  const columnas: ColumnasBalancePeriodo = { cuenta, nombre, tercero, terceroNombre, saldoInicial, debito, credito, saldoFinal }
  const reconocidas = (Object.entries(columnas) as [string, number | null][]).filter(([, v]) => v !== null).map(([k]) => k)
  return { columnas, puntaje: reconocidas.length + 2, reconocidas }
}

/**
 * Lee el balance. Sin `forzado`, detecta el encabezado y las columnas; con él (columnas que indicó el
 * auditor para un formato que no se reconoció), usa exactamente esas.
 */
export function parseBalancePeriodo(filas: string[][], forzado?: { fila: number; columnas: ColumnasBalancePeriodo }): BalancePeriodoParseado | null {
  let mejor: { fila: number; columnas: ColumnasBalancePeriodo; puntaje: number; reconocidas: string[] } | null = null
  if (forzado) {
    mejor = { fila: forzado.fila, columnas: forzado.columnas, puntaje: 0, reconocidas: (Object.entries(forzado.columnas) as [string, number | null][]).filter(([, v]) => v !== null).map(([k]) => k) }
  } else {
    for (let i = 0; i < Math.min(filas.length, 40); i++) {
      const r = puntuarEncabezadoBalance(filas[i] ?? [])
      if (r && (!mejor || r.puntaje > mejor.puntaje)) mejor = { fila: i, ...r }
    }
  }
  if (!mejor) return null
  const { columnas, fila: filaEncabezado, reconocidas } = mejor
  const c = { ...columnas }
  const celda = (fila: string[], i: number | null) => (i === null ? '' : (fila[i] ?? '').toString().trim())
  const esNumero = (t: string) => t !== '' && isFinite(parseNumeroLocal(t)) && /\d/.test(t)

  // Siesa: el nombre no tiene encabezado y los saldos se titulan con la fecha ("2026/07").
  // Se infieren por posición: nombre = primera columna de texto después del código;
  // saldo inicial = numérica justo antes de débitos; saldo final = numérica justo después de créditos.
  const muestra = filas.slice(filaEncabezado + 1, filaEncabezado + 40).filter((f) => /^\d/.test(celda(f, c.cuenta)))
  const columnaEs = (idx: number, pred: (t: string) => boolean) => muestra.length > 0 && muestra.filter((f) => celda(f, idx) !== '').length > 0 && muestra.every((f) => celda(f, idx) === '' || pred(celda(f, idx)))
  if (c.nombre === null && !forzado) {
    for (let idx = c.cuenta + 1; idx < (filas[filaEncabezado]?.length ?? 0); idx++) {
      if (idx === c.tercero || idx === c.debito || idx === c.credito) continue
      if (columnaEs(idx, (t) => /[A-Za-z\u00C0-\u017F]/.test(t))) { c.nombre = idx; break }
    }
  }
  if (!forzado && c.saldoInicial === null && c.debito > 0 && columnaEs(c.debito - 1, esNumero) && c.debito - 1 !== c.cuenta && c.debito - 1 !== c.tercero) c.saldoInicial = c.debito - 1
  if (!forzado && c.saldoFinal === null && columnaEs(c.credito + 1, esNumero)) c.saldoFinal = c.credito + 1

  // Nombre del tercero sin encabezado (Siesa): la columna de texto pegada al NIT.
  if (!forzado && c.tercero !== null && c.terceroNombre === null) {
    const conTercero = filas.slice(filaEncabezado + 1, filaEncabezado + 400).filter((f) => celda(f, c.tercero) !== '')
    const idx = c.tercero + 1
    if (idx !== c.nombre && idx !== c.debito && idx !== c.credito && idx !== c.saldoInicial && conTercero.length > 0 && conTercero.every((f) => /[A-Za-z\u00C0-\u017F]/.test(celda(f, idx)))) c.terceroNombre = idx
  }

  const encabezado = leerTitulos(filas, filaEncabezado)
  // Siesa no pone el período en el título sino en los encabezados de saldo: "Saldo inicial a 2026/07"
  // y "Saldo final a 2026/08" son el primer y el último mes del período.
  if (!encabezado.periodoDesde && c.saldoInicial !== null && c.saldoFinal !== null) {
    const mes = (t: string) => /^(\d{4})[/-](\d{1,2})$/.exec(t.trim())
    const ini = mes(celda(filas[filaEncabezado] ?? [], c.saldoInicial))
    const fin = mes(celda(filas[filaEncabezado] ?? [], c.saldoFinal))
    if (ini && fin && `${fin[1]}${fin[2].padStart(2, '0')}` >= `${ini[1]}${ini[2].padStart(2, '0')}`) {
      const ultimo = new Date(Date.UTC(Number(fin[1]), Number(fin[2]), 0)).getUTCDate()
      encabezado.periodoDesde = `${ini[1]}-${ini[2].padStart(2, '0')}-01`
      encabezado.periodoHasta = `${fin[1]}-${fin[2].padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`
    }
  }
  const advertencias: string[] = []
  const todas: CuentaBalancePeriodo[] = []
  const terceros: SaldoTerceroPeriodo[] = []
  const nombreCuenta = new Map<string, string | null>()
  let filasTercero = 0
  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const cod = separarCodigoNombre(celda(fila, c.cuenta))
    if (!cod) continue
    // Detalle por tercero: repite el código y trae el NIT (o el nombre del tercero) en su columna.
    if (c.tercero !== null && celda(fila, c.tercero) !== '') {
      filasTercero++
      const d = parseNumeroLocal(celda(fila, c.debito))
      const h = parseNumeroLocal(celda(fila, c.credito))
      if ((isFinite(d) && d !== 0) || (isFinite(h) && h !== 0)) {
        const id = celda(fila, c.tercero).replace(/^nit\s*/i, '').replace(/\.0$/, '').replace(/-\d$/, '').replace(/\D/g, '')
        // World Office pone el nombre del tercero donde va el nombre de la cuenta; Siesa lo trae en su propia columna.
        const nombre = c.terceroNombre !== null ? celda(fila, c.terceroNombre) : celda(fila, c.nombre) || cod.nombre || ''
        terceros.push({ cuenta: cod.codigo, cuentaNombre: nombreCuenta.get(cod.codigo) ?? null, tercero: id || null, terceroNombre: nombre || (id ? null : celda(fila, c.tercero)) || null, debitos: isFinite(d) ? d : 0, creditos: isFinite(h) ? h : 0 })
      }
      continue
    }
    const debitos = parseNumeroLocal(celda(fila, c.debito))
    const creditos = parseNumeroLocal(celda(fila, c.credito))
    if (!isFinite(debitos) && !isFinite(creditos)) continue
    const ini = c.saldoInicial !== null ? parseNumeroLocal(celda(fila, c.saldoInicial)) : NaN
    const fin = c.saldoFinal !== null ? parseNumeroLocal(celda(fila, c.saldoFinal)) : NaN
    if (!nombreCuenta.has(cod.codigo)) nombreCuenta.set(cod.codigo, celda(fila, c.nombre) || cod.nombre || null)
    todas.push({
      cuenta: cod.codigo,
      nombre: celda(fila, c.nombre) || cod.nombre || null,
      saldoInicial: isFinite(ini) ? ini : null,
      debitos: isFinite(debitos) ? debitos : 0,
      creditos: isFinite(creditos) ? creditos : 0,
      saldoFinal: isFinite(fin) ? fin : null,
      nivel: cod.codigo.length,
    })
  }
  if (todas.length === 0) return null

  // Hojas: cuentas que no son prefijo de ninguna otra más larga (sin repetir códigos).
  const codigos = [...new Set(todas.map((t) => t.cuenta))]
  const hojas = todas.filter((t, idx) => todas.findIndex((x) => x.cuenta === t.cuenta) === idx && !codigos.some((otro) => otro !== t.cuenta && otro.startsWith(t.cuenta)))
  const cuentas: ResumenCuentaAuxiliar[] = hojas.map((h) => ({ cuenta: h.cuenta, nombre: h.nombre, debitos: h.debitos, creditos: h.creditos, movimientos: 0, cierres: [] }))
  // Una cuenta que mueve más que la suma de sus subcuentas directas tiene una subcuenta que el
  // programa no exportó (World Office lo hace): la diferencia queda como hoja "sin detalle".
  // Solo si el archivo es jerárquico por PUC (cada código tiene a su padre natural: 1→2→4→6→8):
  // Siesa cuelga subcuentas de grupos con otro prefijo y ahí el residuo duplicaría valores. Y solo
  // desde el nivel de subcuenta (6 dígitos): en grupos y cuentas un archivo filtrado daría residuos falsos.
  const unicas = todas.filter((t, idx) => todas.findIndex((x) => x.cuenta === t.cuenta) === idx)
  const padreDe = (cod: string) => (cod.length >= 4 ? cod.slice(0, -2) : cod.length === 2 ? cod.slice(0, 1) : null)
  const jerarquico = unicas.every((t) => { const p = padreDe(t.cuenta); return p === null || codigos.includes(p) })
  for (const p of jerarquico ? unicas : []) {
    const hijas = unicas.filter((x) => padreDe(x.cuenta) === p.cuenta)
    if (p.cuenta.length < 6 || hijas.length === 0) continue
    const d = p.debitos - hijas.reduce((s, x) => s + x.debitos, 0)
    const h = p.creditos - hijas.reduce((s, x) => s + x.creditos, 0)
    if (d <= 1 && h <= 1) continue
    cuentas.push({ cuenta: p.cuenta, nombre: `${p.nombre ?? ''} (sin detalle de subcuenta)`.trim(), debitos: Math.max(d, 0), creditos: Math.max(h, 0), movimientos: 0, cierres: [] })
    advertencias.push(`La cuenta ${p.cuenta} mueve más que la suma de sus subcuentas (${[d > 1 ? `débitos ${Math.round(d).toLocaleString('es-CO')}` : null, h > 1 ? `créditos ${Math.round(h).toLocaleString('es-CO')}` : null].filter(Boolean).join(', ')}): el archivo no trae alguna subcuenta y la diferencia se tomó como "${p.cuenta} sin detalle".`)
  }
  cuentas.sort((a, b) => a.cuenta.localeCompare(b.cuenta))
  if (filasTercero > 0) advertencias.push(`${filasTercero} fila(s) de detalle por tercero no se sumaron (ya están en su cuenta).`)
  advertencias.push('Balance de prueba: trae débitos y créditos por cuenta pero no los asientos, así que no se puede detectar un cierre de IVA dentro del período ni verificar tarifas factura por factura.')

  // Si los saldos no cuadran con los movimientos en buena parte de las cuentas, las columnas no son lo que parecen
  // (una hoja de trabajo, un acumulado): se avisa en vez de seguir como si fuera un balance del período.
  const conSaldos = todas.filter((t) => t.saldoInicial !== null && t.saldoFinal !== null)
  const descuadradas = conSaldos.filter((t) => Math.abs(t.saldoInicial! + t.debitos - t.creditos - t.saldoFinal!) > 1 && Math.abs(t.saldoInicial! - t.debitos + t.creditos - t.saldoFinal!) > 1)
  if (conSaldos.length >= 10 && descuadradas.length > conSaldos.length * 0.2) {
    advertencias.push(`En ${descuadradas.length} de ${conSaldos.length} cuentas el saldo final no es el inicial más débitos menos créditos: puede que no sea un balance de prueba del período (una hoja de trabajo o un acumulado). Verifica el archivo.`)
  }
  if (terceros.length > 0) advertencias.push(`Trae el detalle por tercero (${terceros.length} saldo(s) con movimiento): permite comparar lo causado a cada tercero con lo que se le retuvo.`)
  if (c.terceroNombre !== null && !reconocidas.includes('terceroNombre')) reconocidas.push('terceroNombre')
  return { cuentas, todas, columnas: c, filaEncabezado: filaEncabezado + 1, encabezado, filasTercero, terceros, advertencias, reconocidas }
}

// ─── Qué familia de libro llegó ──────────────────────────────────────────────

export type LibroContableLeido =
  | { familia: 'movimientos'; auxiliar: import('./parse-auxiliar').AuxiliarParseado }
  | { familia: 'balance'; balance: BalancePeriodoParseado }

/**
 * Decide si la matriz es un libro auxiliar por movimientos (tiene fecha por
 * fila) o un balance de prueba del período, y lo lee. null si no es ninguno.
 */
export function leerLibroContable(
  filas: string[][],
  parseAuxiliar: (filas: string[][]) => import('./parse-auxiliar').AuxiliarParseado | null,
  formatos: FormatoLibro[] = [],
): LibroContableLeido | null {
  // Formatos que el auditor ya indicó para esta empresa: mandan sobre la detección automática.
  const conFormato = leerConFormato(filas, formatos)
  if (conFormato) return conFormato
  const aux = parseAuxiliar(filas)
  if (aux && aux.movimientos.length > 0) return { familia: 'movimientos', auxiliar: aux }
  const bal = parseBalancePeriodo(filas)
  if (bal) return { familia: 'balance', balance: bal }
  return aux ? { familia: 'movimientos', auxiliar: aux } : null
}

// ─── Libros de varias hojas ──────────────────────────────────────────────────

export type HojaLibro = { nombre: string; filas: string[][] }

export type HojaLegible = {
  nombre: string
  familia: 'movimientos' | 'balance'
  /** Movimientos dentro del período (auxiliar) o cuentas con movimiento (balance). */
  registros: number
  /** Período que dice el archivo (título o encabezados de saldo), si lo dice. */
  periodo: { desde: string; hasta: string } | null
  /** ¿Sirve para el período de la revisión? Auxiliar con movimientos en el período, o balance del mismo período (o sin período declarado). */
  sirve: boolean
}

/**
 * Un Excel puede traer varias hojas (el libro de trabajo del contador: resumen,
 * balance del bimestre, balance anual, auxiliares). Se lee cada hoja y se elige
 * la que sirve para el período de la revisión: primero un auxiliar con
 * movimientos en el período (trae asientos, terceros y base), luego un balance
 * del mismo período, luego un balance que no dice su período; entre iguales, la
 * que más trae. Devuelve también las demás hojas legibles para mostrarlas.
 */
export function elegirHojaLibro(
  hojas: HojaLibro[],
  rango: { desde: string; hasta: string },
  formatos: FormatoLibro[] = [],
): { hoja: HojaLibro; legibles: HojaLegible[] } | null {
  const evaluadas: { hoja: HojaLibro; info: HojaLegible; puntaje: number[] }[] = []
  for (const hoja of hojas) {
    const libro = leerLibroContable(hoja.filas, parseAuxiliarMovimientos, formatos)
    if (!libro) continue
    if (libro.familia === 'movimientos') {
      const enPeriodo = libro.auxiliar.movimientos.filter((m) => m.fecha >= rango.desde && m.fecha <= rango.hasta).length
      const e = libro.auxiliar.encabezado
      const info: HojaLegible = { nombre: hoja.nombre, familia: 'movimientos', registros: enPeriodo, periodo: e.periodoDesde && e.periodoHasta ? { desde: e.periodoDesde, hasta: e.periodoHasta } : null, sirve: enPeriodo > 0 }
      evaluadas.push({ hoja, info, puntaje: [enPeriodo > 0 ? 3 : 0, 1, enPeriodo] })
    } else {
      const b = libro.balance
      const conMovimiento = b.cuentas.filter((x) => x.debitos !== 0 || x.creditos !== 0).length
      const periodo = b.encabezado.periodoDesde && b.encabezado.periodoHasta ? { desde: b.encabezado.periodoDesde, hasta: b.encabezado.periodoHasta } : null
      const mismo = !!periodo && periodo.desde === rango.desde && periodo.hasta === rango.hasta
      const nivel = conMovimiento === 0 ? 0 : mismo ? 3 : periodo ? 1 : 2
      evaluadas.push({ hoja, info: { nombre: hoja.nombre, familia: 'balance', registros: conMovimiento, periodo, sirve: nivel >= 2 }, puntaje: [nivel, 0, conMovimiento] })
    }
  }
  if (!evaluadas.length) return null
  const mayor = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false }
  const mejor = evaluadas.reduce((m, x) => (mayor(x.puntaje, m.puntaje) ? x : m))
  return { hoja: mejor.hoja, legibles: evaluadas.map((x) => x.info) }
}

// ─── Formatos indicados por el auditor ───────────────────────────────────────
// Cuando un archivo no se reconoce solo (otro software, encabezados propios), el
// auditor dice una vez qué es cada columna. Se guarda en la memoria de la empresa
// con la "firma" de la fila de encabezado, y desde ahí ese formato se lee solo.

export type RolColumnaBalance = keyof ColumnasBalancePeriodo
export type RolColumnaAuxiliar = keyof ColumnasAuxiliar

export type FormatoLibro = {
  /** Fila de encabezado normalizada: identifica el formato aunque cambien las filas de título. */
  firma: string
  familia: 'movimientos' | 'balance'
  /** Índice de columna por rol. */
  columnas: Record<string, number | null>
  /** Cómo se llama el formato para el auditor (p. ej. el archivo con el que se indicó). */
  etiqueta?: string
  creadoAt?: string
}

/** Firma de una fila de encabezado: textos sin tildes, en minúscula y sin espacios dobles. */
export function firmaEncabezado(fila: string[]): string {
  return fila.map((c) => sinAcentos((c ?? '').toString()).replace(/\s+/g, ' ').trim()).join('|').replace(/\|+$/, '')
}

const ROLES_BALANCE: RolColumnaBalance[] = ['cuenta', 'nombre', 'tercero', 'terceroNombre', 'saldoInicial', 'debito', 'credito', 'saldoFinal']
const ROLES_AUXILIAR: RolColumnaAuxiliar[] = ['fecha', 'cuenta', 'cuentaNombre', 'debito', 'credito', 'valor', 'tipoDoc', 'numeroDoc', 'tercero', 'terceroNombre', 'concepto', 'base', 'tarifa']

/** ¿Las columnas indicadas alcanzan para leer el libro? Devuelve qué falta. */
export function faltaParaFormato(familia: FormatoLibro['familia'], columnas: Record<string, number | null>): string[] {
  const tiene = (r: string) => typeof columnas[r] === 'number'
  if (familia === 'balance') return [!tiene('cuenta') && 'el código de la cuenta', !tiene('debito') && 'los débitos', !tiene('credito') && 'los créditos'].filter(Boolean) as string[]
  return [
    !tiene('fecha') && 'la fecha',
    !tiene('cuenta') && 'el código de la cuenta',
    !tiene('valor') && !(tiene('debito') && tiene('credito')) && 'los débitos y créditos (o una columna de valor)',
  ].filter(Boolean) as string[]
}

/** Lee la matriz con columnas indicadas a mano (sin detección). null si no saca ninguna cuenta. */
export function leerConColumnas(filas: string[][], familia: FormatoLibro['familia'], fila: number, columnas: Record<string, number | null>): LibroContableLeido | null {
  if (faltaParaFormato(familia, columnas).length) return null
  if (familia === 'balance') {
    const c = Object.fromEntries(ROLES_BALANCE.map((r) => [r, typeof columnas[r] === 'number' ? columnas[r] : null])) as ColumnasBalancePeriodo
    const balance = parseBalancePeriodo(filas, { fila, columnas: c })
    return balance ? { familia: 'balance', balance } : null
  }
  const c = Object.fromEntries(ROLES_AUXILIAR.map((r) => [r, typeof columnas[r] === 'number' ? columnas[r] : null])) as ColumnasAuxiliar
  const auxiliar = parseAuxiliarMovimientos(filas, { fila, columnas: c })
  return auxiliar && auxiliar.movimientos.length ? { familia: 'movimientos', auxiliar } : null
}

/** Busca en las primeras filas un encabezado con la firma de algún formato guardado y lo lee con él. */
export function leerConFormato(filas: string[][], formatos: FormatoLibro[]): LibroContableLeido | null {
  if (!formatos.length) return null
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const firma = firmaEncabezado(filas[i] ?? [])
    if (!firma) continue
    const f = formatos.find((x) => x.firma === firma)
    if (f) return leerConColumnas(filas, f.familia, i, f.columnas)
  }
  return null
}

/**
 * Fila que más parece encabezado (para proponerla en la ventana de columnas): la de más celdas de
 * texto entre las primeras 30, seguida de filas con números.
 */
export function sugerirFilaEncabezado(filas: string[][]): number {
  let mejor = 0
  let puntaje = -1
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const textos = (filas[i] ?? []).filter((c) => /[A-Za-z\u00C0-\u017F]/.test(c ?? '') && !/^\s*$/.test(c ?? '')).length
    const siguientesConNumeros = filas.slice(i + 1, i + 4).filter((r) => r.filter((c) => /^-?[\d.,]+$/.test((c ?? '').trim()) && /\d/.test(c ?? '')).length >= 2).length
    const p = textos * 2 + siguientesConNumeros * 3
    if (textos >= 2 && p > puntaje) { puntaje = p; mejor = i }
  }
  return mejor
}

/** Columnas que la detección automática encontró (para precargar la ventana cuando el auditor quiere corregirlas). */
export function columnasDetectadas(libro: LibroContableLeido): { familia: FormatoLibro['familia']; fila: number; columnas: Record<string, number | null> } {
  return libro.familia === 'balance'
    ? { familia: 'balance', fila: libro.balance.filaEncabezado - 1, columnas: { ...libro.balance.columnas } }
    : { familia: 'movimientos', fila: libro.auxiliar.filaEncabezado - 1, columnas: { ...libro.auxiliar.columnas } }
}
