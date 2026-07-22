import { describe, expect, it } from 'vitest'
import { evaluarCompletitud, type RiesgoCompletitud, type PapelCompletitud } from './completitud'

const riesgo = (o: Partial<RiesgoCompletitud>): RiesgoCompletitud => ({
  id: 'r1', area: 'cartera', descripcion: 'Riesgo X', nivelCombinado: 'alto', ...o,
})
const papel = (o: Partial<PapelCompletitud>): PapelCompletitud => ({
  id: 'p1', titulo: 'Papel X', area: 'cartera', riesgoId: null, estado: 'borrador', numEvidencias: 0, ...o,
})

describe('evaluarCompletitud', () => {
  it('marca riesgo alto sin ningún papel que lo atienda', () => {
    const res = evaluarCompletitud([riesgo({ id: 'r1', nivelCombinado: 'alto' })], [])
    expect(res.resumen.riesgosAltosSinPrueba).toBe(1)
    expect(res.huecos[0].tipo).toBe('riesgo_alto_sin_prueba')
    expect(res.huecos[0].severidad).toBe('alta')
  })

  it('no marca el riesgo alto si un papel lo atiende', () => {
    const res = evaluarCompletitud(
      [riesgo({ id: 'r1', nivelCombinado: 'alto' })],
      [papel({ id: 'p1', riesgoId: 'r1' })],
    )
    expect(res.resumen.riesgosAltosSinPrueba).toBe(0)
  })

  it('ignora riesgos medios y bajos', () => {
    const res = evaluarCompletitud(
      [riesgo({ id: 'r1', nivelCombinado: 'medio' }), riesgo({ id: 'r2', nivelCombinado: 'bajo' })],
      [],
    )
    expect(res.resumen.riesgosAltosSinPrueba).toBe(0)
  })

  it('marca papel en revisión o aprobado sin evidencia', () => {
    const res = evaluarCompletitud([], [
      papel({ id: 'p1', estado: 'en_revision', numEvidencias: 0 }),
      papel({ id: 'p2', estado: 'aprobado', numEvidencias: 0 }),
    ])
    expect(res.resumen.papelesSinEvidencia).toBe(2)
  })

  it('no marca papel en borrador ni papel con evidencia', () => {
    const res = evaluarCompletitud([], [
      papel({ id: 'p1', estado: 'borrador', numEvidencias: 0 }),
      papel({ id: 'p2', estado: 'aprobado', numEvidencias: 3 }),
    ])
    expect(res.resumen.papelesSinEvidencia).toBe(0)
    expect(res.huecos).toHaveLength(0)
  })

  it('suma el total de huecos de ambos tipos', () => {
    const res = evaluarCompletitud(
      [riesgo({ id: 'r1', nivelCombinado: 'alto' })],
      [papel({ id: 'p1', estado: 'aprobado', numEvidencias: 0, riesgoId: null })],
    )
    expect(res.resumen.total).toBe(2)
  })
})
