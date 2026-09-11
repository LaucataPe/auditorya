import { describe, it, expect } from 'vitest'
import { naturalezaPuc, signoEsperado } from './puc-naturaleza'

describe('naturalezaPuc', () => {
  it('aplica la regla por clase', () => {
    expect(naturalezaPuc('1105')?.naturaleza).toBe('debito')
    expect(naturalezaPuc('220505')?.naturaleza).toBe('credito')
    expect(naturalezaPuc('413505')?.naturaleza).toBe('credito')
    expect(naturalezaPuc('5195')?.naturaleza).toBe('debito')
    expect(naturalezaPuc('7105')?.naturaleza).toBe('debito')
  })
  it('resuelve las excepciones por prefijo, incluidas subcuentas', () => {
    expect(naturalezaPuc('1399')?.naturaleza).toBe('credito')
    expect(naturalezaPuc('139905')?.naturaleza).toBe('credito')
    expect(naturalezaPuc('159205')?.naturaleza).toBe('credito')
    expect(naturalezaPuc('417505')?.naturaleza).toBe('debito')
    expect(naturalezaPuc('3710')?.naturaleza).toBe('debito')
    expect(naturalezaPuc('3705')?.naturaleza).toBe('credito')
  })
  it('devuelve null para cuentas de orden y vacíos', () => {
    expect(naturalezaPuc('8105')).toBeNull()
    expect(naturalezaPuc('')).toBeNull()
  })
  it('calcula el signo esperado según la convención', () => {
    expect(signoEsperado('1105', 'natural')).toBe(1)
    expect(signoEsperado('2205', 'natural')).toBe(1)
    expect(signoEsperado('1105', 'firmada')).toBe(1)
    expect(signoEsperado('2205', 'firmada')).toBe(-1)
    expect(signoEsperado('1592', 'firmada')).toBe(-1)
  })
})
