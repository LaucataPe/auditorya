import { describe, expect, it } from 'vitest'
import { construirGuia, type SignalsProgreso } from './guia'

function signals(overrides: Partial<SignalsProgreso> = {}): SignalsProgreso {
  return {
    tipoServicio: 'revisoria_fiscal',
    estado: 'planificacion',
    entendimientoConfirmado: false,
    balanceCargado: false,
    riesgosTotal: 0,
    riesgosAltos: 0,
    riesgosAltosSinRespuesta: 0,
    materialidadCalculada: false,
    materialidadAprobada: false,
    papelesTotal: 0,
    papelesAprobados: 0,
    cosoEvaluados: 0,
    tareasTotal: 0,
    tareasCompletadas: 0,
    informes: {},
    programasTotal: 0,
    programasCompletados: 0,
    hallazgosTotal: 0,
    ...overrides,
  }
}

describe('construirGuia — revisoría fiscal', () => {
  it('al inicio la fase actual es planificación con progreso 0', () => {
    const guia = construirGuia(signals())
    expect(guia.fases[0].id).toBe('planificacion')
    expect(guia.fases[0].estado).toBe('actual')
    expect(guia.fases[1].estado).toBe('pendiente')
    expect(guia.progresoGlobal).toBe(0)
    expect(guia.completa).toBe(false)
  })

  it('el siguiente paso es el primer requerido pendiente en orden', () => {
    const guia = construirGuia(signals())
    expect(guia.siguientePaso?.tab).toBe('entendimiento')

    const guia2 = construirGuia(signals({ entendimientoConfirmado: true }))
    expect(guia2.siguientePaso?.tab).toBe('riesgos')
  })

  it('planificación completa pasa la fase actual a ejecución', () => {
    const guia = construirGuia(
      signals({
        entendimientoConfirmado: true,
        riesgosTotal: 3,
        materialidadCalculada: true,
        materialidadAprobada: true,
      }),
    )
    expect(guia.fases[0].estado).toBe('completa')
    expect(guia.fases[1].estado).toBe('actual')
  })

  it('todo requerido completo marca la guía como completa (100%)', () => {
    const guia = construirGuia(
      signals({
        entendimientoConfirmado: true,
        riesgosTotal: 3,
        materialidadCalculada: true,
        materialidadAprobada: true,
        papelesTotal: 2,
        papelesAprobados: 2,
        cosoEvaluados: 5,
        informes: { dictamen: 'aprobado' },
      }),
    )
    expect(guia.completa).toBe(true)
    expect(guia.progresoGlobal).toBe(100)
    expect(guia.siguientePaso).toBeNull()
  })

  it('papeles sin aprobar no completan la fase de ejecución', () => {
    const guia = construirGuia(
      signals({
        entendimientoConfirmado: true,
        riesgosTotal: 1,
        materialidadCalculada: true,
        materialidadAprobada: true,
        papelesTotal: 3,
        papelesAprobados: 1,
        cosoEvaluados: 5,
      }),
    )
    expect(guia.fases[1].estado).toBe('actual')
    expect(guia.siguientePaso?.tab).toBe('papeles')
  })
})

describe('construirGuia — auditoría interna', () => {
  it('usa las fases IPPF (programas → hallazgos → informe)', () => {
    const guia = construirGuia(signals({ tipoServicio: 'auditoria_interna' }))
    expect(guia.fases).toHaveLength(3)
    expect(guia.siguientePaso?.tab).toBe('alcance')
  })

  it('flujo completo de auditoría interna', () => {
    const guia = construirGuia(
      signals({
        tipoServicio: 'auditoria_interna',
        programasTotal: 2,
        programasCompletados: 2,
        hallazgosTotal: 1,
        informes: { informe_ai: 'aprobado' },
      }),
    )
    expect(guia.completa).toBe(true)
  })
})
