import { describe, expect, it } from 'vitest'
import { normalizarFecha, parseAuxiliarMovimientos, resumirAuxiliarPeriodo, separarCodigoNombre } from './parse-auxiliar'
import { AUXILIAR_IVA_2408 } from './fixtures/auxiliar-iva-2408'

const aux = parseAuxiliarMovimientos(AUXILIAR_IVA_2408)!
const porCuenta = (r: ReturnType<typeof resumirAuxiliarPeriodo>, c: string) => r.cuentas.find((x) => x.cuenta === c)!

describe('normalizarFecha', () => {
  it('acepta ISO, dd/mm/yyyy, dd-mm-yyyy y el serial de Excel', () => {
    expect(normalizarFecha('2026-03-13')).toBe('2026-03-13')
    expect(normalizarFecha('2026-03-13 10:22:00')).toBe('2026-03-13')
    expect(normalizarFecha('13/03/2026')).toBe('2026-03-13')
    expect(normalizarFecha('13-03-2026')).toBe('2026-03-13')
    expect(normalizarFecha(46094)).toBe('2026-03-13')
    expect(normalizarFecha('46094')).toBe('2026-03-13')
  })
  it('rechaza lo que no es fecha', () => {
    expect(normalizarFecha('SALDO INICIAL')).toBeNull()
    expect(normalizarFecha('')).toBeNull()
    expect(normalizarFecha('24081010')).toBeNull()
    expect(normalizarFecha('32/13/2026')).toBeNull()
  })
})

describe('separarCodigoNombre', () => {
  it('separa "código - nombre" en sus variantes', () => {
    expect(separarCodigoNombre('24081010 - IVA DESC. COMPRAS 19%')).toEqual({ codigo: '24081010', nombre: 'IVA DESC. COMPRAS 19%' })
    expect(separarCodigoNombre('901634034 - TERCERO 1 SAS')).toEqual({ codigo: '901634034', nombre: 'TERCERO 1 SAS' })
    expect(separarCodigoNombre('2408.05.05 IVA GENERADO')).toEqual({ codigo: '24080505', nombre: 'IVA GENERADO' })
    expect(separarCodigoNombre('24080505')).toEqual({ codigo: '24080505', nombre: null })
  })
  it('devuelve null si no empieza por código', () => {
    expect(separarCodigoNombre('IVA GENERADO')).toBeNull()
    expect(separarCodigoNombre('')).toBeNull()
  })
})

describe('parseAuxiliarMovimientos (auxiliar por cuentas real)', () => {
  it('detecta el encabezado y las columnas', () => {
    expect(aux.filaEncabezado).toBe(4)
    expect(aux.columnas).toMatchObject({ fecha: 0, tipoDoc: 1, numeroDoc: 2, cuenta: 4, tercero: 5, concepto: 6, debito: 8, credito: 9 })
  })
  it('lee el título: empresa y período', () => {
    expect(aux.encabezado.empresa).toBe('EMPRESA EJEMPLO S.A.S')
    expect(aux.encabezado.periodoDesde).toBe('2026-01-01')
    expect(aux.encabezado.periodoHasta).toBe('2026-04-30')
    // "CUENTA INICIO / CUENTA FIN" es un rango, no la cuenta única del auxiliar.
    expect(aux.encabezado.cuentaTitulo).toBeNull()
  })
  it('convierte cada asiento en un movimiento con cuenta y tercero separados', () => {
    expect(aux.movimientos).toHaveLength(94)
    expect(aux.filasIgnoradas).toBe(0)
    const m = aux.movimientos[0]
    expect(m).toMatchObject({ fecha: '2026-03-13', tipoDoc: 'FC', cuenta: '24081010', cuentaNombre: 'IVA DESC. COMPRAS 19%', debito: 42579, credito: 0 })
    expect(m.tercero).toMatch(/^\d+$/)
    expect(m.terceroNombre).toMatch(/^TERCERO/)
    const cuentas = new Set(aux.movimientos.map((x) => x.cuenta))
    expect([...cuentas].sort()).toEqual(['24080505', '24081005', '24081010', '24082010', '24082501'])
  })
  it('devuelve null para una matriz que no es un auxiliar (p. ej. un balance de prueba)', () => {
    expect(parseAuxiliarMovimientos([['1105', 'Caja', '100', '0', '0', '100'], ['1110', 'Bancos', '5', '0', '0', '5']])).toBeNull()
    expect(parseAuxiliarMovimientos([])).toBeNull()
  })
})

describe('resumirAuxiliarPeriodo: excluye el asiento de cierre del IVA', () => {
  const b1 = resumirAuxiliarPeriodo(aux, { desde: '2026-01-01', hasta: '2026-02-28' })
  const b2 = resumirAuxiliarPeriodo(aux, { desde: '2026-03-01', hasta: '2026-04-30' })

  it('bimestre 1: el CI del 28 de febrero cancela las cuentas y no se suma', () => {
    const gen = porCuenta(b1, '24080505')
    expect(gen.creditos).toBe(9_139_950)
    expect(gen.debitos).toBe(0)
    expect(gen.cierres).toHaveLength(1)
    expect(gen.cierres[0]).toMatchObject({ tipoDoc: 'CI', fecha: '2026-02-28', debito: 9_139_950 })
    expect(porCuenta(b1, '24081010')).toMatchObject({ debitos: 572_354, creditos: 0 })
    expect(porCuenta(b1, '24081005')).toMatchObject({ debitos: 10_000, creditos: 0 })
    expect(porCuenta(b1, '24082010').debitos).toBeCloseTo(9_415_517.66, 2)
    expect(porCuenta(b1, '24082010').creditos).toBe(0)
    expect(b1.tiposDocCierre).toEqual(['CI'])
    expect(b1.fueraDePeriodo).toBeGreaterThan(0)
  })
  it('bimestre 2: una devolución real de descontable se conserva y solo se excluye su cierre', () => {
    expect(porCuenta(b2, '24080505')).toMatchObject({ creditos: 4_940_000, debitos: 0 })
    const dev = porCuenta(b2, '24082501')
    expect(dev).toMatchObject({ creditos: 1_586_740, debitos: 0 })
    expect(dev.cierres).toHaveLength(1)
    expect(porCuenta(b2, '24082010').debitos).toBeCloseTo(3_600_787.66, 2)
    expect(b2.bitacora.some((l) => l.includes('cierre'))).toBe(true)
  })
  it('con el tipo de comprobante de cierre en memoria excluye por tipo', () => {
    const r = resumirAuxiliarPeriodo(aux, { desde: '2026-01-01', hasta: '2026-02-28' }, { tiposDocCierre: ['ci'] })
    expect(porCuenta(r, '24080505')).toMatchObject({ creditos: 9_139_950, debitos: 0 })
    expect(porCuenta(r, '24080505').cierres[0].tipoDoc).toBe('CI')
  })
  it('no confunde un movimiento del último día que no cancela el neto', () => {
    const r = resumirAuxiliarPeriodo(
      { movimientos: [
        { fecha: '2026-01-10', tipoDoc: 'FV', numeroDoc: '1', cuenta: '24080505', cuentaNombre: null, tercero: null, terceroNombre: null, concepto: null, debito: 0, credito: 1000 },
        { fecha: '2026-01-31', tipoDoc: 'NC', numeroDoc: '2', cuenta: '24080505', cuentaNombre: null, tercero: null, terceroNombre: null, concepto: null, debito: 300, credito: 0 },
      ] },
      { desde: '2026-01-01', hasta: '2026-01-31' },
    )
    expect(porCuenta(r, '24080505')).toMatchObject({ creditos: 1000, debitos: 300, cierres: [] })
  })
})
