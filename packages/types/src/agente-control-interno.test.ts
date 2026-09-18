import { describe, expect, it } from 'vitest'
import {
  CUESTIONARIO_COSO_PYME, PREGUNTAS_POR_COMPONENTE, calificarComponente, correrEvaluacionControlInterno, huellaCoso,
  riesgoControlPorArea, type EntradaCorridaControlInterno, type RespuestaCosoRegistrada,
} from './agente-control-interno'

const r = (pregunta: string, respuesta: RespuestaCosoRegistrada['respuesta'], nota: string | null = null): RespuestaCosoRegistrada => ({ pregunta, respuesta, nota })

const todasSi: RespuestaCosoRegistrada[] = CUESTIONARIO_COSO_PYME.map((p) => r(p.id, 'si'))

const base: EntradaCorridaControlInterno = {
  respuestas: [
    r('AC-1', 'si'), r('AC-2', 'si'), r('AC-3', 'parcial'),
    r('ER-1', 'no'), r('ER-2', 'parcial'), r('ER-3', 'no_se'),
    r('ACT-1', 'no'), r('ACT-2', 'si'), r('ACT-3', 'si'), r('ACT-4', 'no_aplica'), r('ACT-5', 'si'), r('ACT-6', 'parcial'),
    r('IC-1', 'si'), r('IC-2', 'si'),
    r('SUP-1', 'no'),
  ],
  hallazgos: [
    { codigo: 'H-01', titulo: 'Bancos en negativo', cuentaCodigo: '111005', reglas: ['V-20', 'V-21'], severidad: 'alta' },
  ],
  entendimiento: { cambiosSignificativos: 'Cambiamos de software contable a Siigo.', confirmado: true },
  existentes: [{ componente: 'ambiente_control', calificacion: 'deficiente' }],
}

describe('cuestionario', () => {
  it('tiene 15 preguntas y cubre los 5 componentes', () => {
    expect(CUESTIONARIO_COSO_PYME).toHaveLength(15)
    expect(Object.values(PREGUNTAS_POR_COMPONENTE).every((l) => l.length >= 1)).toBe(true)
    expect(new Set(CUESTIONARIO_COSO_PYME.map((p) => p.id)).size).toBe(15)
  })
})

describe('calificarComponente', () => {
  it('puntúa y acota por control clave', () => {
    const preguntas = PREGUNTAS_POR_COMPONENTE.actividades_control
    expect(calificarComponente(preguntas, new Map(preguntas.map((p) => [p.id, 'si' as const])))).toEqual({ calificacion: 'efectivo', puntaje: 100 })
    // Un "no" en ACT-1 (peso 2) con el resto en sí: 9/11 = 82 % pero clave en no → con deficiencias.
    const m = new Map(preguntas.map((p) => [p.id, (p.id === 'ACT-1' ? 'no' : 'si') as 'no' | 'si']))
    expect(calificarComponente(preguntas, m)).toEqual({ calificacion: 'con_deficiencias', puntaje: 82 })
    expect(calificarComponente(preguntas, new Map([['ACT-1', 'no_se']]))).toBeNull()
  })
})

describe('riesgoControlPorArea', () => {
  it('sube alto con un no clave y medio con parcial clave o no simple', () => {
    const out = riesgoControlPorArea([r('ACT-1', 'no'), r('ACT-2', 'parcial'), r('ER-1', 'no'), r('ACT-4', 'si')])
    expect(out.bancos).toBe('alto')
    expect(out.proveedores).toBe('alto')
    expect(out.ingresos_operacionales).toBe('medio')
    expect(out.inventarios).toBeUndefined()
  })
})

describe('correrEvaluacionControlInterno', () => {
  it('propone los 5 componentes con puntaje, señales, deficiencias y documentos por "no sé"', () => {
    const res = correrEvaluacionControlInterno(base)
    const comps = res.propuestas.filter((p) => p.tipo === 'juicio')
    const porComp = Object.fromEntries(comps.map((p) => [p.contenido.coso!.componente, p]))
    expect(comps).toHaveLength(5)
    expect(comps.map((p) => p.codigo)).toEqual(['C-01', 'C-02', 'C-03', 'C-04', 'C-05'])
    expect(comps.every((p) => p.paso === 'control_interno' && p.contenido.destino === 'coso')).toBe(true)

    // Ambiente: sí, sí, parcial → 83 % efectivo; existe guardada como deficiente y se avisa en bitácora.
    expect(porComp.ambiente_control.contenido.coso!.calificacion).toBe('efectivo')
    expect(porComp.ambiente_control.bitacora.some((l) => l.texto.includes('Hoy está guardada'))).toBe(true)

    // Actividades: ACT-1 no (clave) → con deficiencias; V-21 la verifica.
    expect(porComp.actividades_control.contenido.coso!.calificacion).toBe('con_deficiencias')
    expect(porComp.actividades_control.certeza).toBe('verificado')
    expect(porComp.actividades_control.contenido.coso!.deficiencias.map((d) => d.pregunta)).toEqual(['ACT-1', 'ACT-6'])

    // Información: cuestionario 100 % pero el cambio de software la acota a con deficiencias.
    expect(porComp.informacion_comunicacion.contenido.coso!.calificacion).toBe('con_deficiencias')
    expect(porComp.informacion_comunicacion.reglas).toContain('CI-06')

    // Evaluación de riesgos: no, parcial, no sé → 25 % deficiente, certeza no verificable, y pide el presupuesto.
    expect(porComp.evaluacion_riesgos.contenido.coso!.calificacion).toBe('deficiente')
    expect(porComp.evaluacion_riesgos.certeza).toBe('no_verificable')
    const docs = res.propuestas.filter((p) => p.tipo === 'documento')
    expect(docs).toHaveLength(0) // ER-3 no tiene documento asociado

    // Supervisión: SUP-1 no (clave único) → 0 % deficiente.
    expect(porComp.supervision.contenido.coso!.calificacion).toBe('deficiente')
    expect(porComp.supervision.severidad).toBe('alta')

    expect(res.deficiencias.length).toBe(6)
    expect(res.controlPorArea.bancos).toBe('alto')
    expect(res.resumen.porCalificacion).toEqual({ efectivo: 1, con_deficiencias: 2, deficiente: 2 })
    expect(res.propuestas.every((p) => p.bitacora.length >= 2)).toBe(true)
  })

  it('pide el documento cuando la pregunta con "no sé" lo tiene y lo liga al componente', () => {
    const res = correrEvaluacionControlInterno({ ...base, respuestas: [r('AC-1', 'no_se'), r('AC-2', 'si')] })
    const doc = res.propuestas.find((p) => p.tipo === 'documento')!
    expect(doc.titulo).toBe('Organigrama o manual de funciones')
    expect(doc.desbloqueaClave).toBe('C:ambiente_control')
    expect(doc.contenido.para).toMatch(/^Desbloquea C-01/)
  })

  it('sin respuestas solo califica lo que las señales sostienen y respeta lo decidido', () => {
    const res = correrEvaluacionControlInterno({ ...base, respuestas: [] })
    const comps = res.propuestas.filter((p) => p.tipo === 'juicio')
    expect(comps.map((p) => p.contenido.coso!.componente).sort()).toEqual(['actividades_control', 'informacion_comunicacion'])
    expect(comps.every((p) => p.contenido.coso!.calificacion === 'con_deficiencias')).toBe(true)
    const otra = correrEvaluacionControlInterno({ ...base, respuestas: todasSi, huellasDecididas: [huellaCoso('supervision')], numeracion: { C: 5 } })
    expect(otra.propuestas.filter((p) => p.tipo === 'juicio')).toHaveLength(4)
    expect(otra.propuestas[0].codigo).toBe('C-06')
  })
})
