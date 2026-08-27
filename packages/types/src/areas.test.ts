import { describe, expect, it } from 'vitest'
import {
  AREAS_BASE,
  PREFIJO_AREA_BASE,
  claveDeArea,
  prefijoDeArea,
  siguienteIndice,
} from './areas'

describe('prefijos del catálogo base', () => {
  it('toda área base tiene prefijo no vacío en mayúsculas', () => {
    for (const a of AREAS_BASE) {
      expect(a.prefijo).toMatch(/^[A-Z]{1,2}$/)
    }
  })

  it('no hay prefijos repetidos entre áreas base', () => {
    const prefijos = AREAS_BASE.map((a) => a.prefijo)
    expect(new Set(prefijos).size).toBe(prefijos.length)
  })

  it('sigue el orden del balance: activos letra simple, pasivos letra doble', () => {
    expect(PREFIJO_AREA_BASE.caja).toBe('A')
    expect(PREFIJO_AREA_BASE.bancos).toBe('B')
    expect(PREFIJO_AREA_BASE.obligaciones_financieras).toBe('AA')
    expect(PREFIJO_AREA_BASE.patrimonio).toBe('P')
    expect(PREFIJO_AREA_BASE.ingresos_operacionales).toBe('X')
  })
})

describe('prefijoDeArea', () => {
  it('usa el prefijo del catálogo para áreas base', () => {
    expect(prefijoDeArea('inversiones')).toBe('C')
  })

  it('prefiere el prefijo configurado por la firma en ciclos propios', () => {
    expect(prefijoDeArea('cartera_hipotecaria', 'CH2')).toBe('CH2')
  })

  it('deriva iniciales de las dos primeras palabras de la clave', () => {
    expect(prefijoDeArea('cartera_hipotecaria')).toBe('CH')
    expect(prefijoDeArea('nomina')).toBe('N')
    expect(prefijoDeArea(claveDeArea('Tesorería y derivados'))).toBe('TY')
  })

  it('el prefijo de la firma no aplica a áreas base', () => {
    expect(prefijoDeArea('caja', 'ZZ9')).toBe('A')
  })
})

describe('siguienteIndice', () => {
  it('arranca en 1 cuando no hay papeles del prefijo', () => {
    expect(siguienteIndice('C', [])).toBe('C-1')
    expect(siguienteIndice('C', ['D-1', 'AA-3'])).toBe('C-1')
  })

  it('continúa desde el máximo existente', () => {
    expect(siguienteIndice('C', ['C-1', 'C-2', 'D-5'])).toBe('C-3')
  })

  it('no reutiliza huecos por borrado', () => {
    expect(siguienteIndice('C', ['C-1', 'C-7'])).toBe('C-8')
  })

  it('no confunde prefijos que se contienen (A vs AA)', () => {
    expect(siguienteIndice('A', ['AA-4'])).toBe('A-1')
    expect(siguienteIndice('AA', ['A-9'])).toBe('AA-1')
  })

  it('ignora índices editados a mano con otro formato y nulos', () => {
    expect(siguienteIndice('C', ['C-especial', null, 'C-2.1', 'C-3'])).toBe('C-4')
  })
})
