import { describe, expect, it } from 'vitest'
import {
  CATALOGO_CALIDAD,
  COMPONENTES_CALIDAD_CLAVES,
  VINCULOS_CALIDAD,
  cambiosPosterioresARevision,
  componentesPorRevisar,
  diasParaCorte,
  estadoComponenteCalidad,
  riesgosSinRespuesta,
  type CambioRelevante,
  type EvaluacionCalidad,
  type ObjetivoCalidad,
  type RespuestaCalidad,
  type RiesgoCalidad,
} from './calidad'

const obj = (id: string, extra: Partial<ObjetivoCalidad> = {}): ObjetivoCalidad => ({
  id,
  componente: 'etica',
  texto: 'x',
  baseClave: null,
  activo: true,
  ...extra,
})
const rie = (id: string, objetivoId: string, extra: Partial<RiesgoCalidad> = {}): RiesgoCalidad => ({
  id,
  objetivoId,
  descripcion: 'x',
  baseClave: null,
  activo: true,
  ...extra,
})
const res = (id: string, riesgoId: string, extra: Partial<RespuestaCalidad> = {}): RespuestaCalidad => ({
  id,
  riesgoId,
  descripcion: 'x',
  vinculo: null,
  baseClave: null,
  activo: true,
  evidenciaNombre: null,
  evidenciaAt: null,
  ...extra,
})

const revision = { porId: 'u', porNombre: 'U', at: '2026-11-01T00:00:00Z', nota: null }

describe('catálogo NIGC 1', () => {
  it('cubre los 8 componentes', () => {
    const cubiertos = new Set(CATALOGO_CALIDAD.map((o) => o.componente))
    expect([...cubiertos].sort()).toEqual([...COMPONENTES_CALIDAD_CLAVES].sort())
  })

  it('tiene claves únicas y cada riesgo con al menos una respuesta', () => {
    const claves: string[] = []
    for (const o of CATALOGO_CALIDAD) {
      claves.push(o.clave)
      for (const r of o.riesgos) {
        claves.push(r.clave)
        expect(r.respuestas.length).toBeGreaterThan(0)
        for (const a of r.respuestas) {
          claves.push(a.clave)
          if (a.vinculo) expect(VINCULOS_CALIDAD[a.vinculo]).toBeTruthy()
        }
      }
    }
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('estadoComponenteCalidad', () => {
  const datos = {
    objetivos: [obj('o1')],
    riesgos: [rie('r1', 'o1')],
    respuestas: [res('a1', 'r1')],
  }

  it('pendiente si no se ha revisado', () => {
    expect(estadoComponenteCalidad('etica', datos, {})).toBe('pendiente')
  })

  it('revisado si está marcado y todos los riesgos tienen respuesta', () => {
    expect(estadoComponenteCalidad('etica', datos, { etica: revision })).toBe('revisado')
  })

  it('atención si un riesgo activo quedó sin respuesta activa, aunque esté revisado', () => {
    const sinRespuesta = { ...datos, respuestas: [res('a1', 'r1', { activo: false })] }
    expect(estadoComponenteCalidad('etica', sinRespuesta, { etica: revision })).toBe('atencion')
  })

  it('ignora riesgos inactivos y riesgos de objetivos inactivos', () => {
    const d = {
      objetivos: [obj('o1'), obj('o2', { activo: false })],
      riesgos: [rie('r1', 'o1'), rie('r2', 'o1', { activo: false }), rie('r3', 'o2')],
      respuestas: [res('a1', 'r1')],
    }
    expect(riesgosSinRespuesta('etica', d)).toEqual([])
  })

  it('solo mira el componente pedido', () => {
    const d = {
      objetivos: [obj('o1', { componente: 'recursos' })],
      riesgos: [rie('r1', 'o1')],
      respuestas: [],
    }
    expect(estadoComponenteCalidad('etica', d, {})).toBe('pendiente')
    expect(estadoComponenteCalidad('recursos', d, {})).toBe('atencion')
  })
})

describe('evaluación anual', () => {
  it('lista los componentes que faltan por revisar', () => {
    const faltan = componentesPorRevisar({ etica: revision, recursos: revision })
    expect(faltan).toHaveLength(6)
    expect(faltan).not.toContain('etica')
  })

  it('cuenta días hasta la fecha de corte', () => {
    expect(diasParaCorte('2026-12-31', new Date(2026, 10, 9))).toBe(52)
    expect(diasParaCorte('2026-12-31', new Date(2027, 0, 2))).toBe(-2)
  })
})

describe('cambios relevantes', () => {
  const cambio = (id: string, componentes: CambioRelevante['componentes'], createdAt: string): CambioRelevante => ({
    id,
    fecha: createdAt.slice(0, 10),
    tipo: 'socio',
    descripcion: 'Salió un socio',
    componentes,
    decision: null,
    justificacion: null,
    evaluadoPorNombre: null,
    evaluadoAt: null,
    creadoPorNombre: 'U',
    createdAt,
  })
  const evaluacion = (revisados: EvaluacionCalidad['componentesRevisados']): EvaluacionCalidad => ({
    id: 'e',
    anio: 2026,
    fechaCorte: '2026-12-31',
    componentesRevisados: revisados,
    resultado: null,
    conclusion: null,
    deficiencias: null,
    concluidoPorNombre: null,
    concluidoAt: null,
  })

  it('avisa solo los cambios que afectan al componente y se registraron después de su revisión', () => {
    const cambiosRelevantes = [
      cambio('antes', ['recursos'], '2026-10-01T00:00:00.000Z'),
      cambio('despues', ['recursos', 'gobierno_liderazgo'], '2026-11-15T00:00:00.000Z'),
      cambio('otro', ['etica'], '2026-11-20T00:00:00.000Z'),
    ]
    const sistema = { evaluacion: evaluacion({ recursos: revision }), cambiosRelevantes }
    expect(cambiosPosterioresARevision('recursos', sistema).map((x) => x.id)).toEqual(['despues'])
  })

  it('sin revisión no hay aviso: el componente igual está pendiente', () => {
    const sistema = { evaluacion: evaluacion({}), cambiosRelevantes: [cambio('x', ['recursos'], '2026-11-15T00:00:00.000Z')] }
    expect(cambiosPosterioresARevision('recursos', sistema)).toEqual([])
  })

  it('la evaluación anual vive en Seguimiento y los cambios en Valoración de riesgos', () => {
    const vinculo = (v: string) =>
      CATALOGO_CALIDAD.filter((o) => o.riesgos.some((r) => r.respuestas.some((a) => a.vinculo === v))).map((o) => o.componente)
    expect(vinculo('evaluacion_anual')).toEqual(['seguimiento'])
    expect(vinculo('cambios_relevantes')).toEqual(['valoracion_riesgos'])
  })
})
