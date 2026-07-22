import { describe, expect, it } from 'vitest'
import { construirMatrizAserciones, type PapelMatriz, type RiesgoMatriz } from './matriz-aserciones'

// Referencia (catálogo cartera): 'Circularización a clientes' → [existencia, derechos];
// aserciones relevantes de cartera = existencia, derechos, valuación, corte.

describe('construirMatrizAserciones', () => {
  it('un papel aprobado marca sus aserciones como cubiertas y el resto como descubiertas', () => {
    const papeles: PapelMatriz[] = [{ area: 'cartera', titulo: 'Circularización a clientes', estado: 'aprobado' }]
    const m = construirMatrizAserciones(papeles, [])
    const cartera = m.filas.find((f) => f.area === 'cartera')!
    expect(cartera.celdas['existencia']).toBe('cubierta')
    expect(cartera.celdas['derechos']).toBe('cubierta')
    expect(cartera.celdas['valuación']).toBe('descubierta')
    expect(cartera.celdas['corte']).toBe('descubierta')
    expect(cartera.descubiertas).toEqual(expect.arrayContaining(['valuación', 'corte']))
  })

  it('un papel sin aprobar deja sus aserciones en proceso', () => {
    const papeles: PapelMatriz[] = [{ area: 'cartera', titulo: 'Circularización a clientes', estado: 'borrador' }]
    const m = construirMatrizAserciones(papeles, [])
    const cartera = m.filas.find((f) => f.area === 'cartera')!
    expect(cartera.celdas['existencia']).toBe('en_proceso')
    expect(cartera.celdas['derechos']).toBe('en_proceso')
  })

  it('un área con riesgo pero sin papel queda totalmente descubierta', () => {
    const riesgos: RiesgoMatriz[] = [{ area: 'inventarios', riesgoCombinado: 'alto' }]
    const m = construirMatrizAserciones([], riesgos)
    const inv = m.filas.find((f) => f.area === 'inventarios')!
    expect(inv.nivelMax).toBe('alto')
    expect(Object.values(inv.celdas).every((c) => c === 'descubierta')).toBe(true)
    expect(inv.descubiertas.length).toBe(inv.relevantes.length)
  })

  it('los papeles a la medida (sin match en el catálogo) no aportan cobertura', () => {
    const papeles: PapelMatriz[] = [{ area: 'cartera', titulo: 'Prueba especial a la medida', estado: 'aprobado' }]
    const m = construirMatrizAserciones(papeles, [])
    const cartera = m.filas.find((f) => f.area === 'cartera')!
    expect(Object.values(cartera.celdas).every((c) => c === 'descubierta')).toBe(true)
  })

  it('solo incluye áreas en alcance (con riesgo o papel)', () => {
    const m = construirMatrizAserciones(
      [{ area: 'cartera', titulo: 'Circularización a clientes', estado: 'aprobado' }],
      [{ area: 'efectivo', riesgoCombinado: 'medio' }],
    )
    const areas = m.filas.map((f) => f.area)
    expect(areas).toContain('cartera')
    expect(areas).toContain('efectivo')
    expect(areas).not.toContain('nomina')
  })

  it('prioriza las filas de mayor riesgo primero', () => {
    const m = construirMatrizAserciones(
      [],
      [
        { area: 'efectivo', riesgoCombinado: 'bajo' },
        { area: 'inventarios', riesgoCombinado: 'alto' },
      ],
    )
    expect(m.filas[0].area).toBe('inventarios')
  })

  it('el resumen cuadra con las celdas', () => {
    const papeles: PapelMatriz[] = [
      { area: 'cartera', titulo: 'Circularización a clientes', estado: 'aprobado' }, // existencia, derechos → cubiertas
      { area: 'cartera', titulo: 'Análisis de antigüedad y deterioro', estado: 'borrador' }, // valuación → en_proceso
    ]
    const m = construirMatrizAserciones(papeles, [])
    // cartera relevantes: existencia, derechos, valuación, corte
    expect(m.resumen.relevantes).toBe(4)
    expect(m.resumen.cubiertas).toBe(2)
    expect(m.resumen.enProceso).toBe(1)
    expect(m.resumen.descubiertas).toBe(1) // corte
    expect(m.resumen.cubiertas + m.resumen.enProceso + m.resumen.descubiertas).toBe(m.resumen.relevantes)
  })

  it('población vacía devuelve matriz vacía', () => {
    const m = construirMatrizAserciones([], [])
    expect(m.filas).toHaveLength(0)
    expect(m.columnas).toHaveLength(0)
    expect(m.resumen.relevantes).toBe(0)
  })
})
