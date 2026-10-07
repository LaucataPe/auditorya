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
import { leerTitulos, separarCodigoNombre, type ResumenCuentaAuxiliar } from './parse-auxiliar'

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

/** Puntúa una fila como encabezado de balance del período. Sin columna de fecha: eso es un auxiliar. */
export function puntuarEncabezadoBalance(fila: string[]): { columnas: ColumnasBalancePeriodo; puntaje: number; reconocidas: string[] } | null {
  const h = fila.map((c) => sinAcentos((c ?? '').toString()).trim())
  if (h.some((c) => /^fecha/.test(c))) return null
  const usadas = new Set<number>()
  const buscar = (re: RegExp) => {
    const i = h.findIndex((c, idx) => !usadas.has(idx) && re.test(c))
    if (i >= 0) usadas.add(i)
    return i >= 0 ? i : null
  }
  const debito = buscar(/^d[e]?bitos?$|^debe$|^movimiento d/)
  const credito = buscar(/^cr[e]?ditos?$|^haber$|^movimiento c/)
  const cuenta = buscar(/^cuentas?$|^codigo|^cod\.?$|^cta|^cuenta contable/)
  if (debito === null || credito === null || cuenta === null) return null
  // Siesa por terceros repite "Cuentas" para el NIT del tercero.
  const tercero = buscar(/^tercero|^nit\b|^identificacion|^cuentas?$/)
  const terceroNombre = buscar(/^razon social|^nombre (del )?tercero/)
  const nombre = buscar(/^nombre|^descripcion|^cuenta$/)
  const saldoInicial = buscar(/^saldo (inicial|anterior)|^inicial/)
  const saldoFinal = buscar(/^saldo (final|actual)|^final|^nuevo saldo/)
  const columnas: ColumnasBalancePeriodo = { cuenta, nombre, tercero, terceroNombre, saldoInicial, debito, credito, saldoFinal }
  const reconocidas = (Object.entries(columnas) as [string, number | null][]).filter(([, v]) => v !== null).map(([k]) => k)
  return { columnas, puntaje: reconocidas.length + 2, reconocidas }
}

export function parseBalancePeriodo(filas: string[][]): BalancePeriodoParseado | null {
  let mejor: { fila: number; columnas: ColumnasBalancePeriodo; puntaje: number; reconocidas: string[] } | null = null
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const r = puntuarEncabezadoBalance(filas[i] ?? [])
    if (r && (!mejor || r.puntaje > mejor.puntaje)) mejor = { fila: i, ...r }
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
  if (c.nombre === null) {
    for (let idx = c.cuenta + 1; idx < (filas[filaEncabezado]?.length ?? 0); idx++) {
      if (idx === c.tercero || idx === c.debito || idx === c.credito) continue
      if (columnaEs(idx, (t) => /[A-Za-z\u00C0-\u017F]/.test(t))) { c.nombre = idx; break }
    }
  }
  if (c.saldoInicial === null && c.debito > 0 && columnaEs(c.debito - 1, esNumero) && c.debito - 1 !== c.cuenta && c.debito - 1 !== c.tercero) c.saldoInicial = c.debito - 1
  if (c.saldoFinal === null && columnaEs(c.credito + 1, esNumero)) c.saldoFinal = c.credito + 1

  // Nombre del tercero sin encabezado (Siesa): la columna de texto pegada al NIT.
  if (c.tercero !== null && c.terceroNombre === null) {
    const conTercero = filas.slice(filaEncabezado + 1, filaEncabezado + 400).filter((f) => celda(f, c.tercero) !== '')
    const idx = c.tercero + 1
    if (idx !== c.nombre && idx !== c.debito && idx !== c.credito && idx !== c.saldoInicial && conTercero.length > 0 && conTercero.every((f) => /[A-Za-z\u00C0-\u017F]/.test(celda(f, idx)))) c.terceroNombre = idx
  }

  const encabezado = leerTitulos(filas, filaEncabezado)
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
): LibroContableLeido | null {
  const aux = parseAuxiliar(filas)
  if (aux && aux.movimientos.length > 0) return { familia: 'movimientos', auxiliar: aux }
  const bal = parseBalancePeriodo(filas)
  if (bal) return { familia: 'balance', balance: bal }
  return aux ? { familia: 'movimientos', auxiliar: aux } : null
}
