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
    riesgosAltosSinPrueba: 0,
    papelesSinEvidencia: 0,
    hallazgosSinResolver: 0,
    cosoEvaluados: 0,
    tareasTotal: 0,
    tareasCompletadas: 0,
    informes: {},
    opinionSugerida: 'sin_base',
    pbcTotal: 0,
    pbcPendientes: 0,
    cronogramaItems: 0,
    cronogramaProgramados: 0,
    cierreChecklistCompleto: false,
    cierreCerrado: false,
    programasTotal: 0,
    programasCompletados: 0,
    hallazgosTotal: 0,
    ...overrides,
  }
}

/** Señales de una planificación RF completa (todos los requeridos de la fase 1). */
const PLANIFICACION_OK: Partial<SignalsProgreso> = {
  informes: { carta_encargo: 'borrador', memo_planeacion: 'borrador' },
  entendimientoConfirmado: true,
  riesgosTotal: 3,
  cosoEvaluados: 5,
  materialidadCalculada: true,
  materialidadAprobada: true,
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

  it('el siguiente paso sigue el orden del checklist (incluye opcionales de la fase actual)', () => {
    // El primer paso del encargo es la carta de encargo (NIA 210).
    const guia = construirGuia(signals())
    expect(guia.siguientePaso?.tab).toBe('carta_encargo')

    const guia2 = construirGuia(signals({ informes: { carta_encargo: 'borrador' } }))
    expect(guia2.siguientePaso?.tab).toBe('entendimiento')

    // Tras el entendimiento, el siguiente paso es el balance (opcional) antes que
    // los riesgos, igual que el orden del checklist.
    const guia3 = construirGuia(signals({ informes: { carta_encargo: 'borrador' }, entendimientoConfirmado: true }))
    expect(guia3.siguientePaso?.tab).toBe('balance')
  })

  it('planificación completa (incluye carta, COSO y memo) pasa la fase actual a ejecución', () => {
    const guia = construirGuia(signals(PLANIFICACION_OK))
    expect(guia.fases[0].estado).toBe('completa')
    expect(guia.fases[1].estado).toBe('actual')
  })

  it('sin memo de planeación la fase de planificación sigue actual', () => {
    const guia = construirGuia(
      signals({ ...PLANIFICACION_OK, informes: { carta_encargo: 'borrador' } }),
    )
    expect(guia.fases[0].estado).toBe('actual')
  })

  it('el dictamen aprobado NO completa la guía: falta el cierre del encargo', () => {
    const guia = construirGuia(
      signals({
        ...PLANIFICACION_OK,
        papelesTotal: 2,
        papelesAprobados: 2,
        informes: { carta_encargo: 'borrador', memo_planeacion: 'borrador', dictamen: 'aprobado' },
      }),
    )
    expect(guia.completa).toBe(false)
    expect(guia.siguientePaso?.tab).toBe('cierre')
  })

  it('con checklist de cierre completo y encargo cerrado la guía queda completa (100%)', () => {
    const guia = construirGuia(
      signals({
        ...PLANIFICACION_OK,
        papelesTotal: 2,
        papelesAprobados: 2,
        informes: { carta_encargo: 'borrador', memo_planeacion: 'borrador', dictamen: 'aprobado' },
        cierreChecklistCompleto: true,
        cierreCerrado: true,
      }),
    )
    expect(guia.completa).toBe(true)
    expect(guia.progresoGlobal).toBe(100)
    expect(guia.siguientePaso).toBeNull()
  })

  it('papeles sin aprobar no completan la fase de ejecución', () => {
    const guia = construirGuia(
      signals({
        ...PLANIFICACION_OK,
        papelesTotal: 3,
        papelesAprobados: 1,
      }),
    )
    expect(guia.fases[1].estado).toBe('actual')
    expect(guia.siguientePaso?.tab).toBe('papeles')
  })

  it('PBC pendientes aparecen como paso de ejecución', () => {
    const guia = construirGuia(
      signals({
        ...PLANIFICACION_OK,
        papelesTotal: 1,
        pbcTotal: 4,
        pbcPendientes: 2,
      }),
    )
    const ejec = guia.fases[1]
    const itemPbc = ejec.items.find((i) => i.tab === 'pbc')
    expect(itemPbc?.hecho).toBe(false)
    expect(itemPbc?.hint).toBe('2/4')
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
