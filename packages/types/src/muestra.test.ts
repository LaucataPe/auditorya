import { describe, expect, it } from 'vitest'
import { seleccionarMuestra, resumirMuestra, proyectarError, type TerceroSaldo, type ItemMuestreado } from './muestra'

function poblacion(): TerceroSaldo[] {
  return [
    { tercero: '900000001', terceroNombre: 'Grande SA', saldo: 1000 },
    { tercero: '900000002', terceroNombre: 'Mediana SA', saldo: 500 },
    { tercero: '900000003', terceroNombre: 'Menor 1', saldo: 200 },
    { tercero: '900000004', terceroNombre: 'Menor 2', saldo: 150 },
    { tercero: '900000005', terceroNombre: 'Menor 3', saldo: 100 },
    { tercero: '900000006', terceroNombre: 'Menor 4', saldo: 50 },
  ] // total = 2000
}

describe('seleccionarMuestra', () => {
  it('toma como partida clave todo saldo ≥ materialidad', () => {
    const { items } = seleccionarMuestra(poblacion(), { materialidad: 400, coberturaObjetivo: 0 })
    const claves = items.filter((i) => i.esClave).map((i) => i.saldo)
    expect(claves).toEqual([1000, 500]) // los dos ≥ 400
  })

  it('cubre hasta el % objetivo con los mayores saldos', () => {
    // Sin materialidad: cubrir 80% de 2000 = 1600.
    const { items, resumen } = seleccionarMuestra(poblacion(), { materialidad: null, coberturaObjetivo: 0.8 })
    // 1000 + 500 + 200 = 1700 ≥ 1600, se detiene ahí.
    expect(items.map((i) => i.saldo)).toEqual([1000, 500, 200])
    expect(resumen.coberturaPct).toBeGreaterThanOrEqual(80)
    expect(resumen.numClave).toBe(0)
  })

  it('combina partidas clave y cobertura', () => {
    const { resumen } = seleccionarMuestra(poblacion(), { materialidad: 400, coberturaObjetivo: 0.8 })
    expect(resumen.numClave).toBe(2)
    expect(resumen.numMuestra).toBeGreaterThanOrEqual(2)
    expect(resumen.saldoPoblacion).toBe(2000)
  })

  it('con cobertura 0 y sin materialidad no selecciona nada', () => {
    const { items } = seleccionarMuestra(poblacion(), { materialidad: null, coberturaObjetivo: 0 })
    expect(items).toHaveLength(0)
  })

  it('población vacía devuelve resumen en cero', () => {
    const { items, resumen } = seleccionarMuestra([], {})
    expect(items).toHaveLength(0)
    expect(resumen.coberturaPct).toBe(0)
    expect(resumen.saldoPoblacion).toBe(0)
  })

  it('usa el valor absoluto de los saldos (naturaleza crédito)', () => {
    const cuentas: TerceroSaldo[] = [
      { tercero: 'a', terceroNombre: null, saldo: -800 },
      { tercero: 'b', terceroNombre: null, saldo: -200 },
    ]
    const { items } = seleccionarMuestra(cuentas, { materialidad: 500, coberturaObjetivo: 0 })
    expect(items).toHaveLength(1)
    expect(items[0].tercero).toBe('a')
  })
})

describe('proyectarError (NIA 530)', () => {
  const item = (p: Partial<ItemMuestreado>): ItemMuestreado => ({
    saldo: 0,
    esClave: false,
    incluido: true,
    resultado: 'pendiente',
    diferencia: null,
    ...p,
  })

  it('proyecta el error del estrato no clave por ratio al resto de la población', () => {
    // Muestra no clave = 2.000 sobre población 10.000 → factor 5. Diferencia 100 → proyectado 500.
    const items = [
      item({ saldo: 1000, resultado: 'con_diferencia', diferencia: 100 }),
      item({ saldo: 1000, resultado: 'sin_diferencia' }),
    ]
    const r = proyectarError(items, 10000, 2000)
    expect(r.errorConocido).toBe(100)
    expect(r.errorProyectado).toBe(500)
    expect(r.veredicto).toBe('aceptable')
  })

  it('las partidas clave aportan su error real, sin extrapolar', () => {
    const items = [
      item({ saldo: 8000, esClave: true, resultado: 'con_diferencia', diferencia: 300 }),
      item({ saldo: 1000, resultado: 'sin_diferencia' }),
    ]
    // saldo población no clave = 10000 - 8000 = 2000; muestra no clave sin diferencia → 0.
    const r = proyectarError(items, 10000, 2000)
    expect(r.errorProyectado).toBe(300)
    expect(r.errorConocido).toBe(300)
  })

  it('marca "excede" cuando el error proyectado supera la materialidad', () => {
    const items = [
      item({ saldo: 1000, resultado: 'con_diferencia', diferencia: 500 }),
      item({ saldo: 1000, resultado: 'sin_diferencia' }),
    ]
    // factor = 10000/2000 = 5 → proyectado 2500 > materialidad 2000.
    const r = proyectarError(items, 10000, 2000)
    expect(r.errorProyectado).toBe(2500)
    expect(r.veredicto).toBe('excede')
  })

  it('marca "cercano" al acercarse a la materialidad', () => {
    // Población = muestra → factor 1 → proyectado 800; 800/1000 ≥ 0.75.
    const r = proyectarError([item({ saldo: 2000, resultado: 'con_diferencia', diferencia: 800 })], 2000, 1000)
    expect(r.errorProyectado).toBe(800)
    expect(r.veredicto).toBe('cercano')
  })

  it('reporta pendientes y sin materialidad', () => {
    const items = [
      item({ saldo: 1000, resultado: 'pendiente' }),
      item({ saldo: 1000, resultado: 'sin_diferencia' }),
    ]
    const r = proyectarError(items, 10000, null)
    expect(r.itemsPendientes).toBe(1)
    expect(r.itemsEvaluados).toBe(1)
    expect(r.veredicto).toBe('sin_materialidad')
  })

  it('ignora los ítems excluidos de la muestra', () => {
    const items = [
      item({ saldo: 1000, incluido: false, resultado: 'con_diferencia', diferencia: 999 }),
      item({ saldo: 1000, resultado: 'sin_diferencia' }),
    ]
    const r = proyectarError(items, 10000, 2000)
    expect(r.errorConocido).toBe(0)
    expect(r.itemsConDiferencia).toBe(0)
  })

  it('tolera numeric-as-string en saldo y diferencia', () => {
    const r = proyectarError([item({ saldo: '1000', resultado: 'con_diferencia', diferencia: '100' })], 5000, 2000)
    expect(r.errorConocido).toBe(100)
  })
})

describe('resumirMuestra', () => {
  it('calcula cobertura de los incluidos sobre la población', () => {
    const pob = poblacion()
    const incluidos = [{ tercero: '900000001', terceroNombre: 'Grande SA', saldo: 1000, esClave: true }]
    const r = resumirMuestra(pob, incluidos)
    expect(r.numPoblacion).toBe(6)
    expect(r.numMuestra).toBe(1)
    expect(r.coberturaPct).toBe(50) // 1000 / 2000
    expect(r.numClave).toBe(1)
  })
})
