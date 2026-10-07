/**
 * Lectura de libros contables de distintos programas (Pluss100, World Office,
 * Siesa), sobre muestras reales anonimizadas. Lo que se prueba es lo que varía
 * por software: dónde va la cuenta, filas de saldo y totales, importe en una
 * sola columna, tercero sin NIT, códigos como número, balance por terceros.
 */
import { describe, expect, it } from 'vitest'
import { parseAuxiliarMovimientos, resumirAuxiliarPeriodo } from './parse-auxiliar'
import { leerLibroContable, parseBalancePeriodo } from './parse-balance-periodo'
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
