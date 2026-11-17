import { describe, expect, it } from 'vitest'
import { BALANCE_CASO, EMPRESA_CASO, EXPEDIENTE_CASO, MATERIALIDAD_CASO, RESPUESTAS_CASO } from './academia-caso'
import { detectarBanderas, calcularRatios } from './analitica'
import { evaluarOpinion } from './ajuste'

const M = 1_000_000
const saldo = (codigo: string, campo: 'saldoActual' | 'saldoAnterior' = 'saldoActual') =>
  BALANCE_CASO.find((c) => c.codigo === codigo)?.[campo] ?? 0

/** Suma de las cuentas hijas inmediatas (un nivel PUC más abajo) de un código. */
function sumaHijas(codigo: string, campo: 'saldoActual' | 'saldoAnterior') {
  const largoHija = codigo.length === 1 ? 2 : codigo.length === 2 ? 4 : 8
  return BALANCE_CASO.filter((c) => c.codigo.length === largoHija && c.codigo.startsWith(codigo))
    .reduce((acc, c) => acc + (c[campo] ?? 0), 0)
}

const entradaAnalitica = () =>
  BALANCE_CASO.filter((c) => c.codigo.length <= 4).map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    saldoActual: c.saldoActual,
    saldoAnterior: c.saldoAnterior ?? 0,
  }))

describe('caso de la Academia', () => {
  it('cuadra la ecuación contable en 2026 y en el comparativo 2025', () => {
    for (const campo of ['saldoActual', 'saldoAnterior'] as const) {
      const resultado = saldo('4', campo) - saldo('5', campo) - saldo('6', campo)
      expect(saldo('1', campo)).toBe(saldo('2', campo) + saldo('3', campo) + resultado)
    }
  })

  it('cada total es la suma de sus cuentas hijas', () => {
    const conHijas = BALANCE_CASO.filter((c) => c.codigo.length <= 4 && BALANCE_CASO.some((h) => h.codigo !== c.codigo && h.codigo.startsWith(c.codigo)))
    for (const cuenta of conHijas) {
      expect(sumaHijas(cuenta.codigo, 'saldoActual'), cuenta.codigo).toBe(cuenta.saldoActual)
      if (cuenta.codigo.length < 4) expect(sumaHijas(cuenta.codigo, 'saldoAnterior'), cuenta.codigo).toBe(cuenta.saldoAnterior)
    }
  })

  it('deja la utilidad antes de impuestos en 38 M (20 M en 2025)', () => {
    expect(saldo('4') - saldo('5') - saldo('6')).toBe(38 * M)
    expect(saldo('4', 'saldoAnterior') - saldo('5', 'saldoAnterior') - saldo('6', 'saldoAnterior')).toBe(20 * M)
  })

  it('la analítica muestra el salto del margen y marca el inventario frente al costo', () => {
    const ratios = calcularRatios(entradaAnalitica())
    const margen = ratios.find((r) => r.clave === 'margen_bruto')
    expect(margen?.valor).toBeCloseTo(40.5, 1)
    expect(margen?.anterior).toBeCloseTo(30, 1)

    const banderas = detectarBanderas(entradaAnalitica()).map((b) => b.clave)
    expect(banderas).toContain('inventario_vs_costo')
  })

  it('la materialidad de la respuesta correcta da 10 M / 7,5 M / 0,5 M', () => {
    const m = RESPUESTAS_CASO.materialidad
    const global = m.montoBase * (m.porcentaje / 100)
    expect(global).toBe(MATERIALIDAD_CASO.global)
    expect(global * (m.porcentajeDesempeno / 100)).toBe(MATERIALIDAD_CASO.ejecucion)
    expect(global * 0.05).toBe(MATERIALIDAD_CASO.trivial)
  })

  it('no alcanza los topes legales de revisoría fiscal: el cargo viene de los estatutos', () => {
    const smmlv2025 = 1_423_500
    expect(saldo('1', 'saldoAnterior')).toBeLessThan(5000 * smmlv2025)
    expect(saldo('4', 'saldoAnterior')).toBeLessThan(3000 * smmlv2025)
    expect(EMPRESA_CASO.entornoRegulatorio).toMatch(/estatutos/)
  })

  it('el expediente sigue la cronología: renuncia → asamblea → propuesta → certificado con el nombramiento', () => {
    const fecha = (id: string) => EXPEDIENTE_CASO.find((d) => d.id === id)!.fecha
    expect(fecha('renuncia') < fecha('acta-018')).toBe(true)
    expect(fecha('acta-018') < fecha('correo-gerente')).toBe(true)
    expect(fecha('correo-gerente') < fecha('camara')).toBe(true)
  })

  it('la hoja de ajustes del caso deja 133 M sin corregir y sugiere opinión negativa', () => {
    const ev = evaluarOpinion(RESPUESTAS_CASO.ajustes, MATERIALIDAD_CASO.global)
    expect(ev.totalNoCorregido).toBe(133 * M)
    expect(ev.opinionSugerida).toBe('negativa')
  })
})
