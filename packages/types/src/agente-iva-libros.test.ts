import { describe, expect, it } from 'vitest'
import { clasificarIngreso, clasificarSubcuentaIva, mapearAuxiliarACifrasIva } from './agente-iva-libros'
import { parseAuxiliarMovimientos, resumirAuxiliarPeriodo, type ResumenCuentaAuxiliar } from './parse-auxiliar'
import { CIFRAS_CATALOGO, resolverCifras } from './tributario'
import { AUXILIAR_IVA_2408 } from './fixtures/auxiliar-iva-2408'

const aux = parseAuxiliarMovimientos(AUXILIAR_IVA_2408)!
const cuenta = (c: Partial<ResumenCuentaAuxiliar> & { cuenta: string }): ResumenCuentaAuxiliar => ({
  nombre: null, debitos: 0, creditos: 0, movimientos: 1, cierres: [], ...c,
})

describe('clasificarSubcuentaIva', () => {
  it('reconoce las subcuentas reales por su nombre', () => {
    expect(clasificarSubcuentaIva('IVA GENERADO 19%')).toBe('iva-gen-19')
    expect(clasificarSubcuentaIva('IVA GENERADO 5%')).toBe('iva-gen-5')
    expect(clasificarSubcuentaIva('IVA DESC. COMPRAS 19%')).toBe('iva-desc-compras')
    expect(clasificarSubcuentaIva('IVA DESC. COMPRAS 5%')).toBe('iva-desc-compras')
    expect(clasificarSubcuentaIva('IVA DESC. SERVICIOS 19%')).toBe('iva-desc-servicios')
    expect(clasificarSubcuentaIva('DEV. IVA DESCONTABLE 19%')).toBe('iva-gen-recuperado')
    expect(clasificarSubcuentaIva('DEVOLUCION IVA GENERADO')).toBe('iva-desc-devoluciones')
    expect(clasificarSubcuentaIva('IVA POR PAGAR')).toBe('saldo')
  })
  it('no adivina lo que no se lee del nombre', () => {
    expect(clasificarSubcuentaIva('IVA')).toBeNull()
    expect(clasificarSubcuentaIva(null)).toBeNull()
  })
})

describe('clasificarIngreso', () => {
  it('separa por tarifa o clase de operación solo si el nombre lo dice', () => {
    expect(clasificarIngreso('INGRESOS GRAVADOS 19%')).toBe('iva-ing-19')
    expect(clasificarIngreso('VENTAS TARIFA 5%')).toBe('iva-ing-5')
    expect(clasificarIngreso('INGRESOS EXCLUIDOS')).toBe('iva-ing-excluidos')
    expect(clasificarIngreso('EXPORTACION DE SERVICIOS')).toBe('iva-ing-exportaciones')
    expect(clasificarIngreso('ARRENDAMIENTOS')).toBeNull()
  })
})

describe('mapearAuxiliarACifrasIva (auxiliar real de 2408)', () => {
  it('bimestre 1: llena generado y descontables según libros', () => {
    const r = mapearAuxiliarACifrasIva(resumirAuxiliarPeriodo(aux, { desde: '2026-01-01', hasta: '2026-02-28' }))
    expect(r.cifras['iva-gen-19']).toEqual({ libros: 9_139_950 })
    // Compras al 19 % y al 5 %: el catálogo no separa descontables por tarifa.
    expect(r.cifras['iva-desc-compras']).toEqual({ libros: 582_354 })
    expect(r.cifras['iva-desc-servicios']).toEqual({ libros: 9_415_518 })
    expect(r.sinClasificar).toEqual([])
    expect(r.totales['iva-ing-brutos']).toBeUndefined()
    // Los totales del catálogo se resuelven con estos valores.
    const resueltas = resolverCifras('iva', Object.fromEntries(Object.entries(r.cifras).map(([id, v]) => [id, { declarado: null, libros: v.libros }])))
    expect(resueltas['iva-generado'].libros).toBe(9_139_950)
    expect(resueltas['iva-descontable'].libros).toBe(582_354 + 9_415_518)
    expect(resueltas['iva-saldo'].libros).toBe(9_139_950 - 582_354 - 9_415_518)
  })
  it('bimestre 2: la devolución de descontable va al IVA recuperado (casilla 66)', () => {
    const r = mapearAuxiliarACifrasIva(resumirAuxiliarPeriodo(aux, { desde: '2026-03-01', hasta: '2026-04-30' }))
    expect(r.cifras['iva-gen-19']).toEqual({ libros: 4_940_000 })
    expect(r.cifras['iva-gen-recuperado']).toEqual({ libros: 1_586_740 })
  })
  it('todos los destinos existen como renglones digitables del catálogo', () => {
    const digitables = new Set(CIFRAS_CATALOGO.iva.flatMap((s) => s.renglones).filter((r) => r.tipo === 'digitable').map((r) => r.id))
    const r = mapearAuxiliarACifrasIva(resumirAuxiliarPeriodo(aux, { desde: '2026-01-01', hasta: '2026-04-30' }))
    for (const id of Object.keys(r.cifras)) expect(digitables.has(id)).toBe(true)
  })
})

describe('mapearAuxiliarACifrasIva: ingresos, retenciones y memoria', () => {
  const cuentas = [
    cuenta({ cuenta: '41350505', nombre: 'VENTAS GRAVADAS 19%', creditos: 1_000_000 }),
    cuenta({ cuenta: '41359505', nombre: 'ARRENDAMIENTOS', creditos: 500_000, debitos: 20_000 }),
    cuenta({ cuenta: '41750505', nombre: 'DEVOLUCIONES EN VENTAS', debitos: 50_000 }),
    cuenta({ cuenta: '13551701', nombre: 'RETENCION IVA', debitos: 30_000 }),
    cuenta({ cuenta: '13551501', nombre: 'RETEFUENTE', debitos: 99_000 }),
    cuenta({ cuenta: '24089505', nombre: 'IVA POR PAGAR', creditos: 5 }),
    cuenta({ cuenta: '24089901', nombre: 'IVA REGIMEN', creditos: 7_000 }),
    cuenta({ cuenta: '11050501', nombre: 'CAJA', debitos: 1 }),
  ]
  it('clase 4 suma al total de ingresos y solo lo nombrado por tarifa llega al renglón', () => {
    const r = mapearAuxiliarACifrasIva({ cuentas })
    expect(r.cifras['iva-ing-19']).toEqual({ libros: 1_000_000 })
    expect(r.cifras['iva-ing-devoluciones']).toEqual({ libros: 50_000 })
    expect(r.totales['iva-ing-brutos']).toBe(1_000_000 + 480_000)
    expect(r.cifras['iva-retenido']).toEqual({ libros: 30_000 })
    expect(r.cifras['iva-ing-5']).toBeUndefined()
  })
  it('ignora saldos, otros anticipos y cuentas ajenas; deja lo dudoso para confirmar', () => {
    const r = mapearAuxiliarACifrasIva({ cuentas })
    expect(r.sinClasificar.map((c) => c.cuenta)).toEqual(['24089901'])
    expect(r.cuentas.find((c) => c.cuenta === '24089505')?.regla).toBe('ignorada')
    expect(r.cuentas.find((c) => c.cuenta === '13551501')?.destino).toBeNull()
    expect(r.bitacora.some((l) => l.includes('sin clasificar'))).toBe(true)
  })
  it('la memoria de la empresa prevalece sobre las heurísticas', () => {
    const r = mapearAuxiliarACifrasIva({ cuentas }, { mapeo: { '24089901': 'iva-gen-otros', '41359505': 'ignorar' } })
    expect(r.cifras['iva-gen-otros']).toEqual({ libros: 7_000 })
    expect(r.sinClasificar).toEqual([])
    expect(r.totales['iva-ing-brutos']).toBe(1_000_000)
    expect(r.cuentas.find((c) => c.cuenta === '24089901')?.regla).toBe('memoria')
  })
})
