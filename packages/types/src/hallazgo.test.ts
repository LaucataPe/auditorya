import { describe, expect, it } from 'vitest'
import { resumirHallazgos, type EstadoHallazgo } from './hallazgo'

const h = (estado: EstadoHallazgo) => ({ estado })

describe('resumirHallazgos', () => {
  it('cuenta por estado', () => {
    const r = resumirHallazgos([h('abierto'), h('comunicado'), h('comunicado'), h('corregido'), h('no_corregido')])
    expect(r.total).toBe(5)
    expect(r.abiertos).toBe(1)
    expect(r.comunicados).toBe(2)
    expect(r.corregidos).toBe(1)
    expect(r.noCorregidos).toBe(1)
  })

  it('sinResolver son abiertos + comunicados', () => {
    const r = resumirHallazgos([h('abierto'), h('comunicado'), h('corregido'), h('no_corregido')])
    expect(r.sinResolver).toBe(2)
  })

  it('todo corregido → sinResolver 0', () => {
    const r = resumirHallazgos([h('corregido'), h('corregido')])
    expect(r.sinResolver).toBe(0)
  })

  it('lista vacía', () => {
    const r = resumirHallazgos([])
    expect(r.total).toBe(0)
    expect(r.sinResolver).toBe(0)
  })
})
