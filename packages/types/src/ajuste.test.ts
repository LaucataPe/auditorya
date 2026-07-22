import { describe, expect, it } from 'vitest'
import { evaluarOpinion, type AjusteCalc } from './ajuste'

const a = (o: Partial<AjusteCalc>): AjusteCalc => ({ monto: 0, corregido: false, efecto: 'resultado', ...o })

describe('evaluarOpinion', () => {
  it('sin materialidad → sin base para opinar', () => {
    const r = evaluarOpinion([a({ monto: 100 })], null)
    expect(r.opinionSugerida).toBe('sin_base')
  })

  it('sin incorrecciones → favorable', () => {
    const r = evaluarOpinion([], 1000)
    expect(r.opinionSugerida).toBe('favorable')
    expect(r.totalNoCorregido).toBe(0)
  })

  it('no corregido por debajo de la materialidad → favorable', () => {
    const r = evaluarOpinion([a({ monto: 400 })], 1000)
    expect(r.opinionSugerida).toBe('favorable')
    expect(r.superaMaterialidad).toBe(false)
  })

  it('no corregido que supera la materialidad (no generalizado) → con salvedades', () => {
    const r = evaluarOpinion([a({ monto: 1500 })], 1000)
    expect(r.opinionSugerida).toBe('con_salvedades')
    expect(r.superaMaterialidad).toBe(true)
  })

  it('no corregido ≥ 3× materialidad → negativa', () => {
    const r = evaluarOpinion([a({ monto: 3500 })], 1000)
    expect(r.opinionSugerida).toBe('negativa')
  })

  it('los ajustes corregidos no cuentan al total no corregido', () => {
    const r = evaluarOpinion([a({ monto: 5000, corregido: true }), a({ monto: 200 })], 1000)
    expect(r.totalCorregido).toBe(5000)
    expect(r.totalNoCorregido).toBe(200)
    expect(r.opinionSugerida).toBe('favorable')
  })

  it('las reclasificaciones se listan pero no suman al total', () => {
    const r = evaluarOpinion([a({ monto: 9000, efecto: 'reclasificacion' })], 1000)
    expect(r.totalNoCorregido).toBe(0)
    expect(r.totalReclasificaciones).toBe(9000)
    expect(r.opinionSugerida).toBe('favorable')
  })

  it('usa el valor absoluto del monto', () => {
    const r = evaluarOpinion([a({ monto: -1500 })], 1000)
    expect(r.totalNoCorregido).toBe(1500)
    expect(r.opinionSugerida).toBe('con_salvedades')
  })
})
