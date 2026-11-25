import { describe, expect, it } from 'vitest'
import { CATALOGO_CALIDAD } from './calidad'
import {
  FORMATOS_CALIDAD,
  vigenciaDocumentoFirma,
  cumplimientoComponente,
  camposPorCompletar,
  estadoFormato,
  formatoCalidad,
  formatoDeRespuesta,
  rellenarFormato,
  vigenteHasta,
  type DatosFormato,
} from './calidad-formatos'

const datos: DatosFormato = {
  firma: 'Gómez & Asociados S.A.S.',
  nit: '900.123.456-7',
  ciudad: 'Bogotá',
  direccion: 'Calle 100 # 10-20',
  email: 'calidad@gomez.co',
  responsable: 'María Gómez',
  fecha: '18 de noviembre de 2026',
  anio: 2026,
}

describe('catálogo de formatos', () => {
  const respuestas = new Set(CATALOGO_CALIDAD.flatMap((o) => o.riesgos.flatMap((r) => r.respuestas.map((a) => a.clave))))

  it('cada formato evidencia respuestas que existen en el catálogo', () => {
    for (const f of FORMATOS_CALIDAD) {
      expect(f.respuestasBase.length).toBeGreaterThan(0)
      for (const r of f.respuestasBase) expect(respuestas.has(r)).toBe(true)
    }
  })

  it('una respuesta no queda ligada a dos formatos y las claves son únicas', () => {
    const ligadas = FORMATOS_CALIDAD.flatMap((f) => f.respuestasBase)
    expect(new Set(ligadas).size).toBe(ligadas.length)
    expect(new Set(FORMATOS_CALIDAD.map((f) => f.clave)).size).toBe(FORMATOS_CALIDAD.length)
  })

  it('no deja marcadores sin reemplazar', () => {
    for (const f of FORMATOS_CALIDAD) {
      const contenido = rellenarFormato(f, datos)
      expect(Object.values(contenido).join(' ')).not.toMatch(/\{\{/)
    }
  })

  it('encuentra el formato de una respuesta', () => {
    expect(formatoDeRespuesta('ac.decisiones.r2.a')?.clave).toBe('politica_aceptacion_continuidad')
    expect(formatoDeRespuesta(null)).toBeUndefined()
  })
})

describe('rellenarFormato', () => {
  const liderazgo = formatoCalidad('declaracion_liderazgo')!

  it('pone los datos de la firma, incluido el domicilio', () => {
    const c = rellenarFormato(liderazgo, datos)
    expect(c.declaracion).toContain('Gómez & Asociados S.A.S.')
    expect(c.declaracion).toContain('Calle 100 # 10-20, Bogotá')
    expect(c.vigencia).toContain('2026')
  })

  it('un dato faltante queda como campo por completar', () => {
    const sinDireccion = rellenarFormato(liderazgo, { ...datos, direccion: null })
    const conDireccion = rellenarFormato(liderazgo, datos)
    expect(camposPorCompletar(sinDireccion)).toBe(camposPorCompletar(conDireccion) + 1)
  })
})

describe('camposPorCompletar', () => {
  it('cuenta los espacios pendientes en texto plano y HTML', () => {
    expect(camposPorCompletar({ a: 'Hola [COMPLETAR: x] y [COMPLETAR: y]', b: '<p>[COMPLETAR]</p>' })).toBe(3)
    expect(camposPorCompletar({ a: 'Listo' })).toBe(0)
  })
})

describe('vigencia y estado', () => {
  it('un formato anual vence al año; uno permanente no vence', () => {
    expect(vigenteHasta(formatoCalidad('plan_capacitacion')!, '2026-03-15')).toBe('2027-03-15')
    expect(vigenteHasta(formatoCalidad('politica_documentacion')!, '2026-03-15')).toBeNull()
  })

  it('distingue sin crear, borrador, firmado y vencido', () => {
    const firmado = { id: '1', version: 1, firmadoAt: '2025-11-01T00:00:00Z', firmadoPorNombre: 'M', vigenteHasta: '2026-11-01', archivoNombre: null, documentoFirma: null }
    expect(estadoFormato(undefined, '2026-11-18')).toBe('sin_crear')
    expect(estadoFormato({ formato: 'x', firmado: null, borrador: { id: '2', version: 1, pendientes: 2 } }, '2026-11-18')).toBe('borrador')
    expect(estadoFormato({ formato: 'x', firmado, borrador: null }, '2026-10-01')).toBe('firmado')
    expect(estadoFormato({ formato: 'x', firmado, borrador: null }, '2026-11-18')).toBe('vencido')
    expect(estadoFormato({ formato: 'x', firmado: { ...firmado, vigenteHasta: null }, borrador: null }, '2030-01-01')).toBe('firmado')
  })
})

describe('cumplimientoComponente', () => {
  const base = {
    objetivos: [{ id: 'o1', componente: 'etica' as const, texto: 'x', baseClave: null, activo: true }],
    riesgos: [{ id: 'r1', objetivoId: 'o1', descripcion: 'x', baseClave: null, activo: true }],
    respuestas: [
      { id: 'a1', riesgoId: 'r1', descripcion: 'x', vinculo: 'aceptacion' as const, baseClave: null, activo: true, evidenciaNombre: null, evidenciaAt: null },
    ],
    documentos: [],
    evaluacion: {
      id: 'e', anio: 2026, fechaCorte: '2026-12-31', componentesRevisados: {}, resultado: null, conclusion: null,
      deficiencias: null, concluidoPorNombre: null, concluidoAt: null,
    },
  }
  const revisado = { etica: { porId: 'u', porNombre: 'M', at: '2026-11-01', nota: null } }
  const firmado = (vigenteHasta: string | null) => ({
    formato: 'politica_etica_independencia',
    firmado: { id: 'd', version: 1, firmadoAt: '2026-01-01T00:00:00Z', firmadoPorNombre: 'M', vigenteHasta, archivoNombre: null, documentoFirma: null },
    borrador: null,
  })

  it('sin empezar: sin revisar y sin formatos creados', () => {
    const c = cumplimientoComponente('etica', base, '2026-11-19')
    expect(c.estado).toBe('sin_empezar')
    expect(c.pasos.map((p) => p.tipo)).toEqual(['diseno', 'vinculo', 'formato', 'revision'])
  })

  it('en progreso: formato firmado pero sin revisar', () => {
    const c = cumplimientoComponente('etica', { ...base, documentos: [firmado(null)] }, '2026-11-19')
    expect(c.estado).toBe('progreso')
    expect(c.resumen).toBe('Falta: marcarlo como revisado')
  })

  it('en progreso: revisado pero el formato sigue en borrador', () => {
    const doc = { formato: 'politica_etica_independencia', firmado: null, borrador: { id: 'd', version: 1, pendientes: 1 } }
    const c = cumplimientoComponente('etica', { ...base, documentos: [doc], evaluacion: { ...base.evaluacion, componentesRevisados: revisado } }, '2026-11-19')
    expect(c.estado).toBe('progreso')
    expect(c.pasos.find((p) => p.tipo === 'formato')?.detalle).toContain('1 campo')
  })

  it('cumplido: todo hecho', () => {
    const c = cumplimientoComponente('etica', { ...base, documentos: [firmado(null)], evaluacion: { ...base.evaluacion, componentesRevisados: revisado } }, '2026-11-19')
    expect(c.estado).toBe('cumplido')
    expect(c.hechos).toBe(c.pasos.length)
  })

  it('atención: formato vencido o riesgo sin respuesta, aunque esté revisado', () => {
    const conRevision = { ...base.evaluacion, componentesRevisados: revisado }
    expect(cumplimientoComponente('etica', { ...base, documentos: [firmado('2026-06-01')], evaluacion: conRevision }, '2026-11-19').estado).toBe('atencion')
    const sinResp = { ...base, respuestas: [], documentos: [firmado(null)], evaluacion: conRevision }
    expect(cumplimientoComponente('etica', sinResp, '2026-11-19').resumen).toBe('1 riesgo(s) sin respuesta')
  })
})

describe('componentesSinCumplir', () => {
  it('lista los componentes que impiden generar el manual, con lo que les falta', async () => {
    const { componentesSinCumplir } = await import('./calidad-manual')
    const vacio = {
      objetivos: [],
      riesgos: [],
      respuestas: [],
      documentos: [],
      evaluacion: {
        id: 'e', anio: 2026, fechaCorte: '2026-12-31', componentesRevisados: {}, resultado: null, conclusion: null,
        deficiencias: null, concluidoPorNombre: null, concluidoAt: null,
      },
    }
    const faltan = componentesSinCumplir(vacio, '2026-11-19')
    expect(faltan).toHaveLength(8)
    expect(faltan[0]).toMatchObject({ clave: 'valoracion_riesgos' })
    expect(faltan[0].falta).toBeTruthy()
  })
})

describe('documentos que la firma ya tenía', () => {
  it('cubren un año desde la aprobación, también el 29 de febrero', () => {
    expect(vigenciaDocumentoFirma('2026-03-15')).toBe('2027-03-15')
    expect(vigenciaDocumentoFirma('2024-02-29')).toBe('2025-03-01')
  })
})
