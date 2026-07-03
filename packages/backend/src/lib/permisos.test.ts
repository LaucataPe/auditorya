import { describe, expect, it } from 'vitest'
import { esSocioResponsable } from './permisos'

const AUDITORIA = { socioId: 'socio-1' }

describe('esSocioResponsable', () => {
  it('acepta al socio asignado a la auditoría', () => {
    expect(esSocioResponsable({ sub: 'socio-1', rol: 'socio' }, AUDITORIA)).toBe(true)
  })

  it('rechaza a otro socio de la firma (no es el responsable)', () => {
    expect(esSocioResponsable({ sub: 'socio-2', rol: 'socio' }, AUDITORIA)).toBe(false)
  })

  it('rechaza al gerente aunque sea el usuario asignado', () => {
    expect(esSocioResponsable({ sub: 'socio-1', rol: 'gerente' }, AUDITORIA)).toBe(false)
  })

  it('rechaza roles sin privilegio', () => {
    for (const rol of ['senior', 'asistente'] as const) {
      expect(esSocioResponsable({ sub: 'x', rol }, AUDITORIA)).toBe(false)
    }
  })
})
