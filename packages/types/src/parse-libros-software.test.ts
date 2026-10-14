/**
 * Lectura de libros contables de distintos programas (Pluss100, World Office,
 * Siesa), sobre muestras reales anonimizadas. Lo que se prueba es lo que varía
 * por software: dónde va la cuenta, filas de saldo y totales, importe en una
 * sola columna, tercero sin NIT, códigos como número, balance por terceros.
 */
import { describe, expect, it } from 'vitest'
import { parseAuxiliarMovimientos, resumirAuxiliarPeriodo } from './parse-auxiliar'
import { elegirHojaLibro, faltaParaFormato, firmaEncabezado, leerConColumnas, leerLibroContable, parseBalancePeriodo, sugerirFilaEncabezado, type FormatoLibro } from './parse-balance-periodo'
import { beneficiarioDeTercero, esTerceroGenerico } from './agente-retefuente-libros'
import { probarRetencionPorTercero } from './agente-retefuente-terceros'
import { mapearAuxiliarACifrasIva } from './agente-iva-libros'
import { AUXILIAR_IVA_2408 } from './fixtures/auxiliar-iva-2408'
import { AUXILIAR_WORLDOFFICE_1355 } from './fixtures/auxiliar-worldoffice-1355'
import { AUXILIAR_WORLDOFFICE_RETEFUENTE } from './fixtures/auxiliar-worldoffice-retefuente'
import { AUXILIAR_SIESA_2408 } from './fixtures/auxiliar-siesa-2408'
import { BALANCE_SIESA_PERIODO } from './fixtures/balance-siesa-periodo'
import { BALANCE_SIESA_TERCEROS } from './fixtures/balance-siesa-terceros'
import { BALANCE_WORLDOFFICE_TERCEROS } from './fixtures/balance-worldoffice-terceros'

describe('Pluss100 (auxiliar por cuentas) sigue leyéndose igual', () => {
  it('reconoce el encabezado de la fila 4 y todas las cuentas', () => {
    const aux = parseAuxiliarMovimientos(AUXILIAR_IVA_2408)!
    expect(aux.filaEncabezado).toBe(4)
    expect(aux.movimientos.length).toBeGreaterThan(80)
    expect(aux.movimientos[0]).toMatchObject({ cuenta: '24081010', tercero: '900000001', terceroNombre: 'TERCERO 1 SAS', debito: 42579 })
  })
})

describe('World Office · libro auxiliar de 1355', () => {
  const aux = parseAuxiliarMovimientos(AUXILIAR_WORLDOFFICE_1355)!
  it('hereda la cuenta del bloque, salta SALDO INICIAL y los totales, lee fechas seriales', () => {
    expect(aux.encabezado.periodoDesde).toBe('2026-07-01')
    expect(aux.movimientos.every((m) => m.cuenta === '13551708')).toBe(true)
    expect(aux.movimientos.length).toBe(56)
    expect(aux.movimientos[0]).toMatchObject({ fecha: '2026-07-01', cuentaNombre: 'RETENCION DE IVA POR VENTA DE PRODUCTOS BASE CERO', debito: 386372, credito: 0, tercero: null, terceroNombre: 'TERCERO 1 SAS' })
    expect(aux.advertencias.some((a) => /solo con nombre/.test(a))).toBe(true)
    // Ninguna fila "Total …" se coló como movimiento.
    const total = aux.movimientos.reduce((s, m) => s + m.debito, 0)
    expect(total).toBe(9843966) // "Total Movimientos Débito" del archivo, sin el saldo inicial
  })
  it('resume el bimestre sin inventar un cierre', () => {
    const r = resumirAuxiliarPeriodo(aux, { desde: '2026-07-01', hasta: '2026-08-31' })
    expect(r.cuentas).toHaveLength(1)
    expect(r.cuentas[0]).toMatchObject({ cuenta: '13551708', debitos: 9843966, creditos: 52237 })
    expect(r.cuentas[0].cierres).toHaveLength(0)
  })
})

describe('World Office · auxiliar de retenciones con una sola columna Valor', () => {
  const aux = parseAuxiliarMovimientos(AUXILIAR_WORLDOFFICE_RETEFUENTE)!
  it('asigna el valor al lado natural (crédito en 23xx), lee tarifa y base', () => {
    expect(aux.columnas.valor).not.toBeNull()
    expect(aux.movimientos[0]).toMatchObject({ cuenta: '236405', cuentaNombre: 'SALARIOS Y PAGOS LABORALES', credito: 53000, debito: 0, tarifa: 19, base: 5255249.994687 })
    const compras = aux.movimientos.filter((m) => m.cuenta === '23644001')
    expect(compras.length).toBeGreaterThan(3)
    expect(compras.every((m) => m.tarifa === 2.5 && m.credito > 0)).toBe(true)
    // "Total 236405 …" y "Total general" no son movimientos.
    expect(aux.movimientos.some((m) => m.credito === 1283000 || m.credito === 40000979.44)).toBe(false)
  })
})

describe('Siesa · exportación de movimientos (encabezado en la fila 1, sin tildes)', () => {
  const aux = parseAuxiliarMovimientos(AUXILIAR_SIESA_2408)!
  it('lee cuenta y nombre en columnas separadas, NIT del tercero, base gravable, débitos y créditos', () => {
    expect(aux.filaEncabezado).toBe(1)
    expect(aux.movimientos).toHaveLength(14)
    expect(aux.movimientos[0]).toMatchObject({ fecha: '2025-01-02', cuenta: '24080105', cuentaNombre: 'IVA DESCONTABLE COMPRAS 19%', tercero: '900000012', terceroNombre: 'TERCERO 19 SAS', numeroDoc: 'FCS-00008880', debito: 1001344, credito: 0, base: 5270234 })
    // La base gravable permite verificar la tarifa asiento por asiento.
    const m = aux.movimientos[0]
    expect(Math.round((m.debito / m.base!) * 100)).toBe(19)
    expect(aux.movimientos.filter((x) => x.cuenta === '24080501').every((x) => x.credito > 0 && x.debito === 0)).toBe(true)
  })
})

describe('Siesa · comprobación de saldos del bimestre', () => {
  const bal = parseBalancePeriodo(BALANCE_SIESA_PERIODO)!
  it('infiere nombre y saldos por posición, descarta niveles agregados y códigos como número', () => {
    expect(bal.filaEncabezado).toBe(12)
    expect(bal.columnas).toMatchObject({ cuenta: 0, nombre: 1, saldoInicial: 2, debito: 3, credito: 4, saldoFinal: 5 })
    const codigos = bal.cuentas.map((c) => c.cuenta)
    expect(codigos).toContain('24080103')
    expect(codigos).not.toContain('2408')
    expect(codigos).not.toContain('240801')
    expect(bal.cuentas.find((c) => c.cuenta === '24080501')).toMatchObject({ nombre: 'IVA GENERADO EN VENTAS DEL 19%', debitos: 0, creditos: 109174187 })
    expect(bal.cuentas.find((c) => c.cuenta === '13551701')).toMatchObject({ debitos: 7829316, creditos: 93702 })
  })
  it('alimenta el mapeo de IVA con los mismos valores que el formulario 300 real', () => {
    const mapeo = mapearAuxiliarACifrasIva({ cuentas: bal.cuentas })
    expect(mapeo.cifras['iva-gen-19'].libros).toBe(109174187) // c59+c60 declarados 109.175.000
    expect(mapeo.cifras['iva-desc-compras'].libros).toBe(36096344) // c71 16.000 + c72 36.080.000
    expect(mapeo.cifras['iva-desc-servicios'].libros).toBe(20490356) // c75 20.490.000
    expect(mapeo.cifras['iva-gen-recuperado'].libros).toBe(231040) // c66 231.000
    expect(mapeo.cifras['iva-desc-devoluciones'].libros).toBe(1822934) // c79 1.823.000
    expect(mapeo.cifras['iva-retenido'].libros).toBe(7735614) // c85 7.736.000
    expect(mapeo.sinClasificar).toHaveLength(0)
  })
  it('no confunde otros anticipos de 1355 con rete-IVA aunque el nombre contenga "iva" (BOLIVAR)', () => {
    const cuentas = [...bal.cuentas, { cuenta: '13551861', nombre: 'CARMEN DE BOLIVAR2/1000', debitos: 944, creditos: 0, movimientos: 0, cierres: [] }]
    const mapeo = mapearAuxiliarACifrasIva({ cuentas })
    expect(mapeo.cifras['iva-retenido'].libros).toBe(7735614)
    expect(mapeo.cuentas.find((c) => c.cuenta === '13551861')?.destino).toBeNull()
  })
  it('leerLibroContable lo clasifica como balance, y al auxiliar como movimientos', () => {
    expect(leerLibroContable(BALANCE_SIESA_PERIODO, parseAuxiliarMovimientos)?.familia).toBe('balance')
    expect(leerLibroContable(AUXILIAR_SIESA_2408, parseAuxiliarMovimientos)?.familia).toBe('movimientos')
    expect(leerLibroContable(AUXILIAR_WORLDOFFICE_1355, parseAuxiliarMovimientos)?.familia).toBe('movimientos')
    expect(leerLibroContable([['a', 'b'], ['1', '2']], parseAuxiliarMovimientos)).toBeNull()
  })
})

describe('balances por tercero: el detalle no suma dos veces', () => {
  it('Siesa por terceros: la segunda columna "Cuentas" es el NIT del tercero', () => {
    const bal = parseBalancePeriodo(BALANCE_SIESA_TERCEROS)!
    expect(bal.filasTercero).toBeGreaterThan(5)
    expect(bal.cuentas.find((c) => c.cuenta === '24080103')).toMatchObject({ debitos: 20490356.15, creditos: 0 })
    expect(bal.cuentas.filter((c) => c.cuenta === '24080103')).toHaveLength(1)
  })
  it('World Office: las filas con "NIT  123" en TERCERO se descartan', () => {
    const bal = parseBalancePeriodo(BALANCE_WORLDOFFICE_TERCEROS)!
    expect(bal.encabezado.periodoDesde).toBe('2026-08-01')
    expect(bal.filasTercero).toBe(12)
    expect(bal.cuentas.map((c) => c.cuenta).sort()).toEqual(['23671001', '23679005'])
    expect(bal.cuentas.find((c) => c.cuenta === '23671001')).toMatchObject({ nombre: 'RETEIVA 15% A RST', debitos: 0, creditos: 25346 })
  })
})

// Libro de trabajo de un contador con Siesa (hojas reales de TPC, abreviadas): un resumen del bimestre 1,
// el balance del bimestre 4, el balance anual de 2025 y un auxiliar de 2025.
const siesa = (ini: string, fin: string, filas: string[][]) => [
  ['COMPROBACION DE SALDOS'], ['EMPRESA EJEMPLO S.A.S'], ['Saldo inicial a', 'Saldo final a'],
  ['Cuentas', '', ini, 'Débitos', 'Créditos', fin, 'L/G'], ...filas,
]
const HOJA_RESUMEN = [
  ['Cuentas', '             Descripción ', 'Casilla', '2026/01', 'Débitos', 'Créditos', '2026/02'],
  // Saldos que no salen de los movimientos (columnas de otra cosa): en un balance real esto no pasa.
  ...Array.from({ length: 12 }, (_, i) => [`417095${String(i + 10).padStart(2, '0')}`, `SERVICIO ${i}`, '59', String(-1_000_000 * (i + 1)), '0', String(100_000 * (i + 1)), String(-100_000 * (i + 1))]),
]
const BAL_BIM4 = siesa('2026/07', '2026/08', [
  ['2408', 'IMPUESTO SOBRE LAS VENTAS POR PAGAR', '-300', '1000', '400', '300', '4'],
  ['240801', 'IVA DESCONTABLE', '0', '1000', '0', '1000', '6'],
  ['240805', 'IVA GENERADO', '-300', '0', '400', '-700', '6'],
])
const BAL_ANUAL = siesa('2025/01', '2025/12', [
  ['2408', 'IMPUESTO SOBRE LAS VENTAS POR PAGAR', '0', '9000', '9000', '0', '4'],
  ['240801', 'IVA DESCONTABLE', '0', '9000', '0', '9000', '6'],
  ['240805', 'IVA GENERADO', '0', '0', '9000', '-9000', '6'],
])
const AUX_2025 = [
  ['Fecha', 'Auxiliar', 'Desc. auxiliar', 'Nit tercero', 'Razón social tercero docto.', 'Base gravable', 'Débitos', 'Créditos'],
  ['45778', '24080105', 'IVA DESCONTABLE COMPRAS 19%', '900000012', 'TERCERO 19 SAS', '5270234', '1001344', '0'],
]
const LIBRO = [
  { nombre: 'Hoja de W', filas: HOJA_RESUMEN },
  { nombre: 'IVA', filas: [['Resumen'], ['casilla', 'valor']] },
  { nombre: 'Bal_prueba', filas: BAL_BIM4 },
  { nombre: 'Bal_Anual', filas: BAL_ANUAL },
  { nombre: 'AUX-2408', filas: AUX_2025 },
]

describe('libros de varias hojas y período de Siesa', () => {
  it('Siesa declara el período en los encabezados de saldo ("2026/07" a "2026/08")', () => {
    expect(parseBalancePeriodo(BAL_BIM4)!.encabezado).toMatchObject({ periodoDesde: '2026-07-01', periodoHasta: '2026-08-31' })
    expect(parseBalancePeriodo(BAL_ANUAL)!.encabezado).toMatchObject({ periodoDesde: '2025-01-01', periodoHasta: '2025-12-31' })
  })
  it('avisa cuando los saldos no salen de los movimientos (no parece un balance del período)', () => {
    expect(parseBalancePeriodo(HOJA_RESUMEN)!.advertencias.some((a) => /saldo final no es el inicial/.test(a))).toBe(true)
    expect(parseBalancePeriodo(BAL_BIM4)!.advertencias.some((a) => /saldo final no es el inicial/.test(a))).toBe(false)
  })
  it('elige la hoja que sirve para el período de la revisión, no la primera', () => {
    const bim4 = elegirHojaLibro(LIBRO, { desde: '2026-07-01', hasta: '2026-08-31' })!
    expect(bim4.hoja.nombre).toBe('Bal_prueba')
    expect(bim4.legibles.map((h) => [h.nombre, h.sirve])).toEqual([['Hoja de W', false], ['Bal_prueba', true], ['Bal_Anual', false], ['AUX-2408', false]])
    expect(elegirHojaLibro(LIBRO, { desde: '2026-01-01', hasta: '2026-02-28' })!.hoja.nombre).toBe('Hoja de W')
    // Con un auxiliar del período, gana el auxiliar (trae asientos, terceros y base).
    expect(elegirHojaLibro(LIBRO, { desde: '2025-05-01', hasta: '2025-05-31' })!.hoja.nombre).toBe('AUX-2408')
    expect(elegirHojaLibro([{ nombre: 'x', filas: [['hola']] }], { desde: '2026-07-01', hasta: '2026-08-31' })).toBeNull()
  })
})

describe('terceros de relleno ("Genérico", "Varios")', () => {
  it('no son proveedores: no se clasifican ni entran a la prueba por tercero', () => {
    expect(esTerceroGenerico(null, 'Genérico')).toBe(true)
    expect(esTerceroGenerico('', 'VARIOS')).toBe(true)
    expect(esTerceroGenerico('222222222', 'Cuantías menores')).toBe(true)
    expect(esTerceroGenerico(null, 'SEGUROS GENERALES SURAMERICANA S A')).toBe(false)
    expect(esTerceroGenerico('900000001', 'Genérico')).toBe(false)
    expect(beneficiarioDeTercero(null, 'Genérico')).toBeNull()
    const r = probarRetencionPorTercero([
      { cuenta: '15201001', cuentaNombre: 'MAQUINARIA Y EQUIPO', tercero: null, terceroNombre: 'Genérico', debitos: 102_764_830, creditos: 0 },
      { cuenta: '51100501', cuentaNombre: 'HONORARIOS', tercero: '900000101', terceroNombre: 'ASESORES UNO SAS', debitos: 10_000_000, creditos: 0 },
      { cuenta: '23651501', cuentaNombre: 'RETEFUENTE HONORARIOS 11%', tercero: '900000101', terceroNombre: 'ASESORES UNO SAS', debitos: 0, creditos: 1_100_000 },
    ], { anio: 2025 }).prueba!
    expect(r.filas.map((f) => f.nombre)).toEqual(['ASESORES UNO SAS'])
    expect(r.alertas.sin_retencion).toBe(0)
    expect(r.bitacora.some((b) => /tercero genérico/.test(b))).toBe(true)
  })
})

// ─── Otros programas contables ───────────────────────────────────────────────

describe('balances y auxiliares de otros programas', () => {
  it('Pluss100 · balance de prueba "CODIGO · CUENTA · N° DOCUMENTO · TERCERO": CUENTA es el nombre, no el tercero', () => {
    // Estructura real del archivo que falló (cifras y empresa cambiadas).
    const b = parseBalancePeriodo([
      ['EMPRESA EJEMPLO S.A.S'], ['BALANCE DE PRUEBA'],
      ['PERIODO:  01/09/2026 - 30/09/2026      RANGO CUENTAS: 2365 - RETENCION EN LA FUENTE | 23659901 - PAGO RETENCION EN LA FUENTE'],
      ['CODIGO', 'CUENTA', 'N° DOCUMENTO', 'TERCERO', 'SALDO INICIAL', 'DEBITO', 'CREDITO', 'SALDO FINAL'],
      ['2', 'PASIVO', '', '', '1000', '1000', '5330', '5330'],
      ['2365', 'RETENCION EN LA FUENTE', '', '', '1000', '1000', '5330', '5330'],
      ['236515', 'HONORARIOS', '', '', '0', '0', '4330', '4330'],
      ['23651501', 'HONORARIOS 11%', '', '', '0', '0', '330', '330'],
      ['23651502', 'HONORARIOS 10%', '', '', '0', '0', '4000', '4000'],
      ['236599', 'PAGO RETENCION EN LA FUENTE', '', '', '1000', '1000', '0', '0'],
      ['23659901', 'PAGO RETENCION EN LA FUENTE', '', '', '1000', '1000', '0', '0'],
      ['23651502', 'GOMEZ RUIZ LUIS', '', '79555111', '0', '0', '4000', '4000'],
    ])!
    expect(b.columnas).toMatchObject({ cuenta: 0, nombre: 1, tercero: 3, debito: 5, credito: 6 })
    expect(b.encabezado).toMatchObject({ periodoDesde: '2026-09-01', periodoHasta: '2026-09-30' })
    expect(b.cuentas.map((c) => [c.cuenta, c.nombre, c.creditos])).toEqual([['23651501', 'HONORARIOS 11%', 330], ['23651502', 'HONORARIOS 10%', 4000], ['23659901', 'PAGO RETENCION EN LA FUENTE', 0]])
    expect(b.terceros).toEqual([expect.objectContaining({ cuenta: '23651502', tercero: '79555111', creditos: 4000 })])
  })
  it('Siigo, Helisa y Alegra: "Movimiento débito", "Nuevo saldo", "Código cuenta contable"', () => {
    const siigo = parseBalancePeriodo([
      ['Código cuenta contable', 'Nombre cuenta contable', 'Saldo inicial', 'Movimiento débito', 'Movimiento crédito', 'Saldo final'],
      ['2408', 'IVA POR PAGAR', '0', '100', '500', '-400'], ['240805', 'IVA GENERADO', '0', '0', '500', '-500'], ['240810', 'IVA DESCONTABLE', '0', '100', '0', '100'],
    ])!
    expect(siigo.columnas).toMatchObject({ cuenta: 0, nombre: 1, saldoInicial: 2, debito: 3, credito: 4, saldoFinal: 5 })
    expect(siigo.cuentas.map((c) => c.cuenta)).toEqual(['240805', '240810'])
    const helisa = parseBalancePeriodo([['CUENTA', 'NOMBRE', 'SALDO ANTERIOR', 'DEBITOS', 'CREDITOS', 'NUEVO SALDO'], ['240805', 'IVA GENERADO', '0', '0', '500', '-500']])!
    expect(helisa.columnas).toMatchObject({ cuenta: 0, nombre: 1, saldoInicial: 2, debito: 3, credito: 4, saldoFinal: 5 })
    // Saldos partidos en débito y crédito: no se confunden con el movimiento.
    const partido = parseBalancePeriodo([['Código', 'Nombre', 'Saldo inicial débito', 'Saldo inicial crédito', 'Débito', 'Crédito', 'Saldo final débito', 'Saldo final crédito'], ['240805', 'IVA GENERADO', '0', '0', '0', '500', '0', '500']])!
    expect(partido.columnas).toMatchObject({ debito: 4, credito: 5 })
    expect(partido.cuentas[0].creditos).toBe(500)
    const auxSiigo = parseAuxiliarMovimientos([
      ['Cuenta contable', 'Nombre cuenta', 'Comprobante', 'Fecha elaboración', 'Identificación', 'Nombre del tercero', 'Descripción', 'Débito', 'Crédito', 'Saldo'],
      ['24080501', 'IVA GENERADO 19%', 'FV-1-120', '15/07/2026', '900000001', 'CLIENTE UNO SAS', 'Venta', '0', '19000', '-19000'],
    ])!
    expect(auxSiigo.movimientos[0]).toMatchObject({ fecha: '2026-07-15', cuenta: '24080501', cuentaNombre: 'IVA GENERADO 19%', tercero: '900000001', terceroNombre: 'CLIENTE UNO SAS', credito: 19000 })
  })
})

describe('formatos indicados por el auditor', () => {
  // Encabezados que ningún sinónimo reconoce.
  const RARO = [
    ['INFORME DE SALDOS DEL MES'], ['Generado el 2026-10-01'],
    ['Cód.', 'Desc.', 'S. Ant.', 'Mov. D', 'Mov. C', 'S. Act.'],
    ['24', 'IMPUESTOS', '0', '100', '500', '-400'], ['2408', 'IVA', '0', '100', '500', '-400'],
    ['240805', 'IVA GENERADO', '0', '0', '500', '-500'], ['240810', 'IVA DESCONTABLE', '0', '100', '0', '100'],
  ]
  it('sin formato no se reconoce; con las columnas indicadas se lee y queda como formato', () => {
    expect(leerLibroContable(RARO, parseAuxiliarMovimientos)).toBeNull()
    expect(sugerirFilaEncabezado(RARO)).toBe(2)
    expect(faltaParaFormato('balance', { cuenta: 0, debito: 3 })).toEqual(['los créditos'])
    const columnas = { cuenta: 0, nombre: 1, saldoInicial: 2, debito: 3, credito: 4, saldoFinal: 5 }
    const libro = leerConColumnas(RARO, 'balance', 2, columnas)!
    expect(libro.familia).toBe('balance')
    if (libro.familia === 'balance') expect(libro.balance.cuentas.map((c) => [c.cuenta, c.debitos, c.creditos])).toEqual([['240805', 0, 500], ['240810', 100, 0]])
    const formato: FormatoLibro = { firma: firmaEncabezado(RARO[2]), familia: 'balance', columnas }
    expect(formato.firma).toBe('cod.|desc.|s. ant.|mov. d|mov. c|s. act.')
    // El mes siguiente: otras filas de título arriba, mismo encabezado → se lee solo con el formato guardado.
    const siguiente = [['INFORME DE SALDOS DEL MES'], ['Generado el 2026-11-01'], ['Página 1'], ...RARO.slice(2)]
    expect(leerLibroContable(siguiente, parseAuxiliarMovimientos, [formato])?.familia).toBe('balance')
    expect(elegirHojaLibro([{ nombre: 'Saldos', filas: siguiente }], { desde: '2026-10-01', hasta: '2026-10-31' }, [formato])?.hoja.nombre).toBe('Saldos')
  })
  it('un auxiliar con columnas indicadas: fecha, cuenta y una sola columna de valor', () => {
    const filas = [['F. mov', 'Aux', 'Importe'], ['2026-07-03', '24080501', '-19000'], ['2026-07-04', '24081001', '5000']]
    expect(leerLibroContable(filas, parseAuxiliarMovimientos)).toBeNull()
    expect(faltaParaFormato('movimientos', { fecha: 0, cuenta: 1 })).toEqual(['los débitos y créditos (o una columna de valor)'])
    const libro = leerConColumnas(filas, 'movimientos', 0, { fecha: 0, cuenta: 1, valor: 2 })!
    expect(libro.familia === 'movimientos' && libro.auxiliar.movimientos.map((m) => [m.cuenta, m.debito, m.credito])).toEqual([['24080501', 19000, 0], ['24081001', 0, 5000]])
  })
})
