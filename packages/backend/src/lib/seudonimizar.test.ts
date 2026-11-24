import { describe, expect, it } from 'vitest'
import { crearSeudonimizador, entradasEmpresa } from './seudonimizar'

const sd = () => crearSeudonimizador(entradasEmpresa({ nombre: 'Inversiones Acme S.A.S.', nit: '900123456-7' }))

describe('seudonimizar', () => {
  it('oculta nombre y las variantes del NIT, y rehidrata', () => {
    const s = sd()
    const out = s.aplicar('Inversiones Acme: Inversiones Acme S.A.S. (NIT 900.123.456-7 / 900123456) paga a su proveedor.')
    expect(out).not.toMatch(/Inversiones|Acme|900/)
    expect(out).toContain('EMP_01')
    expect(out).toContain('NIT_01')
    expect(s.rehidratar('Sobre EMP_01 con NIT_01')).toBe('Sobre Inversiones Acme S.A.S. con 900123456-7')
  })

  it('no toca montos ni años', () => {
    const t = 'Saldo 1.250.000.000 y 2024 con caja 123456789012'
    expect(sd().aplicar(t)).toBe(t)
  })

  it('oculta correos, celulares y documentos con etiqueta', () => {
    const out = sd().aplicar('Escribir a juan.perez@acme.co o al 310 555 1234; CC 1.020.304.050, cuenta de ahorros 123-456789-01')
    expect(out).not.toMatch(/@|310|1\.020|456789/)
  })

  it('mismo valor, mismo token', () => {
    const s = crearSeudonimizador()
    const out = s.aplicar('a@x.co y otra vez a@x.co')
    expect(out).toBe('CORREO_01 y otra vez CORREO_01')
  })

  it('rehidrata JSON escapando comillas', () => {
    const s = crearSeudonimizador([{ tipo: 'tercero', valor: 'Comercial "El Sol" Ltda' }])
    s.aplicar('Comercial "El Sol" Ltda')
    const json = s.rehidratar('{"d":"pago a TER_01"}', { json: true })
    expect(JSON.parse(json).d).toBe('pago a Comercial "El Sol" Ltda')
  })

  it('no rehidrata tokens desconocidos', () => {
    expect(sd().rehidratar('EMP_09')).toBe('EMP_09')
  })
})
