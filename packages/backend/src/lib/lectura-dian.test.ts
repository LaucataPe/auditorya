/**
 * El contrato con el workflow es {"casillas": {...}}, pero n8n envuelve la salida
 * de distintas formas según cómo se cierre el flujo (Respond to Webhook, nodo
 * Set, arreglo de ítems), y los valores pueden llegar como texto. Estos tests
 * fijan qué formas se aceptan y cuáles deben fallar ruidosamente.
 */
import { describe, it, expect } from 'vitest'
import { parsearCasillas, desenvolver } from './lectura-dian'

describe('parsearCasillas — formas de respuesta', () => {
  const esperado = { '27': 0, '28': 122149000 }

  it('acepta la forma plana del contrato', () => {
    expect(parsearCasillas({ casillas: { '27': 0, '28': 122149000 } })).toEqual(esperado)
  })

  it('desenvuelve un arreglo de un solo ítem (salida típica de n8n)', () => {
    expect(parsearCasillas([{ casillas: { '27': 0, '28': 122149000 } }])).toEqual(esperado)
  })

  it('desenvuelve anidamiento en data y en json', () => {
    expect(parsearCasillas({ data: { casillas: { '27': 0, '28': 122149000 } } })).toEqual(esperado)
    expect(parsearCasillas([{ json: { data: { casillas: { '27': 0, '28': 122149000 } } } }])).toEqual(esperado)
  })

  it('normaliza valores en texto con separadores de miles y vacíos', () => {
    expect(parsearCasillas({ casillas: { '27': '0', '28': '122.149.000', '29': '', '30': null } })).toEqual({
      '27': 0,
      '28': 122149000,
      '29': null,
      '30': null,
    })
  })

  it('redondea decimales: las casillas de la DIAN van en pesos enteros', () => {
    expect(parsearCasillas({ casillas: { '28': 122149000.4 } })).toEqual({ '28': 122149000 })
  })

  it('deja en null lo que no es un número, en vez de inventar un 0', () => {
    expect(parsearCasillas({ casillas: { '28': 'N/A' } })).toEqual({ '28': null })
  })

  it('falla si la respuesta no trae casillas: mejor 502 que cifras vacías', () => {
    expect(() => parsearCasillas({ renglones: { 'iva-ing-19': 1 } })).toThrow()
    expect(() => parsearCasillas('ok')).toThrow()
  })
})

describe('desenvolver', () => {
  it('no descarta un arreglo de varios ítems', () => {
    const varios = [{ casillas: {} }, { casillas: {} }]
    expect(desenvolver(varios)).toBe(varios)
  })

  it('para en cuanto encuentra casillas, sin seguir bajando', () => {
    const o = { casillas: { '28': 1 }, data: { casillas: { '28': 2 } } }
    expect(desenvolver(o)).toBe(o)
  })
})
