/**
 * Motor de ICA (IC-xx) sobre dos borradores reales del Formulario Único Nacional
 * de Bogotá (bimestre 4 de 2026) y el balance de World Office del mismo bimestre
 * de una de las empresas (anonimizado, solo cuentas agregadas).
 */
import { describe, expect, it } from 'vitest'
import { parseBalancePeriodo } from './parse-balance-periodo'
import { clasificarCuentaIca, mapearLibrosIca, municipioDeObligacionIca } from './agente-ica-libros'
import { correrRevisionIca, programaSugeridoIca, reglasOmitidasIca, tarifasIcaDe, type EntradaCorridaIca } from './agente-ica'
import { AGENTES_TRIBUTARIOS, esTipoAgentico, insumosDelProgramaDe, mapeoMemoriaDe } from './agente-tributario'
import { aplicarLecturaFormulario, resolverCifras, type CifrasRevision } from './tributario'
import { BALANCE_WORLDOFFICE_ICA } from './fixtures/balance-worldoffice-ica'

const periodo = { desde: '2026-07-01', hasta: '2026-08-31', etiqueta: 'Bim. 4 (jul–ago) 2026', periodicidad: 'bimestral' as const, anio: 2026 }
const porRegla = (r: ReturnType<typeof correrRevisionIca>, regla: string) => r.propuestas.filter((p) => p.reglas.includes(regla))
const aCifras = (renglones: Record<string, number | null>): CifrasRevision => Object.fromEntries(Object.entries(renglones).map(([k, v]) => [k, { declarado: v, libros: null }]))

// Renglones del borrador de la empresa industrial (con actividades de la sección C y la hoja de otras actividades).
const CARRIEL: Record<string, number> = {
  '8': 7_958_955_000, '9': 320_101_000, '10': 7_638_854_000, '11': 1_043_318_000, '12': 504_006_000, '13': 0, '14': 277_224_000, '15': 0, '16': 5_814_306_000,
  '17': 24_342_000, '18': 0, '19': 0, '20': 24_342_000, '21': 3_651_000, '22': 0, '23': 243_000, '24': 0, '25': 28_236_000, '26': 0, '27': 10_003_000, '28': 0,
  '29': 0, '30': 0, '31': 0, '32': 0, '33': 18_233_000, '34': 0, '35': 18_233_000, '36': 0, '37': 0, '38': 18_233_000, '39': 0, '40': 18_233_000,
  act1_ingresos: 5_751_351_000, act1_impuesto: 23_810_593, act2_ingresos: 100_000, act2_impuesto: 1_400,
  act3_ingresos: 13_931_000, act3_impuesto: 57_674, act4_ingresos: 48_924_000, act4_impuesto: 472_606,
}
// Borrador de la productora audiovisual: una actividad, sin avisos.
const LAMUVI: Record<string, number> = {
  '8': 219_477_000, '9': 0, '10': 219_477_000, '11': 84_185_000, '12': 22_187_000, '13': 0, '14': 0, '15': 0, '16': 113_105_000,
  '17': 1_093_000, '19': 0, '20': 1_093_000, '21': 0, '22': 0, '23': 0, '24': 0, '25': 1_093_000, '26': 0, '27': 423_000, '28': 0,
  '29': 0, '30': 0, '31': 0, '32': 0, '33': 670_000, '34': 0, '35': 670_000, '36': 0, '37': 0, '38': 670_000,
  act1_ingresos: 113_105_000, act1_impuesto: 1_092_594,
}

const leer = (c: Record<string, number>) => aplicarLecturaFormulario('ica', c)!
const balance = parseBalancePeriodo(BALANCE_WORLDOFFICE_ICA)!
const libros = (memoria: Record<string, string> = {}) => mapearLibrosIca({ cuentas: balance.cuentas }, { obligacion: { nombre: 'ICA', municipio: 'bogota' }, memoria })
const correr = (extra: Partial<EntradaCorridaIca> = {}) => correrRevisionIca({ periodo, cifras: aCifras(leer(CARRIEL).renglones), libros: libros(), municipio: 'bogota', municipiosConObligacion: ['bogota'], ...extra })

describe('lectura del Formulario Único Nacional', () => {
  it('los dos borradores reales cuadran sin advertencias, actividades incluidas', () => {
    expect(leer(CARRIEL).advertencias).toEqual([])
    expect(leer(LAMUVI).advertencias).toEqual([])
    const r = resolverCifras('ica', aCifras(leer(CARRIEL).renglones))
    expect(r['ica-base'].declarado).toBe(5_814_306_000)
    expect(r['ica-act-ingresos'].declarado).toBe(5_814_306_000)
    expect(r['ica-saldo'].declarado).toBe(18_233_000)
    expect(r['ica-total-pagar'].declarado).toBe(18_233_000)
  })
  it('detecta un total del formulario que no cuadra y actividades que no suman el 16', () => {
    expect(leer({ ...CARRIEL, '25': 28_000_000 }).advertencias.some((a) => a.includes('Total impuesto a cargo'))).toBe(true)
    expect(leer({ ...CARRIEL, act4_ingresos: 0 }).advertencias.some((a) => a.includes('por actividad'))).toBe(true)
  })
  it('un saldo a favor no alerta en el total a pagar', () => {
    const favor = { ...LAMUVI, '27': 2_000_000, '33': 0, '34': 907_000, '35': 0, '38': 0 }
    expect(leer(favor).advertencias).toEqual([])
  })
})

describe('lectura de los libros del ICA', () => {
  it('clasifica por código y nombre', () => {
    expect(clasificarCuentaIca('41200633', 'FUNZA PRODUCCION EXCLUIDOS', 'bogota')).toMatchObject({ clase: 'fuera', municipio: 'funza' })
    expect(clasificarCuentaIca('41200633', 'BOGOTA PRODUCCION', 'bogota')).toMatchObject({ clase: 'ingreso', municipio: null })
    expect(clasificarCuentaIca('41760103', 'ANULACION VENTAS AL EXTERIOR', 'bogota')).toMatchObject({ clase: 'devolucion-exportacion' })
    expect(clasificarCuentaIca('41760112', 'ANULAICION M.PRIMAS EXCLUIDAS', 'bogota')).toMatchObject({ clase: 'devolucion' })
    expect(clasificarCuentaIca('42100601', 'RENDIMIENTOS CRÉDITOS EXTERIOR', 'bogota')).toMatchObject({ clase: 'ingreso' })
    expect(clasificarCuentaIca('424505', 'UTILIDAD EN VENTA DE PROPIEDADES', 'bogota')).toMatchObject({ clase: 'activo-fijo' })
    expect(clasificarCuentaIca('13551801', 'RETENCION DE ICA POR VENTA DE PRODUCTOS', 'bogota')).toMatchObject({ clase: 'retencion' })
    expect(clasificarCuentaIca('13551006', 'FUNZA ANTICIPO DE INDUSTRIA Y COMERCIO', 'bogota')).toMatchObject({ clase: 'anticipo', municipio: 'funza' })
    expect(clasificarCuentaIca('241205', 'VIGENCIA FISCAL CORRIENTE', 'bogota')).toMatchObject({ clase: 'causacion' })
    expect(clasificarCuentaIca('52150510', 'AVISOS Y TABLEROS', 'bogota')).toMatchObject({ clase: 'gasto' })
    expect(clasificarCuentaIca('511545', 'GRAVAMEN A LOS MOVIMIENTOS FINANCIEROS', 'bogota')).toBeNull()
    expect(municipioDeObligacionIca({ nombre: 'ICA Cali', municipio: null })).toBe('cali')
  })
  it('lleva el balance real a los renglones (incluida la subcuenta que World Office no exporta)', () => {
    const l = libros()
    expect(balance.advertencias.some((a) => a.includes('415505'))).toBe(true)
    expect(l.cifras['ica-ingresos']).toEqual({ libros: 8_049_900_947 })
    // Los ingresos de Funza son exactamente el renglón 9 declarado.
    expect(l.cifras['ica-fuera-municipio']).toEqual({ libros: 320_100_980 })
    expect(l.cifras['ica-devoluciones']).toEqual({ libros: 864_956_313 })
    // Exportaciones netas de su devolución y su anulación.
    expect(l.cifras['ica-exportaciones']).toEqual({ libros: 549_055_791 })
    expect(l.cifras['ica-retenciones']).toEqual({ libros: 9_744_676 })
    expect(l.cifras['ica-no-sujetos']).toBeUndefined()
    expect(l.otrosMunicipios.map((o) => o.municipio)).toEqual(['funza'])
    expect(l.retencionesPorMunicipio).toBe(false)
    expect(l.causado).toEqual({ creditos2412: 0, debitosGasto: 0 })
  })
  it('la memoria de la firma lleva una cuenta al renglón 14', () => {
    const l = libros({ '42102005': 'no-sujeto' })
    expect(l.cifras['ica-no-sujetos']).toEqual({ libros: 277_223_767 })
    expect(l.porClasificar.map((c) => c.cuenta)).not.toContain('42102005')
  })
})

describe('motor IC-xx con el borrador y el balance reales', () => {
  it('el formulario es coherente: actividades, tarifas de Bogotá y avisos al 15 %', () => {
    const r = correr()
    const f = r.cedulas!.find((c) => c.id === 'formulario')!
    const act = f.tablas.find((t) => t.id === 'actividades')!
    expect(act.filas.map((x) => x.valores.tarifa)).toEqual([4.14, 14, 4.14, 9.66])
    expect(act.filas.every((x) => x.estado === 'conforme')).toBe(true)
    expect(porRegla(r, 'IC-02')).toHaveLength(0)
    expect(porRegla(r, 'IC-03')).toHaveLength(0)
    expect(porRegla(r, 'IC-04')).toHaveLength(0)
    expect(porRegla(r, 'IC-05')).toHaveLength(0)
    expect(porRegla(r, 'IC-06')[0]).toMatchObject({ tipo: 'juicio', monto: 243_000 })
  })
  it('cruza ingresos, devoluciones y exportaciones contra los libros', () => {
    const r = correr()
    expect(porRegla(r, 'IC-10')[0]).toMatchObject({ tipo: 'hallazgo', monto: 90_945_947 })
    const dev = porRegla(r, 'IC-11')[0]
    expect(dev).toMatchObject({ tipo: 'hallazgo', monto: 178_361_687 })
    // La anulación de exportaciones restada también como devolución: pista de doble resta.
    expect(dev.contenido.descripcion).toMatch(/dos veces/)
    expect(porRegla(r, 'IC-12')[0].contenido.descripcion).toMatch(/EXPORTACION DE MAIZ/)
    // Renglón 9 = ingresos de Funza: conforme.
    expect(porRegla(r, 'IC-13')).toHaveLength(0)
    const base = r.cedulas!.find((c) => c.id === 'ingresos-libros')!.tablas.find((t) => t.id === 'base')!.filas[0]
    expect(base.valores).toMatchObject({ declarado: 5_814_306_000, libros: 6_038_563_863 })
    expect(r.cifrasLibros['ica-ingresos']).toEqual({ libros: 8_049_900_947 })
  })
  it('pregunta por la cuenta que explica los no sujetos y la recuerda', () => {
    const r = correr()
    const a = porRegla(r, 'IC-09')
    expect(a.map((p) => p.cuentaCodigo)).toEqual(['42102005'])
    expect(a[0].contenido.tributario?.memoriaClave).toBe('mapeoIca')
    expect(a[0].contenido.opciones?.map((o) => o.clave)).toEqual(['no-sujeto', 'exento', 'gravado'])
    // Con la cuenta clasificada, el 14 se cruza contra libros: deja de ser juicio.
    const r2 = correr({ libros: libros({ '42102005': 'no-sujeto' }) })
    expect(porRegla(r2, 'IC-09')).toHaveLength(0)
    expect(porRegla(r2, 'IC-15')).toHaveLength(0)
    const fila = r2.cedulas!.find((c) => c.id === 'deducciones')!.tablas.find((t) => t.id === 'cruce')!.filas[0]
    expect(fila.estado).toBe('conforme')
  })
  it('territorialidad y retenciones sin municipio en la 135518', () => {
    const r = correr()
    expect(porRegla(r, 'IC-20')[0]).toMatchObject({ tipo: 'juicio', monto: 320_100_980 })
    expect(porRegla(correr({ municipiosConObligacion: ['bogota', 'funza'] }), 'IC-20')).toHaveLength(0)
    // Hay ingresos en Funza: la diferencia de retenciones es juicio, no hallazgo.
    expect(porRegla(r, 'IC-21')[0]).toMatchObject({ tipo: 'juicio', monto: 258_324 })
  })
  it('lo decidido no se vuelve a proponer y los pasos apagados no proponen', () => {
    const r = correr()
    const omit = reglasOmitidasIca({ pasos: programaSugeridoIca().pasos.map((p) => ({ ...p, activo: p.id !== 'ingresos-libros' })) })
    expect(omit).toEqual(['IC-10', 'IC-11', 'IC-12', 'IC-13', 'IC-14'])
    const r2 = correr({ omitirReglas: omit })
    expect(r2.propuestas.some((p) => p.reglas.some((x) => omit.includes(x)))).toBe(false)
    expect(r2.cedulas!.find((c) => c.id === 'ingresos-libros')!.estado).toBe('omitida')
    expect(r.propuestas.length).toBeGreaterThan(r2.propuestas.length)
  })
})

describe('motor IC-xx solo con el borrador', () => {
  const r = correrRevisionIca({ periodo, cifras: aCifras(leer(LAMUVI).renglones), municipio: 'bogota' })
  it('verifica el formulario y deja constancia de lo que no se pudo cruzar', () => {
    const f = r.cedulas!.find((c) => c.id === 'formulario')!
    expect(f.tablas.find((t) => t.id === 'actividades')!.filas[0]).toMatchObject({ estado: 'conforme', valores: { tarifa: 9.66 } })
    expect(f.tablas.find((t) => t.id === 'pruebas')!.filas.some((x) => x.valores.prueba === 'Avisos y tableros' && x.estado === 'informativo')).toBe(true)
    expect(r.cedulas!.find((c) => c.id === 'ingresos-libros')!.estado).toBe('sin_insumos')
    expect(r.resumen.limitaciones.some((l) => l.regla === 'IC-10..IC-14')).toBe(true)
    expect(r.resumen.hallazgos).toBe(0)
  })
  it('una tarifa que no es de Bogotá se pregunta', () => {
    const r2 = correrRevisionIca({ periodo, cifras: aCifras(leer({ ...LAMUVI, act1_impuesto: 904_840 }).renglones), municipio: 'bogota' })
    expect(porRegla(r2, 'IC-04')[0]).toMatchObject({ tipo: 'juicio' })
    expect(tarifasIcaDe('bogota')).toContain(14)
    expect(tarifasIcaDe('cali')).toBeNull()
  })
  it('saldo a favor imputado contra la declaración anterior', () => {
    const anterior = { etiqueta: 'Bim. 3 (may–jun) 2026', cifras: aCifras(leer({ ...LAMUVI, '27': 2_000_000, '33': 0, '34': 907_000, '35': 0, '38': 0 }).renglones) }
    const bien = correrRevisionIca({ periodo, cifras: aCifras(leer({ ...LAMUVI, '32': 907_000, '33': 0, '34': 237_000, '35': 0, '38': 0 }).renglones), municipio: 'bogota', anterior })
    expect(porRegla(bien, 'IC-24')).toHaveLength(0)
    const mal = correrRevisionIca({ periodo, cifras: aCifras(leer({ ...LAMUVI, '32': 1_500_000, '33': 0, '34': 830_000, '35': 0, '38': 0 }).renglones), municipio: 'bogota', anterior })
    expect(porRegla(mal, 'IC-24')[0]).toMatchObject({ tipo: 'hallazgo', monto: 593_000 })
  })
})

describe('registro del agente de ICA', () => {
  it('es agéntico, pide borrador, libros y anterior, y guarda en mapeoIca', () => {
    expect(esTipoAgentico('ica')).toBe(true)
    expect(insumosDelProgramaDe('ica', null)).toEqual(['borrador', 'auxiliar', 'anterior'])
    expect(AGENTES_TRIBUTARIOS.ica.memoriaClave).toBe('mapeoIca')
    expect(mapeoMemoriaDe('ica', { mapeo2408: {}, mapeoIca: { '42102005': 'no-sujeto' } })).toEqual({ '42102005': 'no-sujeto' })
    expect(AGENTES_TRIBUTARIOS.ica.anteriorRelevante(aCifras({ 'ica-saldo-favor-ant': 5000 }))).toMatch(/saldo a favor/)
  })
})
