/**
 * Diccionario PUC (Decreto 2650) — subconjunto de nombres frecuentes.
 * Cubre clases, grupos y cuentas/subcuentas comunes. Para códigos no listados,
 * se busca el ancestro más cercano; si no hay, queda sin nombre.
 */
export const PUC_NOMBRES: Record<string, string> = {
  '1': 'Activo',
  '2': 'Pasivo',
  '3': 'Patrimonio',
  '4': 'Ingresos',
  '5': 'Gastos',
  '6': 'Costos de ventas',
  '7': 'Costos de producción o de operación',
  '11': 'Disponible',
  '12': 'Inversiones',
  '13': 'Deudores',
  '14': 'Inventarios',
  '15': 'Propiedades, planta y equipo',
  '16': 'Intangibles',
  '17': 'Diferidos',
  '18': 'Otros activos',
  '19': 'Valorizaciones',
  '21': 'Obligaciones financieras',
  '22': 'Proveedores',
  '23': 'Cuentas por pagar',
  '24': 'Impuestos, gravámenes y tasas',
  '25': 'Obligaciones laborales',
  '26': 'Pasivos estimados y provisiones',
  '27': 'Diferidos',
  '28': 'Otros pasivos',
  '29': 'Bonos y papeles comerciales',
  '31': 'Capital social',
  '32': 'Superávit de capital',
  '33': 'Reservas',
  '34': 'Revalorización del patrimonio',
  '36': 'Resultados del ejercicio',
  '37': 'Resultados de ejercicios anteriores',
  '38': 'Superávit por valorizaciones',
  '41': 'Operacionales (ingresos)',
  '42': 'No operacionales (ingresos)',
  '51': 'Operacionales de administración',
  '52': 'Operacionales de ventas',
  '53': 'No operacionales (gastos)',
  '54': 'Impuesto de renta y complementarios',
  '61': 'Costo de ventas',
  '1105': 'Caja',
  '1110': 'Bancos',
  '1115': 'Remesas en tránsito',
  '1120': 'Cuentas de ahorro',
  '1205': 'Acciones',
  '1305': 'Clientes',
  '1330': 'Anticipos y avances',
  '1335': 'Depósitos',
  '1345': 'Ingresos por cobrar',
  '1355': 'Anticipo de impuestos y contribuciones',
  '1365': 'Cuentas por cobrar a trabajadores',
  '1380': 'Deudores varios',
  '1399': 'Provisiones (deudores)',
  '1405': 'Materias primas',
  '1430': 'Productos terminados',
  '1435': 'Mercancías no fabricadas por la empresa',
  '1455': 'Materiales, repuestos y accesorios',
  '1460': 'Envases y empaques',
  '1465': 'Inventarios en tránsito',
  '1504': 'Terrenos',
  '1516': 'Construcciones y edificaciones',
  '1520': 'Maquinaria y equipo',
  '1524': 'Equipo de oficina',
  '1528': 'Equipo de cómputo y comunicación',
  '1540': 'Flota y equipo de transporte',
  '1592': 'Depreciación acumulada',
  '2105': 'Bancos nacionales',
  '2205': 'Proveedores nacionales',
  '2305': 'Cuentas corrientes comerciales',
  '2335': 'Costos y gastos por pagar',
  '2365': 'Retención en la fuente',
  '2367': 'Impuesto a las ventas retenido',
  '2368': 'Impuesto de industria y comercio retenido',
  '2370': 'Retenciones y aportes de nómina',
  '2404': 'De renta y complementarios',
  '2408': 'Impuesto sobre las ventas por pagar',
  '2412': 'De industria y comercio',
  '2505': 'Salarios por pagar',
  '2510': 'Cesantías consolidadas',
  '2515': 'Intereses sobre cesantías',
  '2525': 'Vacaciones consolidadas',
  '3105': 'Capital suscrito y pagado',
  '3305': 'Reserva legal',
  '3605': 'Utilidad del ejercicio',
  '3610': 'Pérdida del ejercicio',
  '4135': 'Comercio al por mayor y al por menor',
  '4140': 'Industrias manufactureras',
  '4145': 'Transporte, almacenamiento y comunicaciones',
  '4155': 'Actividad financiera',
  '4175': 'Devoluciones en ventas (DB)',
  '4210': 'Financieros',
  '4250': 'Recuperaciones',
  '5105': 'Gastos de personal',
  '5110': 'Honorarios',
  '5120': 'Arrendamientos',
  '5135': 'Servicios',
  '5140': 'Gastos legales',
  '5145': 'Mantenimiento y reparaciones',
  '5160': 'Depreciaciones',
  '5205': 'Gastos de personal (ventas)',
  '5305': 'Financieros',
  '6135': 'Comercio al por mayor y al por menor (costo)',
}

/** Busca el nombre PUC del código o de su ancestro más cercano. */
export function nombrePuc(codigo: string): string | null {
  let c = codigo.trim()
  while (c.length > 0) {
    if (PUC_NOMBRES[c]) return PUC_NOMBRES[c]
    c = c.slice(0, -1)
  }
  return null
}

/** Convierte texto numérico en formato local (1.234.567,89 / (123)) a número. */
export function parseNumeroLocal(raw: string): number {
  let s = (raw ?? '').toString().trim().replace(/[^\d.,\-()]/g, '')
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { neg = true; s = s.slice(1) }
  const dot = s.includes('.')
  const comma = s.includes(',')
  if (dot && comma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (comma) {
    const p = s.split(',')
    if (p.length === 2 && p[1].length <= 2) s = s.replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (dot) {
    const p = s.split('.')
    if (p.length > 2) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return neg ? -n : n
}

export type CuentaParseada = {
  codigo: string
  nombre: string | null
  nivel: number
  tercero: string | null
  terceroNombre: string | null
  saldoActual: number // saldo final / período actual
  saldoAnterior: number // saldo inicial / período anterior
  debito: number | null
  credito: number | null
}

/**
 * Parsea una matriz cruda (filas x celdas) de un balance de prueba colombiano.
 *
 * Reglas (formato sin encabezados, por tercero):
 *  - col 0 = código PUC; el nivel = longitud del código (1 clase … 8+ auxiliar).
 *  - los últimos hasta 4 valores numéricos de la fila son [inicial, débito, crédito, final].
 *  - en cuentas auxiliares (nivel ≥ 8), el valor numérico previo a ese bloque es el NIT del tercero.
 */
export function parseBalanceMatrix(filas: string[][]): CuentaParseada[] {
  const out: CuentaParseada[] = []

  for (const fila of filas) {
    if (!fila || fila.length === 0) continue
    const codigo = (fila[0] ?? '').toString().trim()
    if (!/^\d{1,}$/.test(codigo)) continue // ignora encabezados, totales, vacíos

    const nivel = codigo.length
    // valores numéricos de la fila, excluyendo la columna del código
    const numericos = fila
      .slice(1)
      .map((c) => ({ raw: (c ?? '').toString().trim(), n: parseNumeroLocal((c ?? '').toString()) }))
      .filter((x) => x.raw !== '' && isFinite(x.n))

    if (numericos.length === 0) continue

    const saldos = numericos.slice(-4)
    const final = saldos[saldos.length - 1]?.n ?? 0
    let inicial = 0
    let debito: number | null = null
    let credito: number | null = null
    if (saldos.length >= 4) {
      inicial = saldos[saldos.length - 4].n
      debito = saldos[saldos.length - 3].n
      credito = saldos[saldos.length - 2].n
    } else if (saldos.length >= 2) {
      inicial = saldos[0].n
    }

    // El tercero (NIT) es el numérico que antecede al bloque de saldos, en auxiliares.
    const previos = numericos.slice(0, numericos.length - saldos.length)
    const tercero = nivel >= 8 && previos.length > 0 ? previos[previos.length - 1].raw : null

    // Nombre del tercero: las celdas de texto (con letras) de la fila — la razón social.
    const nombreTexto = fila
      .slice(1)
      .map((c) => (c ?? '').toString().trim())
      .filter((t) => t !== '' && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t))
      .join(' ')
      .trim()

    out.push({
      codigo,
      nombre: nombrePuc(codigo),
      nivel,
      tercero,
      terceroNombre: tercero && nombreTexto ? nombreTexto : null,
      saldoActual: final,
      saldoAnterior: inicial,
      debito,
      credito,
    })
  }

  return out
}
