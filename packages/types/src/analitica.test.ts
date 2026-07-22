import { describe, expect, it } from 'vitest'
import { calcularRatios, detectarBanderas, type EntradaAnalitica } from './analitica'

/** Balance mínimo de una empresa comercial sana. */
function balanceSano(): EntradaAnalitica[] {
  return [
    { codigo: '1', saldoActual: 1000, saldoAnterior: 900 }, // activo
    { codigo: '11', saldoActual: 200, saldoAnterior: 180 }, // disponible
    { codigo: '13', saldoActual: 300, saldoAnterior: 280 }, // cartera
    { codigo: '14', saldoActual: 250, saldoAnterior: 240 }, // inventario
    { codigo: '2', saldoActual: 400, saldoAnterior: 380 }, // pasivo
    { codigo: '21', saldoActual: 150, saldoAnterior: 140 },
    { codigo: '22', saldoActual: 100, saldoAnterior: 90 },
    { codigo: '3', saldoActual: 600, saldoAnterior: 520 }, // patrimonio
    { codigo: '4', saldoActual: 2000, saldoAnterior: 1800 }, // ingresos
    { codigo: '5', saldoActual: 500, saldoAnterior: 450 }, // gastos
    { codigo: '6', saldoActual: 1200, saldoAnterior: 1100 }, // costo de ventas
  ]
}

describe('calcularRatios', () => {
  it('calcula endeudamiento como pasivo/activo', () => {
    const ratios = calcularRatios(balanceSano())
    const endeud = ratios.find((r) => r.clave === 'endeudamiento')
    expect(endeud?.valor).toBe(40) // 400/1000
    expect(endeud?.estado).toBe('neutral')
  })

  it('marca alerta cuando el endeudamiento supera 70%', () => {
    const cuentas: EntradaAnalitica[] = [
      { codigo: '1', saldoActual: 1000, saldoAnterior: 1000 },
      { codigo: '2', saldoActual: 800, saldoAnterior: 700 },
    ]
    const endeud = calcularRatios(cuentas).find((r) => r.clave === 'endeudamiento')
    expect(endeud?.valor).toBe(80)
    expect(endeud?.estado).toBe('alerta')
  })

  it('razón corriente < 1 dispara alerta de liquidez', () => {
    const cuentas: EntradaAnalitica[] = [
      { codigo: '11', saldoActual: 100, saldoAnterior: 100 },
      { codigo: '21', saldoActual: 300, saldoAnterior: 300 },
    ]
    const razon = calcularRatios(cuentas).find((r) => r.clave === 'razon_corriente')
    expect(razon?.estado).toBe('alerta')
    expect(razon?.aproximado).toBe(true)
  })

  it('no incluye ratios que no se pueden calcular (sin ingresos, sin margen)', () => {
    const cuentas: EntradaAnalitica[] = [{ codigo: '1', saldoActual: 100, saldoAnterior: 100 }]
    const claves = calcularRatios(cuentas).map((r) => r.clave)
    expect(claves).not.toContain('margen_neto')
    expect(claves).not.toContain('rotacion_cartera')
  })
})

describe('detectarBanderas', () => {
  it('un balance sano no genera banderas de alta severidad', () => {
    const banderas = detectarBanderas(balanceSano())
    expect(banderas.some((b) => b.severidad === 'alta')).toBe(false)
  })

  it('detecta patrimonio negativo cuando el pasivo supera al activo', () => {
    const cuentas: EntradaAnalitica[] = [
      { codigo: '1', saldoActual: 500, saldoAnterior: 500 },
      { codigo: '2', saldoActual: 700, saldoAnterior: 600 },
    ]
    const b = detectarBanderas(cuentas).find((x) => x.clave === 'patrimonio_negativo')
    expect(b?.severidad).toBe('alta')
  })

  it('detecta pérdida del ejercicio', () => {
    const cuentas: EntradaAnalitica[] = [
      { codigo: '4', saldoActual: 1000, saldoAnterior: 1000 },
      { codigo: '5', saldoActual: 600, saldoAnterior: 500 },
      { codigo: '6', saldoActual: 700, saldoAnterior: 600 },
    ]
    const b = detectarBanderas(cuentas).find((x) => x.clave === 'perdida_ejercicio')
    expect(b?.severidad).toBe('alta')
  })

  it('detecta cartera creciendo más rápido que las ventas', () => {
    const cuentas: EntradaAnalitica[] = [
      { codigo: '13', saldoActual: 200, saldoAnterior: 100 }, // +100%
      { codigo: '4', saldoActual: 1050, saldoAnterior: 1000 }, // +5%
    ]
    const b = detectarBanderas(cuentas).find((x) => x.clave === 'cartera_vs_ventas')
    expect(b).toBeDefined()
    expect(b?.codigos).toContain('13')
  })
})
